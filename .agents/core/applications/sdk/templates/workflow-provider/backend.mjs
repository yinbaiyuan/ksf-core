// Example business-owned workflow. Core does not interpret these steps.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'&&!Buffer.isBuffer(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(Buffer.isBuffer(v)||typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
const check=(ok,text)=>{if(!ok)throw Object.assign(Error(text),{code:'EXAMPLE_WORKFLOW_INVALID'});};
const definition={id:'text-normalize',revision:1,name:'文本整理示例',description:'整理文本，可在本机人工复核后交付。',inputs:[{key:'references',label:'补充文本材料',type:'materials',required:false},{key:'style',label:'输出风格',type:'select',required:false,options:['简洁','保留原文']},{key:'humanReview',label:'需要本机人工复核',type:'boolean',required:false}],outputs:[{key:'summary',label:'成果说明',type:'text'},{key:'materials',label:'成果文件',type:'materials'}]};
export async function activate(ctx){
 await mkdir(ctx.dataDirectory,{recursive:true});const db=new DatabaseSync(join(ctx.dataDirectory,'workflow.sqlite'));db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL);');
 const get=id=>{const row=db.prepare('SELECT body FROM runs WHERE id=?').get(id);check(row,'找不到原工作流运行');return JSON.parse(row.body);};
 const save=r=>{r.revision=(r.revision??0)+1;db.prepare('INSERT INTO runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(r.runId,JSON.stringify(r));return r;};
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 function continueWait(r,event){const w=r.waits.find(w=>w.waitId===event.waitId);check(w&&w.taskId===event.taskId&&w.peerId===event.sourcePeerId,'结果未匹配到原等待点');w.state='consumed';w.receivedEventId=event.eventId;w.outcome=event.outcome;w.delivery=event.delivery;r.continuations=(r.continuations??0)+1;r.status=r.waits.every(w=>w.state==='consumed')?'completed':'waiting';r.progress='已按原等待点采用合作结果';}
 async function call(method,input={},caller={}){
  if(method.startsWith('workflow.'))check(caller.source==='workflow','工作流接口只接受宿主调用');
  if(method==='workflow.list')return [definition];
  if(method==='workflow.describe'){check(input.workflowId===definition.id,'工作流不存在');return definition;}
  if(['workflow.get','workflow.reconcile','run.get'].includes(method))return get(input.runId);
  if(method==='workflow.start'){
   const key='start:'+input.runId,d=hash(input),old=db.prepare('SELECT * FROM operations WHERE id=?').get(key);if(old){check(old.digest===d,'运行编号内容冲突');return get(input.runId);}
   const lines=[];for(const m of [...(input.materials??[]),...(input.inputs?.references??[])]){check(/^[a-f0-9]{64}$/.test(m.digest),'材料摘要无效');const path=join(ctx.dataDirectory,'materials',m.digest),st=await lstat(path);check(st.isFile()&&!st.isSymbolicLink(),'材料必须为普通文件');const bytes=await readFile(path);check(hash(bytes)===m.digest,'材料摘要不符');if(/text|json|markdown/.test(m.mediaType))lines.push(bytes.toString('utf8'));}
   const text='# 整理结果\n\n'+input.goal+'\n\n'+lines.join('\n\n').replace(/\r\n/g,'\n'),digest=hash(text),home=join(ctx.dataDirectory,'materials');await mkdir(home,{recursive:true});await writeFile(join(home,digest),text,{mode:0o600});
   await ctx.background.retain({key:'workflow:'+input.runId,reason:'工作流处理与人工复核'});
   const r=tx(()=>{const run=save({runId:input.runId,workflowId:definition.id,status:input.inputs?.humanReview?'waiting':'ready',waitReason:input.inputs?.humanReview?'等待 B 人工复核':'',actionLabel:'审核整理结果',progress:'已整理任务文本',waits:[],result:{summary:'文本已整理，输出风格：'+(input.inputs?.style??'简洁'),materials:[{digest,name:'整理结果.md',size:Buffer.byteLength(text),mediaType:'text/markdown'}]}});db.prepare('INSERT INTO operations VALUES (?,?,?)').run(key,d,JSON.stringify(run));return run;});if(r.status==='ready')await ctx.background.release('workflow:'+r.runId);return r;
  }
  if(method==='workflow.cancel'){const r=get(input.runId);if(r.status!=='completed'){r.status='cancelled';save(r);}await ctx.background.release('workflow:'+r.runId);return r;}
  if(method==='run.create'){const id=input.runId??randomUUID();if(db.prepare('SELECT 1 FROM runs WHERE id=?').get(id))return get(id);return save({runId:id,workflowId:'cooperation-roundtrip',status:'running',waits:[],continuations:0,progress:'准备向合作实例分发任务'});}
  if(method==='run.request'){
   const r=get(input.runId);check(!['completed','cancelled','failed'].includes(r.status),'原流程已结束');const waitId=input.waitId??randomUUID(),previous=r.waits.find(w=>w.waitId===waitId),taskId=previous?.taskId??input.taskId??randomUUID(),operationId=previous?.operationId??input.operationId??randomUUID();
   if(!previous){r.waits.push({waitId,taskId,operationId,peerId:input.peerId,state:'waiting'});r.status='waiting';save(r);await ctx.background.retain({key:'workflow:'+r.runId,reason:'等待合作结果回调'});}
   const result=await ctx.services.call('cooperation','request',[{operationId,taskId,workflowRunId:r.runId,waitId,peerId:input.peerId,offerId:input.offerId??'manual',offerRevision:input.offerRevision??1,goal:input.goal,materials:input.materials??[],offerInputs:input.offerInputs??{}}]);return {runId:r.runId,waitId,taskId,result};
  }
  if(method==='workflow.signal'){const ack=tx(()=>{const prior=db.prepare('SELECT body FROM events WHERE id=?').get(input.eventId);if(prior){check(hash(JSON.parse(prior.body))===hash(input),'事件编号冲突');return {accepted:true,eventId:input.eventId,duplicate:true,paused:get(input.runId).status==='paused'};}const r=get(input.runId);check(!['completed','cancelled','failed'].includes(r.status),'原运行已结束');check(r.waits.some(w=>w.waitId===input.waitId&&w.taskId===input.taskId&&w.peerId===input.sourcePeerId&&w.state==='waiting'),'结果不属于待处理等待点');db.prepare('INSERT INTO events VALUES (?,?)').run(input.eventId,JSON.stringify(input));if(r.status==='paused'){const w=r.waits.find(w=>w.waitId===input.waitId);w.state='received';w.receivedEventId=input.eventId;w.pending=input;}else continueWait(r,input);save(r);return {accepted:true,eventId:input.eventId,paused:r.status==='paused'};});if(get(input.runId).status==='completed')await ctx.background.release('workflow:'+input.runId);return ack;}
  if(method==='run.pause'){const r=get(input.runId);check(['running','waiting'].includes(r.status),'原流程已经结束或暂停');r.status='paused';return save(r);}
  if(method==='run.resume'){const r=get(input.runId);check(r.status==='paused','流程尚未暂停');r.status='waiting';for(const w of r.waits.filter(w=>w.state==='received')){const event=w.pending;delete w.pending;continueWait(r,event);}save(r);if(r.status==='completed')await ctx.background.release('workflow:'+r.runId);return r;}
  if(method==='run.review'){check(caller.source==='surface'&&caller.kind==='window','人工复核只能在本机窗口完成');const r=get(input.runId);check(r.status==='waiting'&&r.workflowId===definition.id,'没有待复核成果');check(input.revision===r.revision,'成果已变化');r.status='ready';r.waitReason='';save(r);await ctx.background.release('workflow:'+r.runId);return r;}
  throw Error('未知工作流示例操作');
 }
 return {call,async startBackground(){},dispose(){db.close();}};
}
