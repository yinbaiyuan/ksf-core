import {randomUUID} from 'node:crypto';
import {hash} from './store.mjs';
import {contentDigest,terminal} from './tasks.mjs';
export function createWorkflowExecution(context,store,tasks,materials,{getRules}){
  const call=(method,input)=>context.services.call('workflows',method,[input]);
  const save=r=>store.db.prepare('INSERT INTO runs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(r.id,r.taskId,JSON.stringify(r));
  function waiting(t,message){if(terminal(t))return;store.tx(()=>{const fresh=store.task(t.id);if(fresh.status==='waiting'&&fresh.nextActor==='B'&&fresh.waitReason===message)return;fresh.status='waiting';fresh.nextActor='B';fresh.waitReason=message;store.save(fresh);tasks.sendState(fresh);});}
  async function consume(run,result){
    if(result.runId!==run.runId)throw Error('工作流运行回执不匹配。');run.lastStatus=result.status;run.progress=result.progress;run.actionLabel=result.actionLabel;run.state=['unknown'].includes(result.status)?'unknown':['failed','cancelled'].includes(result.status)?result.status:['completed','ready'].includes(result.status)?'succeeded':'running';
    const imported=[];if(result.result)for(const m of result.result.materials??[]){const {bytes}=await materials.read(m.digest);imported.push(await materials.put(bytes,m));}
    store.tx(()=>{const t=store.task(run.taskId),rule=getRules(t);if(terminal(t)||t.paused||run.contentDigest!==contentDigest(t)||rule?.revision!==run.ruleRevision){save(run);return;}
      if(run.state==='succeeded'){t.draft={summary:result.result.summary,materials:imported,contentDigest:run.contentDigest,deliveryId:run.deliveryId};t.status='ready_to_submit';t.nextActor=rule.delivery==='auto'?'Agent':'B';t.waitReason=rule.delivery==='auto'?'':'等待 B 确认提交成果';}
      else if(['waiting','paused','failed','cancelled','unknown'].includes(result.status)){t.status='waiting';t.nextActor='B';t.waitReason=result.waitReason||'工作流等待 B 处理';}
      else{t.status='in_progress';t.nextActor='工作流';t.waitReason='';}t.progress=result.progress||'工作流正在处理';store.save(t);tasks.sendState(t);save(run);
    });
  }
  async function poll(run){const t=store.task(run.taskId),rule=getRules(t),paired=(await context.peers.list()).paired.some(p=>p.nodeId===t.requester);
    if(t.paused||terminal(t)||!paired||!rule||rule.revision!==run.ruleRevision||run.contentDigest!==contentDigest(t)){
      const r=await call('cancel',{binding:run.binding,runId:run.runId,operationId:run.cancelId});run.state=r.status==='cancelled'?'cancelled':'unknown';save(run);waiting(t,run.state==='unknown'?'原工作流停止状态未知，等待对账':'工作流已停止，等待 B 重新安排');return;
    }
    await consume(run,await call(run.state==='unknown'?'reconcile':'get',{binding:run.binding,runId:run.runId}));
  }
  async function tick(){
    if(store.foreign)return;
    for(const row of store.db.prepare('SELECT body FROM runs').all()){const run=JSON.parse(row.body);if(run.kind!=='workflow'||!['submitting','running','unknown'].includes(run.state))continue;try{await poll(run);}catch(e){run.state='unknown';run.error={code:e.code,message:e.message};save(run);waiting(store.task(run.taskId),'工作流结果待核对，请 B 查看本机运行诊断');}}
    for(const t of tasks.list({view:'accepted',limit:100}).tasks){const r=t.automation,current=getRules(t);if(r?.handling!=='workflow'||t.paused||t.terminationRequested||terminal(t)||t.status==='ready_to_submit')continue;
      const id=hash({task:t.id,digest:contentDigest(t),revision:r.revision,nonce:t.manualRunNonce??null});if(store.db.prepare('SELECT 1 FROM runs WHERE id=?').get(id))continue;
      if(!current||current.revision!==r.revision){waiting(t,'声明已变化，等待 B 重新安排');continue;}
      const run={id,kind:'workflow',runId:randomUUID(),taskId:t.id,contentDigest:contentDigest(t),ruleRevision:r.revision,binding:r.workflow,state:'submitting',deliveryId:randomUUID(),cancelId:randomUUID()};
      store.tx(()=>{save(run);const fresh=store.task(t.id);fresh.status='in_progress';fresh.nextActor='工作流';fresh.progress='正在启动工作流';store.save(fresh);tasks.sendState(fresh);});
      try{await consume(run,await call('start',{runId:run.runId,taskId:t.id,contentDigest:run.contentDigest,goal:t.goal,materials:t.materials,inputs:t.offerInputs??{},grant:{id:r.id,revision:r.revision}}));}catch(e){run.state='unknown';run.error={code:e.code,message:e.message};save(run);waiting(store.task(t.id),'工作流启动结果待核对，请 B 查看本机运行诊断');}
    }
  }
  return {tick};
}
