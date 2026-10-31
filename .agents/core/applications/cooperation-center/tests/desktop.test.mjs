import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,realpath} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {openStore,hash} from '../lib/store.mjs';import {createTasks,contentDigest} from '../lib/tasks.mjs';import {createMaterials} from '../lib/materials.mjs';import {createExecution} from '../lib/execution.mjs';import {matchOffer} from '../lib/offers.mjs';
const A='a'.repeat(64),B='b'.repeat(64),id=()=>randomUUID();
async function setup(t,handling='auto',rawText=null){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'ksf-desktop-contract-'))),store=openStore(directory,B);t.after(async()=>{store.close();await rm(directory,{recursive:true,force:true});});
 const rule={id:hash('local'),offerId:'desktop',revision:1,name:'Desktop 示例',description:'草稿',inputs:'材料',outputs:'成果',published:true,handling,delivery:'confirm',scope:{capability:'draft',profileId:'',shell:false,network:false,writeBack:false},target:{provider:'codex-desktop',project:{name:'项目甲',scope:'current'}}};
 const stream=id();
 const tasks=createTasks(store,{rules:()=>rule,match:s=>matchOffer({rules:[rule],instanceMatches:true},s)}),operations=new Map(),requests=[],threads=new Map();let creates=0,sends=0,interrupts=0;
 const ctx={dataDirectory:directory,peers:{list:async()=>({paired:[{nodeId:A}]})},services:{async call(service,method,args){assert.equal(service,'codex-conversations');const input=args[0];
  if(['create','send'].includes(method)){requests.push(input);const payload=JSON.parse(input.text.slice(input.text.lastIndexOf('\n')+1));const threadId=input.threadId??'thread-'+(++creates),turnId='turn-'+requests.length;if(method==='send')sends++;operations.set(input.operationId,{status:'accepted',threadId,turnId});threads.set(threadId,{status:'idle',turnId:null,messages:[{role:'assistant',turnId,text:rawText??JSON.stringify({...payload,summary:input.executionGrant.phase==='plan'?'明确方案':'明确成果'})}]});return operations.get(input.operationId);}
  if(method==='operation')return operations.get(input.operationId);if(method==='read')return threads.get(input.threadId);if(method==='executionFiles')return [];if(method==='interrupt'){interrupts++;return {status:'accepted'};}throw Error(method);
 }}},materials=createMaterials(ctx,store),execution=createExecution(ctx,store,tasks,materials,{getRules:()=>rule});
 function receive(){const taskId=id();tasks.receive(A,{protocol:'ksf-cooperation-v1',id:id(),stream,seq:store.get('receive:'+A)+1||1,kind:'task.request',payload:{offerId:rule.offerId,offerRevision:1,id:taskId,requester:A,assignee:B,goal:'桌面草稿 '+taskId,materials:[],contentVersion:1}});return taskId;}
 return {store,rule,tasks,execution,requests,threads,operations,receive,get interrupts(){return interrupts;},get creates(){return creates;},get sends(){return sends;}};
}
test('Desktop tasks create independent conversations, adopt only explicit run-bound results and require B confirmation',async t=>{
 const f=await setup(t),one=f.receive(),two=f.receive();await f.execution.tick();assert.equal(f.creates,2);assert.equal(f.store.task(one).status,'ready_to_submit');assert.equal(f.store.task(two).status,'ready_to_submit');
 const task=f.store.task(one);assert.throws(()=>f.tasks.mutate('task.deliver',{operationId:id(),taskId:one,revision:task.revision,summary:task.draft.summary,materials:[]},{source:'cli'}),{code:'COOP_HUMAN_REQUIRED'});await f.execution.tick();assert.equal(f.creates,2);
});
test('plan approval is bound to exact content and execution resumes only the task own Desktop conversation',async t=>{
 const f=await setup(t,'plan'),taskId=f.receive();await f.execution.tick();let task=f.store.task(taskId);assert.equal(task.status,'waiting');assert.equal(task.plan.approved,false);
 assert.throws(()=>f.tasks.mutate('task.action',{operationId:id(),taskId,revision:task.revision,action:'approve_plan',confirmDigest:task.plan.digest},{source:'cli'}),{code:'COOP_HUMAN_REQUIRED'});
 f.tasks.mutate('task.action',{operationId:id(),taskId,revision:task.revision,action:'approve_plan',confirmDigest:task.plan.digest},{source:'surface',kind:'window'});await f.execution.tick();task=f.store.task(taskId);assert.equal(task.status,'ready_to_submit');assert.equal(f.creates,1);assert.equal(f.sends,1);assert.equal(f.requests[1].threadId,'thread-1');
});
test('ordinary Desktop final text is not task completion and a forged result token is rejected',async t=>{
 const f=await setup(t,'auto','本轮对话结束，但没有正式业务成果'),taskId=f.receive();const original=f.execution;await original.tick();assert.equal(f.store.task(taskId).status,'waiting');const run=JSON.parse(f.store.db.prepare('SELECT body FROM runs WHERE taskId=?').get(taskId).body),task=f.store.task(taskId);
 assert.throws(()=>f.tasks.mutate('task.result',{operationId:id(),taskId,revision:task.revision,runId:run.id,executionToken:'forged',status:'completed',summary:'forged'},{source:'cli'}),{code:'COOP_RESULT_STALE'});
 assert.ok(!JSON.stringify(f.tasks.shared(task)).includes('executionToken'));
});

test('revocation still interrupts a known Desktop thread when its dispatch receipt is unknown',async t=>{const f=await setup(t,'auto','未登记成果'),taskId=f.receive();await f.execution.tick();const request=f.requests[0],operation=f.operations.get(request.operationId);operation.status='unknown';f.threads.set(operation.threadId,{status:'running',turnId:operation.turnId,messages:[]});f.rule.revision++;await f.execution.tick();assert.equal(f.interrupts,1);assert.equal(f.creates,1);assert.match(f.store.task(taskId).waitReason,/停止确认/);assert.equal(JSON.parse(f.store.db.prepare('SELECT body FROM runs WHERE taskId=?').get(taskId).body).state,'unknown');});
