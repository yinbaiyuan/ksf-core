import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,basename} from 'node:path';
import {openStore,check,hash,nodeId,id} from './lib/store.mjs';
import {createTasks,contentDigest,terminal} from './lib/tasks.mjs';
import {createMaterials} from './lib/materials.mjs';
import {createSync} from './lib/sync.mjs';
import {createWorkflowExecution} from './lib/workflow-execution.mjs';
import {fieldValues} from '../sdk/server/workflow-contract.mjs';
import {createExecution} from './lib/execution.mjs';
import {offerCatalog,matchOffer,manualOffer} from './lib/offers.mjs';
import {activate as activateMessages} from './legacy-messages.mjs';
const emptyMessages={nextSequence:1,outgoing:{},incoming:{},readThrough:{}};
export async function prepareData(context){
  const original=await context.storage.read('messages.json'),directory=dirname(original.path);await mkdir(directory,{recursive:true,mode:0o700});
  if(!original.exists)return;
  const document=JSON.parse(original.text);check([1,2,3].includes(document.schemaVersion),'旧消息格式不受支持，原件已保留。','COOP_DATA_UNSUPPORTED');
  if(document.schemaVersion>=2){const db=openStore(directory);try{check(db.get('legacy-import')===document.data.sqliteImport,'SQLite 导入记录不符，停止读取。','COOP_MIGRATION_INCOMPLETE');}finally{db.close();}if(document.schemaVersion===2)await context.storage.migrate('messages.json',{text:JSON.stringify({...document,schemaVersion:3,revision:document.revision+1}),ifMatch:original.etag,fromVersion:2,toVersion:3});return;}
  check(document.data&&Number.isSafeInteger(document.data.nextSequence)&&document.data.outgoing&&document.data.incoming&&document.data.readThrough,'旧消息记录损坏。','COOP_DATA_INVALID');
  const digest=hash(original.text),db=openStore(directory);
  try{
    db.tx(()=>{const prior=db.get('legacy-import');check(!prior||prior===digest,'存在另一份旧消息导入，保留双方。','COOP_MIGRATION_CONFLICT');db.db.prepare("INSERT OR IGNORE INTO documents VALUES ('messages',?)").run(JSON.stringify(document.data));const saved=JSON.parse(db.db.prepare("SELECT body FROM documents WHERE key='messages'").get().body);check(hash(saved)===hash(document.data),'旧消息导入核对失败。');db.put('legacy-import',digest);});
    // Mark only after SQLite commit and readback; host backs up the old JSON envelope.
    await context.storage.migrate('messages.json',{text:JSON.stringify({schemaVersion:3,revision:document.revision+1,data:{sqliteImport:digest}}),ifMatch:original.etag,fromVersion:1,toVersion:3});
  }finally{db.close();}
}
export async function activate(context){
  const directory=await context.peers.list();let owner=directory.local?.identity?.nodeId;
  const store=openStore(context.dataDirectory,owner);
  const marker=await context.storage.read('messages.json');if(!marker.exists){const imported=store.get('legacy-import')??hash('cooperation-sqlite-v1');store.put('legacy-import',imported);await context.storage.write('messages.json',JSON.stringify({schemaVersion:3,revision:0,data:{sqliteImport:imported}}),{ifMatch:marker.etag});}
  const materials=createMaterials(context,store);let ruleState={rules:[],revision:0,instanceMatches:true};
  const ai=(method,...args)=>context.services.call('ai',method,args);
  const getRules=selection=>ruleState.instanceMatches?ruleState.rules.find(r=>r.offerId===selection.offerId&&r.published):null;
  async function bindOwner(){const current=(await context.peers.list()).local?.identity?.nodeId;if(current){store.bindOwner(current);owner=current;}}
  async function loadRules(){ruleState=await ai('executionRules');}
  await loadRules();
  const tasks=createTasks(store,{rules:getRules,outgoingOffer:selection=>(selection.offerId??'manual')==='manual'?manualOffer():sync.offers(selection.peerId).offers.find(o=>o.offerId===selection.offerId&&o.revision===selection.offerRevision),match:selection=>matchOffer(ruleState,selection)}),sync=createSync(context,store,tasks,materials,{catalog:features=>offerCatalog(ruleState,features)}),execution=createExecution(context,store,tasks,materials,{getRules}),workflowExecution=createWorkflowExecution(context,store,tasks,materials,{getRules});
  const notedDirectory=async()=>{const d=await context.peers.list();return {...d,paired:d.paired.map(p=>({...p,remark:store.get('note:'+p.nodeId)??'',name:(store.get('note:'+p.nodeId)?store.get('note:'+p.nodeId)+' · ':'')+p.name}))};};
  const messages=await activateMessages({...context,peers:{list:notedDirectory},legacyStore:store.legacyStore(emptyMessages)});
  let disposed=false,timer,work;
  async function background(){if(disposed||work)return;work=(async()=>{await bindOwner();if(!nodeId(owner)||store.foreign)return;await loadRules();await execution.tick();await workflowExecution.tick();autoDeliver();await callbacks();await sync.tick();})().catch(e=>{store.put('background-error',{code:e.code,message:e.message,at:new Date().toISOString()});}).finally(()=>{work=null;});await work;}
  async function callbacks(){for(const row of store.db.prepare("SELECT * FROM callbacks WHERE state!='acknowledged'").all()){
    const body=JSON.parse(row.body);if(body.retryAt&&body.retryAt>Date.now())continue;
    try{const ack=await context.services.call('workflows','signal',[body]);store.db.prepare("UPDATE callbacks SET state='acknowledged',error=NULL,attempts=attempts+1 WHERE id=?").run(row.id);store.put('callback:'+row.taskId,{state:'acknowledged',eventId:row.id,paused:ack.paused===true});}
    catch(e){body.retryAt=Date.now()+Math.min(60000,1000*2**Math.min(6,row.attempts));store.db.prepare("UPDATE callbacks SET state='queued',body=?,error=?,attempts=attempts+1 WHERE id=?").run(JSON.stringify(body),JSON.stringify({code:e.code,message:e.message}),row.id);store.put('callback:'+row.taskId,{state:'queued',error:e.message,eventId:row.id});}
  }}
  function autoDeliver(){for(const t of tasks.list({view:'accepted',limit:100}).tasks){if(t.status!=='ready_to_submit'||t.paused||!t.draft||t.draft.contentDigest!==contentDigest(t)||t.automation?.delivery!=='auto'||getRules(t)?.revision!==t.automation.revision)continue;tasks.mutate('task.deliver',{operationId:t.draft.deliveryId??hash(t.id+contentDigest(t)).slice(0,8)+'-'+hash(t.id).slice(0,4)+'-4000-8000-'+hash(contentDigest(t)).slice(0,12),taskId:t.id,revision:t.revision,summary:t.draft.summary,materials:t.draft.materials},{source:'message'});}}
  async function startBackground(){if(timer||store.foreign)return;await context.background.retain({key:'cooperation',reason:'恢复合作任务、离线队列与运行回执'});timer=setInterval(()=>void background(),1500);timer.unref();void background();}
  async function call(method,input={},caller={}){
    if(method==='workflow.catalog')return context.services.call('workflows','list',[]);
    if(method==='execution.catalog'){
      const [profiles,desktop,projects]=await Promise.allSettled([ai('describe'),context.services.call('codex-conversations','check',[]),context.services.call('projects','list',[{scope:'current'}])]);
      return {profiles:profiles.status==='fulfilled'?profiles.value.profiles:[],desktop:desktop.status==='fulfilled'?desktop.value:{available:false,message:desktop.reason.message},projects:projects.status==='fulfilled'?projects.value.projects??projects.value.data?.projects??[]:[],issues:[profiles,desktop,projects].filter(r=>r.status==='rejected').map(r=>r.reason.message)};
    }
    if(method==='execution.open'){const t=store.task(input.taskId),run=store.db.prepare('SELECT body FROM runs WHERE taskId=?').all(t.id).map(r=>JSON.parse(r.body)).find(r=>r.kind==='desktop'&&r.threadId);check(run,'本任务尚未关联 Desktop 会话。');return context.services.call('codex-conversations','openDesktop',[{threadId:run.threadId}]);}
    if(method==='workflow.request'){
      check(caller.source==='workflow'&&caller.requesterAppId===input.workflowOrigin?.appId,'流程请求必须经过受控宿主接口。','COOP_WORKFLOW_FORBIDDEN');
      check(!store.foreign&&nodeId(owner),'任务库不属于当前实例。');
      for(const ref of [...(input.materials??[]),...Object.values(input.offerInputs??{}).filter(Array.isArray).flat().filter(m=>m?.digest)]){const {bytes}=await materials.read(ref.digest);await materials.put(bytes,ref);}
      return call('task.create',input,caller);
    }
    if(method==='peers')return notedDirectory();
    if(method==='peer.offers'||method==='peer.offers.refresh'){
      const peers=await context.peers.list();check(peers.paired.some(p=>p.nodeId===input.peerId),'合作实例尚未配对。','COMM_PEER_UNTRUSTED');
      check(!store.foreign,'复制来的数据只能查看。','COOP_INSTANCE_CHANGED');if(method.endsWith('refresh')||!sync.offers(input.peerId).syncedAt)sync.refreshOffers(input.peerId);void background();return sync.offers(input.peerId);
    }
    if(method.startsWith('offer.')||method.startsWith('policy.')){
      await loadRules();
      if(method==='offer.list'||method==='policy.list')return {...ruleState,profiles:(await ai('describe')).profiles};
      if(method==='offer.preview'||method==='policy.match')return matchOffer(ruleState,input);
      check(method==='offer.save'&&caller.source==='surface'&&caller.kind==='window','承接声明只能由 B 在窗口设置；不再支持按发送实例设置规则。','COOP_HUMAN_REQUIRED');
      if(input.handling==='workflow'){const selected=await context.services.call('workflows','describe',[input.workflow]);const fields=selected.descriptor.inputs.filter(f=>!Object.hasOwn(selected.binding.fixedInputs,f.key));check(JSON.stringify(fields)===JSON.stringify(input.inputFields??[]),'请按当前工作流输入配置公开字段。');fieldValues(selected.descriptor.inputs.map(f=>({...f,required:false})),selected.binding.fixedInputs);}
      const result=await ai('configureExecution',input);await loadRules();
      for(const peer of (await context.peers.list()).paired)if(store.get('capability:'+peer.nodeId)?.offersProtocol===1)sync.control(peer.nodeId,{kind:'offers.changed'});
      void background();return result;
    }
    if(['material.import','material.text'].includes(method)){
      check(id(input.operationId),'材料导入需要稳定的 operationId。');const signature={method,...input},prior=store.db.prepare('SELECT digest,result FROM operations WHERE id=?').get(input.operationId);if(prior){check(prior.digest===hash(signature),'操作编号对应不同材料。','COOP_OPERATION_CONFLICT');return JSON.parse(prior.result);}
      let result;
      if(method==='material.text'){check(typeof input.text==='string'&&Buffer.byteLength(input.text)<=512*1024,'文本材料最多 512 KiB。');result=await materials.put(Buffer.from(input.text),{name:input.name??'材料.txt',mediaType:'text/plain'});}
      else if(input.materialId)result=await materials.stagedMaterial(input.materialId);
      else{check(caller.source==='surface','本地路径导入需要窗口操作；CLI 使用 text 或已上传材料。','COOP_HUMAN_REQUIRED');result=await materials.importPath(input.path,{name:input.name??basename(input.path),mediaType:input.mediaType});}
      return store.operation(input.operationId,signature,()=>result);
    }
    if(method==='file.export'){
      if(input.digest){const row=store.db.prepare('SELECT * FROM artifacts WHERE digest=?').get(input.digest);check(row,'材料不存在。');await materials.read(input.digest);return {path:'materials/'+input.digest,name:row.name,sha256:input.digest};}
      check(id(input.operationId),'导出需要稳定操作编号。');const rows=input.taskId?[store.task(input.taskId)]:tasks.list({...input,limit:100,archived:true}).tasks;const text=JSON.stringify({protocol:'ksf-cooperation-export-v1',instance:owner,tasks:rows},null,2),dir=join(context.dataDirectory,'exports'),path='exports/'+input.operationId+'.json';await mkdir(dir,{recursive:true,mode:0o700});await writeFile(join(context.dataDirectory,path),text,{mode:0o600});return {path,name:'合作任务.json',sha256:hash(text)};
    }
    if(method==='peer.note')return store.operation(input.operationId,{method,...input},()=>{check(nodeId(input.peerId)&&typeof input.note==='string'&&input.note.length<=80,'备注无效。');check((store.get('note:'+input.peerId)??'')===input.expectedNote,'备注已变化，请刷新。','COOP_REVISION_CONFLICT');store.put('note:'+input.peerId,input.note);return {saved:true};});
    if(method==='material.read'){const {bytes}=await materials.read(input.digest);check(bytes.length<=512*1024,'材料较大，请从导出目录读取。');return {text:bytes.toString('utf8'),digest:input.digest};}
    if(method==='sync.status')return {...sync.status(),backgroundError:store.get('background-error')??null};
    if(method==='sync.retry'){check(!store.foreign,'复制来的队列只能查看。','COOP_INSTANCE_CHANGED');await sync.tick();return sync.status();}
    if(method==='task.list')return tasks.list(input);
    if(method==='task.get'){const t=store.task(input.taskId);return {...t,callback:t.workflowOrigin?(store.get('callback:'+t.id)??{state:'waiting'}):null,transport:store.db.prepare("SELECT o.state,o.transport,o.attempts,o.error,o.updated FROM outbox o JOIN events e ON e.id=o.id WHERE json_extract(e.body,'$.payload.id')=? OR json_extract(e.body,'$.payload.taskId')=? ORDER BY e.seq DESC LIMIT 1").get(t.id,t.id)??null,contentDigest:contentDigest(t),submissionDigest:t.draft?hash({summary:t.draft.summary,materials:t.draft.materials,content:contentDigest(t)}):null,runs:store.db.prepare('SELECT body FROM runs WHERE taskId=?').all(t.id).map(r=>JSON.parse(r.body)).map(({request,resultTokenHash,...run})=>run),children:store.db.prepare("SELECT body FROM tasks WHERE json_extract(body,'$.parentId')=? ORDER BY updated DESC LIMIT 100").all(t.id).map(r=>JSON.parse(r.body)).map(({id,goal,status,publicSummary})=>({id,goal,status,publicSummary}))};}
    if(method==='task.export'){
      const data=input.taskId?[store.task(input.taskId)]:tasks.list({...input,limit:100,archived:true}).tasks;
      const dir=join(context.dataDirectory,'exports');await mkdir(dir,{recursive:true,mode:0o700});const path=join(dir,'cooperation-'+Date.now()+'.json');await writeFile(path,JSON.stringify({protocol:'ksf-cooperation-export-v1',instance:owner,tasks:data},null,2),{mode:0o600});return {path,count:data.length,scope:'当前筛选最多 100 条；可用 offset 分页导出'};
    }
    if(method.startsWith('task.')){
      await bindOwner();check(!store.foreign&&nodeId(owner),'任务数据不属于当前实例或尚未开启通信身份。','COOP_INSTANCE_CHANGED');await loadRules();
      if(['task.create','task.rework'].includes(method)){
        const peers=await context.peers.list();check(peers.paired.some(p=>p.nodeId===input.peerId),'合作实例尚未配对。','COMM_PEER_UNTRUSTED');
        if(method==='task.rework')check(input.relatedId&&terminal(store.task(input.relatedId)),'返工需要关联已结束的请求。');
        const selected=input.offerId??'manual',catalog=sync.offers(input.peerId),prior=store.db.prepare('SELECT digest FROM operations WHERE id=?').get(input.operationId);
        if(!prior){
          if(!catalog.supported){sync.refreshOffers(input.peerId);void background();check(false,'对方尚未确认支持承接声明，请刷新目录或升级对方KSF合作。','COOP_OFFERS_UNSUPPORTED');}
          const offer=selected==='manual'?manualOffer():catalog.offers.find(o=>o.offerId===selected&&o.revision===input.offerRevision);if(offer&&(offer.handling==='workflow'||offer.inputFields?.length))check(catalog.features?.includes('workflow-offers-v1'),'对方尚不支持工作流声明或业务表单，请先升级。','COOP_OFFERS_UNSUPPORTED');check(offer,'声明目录已变化，请刷新后选择。','COOP_OFFER_STALE');
        }
      }
      const result=tasks.mutate(method,input,caller);void background();return result;
    }
    return messages.call(method,input,caller);
  }
  async function onMessage(event){
    const record=await context.messages.read(event.messageId),manifest=record.manifest,part=manifest.parts.find(p=>p.partId===manifest.payloadPartId);
    check(part&&part.byteLength<=256*1024,'消息信封过大。');let body;
    try{body=JSON.parse(await readFile((await context.messages.readPart(event.messageId,part.partId)).path,'utf8'));}catch{return messages.onMessage(event);}
    if(['ksf-cooperation-v1','ksf-cooperation-control-v1'].includes(body.protocol)){
      await bindOwner();check(!store.foreign&&nodeId(owner),'复制来的任务库仅保留历史，不接管来信。','COOP_INSTANCE_CHANGED');await loadRules();await sync.receive(event,body,manifest);void background();return;
    }
    return messages.onMessage(event);
  }
  return {call,onMessage,startBackground,async dispose(){disposed=true;clearInterval(timer);await work;await messages.dispose();store.close();}};
}
