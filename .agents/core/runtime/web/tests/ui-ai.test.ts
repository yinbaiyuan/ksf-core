import test from 'node:test';
import assert from 'node:assert/strict';
import {answerSnapshot,promptSnapshot,requestActionable,runStatusAxes,resultReadyForIntent,canRequestStop} from '../../../applications/projects/ai-model.ts';
import {projectAITask} from '../../../applications/sdk/src/controllers/run-projections.ts';
import type {RunQuestion,RunView} from '../../../applications/sdk/src/controllers/run-types';
import {createDesktopRunAdapter} from '../../../applications/sdk/src/controllers/run-adapters.ts';

const available={state:'available',reason:''} as const;
const question:RunQuestion={request:{type:'string',value:'original-request'},version:'v17',turnId:'original-turn',answerFormat:'single-text',questions:[{id:'first',question:'选择一个范围',isOther:false,options:[{label:'当前项目'},{label:'整个实例'}]},{id:'second',question:'补充说明',isOther:true}]};
function view():RunView{return {source:'ai-task-v1',identity:{source:'ai-task-v1',idempotencyKey:'original-submit'},submission:{state:'accepted',receipt:null},observation:null,connection:'connected',pending:null,cancellation:null,answer:null,previousResults:[],error:null};}
test('composer snapshots retain the submitted draft version and immutable resource references while later editing stays independent',()=>{
 const resource={id:'r',label:'原件',source:'workspace',kind:'file' as const,availability:'available' as const,ref:{scope:'workspace' as const,path:'资料/a.md'}};
 const snapshot=promptSnapshot('第一份草稿',7,[resource]);resource.ref.path='资料/b.md';
 assert.equal(snapshot.draft,'第一份草稿');assert.equal(snapshot.draftVersion,7);assert.equal(snapshot.resources[0].ref?.path,'资料/a.md');assert.ok(Object.isFrozen(snapshot));assert.ok(Object.isFrozen(snapshot.resources[0].ref));
 assert.throws(()=>promptSnapshot('x',-1,[]));assert.throws(()=>promptSnapshot('x',Number.MAX_SAFE_INTEGER+1,[]));
});
test('public replies keep original version, turn and request reference and exactly one string per declared question',()=>{
 const values={first:'当前项目',second:'请保留原文件',unrelated:'不提交'};const snapshot=answerSnapshot(question,values);values.second='后续编辑';
 assert.deepEqual(snapshot.answers,{first:'当前项目',second:'请保留原文件'});assert.equal(snapshot.turnId,'original-turn');assert.equal(snapshot.version,'v17');assert.deepEqual(snapshot.request,question.request);assert.ok(Object.isFrozen(snapshot.answers));assert.ok(Object.isFrozen(snapshot.request));
 assert.throws(()=>answerSnapshot(question,{first:['当前项目'] as any,second:'说明'}),/每题/);assert.throws(()=>answerSnapshot(question,{first:'自选范围',second:'说明'}),/提供的选项/);assert.throws(()=>answerSnapshot(question,{first:'当前项目',second:''}),/每题/);assert.throws(()=>answerSnapshot(question,{first:'当前项目',second:'x'.repeat(8001)}),/8000/);
});
test('unsupported and duplicate question schemas cannot emit a public reply',()=>{
 assert.throws(()=>answerSnapshot({...question,answerFormat:'multiple-choice' as any},{first:'当前项目',second:'x'}),/原生/);
 assert.throws(()=>answerSnapshot({...question,questions:[question.questions[0],question.questions[0]]},{first:'当前项目'}),/唯一/);
 const special={...question,questions:[{id:'__proto__',question:'说明'}]};const values=Object.create(null);values.__proto__='明确的文本';const answer=answerSnapshot(special,values);assert.equal(Object.getPrototypeOf(answer.answers),Object.prototype);assert.equal(Object.getOwnPropertyDescriptor(answer.answers,'__proto__')?.value,'明确的文本');
});
test('accepted, unknown, expired and confirmed requests do not allow another decision or answer',()=>{
 for(const state of ['submitting','accepted','unknown','expired','confirmed'] as const)assert.equal(requestActionable(state,available),false);
 for(const state of ['waiting','failed'] as const){assert.equal(requestActionable(state,available),true);assert.equal(requestActionable(state,{state:'unsupported',reason:'此路径不提供'}),false);assert.equal(requestActionable(state,{state:'unavailable',reason:'当前不可用'}),false);}
});
test('acceptance is not execution, and disconnected observations retain independent execution, stop and result facts',()=>{
 const current=view();assert.equal(runStatusAxes(current).submission,'提交已受理');assert.equal(runStatusAxes(current).execution,'尚未取得执行快照');
 current.connection='disconnected';current.cancellation={operationId:'original-stop',state:'unknown',status:'unknown'};
 current.observation={identity:current.identity!,version:'r1',rawStatus:'running',executionStatus:'running',phase:'waiting-input',stopConfirmed:false,cancelRequested:false,capabilities:{cancel:available,results:available,toolEvents:available,publicQuestions:available,nativeApprovals:available,privateInput:available},tools:{records:[],total:0,truncated:false,scope:'latest-turn'},questions:[],native:{approvals:false,privateInput:false},result:{state:'unknown',record:null},error:null};
 const axes=runStatusAxes(current);assert.equal(axes.execution,'执行中');assert.equal(axes.attention,'有公开问题待回答');assert.equal(axes.stop,'停止请求结果待核实');assert.equal(axes.result,'结果待核实');assert.match(axes.connection,/保留上次快照/);assert.equal(current.observation.phase,'waiting-input');
});
test('a cancelled execution marker alone never becomes an actual stop confirmation',()=>{
 const current=view();current.observation={identity:current.identity!,version:'r2',rawStatus:'cancelled',executionStatus:'cancelled',phase:'cancelled',stopConfirmed:false,cancelRequested:true,capabilities:{} as any,tools:{records:[],total:null,truncated:false,scope:'unsupported'},questions:[],native:{approvals:false,privateInput:false},result:{state:'none',record:null},error:null};
 assert.equal(runStatusAxes(current).stop,'已请求停止，等待实际确认');current.observation.stopConfirmed=true;assert.equal(runStatusAxes(current).stop,'已确认停止');
});
test('native history can support an explicit result intent without being called service-verified; truncation, unknown and a changed run still block it',()=>{
 const current=view();current.source='codex-conversations-v1';current.identity={source:'codex-conversations-v1',operationId:'original',threadId:'native',turnId:'turn'};current.observation={identity:current.identity,version:'n1',rawStatus:'idle',executionStatus:'completed',phase:'succeeded',stopConfirmed:true,cancelRequested:false,capabilities:{results:available} as any,tools:{records:[],total:null,truncated:false,scope:'unsupported'},questions:[],native:{approvals:false,privateInput:false},result:{state:'available',record:{runId:'native/turn',source:'codex-conversations-v1',version:'n1',format:'text',value:'结果',persistence:'native-history'}},error:null};
 assert.equal(resultReadyForIntent(current),true);assert.equal(current.observation.result.record!.persistence,'native-history');
 current.observation.result.record!.truncated=true;assert.equal(resultReadyForIntent(current),false);delete current.observation.result.record!.truncated;
 current.submission.state='unknown';assert.equal(resultReadyForIntent(current),false);current.submission.state='accepted';current.observation.result.record!.runId='native/unrelated-turn';assert.equal(resultReadyForIntent(current),false);current.observation.result.record!.runId='native/turn';current.observation.result.record!.version='unrelated-version';assert.equal(resultReadyForIntent(current),false);current.observation.result.record!.version='n1';current.observation.phase='unknown';assert.equal(resultReadyForIntent(current),false);
});
test('the component reply snapshot passes through the real Desktop adapter with its original identity and one text per question',async()=>{
 const calls:unknown[]=[],client={answer:async(input:any)=>{calls.push(input);if(input.version!=='v17')throw Object.assign(Error('服务拒绝旧版本'),{code:'VERSION_CONFLICT'});return {operationId:input.operationId,method:'answer',status:'accepted',threadId:input.threadId,turnId:'original-turn',createdAt:'recorded',updatedAt:'recorded'};}};
 const adapter=createDesktopRunAdapter(client as any),identity={source:'codex-conversations-v1' as const,operationId:'original-run',threadId:'original-thread',turnId:'original-turn'},reply=answerSnapshot(question,{first:'当前项目',second:'保留原件'});
 const receipt=await adapter.answer!(identity,reply,'original-answer');assert.equal(receipt.state,'accepted');assert.equal(receipt.operationId,'original-answer');
 assert.deepEqual(calls[0],{operationId:'original-answer',threadId:'original-thread',version:'v17',request:{type:'string',value:'original-request'},answers:{first:['当前项目'],second:['保留原件']}});
 await assert.rejects(adapter.answer!(identity,{...reply,turnId:'unrelated-turn'},'do-not-dispatch'),{code:'RUN_ARGUMENT'});assert.equal(calls.length,1);
 await assert.rejects(adapter.answer!(identity,{...reply,version:'stale'},'same-service-validation'),{code:'VERSION_CONFLICT'});
});
test('the real task projection keeps a queued or retry-wait job cancellable even when there is no active process to stop',()=>{
 const current=view();current.identity={source:'ai-task-v1',idempotencyKey:'original-submit',aiTaskId:'queued-task'};
 const task={aiTaskId:'queued-task',status:'queued',revision:1,timestamps:{},output:null,error:null,execution:{attempts:[]}};
 current.observation=projectAITask(task as any,current.identity);assert.equal(current.observation.stopConfirmed,true);assert.equal(runStatusAxes(current).phase,'排队中');assert.equal(runStatusAxes(current).stop,'尚未开始执行');assert.equal(canRequestStop(current),true);
 current.observation=projectAITask({...task,status:'retry_wait',execution:{attempts:[{stopConfirmed:true,executionOutcome:'failed'}]}} as any,current.identity);assert.equal(runStatusAxes(current).phase,'等待重试');assert.equal(canRequestStop(current),true);
 current.cancellation={operationId:'original-stop',state:'unknown',status:'unknown'};assert.equal(canRequestStop(current),false);current.cancellation=null;current.observation.phase='cancelled';assert.equal(canRequestStop(current),false);
});
