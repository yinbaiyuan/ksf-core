import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {RunController} from '../src/controllers/run-controller.ts';
import {createAITaskRunAdapter,createDesktopRunAdapter} from '../src/controllers/run-adapters.ts';
import type {AITaskRunClient,DesktopRunClient,DesktopRunRequest} from '../src/controllers/run-adapters.ts';
import {projectAITask,projectConversation} from '../src/controllers/run-projections.ts';
import {createAIClient} from '../src/ai-tasks.ts';
import type {AIRequest,AITask} from '../src/ai-tasks.ts';
import type {ConversationSnapshot,ConversationOperation} from '../src/codex-conversations.ts';
import {createAITaskService} from '../../../runtime/src/ai-tasks/service.js';

const pause=(ms=5)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean,limit=2000){const end=Date.now()+limit;while(!check()&&Date.now()<end)await pause();assert.ok(check(),'state did not settle');}
const request=(key='first'):AIRequest=>({contractVersion:'ai-task-v1',idempotencyKey:key,profileId:'text',instruction:'synthetic input',inputs:[],outputSpec:{format:'text'}});
function task(id='task-first',status:AITask['status']='running'):AITask {
 return {aiTaskId:id,application:{appId:'com.example.run'},status,revision:2,context:{},output:null,warnings:[],timestamps:{receivedAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'},usage:null,error:null,execution:{executorId:'fixture',profileId:'text',profileRevision:1,connectionRevision:1,model:null,attempts:[{attemptId:'attempt',startedAt:'2026-01-01T00:00:00Z',stopConfirmed:false,executionOutcome:'running'}]}};
}
function taskPeer(){
 const tasks=new Map<string,AITask>(),requests:AIRequest[]=[];let offline=false,lose=false,events=0,cancels=0;
 const client={async submit(input:AIRequest){requests.push(structuredClone(input));let value=tasks.get(input.idempotencyKey);if(!value){value=task('task-'+input.idempotencyKey);tasks.set(input.idempotencyKey,value);}if(lose){lose=false;throw Error('reply lost');}return structuredClone(value);},async get(id:string){return structuredClone([...tasks.values()].find(t=>t.aiTaskId===id)!);},async lookup(key:string){return structuredClone(tasks.get(key)??null);},async events(id:string,afterSeq:number){events++;if(offline)throw Error('offline');return {snapshot:await this.get(id),events:[],afterSeq:2,hasMore:false};},async readResult(id:string){return {resultId:id,format:'text',value:'verified result',sha256:'a'.repeat(64)};},async cancel(id:string){cancels++;const value=[...tasks.values()].find(t=>t.aiTaskId===id)!;value.status='cancelled';value.timestamps.cancelRequestedAt='2026-01-01T00:01:00Z';return structuredClone(value);}};
 return {client:client as unknown as AITaskRunClient,tasks,requests,lose(){lose=true;},offline(value:boolean){offline=value;},get events(){return events;},get cancels(){return cancels;},complete(key='first'){const t=tasks.get(key)!;t.status='succeeded';t.execution.attempts[0].stopConfirmed=true;t.execution.attempts[0].executionOutcome='completed';t.output={format:'text',value:'verified result',artifacts:[{resultId:t.aiTaskId,sha256:'a'.repeat(64)}]};}};
}
function desktopPeer(){
 let revision=1,lose=false,missing=false,loseCancel=false,creates=0,answerTurn:string|undefined;
 const operations=new Map<string,ConversationOperation>(),writes:{method:string;input:any}[]=[];
 const snapshot:ConversationSnapshot={threadId:'thread-0001',version:'1',title:'fixture',status:'running',turnId:'turn-0001',questions:[],approvals:false,privateInput:false,plan:null,messages:[],ksf:{taskId:null,route:null,chat:null,hookState:'unconfirmed'},viewCapabilities:{toolEvents:'native-metadata-v1',toolKinds:['command','mcp','file-change'],publicQuestions:'single-text-v1',nativeApprovals:true,privateInput:'native-only',turnOutcomes:true},lastTurn:{turnId:'turn-0001',status:'running',startedAt:null,finishedAt:null},tools:{scope:'latest-turn',turnId:'turn-0001',records:[],total:0,truncated:false}};
 const receipt=(id:string,method:string):ConversationOperation=>({operationId:id,method,status:'accepted',threadId:snapshot.threadId,turnId:'turn-0001',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'});
 const bump=()=>{snapshot.version=String(++revision);};
 const client={async create(input:any){writes.push({method:'create',input:structuredClone(input)});if(missing){missing=false;throw Error('not received');}let op=operations.get(input.operationId);if(!op){creates++;op=receipt(input.operationId,'create');operations.set(input.operationId,op);}if(lose){lose=false;throw Error('lost reply');}return structuredClone(op);},async send(input:any){return this.create(input);},async operation(id:string){const value=operations.get(id);if(!value)throw Object.assign(Error('missing'),{code:'CODEX_OPERATION_MISSING'});return structuredClone(value);},async read(){return structuredClone(snapshot);},async events(_id:string,version?:string){return {version:snapshot.version,changed:snapshot.version!==version,events:[],snapshot:snapshot.version!==version?structuredClone(snapshot):null};},async interrupt(input:any){writes.push({method:'interrupt',input:structuredClone(input)});if(loseCancel){loseCancel=false;throw Error('cancel not received');}let op=operations.get(input.operationId);if(!op){op=receipt(input.operationId,'interrupt');operations.set(input.operationId,op);}return structuredClone(op);},async answer(input:any){writes.push({method:'answer',input:structuredClone(input)});if(input.version!==snapshot.version)throw Object.assign(Error('stale'),{code:'CODEX_QUESTION_STALE',outcomeUnknown:false});const op={...receipt(input.operationId,'answer'),status:'succeeded' as const,...(answerTurn?{turnId:answerTurn}:{})};operations.set(input.operationId,op);snapshot.questions=[];if(answerTurn){snapshot.turnId=answerTurn;snapshot.lastTurn={turnId:answerTurn,status:'running',startedAt:null,finishedAt:null};snapshot.status='running';snapshot.tools={scope:'latest-turn',turnId:answerTurn,records:[],total:0,truncated:false};}bump();return op;},async openDesktop(){return {opened:true};}};
 return {client:client as unknown as DesktopRunClient,snapshot,operations,writes,bump,lose(){lose=true;},missing(){missing=true;},loseCancel(){loseCancel=true;},get creates(){return creates;},continueIn(id:string){answerTurn=id;},stop(){snapshot.status='idle';snapshot.turnId=null;snapshot.lastTurn!.status='cancelled';bump();},question(){snapshot.status='question';snapshot.questions=[{request:{type:'string',value:'question-native'},turnId:'turn-0001',questions:[{id:'q',question:'choose',options:[{label:'one'}]}]}];bump();}};
}
const desktopRequest=(id='operation-original'):DesktopRunRequest=>({kind:'create',params:{operationId:id,project:{name:'fixture',scope:'current'},text:'synthetic'}});

test('task cancellation is requested separately from actual stop, and unsupported tools/questions are explicit',()=>{
 const value=task();value.status='cancelled';value.timestamps.cancelRequestedAt='now';const view=projectAITask(value,{source:'ai-task-v1',idempotencyKey:'key'});
 assert.equal(view.phase,'stopping');assert.equal(view.stopConfirmed,false);assert.equal(view.cancelRequested,true);assert.equal(view.capabilities.toolEvents.state,'unsupported');assert.equal(view.tools.total,null);assert.equal(view.capabilities.publicQuestions.state,'unsupported');
 value.execution.attempts[0].stopConfirmed=true;assert.equal(projectAITask(value,{source:'ai-task-v1',idempotencyKey:'key'}).phase,'cancelled');
});
test('Desktop idle alone is not completion, and other turns never supply the current result or tools',()=>{
 const peer=desktopPeer(),id={source:'codex-conversations-v1' as const,operationId:'op',threadId:peer.snapshot.threadId,turnId:'original'};
 const mismatch=projectConversation(peer.snapshot,id);assert.equal(mismatch.phase,'unknown');assert.equal(mismatch.tools.scope,'unavailable');assert.equal(mismatch.tools.total,null);assert.equal(mismatch.capabilities.toolEvents.state,'unavailable');
 const old={...peer.snapshot,status:'idle' as const,lastTurn:undefined,viewCapabilities:undefined};assert.equal(projectConversation(old,{...id,turnId:'turn-0001'}).phase,'unknown');
});
test('AI lost receipt restores the exact immutable idempotent request without a second execution',async()=>{
 const peer=taskPeer();peer.lose();const controller=new RunController(createAITaskRunAdapter(peer.client)),input=request();await controller.submit(input);input.instruction='new text';
 assert.equal(controller.getSnapshot().submission.state,'unknown');await assert.rejects(controller.submit(request('different')),{code:'RUN_NOT_READY'});
 const point=controller.getCheckpoint()!,restored=new RunController(createAITaskRunAdapter(peer.client),{checkpoint:point});assert.equal(peer.requests.length,1);await restored.refresh();
 assert.equal(peer.tasks.size,1);assert.equal(peer.requests.length,1);assert.equal(point.request.instruction,'synthetic input');assert.equal(restored.getSnapshot().identity?.source,'ai-task-v1');assert.equal(restored.getSnapshot().submission.state,'accepted');assert.equal(restored.getSnapshot().observation?.phase,'running');
});
test('Desktop lost receipt queries the original operation; genuinely missing requests only retry explicitly with that same id',async()=>{
 const peer=desktopPeer();peer.lose();const controller=new RunController(createDesktopRunAdapter(peer.client));await controller.submit(desktopRequest());await controller.refresh();assert.equal(peer.creates,1);assert.equal(peer.writes.length,1);assert.equal(controller.getSnapshot().submission.state,'accepted');assert.equal(controller.getSnapshot().observation?.phase,'running');
 const missing=desktopPeer();missing.missing();const next=new RunController(createDesktopRunAdapter(missing.client));await next.submit(desktopRequest());await next.refresh();assert.equal(next.getSnapshot().submission.state,'unknown');assert.equal(missing.creates,0);await next.retryOriginal();await next.refresh();assert.equal(missing.creates,1);assert.equal(missing.writes.length,2);assert.equal(missing.writes[0].input.operationId,missing.writes[1].input.operationId);
});
test('cancel acknowledgement does not confirm stop; a lost stop request uses its original operation id',async()=>{
 const peer=desktopPeer(),controller=new RunController(createDesktopRunAdapter(peer.client),{operationId:()=> 'cancel-original'});await controller.submit(desktopRequest());await controller.refresh();peer.loseCancel();await controller.cancel();assert.equal(controller.getSnapshot().cancellation?.state,'unknown');await controller.refresh();assert.equal(peer.writes.filter(x=>x.method==='interrupt').length,1);
 await controller.retryCancellation();assert.equal(controller.getSnapshot().cancellation?.state,'accepted');assert.equal(controller.getSnapshot().observation?.stopConfirmed,false);assert.deepEqual(peer.writes.filter(x=>x.method==='interrupt').map(x=>x.input.operationId),['cancel-original','cancel-original']);
 await assert.rejects(controller.submit(desktopRequest('another-operation')),{code:'RUN_NOT_READY'});peer.stop();await controller.refresh();assert.equal(controller.getSnapshot().cancellation?.state,'confirmed');assert.equal(controller.getSnapshot().observation?.phase,'cancelled');
});
test('public answers preserve current native version and convert exactly one string per question',async()=>{
 const peer=desktopPeer(),controller=new RunController(createDesktopRunAdapter(peer.client),{operationId:()=> 'answer-original'});await controller.submit(desktopRequest());peer.question();await controller.refresh();const question=controller.getSnapshot().observation!.questions[0],input={version:question.version,turnId:question.turnId,request:question.request,answers:{q:'one'}};
 assert.equal(controller.getSnapshot().observation?.executionStatus,'running');await assert.rejects(controller.answer({...input,version:'stale'}),{code:'RUN_ARGUMENT'});await controller.answer(input);const sent=peer.writes.find(x=>x.method==='answer')!.input;assert.deepEqual(sent.answers,{q:['one']});assert.equal(sent.version,question.version);assert.equal(controller.getSnapshot().answer?.state,'confirmed');await controller.refresh();assert.equal(controller.getSnapshot().observation?.questions.length,0);
 const adapter=createDesktopRunAdapter(peer.client);await assert.rejects(adapter.answer!({source:'codex-conversations-v1',operationId:'op',threadId:peer.snapshot.threadId,turnId:'turn-0001'},{...input,answers:{q:['one','two'] as never}},'bad-answer'),{code:'RUN_ARGUMENT'});
});
test('verified previous results survive the next run and disconnection without pretending the new run stopped',async()=>{
 const peer=taskPeer(),controller=new RunController(createAITaskRunAdapter(peer.client));await controller.submit(request());peer.complete();await controller.refresh();assert.equal(controller.getSnapshot().observation?.result.record?.persistence,'service-verified');await controller.submit(request('second'));assert.equal(controller.getSnapshot().previousResults[0].value,'verified result');peer.offline(true);await controller.refresh();assert.equal(controller.getSnapshot().connection,'disconnected');assert.equal(controller.getSnapshot().observation?.phase,'running');assert.equal(controller.getSnapshot().previousResults.length,1);peer.offline(false);await controller.refresh();assert.equal(controller.getSnapshot().connection,'connected');
});
test('watching resumes for a new run after terminal sleep, and disposing never cancels execution',async()=>{
 const peer=taskPeer(),controller=new RunController(createAITaskRunAdapter(peer.client));const dispose=controller.watch({intervalMs:250});await controller.submit(request());peer.complete();await controller.refresh();const count=peer.events;await pause(20);assert.equal(peer.events,count);await controller.submit(request('second'));await until(()=>peer.events>count);dispose();assert.equal(peer.cancels,0);
});
test('actual AI service idempotency and durable results pass through the public client/controller',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-run-adapter-'));let runs=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const service=createAITaskService(root,{pollMs:10,executors:{'openai-responses-v1':{execute:async()=>{runs++;await gate;return {text:'durable result'};}}}});t.after(async()=>{release();await service.close();await rm(root,{recursive:true,force:true});});
 await service.config('connections',{revision:0,items:[{id:'api',kind:'api',enabled:true,protocolId:'openai-responses-v1',baseURL:'https://example.invalid/v1',credentialRef:'env:SYNTHETIC',concurrency:1}]});await service.config('profiles',{revision:0,items:[{id:'text',executorId:'api',enabled:true,model:'synthetic',timeoutMs:1000,maxAttempts:1,retryDelayMs:0,maxInputBytes:4096,maxOutputBytes:4096}]});
 const caller={appId:'com.example.run'};let lose=true;
 const client=createAIClient({services:{async call(_service,method,params=[]){const value=await (service as any)[method](caller,...params);if(method==='submit'&&lose){lose=false;throw Error('lost durable reply');}return value;}}});
 const controller=new RunController(createAITaskRunAdapter(client));await controller.submit(request());await controller.refresh();await until(()=>runs===1);release();await until(()=>runs===1);for(let i=0;i<100&&controller.getSnapshot().observation?.phase!=='succeeded';i++){await controller.refresh();await pause();}
 assert.equal(runs,1);assert.equal(controller.getSnapshot().observation?.phase,'succeeded');assert.equal(controller.getSnapshot().observation?.result.record?.value,'durable result');assert.equal(controller.getSnapshot().observation?.result.state,'verified');
});
test('a mismatched post-submit identity is unknown rather than proof that the original was rejected',async()=>{
 const peer=taskPeer(),adapter=createAITaskRunAdapter(peer.client),submit=adapter.submit;adapter.submit=async input=>{const update=await submit(input);update.receipt!.identity={source:'ai-task-v1',idempotencyKey:'another'};update.observation=undefined;return update;};
 const controller=new RunController(adapter);await controller.submit(request());assert.equal(controller.getSnapshot().submission.state,'unknown');assert.equal(controller.getSnapshot().pending?.identity.source,'ai-task-v1');assert.equal(peer.tasks.size,1);
});
test('a rejected retry never erases an earlier unknown submission or its immutable identity',async()=>{
 const peer=desktopPeer();peer.missing();const adapter=createDesktopRunAdapter(peer.client),controller=new RunController(adapter);await controller.submit(desktopRequest());
 adapter.retrySubmission=async()=>{throw Object.assign(Error('pre-write denied on retry'),{code:'CODEX_ARGUMENT',outcomeUnknown:false});};await controller.retryOriginal();assert.equal(controller.getSnapshot().submission.state,'unknown');assert.equal(controller.getSnapshot().error?.outcomeUnknown,true);assert.equal(controller.getCheckpoint()!.identity.source,'codex-conversations-v1');
});
test('bad result digests are not cached as verified and later valid reads can recover',async()=>{
 const peer=taskPeer(),client=peer.client,read=client.readResult;let wrong=true,calls=0;client.readResult=async id=>{calls++;const result=await read(id);return {...result,sha256:wrong?'b'.repeat(64):result.sha256};};
 const controller=new RunController(createAITaskRunAdapter(client));await controller.submit(request());peer.complete();await controller.refresh();assert.equal(controller.getSnapshot().observation?.result.state,'unknown');assert.equal(controller.getSnapshot().observation?.result.record,null);wrong=false;await controller.refresh();assert.equal(controller.getSnapshot().observation?.result.state,'verified');assert.equal(calls,2);
});
test('native final messages remain native history, and source cursors cannot cross adapters',async()=>{
 const peer=desktopPeer();peer.snapshot.lastTurn!.status='completed';peer.snapshot.status='idle';peer.snapshot.turnId=null;peer.snapshot.messages=[{id:'final',turnId:'turn-0001',role:'assistant',phase:'final_answer',text:'native result'}];
 const identity={source:'codex-conversations-v1' as const,operationId:'op',threadId:peer.snapshot.threadId,turnId:'turn-0001'},view=projectConversation(peer.snapshot,identity);assert.equal(view.result.record?.persistence,'native-history');assert.equal(view.phase,'succeeded');
 await assert.rejects(createDesktopRunAdapter(peer.client).read(identity,{source:'ai-task-v1',afterSeq:0}),{code:'RUN_SOURCE_MISMATCH'});
 const tasks=taskPeer();await assert.rejects(createAITaskRunAdapter(tasks.client).read({source:'ai-task-v1',idempotencyKey:'k',aiTaskId:'t'},{source:'codex-conversations-v1',version:'v'}),{code:'RUN_SOURCE_MISMATCH'});
});


test('an async answer follows only its verified continuation while preserving the original submission and prior result',async()=>{
 const peer=desktopPeer(),controller=new RunController(createDesktopRunAdapter(peer.client),{operationId:()=> 'async-answer-original'});await controller.submit(desktopRequest());peer.question();peer.snapshot.turnId=null;peer.snapshot.lastTurn!.status='completed';peer.snapshot.messages=[{id:'prior',role:'assistant',turnId:'turn-0001',phase:'final_answer',text:'prior native result'}];await controller.refresh();
 assert.equal(controller.getSnapshot().observation?.phase,'waiting-input');const q=controller.getSnapshot().observation!.questions[0];peer.continueIn('turn-continuation');await controller.answer({version:q.version,turnId:q.turnId,request:q.request,answers:{q:'one'}});await controller.refresh();
 const identity=controller.getSnapshot().identity!;assert.equal(identity.source,'codex-conversations-v1');if(identity.source!=='codex-conversations-v1')assert.fail();assert.equal(identity.operationId,'operation-original');assert.equal(identity.turnId,'turn-0001');assert.deepEqual(identity.continuation,{operationId:'async-answer-original',turnId:'turn-continuation'});assert.equal(controller.getSnapshot().observation?.phase,'running');assert.equal(controller.getSnapshot().previousResults[0].value,'prior native result');
 const restored=new RunController(createDesktopRunAdapter(peer.client),{checkpoint:controller.getCheckpoint()!});await restored.refresh();assert.equal(restored.getSnapshot().observation?.phase,'running');
 peer.snapshot.lastTurn!.turnId='unrelated-turn';peer.snapshot.turnId='unrelated-turn';peer.bump();await restored.refresh();assert.equal(restored.getSnapshot().observation?.phase,'unknown');assert.equal(restored.getSnapshot().observation?.tools.total,null);
});


test('recovery lookup never creates a missing AI task and clients without lookup never silently resubmit',async()=>{
 const peer=taskPeer(),submit=peer.client.submit;let first=true;peer.client.submit=async input=>{if(first){first=false;throw Error('not received');}return submit(input);};
 const controller=new RunController(createAITaskRunAdapter(peer.client));await controller.submit(request());const restored=new RunController(createAITaskRunAdapter(peer.client),{checkpoint:controller.getCheckpoint()!});await restored.refresh();assert.equal(peer.tasks.size,0);assert.equal(restored.getSnapshot().submission.state,'unknown');assert.equal(restored.getSnapshot().connection,'connected');
 await restored.retryOriginal();assert.equal(peer.tasks.size,1);assert.equal(peer.requests[0].idempotencyKey,'first');
 const noLookup=taskPeer();noLookup.lose();delete noLookup.client.lookup;const old=new RunController(createAITaskRunAdapter(noLookup.client));await old.submit(request());await old.refresh();assert.equal(noLookup.requests.length,1);assert.equal(old.getSnapshot().submission.receipt?.error?.code,'RUN_LOOKUP_UNSUPPORTED');
});
