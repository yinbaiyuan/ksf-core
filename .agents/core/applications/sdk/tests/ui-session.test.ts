import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApplicationSessions} from '../../../runtime/src/services/application-sessions.js';
import {createApplicationStorage} from '../../../runtime/src/services/application-storage.js';
import {createAITaskService} from '../../../runtime/src/ai-tasks/service.js';
import {SaveController,RunController,createAITaskRunAdapter,createSessionSaveAdapter,CloseCoordinator,createSessionCloseGuard} from '../src/controllers.ts';
import {createAIClient} from '../src/ai-tasks.ts';
import type {AIRequest} from '../src/ai-tasks.ts';
import type {SaveAdapter} from '../src/controllers/save-controller.ts';
import type {ApplicationSessionStorage} from '../src/application-session.ts';
import {validateSessionValue} from '../src/session-contract.js';
const caller={appId:'com.example.recovery',version:'1.0.0'};
async function fixture(t:{after:(fn:()=>unknown)=>void}){const root=await mkdtemp(join(tmpdir(),'ksf-ui-session-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
function client(service:ReturnType<typeof createApplicationSessions>):ApplicationSessionStorage{return {read:(key,recordVersion)=>service.read(caller,{key,recordVersion}),write:(key,input)=>service.write(caller,{key,...input})};}
const pause=(ms=5)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean){for(let i=0;i<400&&!check();i++)await pause();assert.ok(check(),'state did not settle');}

test('managed sessions survive new service objects, isolate apps and reject stale/foreign/future records without overwriting',async t=>{
 const root=await fixture(t),service=createApplicationSessions(root,{instanceId:'instance-one'}),key='project:中文/one';
 assert.equal((await service.read(caller,{key,recordVersion:1})).exists,false);assert.deepEqual(await readdir(root),[]);
 const first=await service.write(caller,{key,recordVersion:1,value:{draft:'未提交',selected:'task-1',pending:{operationId:'original'}},ifMatch:null});
 const restarted=createApplicationSessions(root,{instanceId:'instance-one'});assert.deepEqual((await restarted.read(caller,{key,recordVersion:1})).record,first.record);
 assert.equal((await service.read({...caller,appId:'com.example.other'},{key,recordVersion:1})).exists,false);
 await assert.rejects(service.write(caller,{key,recordVersion:1,value:{},ifMatch:null}),{code:'APP_DATA_CONFLICT'});
 await assert.rejects(service.read(caller,{key,recordVersion:2}),{code:'APP_SESSION_VERSION'});
 await assert.rejects(createApplicationSessions(root,{instanceId:'another-instance'}).read(caller,{key,recordVersion:1}),{code:'APP_SESSION_IDENTITY'});
 const folder=join(root,'.agents/user-data/applications/data',caller.appId),path=join(folder,(await readdir(folder)).find(n=>n.startsWith('ui-session-'))!);await writeFile(path,'{broken');const before=await readFile(path);
 await assert.rejects(service.write(caller,{key,recordVersion:1,value:{},ifMatch:first.etag}),{code:'APP_SESSION_INVALID'});assert.deepEqual(await readFile(path),before);
});
test('session data validation refuses lossy JS values and an interrupted durable reply reconciles the saved checkpoint',async t=>{
 for(const value of [{x:undefined},{x:NaN},new Date(),[,'sparse'],Object.assign(Array(1),{extra:'lost'}),{x:BigInt(1)},Object.defineProperty({},'x',{get(){return 'getter';},enumerable:true})])assert.throws(()=>validateSessionValue(value),{code:'APP_SESSION_INVALID'});
 const root=await fixture(t);let writes=0;const storage=createApplicationStorage(root,{fault:async phase=>{if(phase==='after-replace'&&writes++===0)throw Error('lost acknowledgement after durable replacement');}}),service=createApplicationSessions(root,{instanceId:'instance',storage});
 const recovery=new SaveController(createSessionSaveAdapter(client(service),{key:'main',recordVersion:1,initial:{draft:''}}),{initial:{draft:''}});await recovery.refresh();recovery.update({draft:'kept'});await recovery.save();assert.equal(recovery.getSnapshot().status,'saved');assert.equal(recovery.getSnapshot().confirmation,'value');assert.equal(writes,1);
 const reread=await createApplicationSessions(root,{instanceId:'instance'}).read(caller,{key:'main',recordVersion:1});assert.equal(reread.record?.value.draft,'kept');
});
test('save checkpoints retain the original unknown write across reconstruction and a rejected retry cannot erase it',async()=>{
 let writes=0,revision='base',value={text:'base'};const adapter:SaveAdapter<{text:string}>={read:async()=>({value,revision}),write:async()=>{writes++;throw Object.assign(Error('unknown first write or explicit retry rejection'),{code:writes===1?'LOST':'DENIED'});},classifyError:(e:unknown)=>(e as {code:string}).code==='DENIED'?'failed' as const:'unknown' as const,reconcile:async()=>({kind:'unknown' as const,record:{value,revision},retrySameAttempt:true})};
 const original=new SaveController(adapter,{initial:{text:''},operationId:()=> 'original-save'});await original.refresh();original.update({text:'intent'});await original.save();const point=original.getCheckpoint();
 const restored=new SaveController(adapter,{initial:{text:''},checkpoint:point});assert.equal(writes,1);assert.equal(restored.getSnapshot().status,'unknown');await restored.retry();assert.equal(writes,2);assert.equal(restored.getSnapshot().status,'unknown');assert.equal(restored.getSnapshot().pending?.operationId,'original-save');
 value={text:'intent'};revision='committed';adapter.reconcile=async()=>({kind:'saved',record:{value,revision},confirmation:'value'});await restored.refresh();assert.equal(restored.getSnapshot().status,'saved');assert.equal(writes,2);
});
test('a held draft is revalidated before saving after restoration and a failed preservation prevents domain dispatch',async()=>{
 let writes=0;const adapter={read:async()=>({value:{text:'base'},revision:'base'}),write:async()=>{writes++;return {value:{text:'new'},revision:'next'};}};
 const first=new SaveController(adapter,{initial:{text:''}});await first.refresh();first.update({text:'new'});
 const restored=new SaveController(adapter,{initial:{text:''},checkpoint:first.getCheckpoint(),preserve:async()=>{throw Error('disk unavailable');}});assert.equal(restored.getSnapshot().ready,false);await restored.save();assert.equal(writes,0);await restored.refresh();assert.equal(restored.getSnapshot().ready,true);assert.equal(restored.getSnapshot().value.text,'new');await restored.save();assert.equal(writes,0);assert.equal(restored.getSnapshot().error?.code,'SAVE_CHECKPOINT_FAILED');assert.equal(restored.getSnapshot().pending,null);
});
test('all close sources coalesce one transaction and thrown/negative legacy outcomes keep the window with visible failure',async()=>{
 let resolve!:()=>void,guards=0,commits=0;const gate=new Promise<void>(yes=>{resolve=yes;});
 const close=new CloseCoordinator({guards:()=>[async()=>{guards++;await gate;return {status:'ready'};}],commit:()=>{commits++;}});
 const a=close.request(),b=close.request();assert.equal(a,b);assert.equal(close.getSnapshot().phase,'checking');resolve();assert.equal(await a,true);assert.equal(guards,1);assert.equal(commits,1);await close.request();assert.equal(commits,1);
 const broken=new CloseCoordinator({guards:()=>[async()=>{throw Error('legacy rejection');}],commit:()=>{commits++;}});assert.equal(await broken.request(),false);assert.equal(broken.getSnapshot().phase,'failed');assert.equal(broken.getSnapshot().error,'legacy rejection');
 const cancelled=new CloseCoordinator({guards:()=>[()=>({status:'cancelled'})],commit:()=>{commits++;}});assert.equal(await cancelled.request(),false);assert.equal(cancelled.getSnapshot().phase,'idle');assert.equal(commits,1);
});
test('prepared close tokens are checked after later guards and session preparation detects edits after durable preservation',async()=>{
 let valid=true,commits=0;const close=new CloseCoordinator({guards:()=>[()=>({status:'ready',validate:()=>valid}),()=>{valid=false;return {status:'ready'};}],commit:()=>{commits++;}});assert.equal(await close.request(),false);assert.equal(commits,0);
 let generation=1;const guard=createSessionCloseGuard({getState:()=>({generation,dirty:false,unresolved:false,running:true,canBackground:true}),choose:()=> 'preserve',save:async()=>true,discard:async()=>true,persist:async()=>true}),result=await guard({requestId:'reload-prepare',reason:'reload'});assert.equal(result.status,'ready');if(result.status==='ready'){assert.equal(result.validate?.(),true);generation++;assert.equal(result.validate?.(),false);}
});
test('close choices preserve pending identities, detect new edits and never turn closing into cancellation',async()=>{
 let generation=1,dirty=true,unresolved=true,choice:'save'|'discard'|'preserve'|'continue'='discard',saves=0,discards=0,persists=0;
 const guard=createSessionCloseGuard({getState:()=>({generation,dirty,unresolved,running:true,canBackground:true}),choose:()=>choice,save:async()=>{saves++;dirty=false;generation++;return true;},discard:async()=>{discards++;dirty=false;generation++;return true;},persist:async()=>{persists++;return true;}}),request={requestId:'closing',reason:'close' as const};
 assert.equal((await guard(request)).status,'failed');assert.equal(discards,0);choice='continue';assert.equal((await guard(request)).status,'cancelled');choice='preserve';assert.equal((await guard(request)).status,'ready');assert.equal(persists,1);assert.equal(unresolved,true);
 unresolved=false;choice='save';assert.equal((await guard(request)).status,'ready');assert.equal(saves,1);
 const changing=createSessionCloseGuard({getState:()=>({generation,dirty:false,unresolved:false,running:false,canBackground:true}),choose:()=> 'preserve',save:async()=>true,discard:async()=>true,persist:async()=>{generation++;return true;}});assert.equal((await changing(request)).status,'failed');
});
test('an actual AI service keeps running after UI disposal and reopens from a durable pre-dispatch identity without a second execution',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-ui-background-'));let runs=0,release!:()=>void;const gate=new Promise<void>(yes=>{release=yes;});
 const service=createAITaskService(root,{pollMs:10,executors:{'openai-responses-v1':{execute:async()=>{runs++;await gate;return {text:'durable result'};}}}});t.after(async()=>{release();await service.close();await rm(root,{recursive:true,force:true});});
 await service.config('connections',{revision:0,items:[{id:'api',kind:'api',enabled:true,protocolId:'openai-responses-v1',baseURL:'https://example.invalid/v1',credentialRef:'env:SYNTHETIC',concurrency:1}]});await service.config('profiles',{revision:0,items:[{id:'text',executorId:'api',enabled:true,model:'synthetic',timeoutMs:5000,maxAttempts:1,retryDelayMs:0,maxInputBytes:4096,maxOutputBytes:4096}]});
 const sessions=createApplicationSessions(root,{instanceId:'instance'});let lose=true,cancels=0;
 const transport=createAIClient({services:{async call(_s,method,args=[]){if(method==='cancel')cancels++;const result=await (service as any)[method](caller,...args);if(method==='submit'&&lose){lose=false;throw Error('lost submit receipt');}return result;}}});
 let etag:string|null=null;const run=new RunController(createAITaskRunAdapter(transport),{preserve:async point=>{const saved=await sessions.write(caller,{key:'run',recordVersion:1,ifMatch:etag,value:{selection:'task-one',draft:'kept draft',run:point}});etag=saved.etag;}});
 const input:AIRequest={contractVersion:'ai-task-v1',idempotencyKey:'durable-original',profileId:'text',instruction:'synthetic',inputs:[],outputSpec:{format:'text'}};await run.submit(input);await until(()=>runs===1);const off=run.watch();off();assert.equal(cancels,0);
 const record=(await createApplicationSessions(root,{instanceId:'instance'}).read(caller,{key:'run',recordVersion:1})).record!;assert.equal(record.value.selection,'task-one');assert.equal(record.value.run.identity.idempotencyKey,'durable-original');
 const reopened=new RunController(createAITaskRunAdapter(transport),{checkpoint:record.value.run});assert.equal(reopened.getSnapshot().submission.state,'unknown');await reopened.refresh();assert.equal(reopened.getSnapshot().observation?.phase,'running');assert.equal(runs,1);release();for(let i=0;i<200&&reopened.getSnapshot().observation?.phase!=='succeeded';i++){await reopened.refresh();await pause();}assert.equal(reopened.getSnapshot().observation?.result.record?.value,'durable result');assert.equal(runs,1);assert.equal(cancels,0);
});
test('failed run preservation prevents effect dispatch instead of reporting a submitted task',async()=>{
 let submits=0;const adapter={source:'ai-task-v1' as const,identity:()=>({source:'ai-task-v1' as const,idempotencyKey:'original'}),submit:async()=>{submits++;throw Error('must not dispatch');},reconcile:async()=>({}),read:async()=>({}),cancel:async()=>({operationId:'stop',state:'confirmed' as const,status:'stopped'})};
 const run=new RunController(adapter,{preserve:async()=>{throw Error('disk failed');}});await run.submit({text:'input'});assert.equal(submits,0);assert.equal(run.getSnapshot().submission.state,'failed');assert.equal(run.getSnapshot().error?.code,'RUN_CHECKPOINT_FAILED');
});


test('a checkpoint CAS conflict during retry cannot masquerade as a domain conflict and erase an earlier unknown write',async()=>{
 let writes=0,preserves=0;const adapter:SaveAdapter<{text:string}>={read:async()=>({value:{text:'base'},revision:'base'}),write:async()=>{writes++;throw Error('lost domain reply');},classifyError:e=>(e as {code?:string}).code==='APP_DATA_CONFLICT'?'conflict':'unknown',reconcile:async()=>({kind:'unknown',retrySameAttempt:true})};
 const save=new SaveController(adapter,{initial:{text:''},preserve:async()=>{if(preserves++>0)throw Object.assign(Error('different checkpoint writer'),{code:'APP_DATA_CONFLICT'});}});await save.refresh();save.update({text:'intent'});await save.save();const original=save.getSnapshot().pending;assert.ok(original);await save.retry();assert.equal(writes,1);assert.equal(save.getSnapshot().status,'unknown');assert.equal(save.getSnapshot().pending,original);assert.equal(save.getSnapshot().error?.code,'SAVE_CHECKPOINT_FAILED');
});
