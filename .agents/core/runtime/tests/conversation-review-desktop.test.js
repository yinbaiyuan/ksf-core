import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopRequest, desktopStep, validateReviewJSON } from '../../applications/conversations/backend/review-desktop.js';
import { extractionSchema, reportSchema } from '../../applications/conversations/backend/review-model.js';
import { createReviews } from '../../applications/conversations/backend/reviews.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capabilityAdoption } from '../../applications/conversations/backend/review-capability.js';

const capability={id:'competency.ksf.work-review',ref:'competency.ksf.work-review@0.1.0',name:'工作回顾',version:'0.1.0',source:'system',userRevision:null,definitionDigest:'d'.repeat(64)};
const proof=()=>({taskId:'task',hookState:'observed',routeTurnId:'turn',chat:{system:{turnId:'turn'},abilities:[{objectId:capability.id,participatedInCurrentTurn:true,runId:'run',abilityTurnNumber:1,version:{revision:1}}]},route:{abilities:[{...capability,stage:'adopted'}]}});

function fixture(selected) {
  const request = desktopRequest({id:'run',date:'2026-10-30',capability:selected,desktopProject:{name:'test',scope:'current'}},'extract-one','整理证据',{messages:[]},extractionSchema);
  const saved = {request,state:'prepared'}, calls = [];
  const output = {facts:[],notes:'合成证据',artifacts:[]};
  let operation = null, status = 'idle', records = [], time = 0, historyChanged = false, ksf;
  const call = async (_service, method, input) => {
    calls.push({method,input});
    if(method==='operation') { if(!operation)throw Object.assign(Error('missing'),{code:'CODEX_OPERATION_MISSING'});return operation; }
    if(method==='create') { operation={status:'accepted',threadId:'thread',turnId:'turn'};return operation; }
    if(method==='read')return{status,version:'v1',ksf};
    if(method==='history') { if(historyChanged){historyChanged=false;throw Object.assign(Error('history changed'),{code:'CODEX_HISTORY_CHANGED'});}return{version:'v1',records:records.slice(input.offset,input.offset+50),nextOffset:records.length>input.offset+50?input.offset+50:null}; }
    throw Error(method);
  };
  const response = (extra={})=>({id:'assistant',role:'assistant',turnId:'turn',phase:'final_answer',text:JSON.stringify({protocol:'ksf-review-result-v1',operationId:request.operationId,inputDigest:request.inputDigest,result:output}),...extra});
  records=[{id:'user',role:'user',turnId:'turn',text:'project header\n'+request.create.text}];
  return {saved,calls,output,response,records,step:()=>desktopStep({saved,persist(){},call,now:()=>time}),setOperation(v){operation=v;},setStatus(v){status=v;},setTime(v){time=v;},setProof(v){ksf=v;},changeHistory(){historyChanged=true;}};
}
test('new Desktop reviews use a pinned competency and require native adoption, not model self-report',async()=>{
  const f=fixture(capability);assert.match(f.saved.request.create.text,/competency read competency.ksf.work-review@0.1.0/);assert(!f.saved.request.create.text.includes('整理证据\n最终'));
  f.records.push(f.response());assert.equal(await f.step(),null);f.setTime(60001);await assert.rejects(f.step(),{code:'REVIEW_RECONCILING'});
  assert.notEqual(f.saved.state,'succeeded');f.setProof(proof());assert.deepEqual(await f.step(),f.output);assert.equal(f.saved.receipt.capability.definitionDigest,capability.definitionDigest);assert.equal(f.calls.filter(c=>c.method==='create').length,1);
});
test('adoption from another turn, another revision or a declared-only capability is insufficient',()=>{
  for(const alter of [v=>v.routeTurnId='old',v=>v.chat.system.turnId='old',v=>v.chat.abilities[0].participatedInCurrentTurn=false,v=>v.route.abilities[0].definitionDigest='e'.repeat(64),v=>v.route.abilities[0].userRevision=2,v=>v.route.abilities[0].stage='read']){
    const value=proof();alter(value);assert.equal(capabilityAdoption(value,capability,'turn'),null);
  }
});
test('Desktop adopts only complete correlated final JSON after idle and records a durable result receipt',async()=>{
  const f=fixture();f.records.push(f.response());assert.deepEqual(await f.step(),f.output);assert.equal(f.saved.receipt.turnId,'turn');assert.equal(f.saved.receipt.messageId,'assistant');assert.equal(f.saved.request,null);assert.equal(f.calls.filter(c=>c.method==='create').length,1);
  assert.deepEqual(await f.step(),f.output);assert.equal(f.calls.filter(c=>c.method==='create').length,1);
});
test('dispatch acceptance, active generation and idle without result never establish success',async()=>{
  const f=fixture();f.setStatus('running');assert.equal(await f.step(),null);f.setStatus('idle');assert.equal(await f.step(),null);f.setTime(16001);await assert.rejects(f.step(),{code:'REVIEW_RECONCILING'});assert.notEqual(f.saved.state,'succeeded');assert.equal(f.calls.filter(c=>c.method==='create').length,1);
});
test('unknown dispatch reconciles original ID without creating again, including process-resumed state',async()=>{
  const f=fixture();f.setOperation({status:'unknown',threadId:'thread',error:{outcomeUnknown:true}});await assert.rejects(f.step(),{code:'REVIEW_RECONCILING'});assert.equal(f.calls.filter(c=>c.method==='create').length,0);
  f.setOperation({status:'accepted',threadId:'thread',turnId:'turn'});f.records.push(f.response());assert.deepEqual(await f.step(),f.output);
});
test('another turn, wrong correlation, truncation and user-input requests remain unadopted',async()=>{
  for(const message of [{turnId:'other'},{truncated:true},{text:JSON.stringify({protocol:'ksf-review-result-v1',operationId:'wrong',inputDigest:'wrong',result:{}})}]){
    const f=fixture();f.records.push(f.response(message));if(message.turnId)assert.equal(await f.step(),null);else await assert.rejects(f.step(),{code:'REVIEW_RECONCILING'});assert.notEqual(f.saved.state,'succeeded');
  }
  const f=fixture();f.setStatus('question');await assert.rejects(f.step(),{code:'REVIEW_RECONCILING'});
});
test('invalid final JSON/schema fails visibly, history is paged and errors never authorize fallback',async()=>{
  const f=fixture();f.records.push(f.response({text:'not json'}));await assert.rejects(f.step(),{code:'REVIEW_DESKTOP_FORMAT'});assert.equal(f.saved.state,'failed');
  const g=fixture();g.records.push(...Array.from({length:70},(_,i)=>({id:String(i),role:'assistant',turnId:'turn',phase:'commentary',text:'progress'})),g.response());assert.deepEqual(await g.step(),g.output);assert.equal(g.calls.filter(c=>c.method==='history').length,2);
  assert.throws(()=>validateReviewJSON({summary:'',workItems:[],findings:[],suggestions:[],chatClosures:[],extra:true},reportSchema),{code:'REVIEW_DESKTOP_FORMAT'});
  assert.throws(()=>validateReviewJSON({facts:[],notes:123,artifacts:[]},extractionSchema),{code:'REVIEW_DESKTOP_FORMAT'});
});

test('history version changes retry reads without redispatch and request prefix survives a truncated user preview',async()=>{
  const f=fixture();f.records[0].text='project header\n'+f.saved.request.marker;f.records[0].truncated=true;f.records.push(f.response());f.changeHistory();
  assert.equal(await f.step(),null);assert.deepEqual(await f.step(),f.output);assert.equal(f.calls.filter(c=>c.method==='create').length,1);
  const reads=f.calls.filter(c=>c.method==='history');assert.equal(reads[0].input.version,undefined);
});

test('application runs both Desktop steps, saves report provenance and resumes after a process restart without task fallback',async t=>{
  const root=mkdtempSync(join(tmpdir(),'ksf-review-desktop-test-')), taskId='a'.repeat(64), at='2026-10-30T02:00:00Z';
  const turn={taskId,turnId:'one',revision:1,digest:'digest',status:'completed',startedAt:at,updatedAt:at,messages:[{id:'u',role:'user',at,text:'合成草稿，未验证',timeKnown:true}],route:null,issues:[]};
  const chat={taskId,title:'合成聊天',fingerprint:'fp',turns:[{...turn,allowed:true}],errors:[],latestMessageAt:at,latestTurnId:'one'};
  const operations=new Map();let active=true,submits=0,definitionDigest=capability.definitionDigest;
  const context={dataDirectory:join(root,'user'),runtimeDataDirectory:join(root,'runtime'),services:{async call(service,method,[input]=[]){
    if(service==='capabilities')return{id:capability.id,version:capability.version,source:capability.source,user_revision:null,definition_digest:definitionDigest,metadata:{name:capability.name},body:'Synthetic method'};
    if(service==='projects')return{data:{project:{name:'fixture'},projects:[{name:'fixture',scope:'current'}]},errors:[]};
    if(service==='ai'){if(method==='describe')return{profiles:[]};throw Error('task fallback forbidden');}
    if(service==='tasks')return method==='reviewSources'?{records:[turn],chats:[chat],errors:[],capture:{enabled:true},nextOffset:null}:{...turn,nextOffset:null};
    if(service==='codex-conversations'){
      if(method==='check')return{available:true};
      if(method==='operation'){if(!operations.has(input.operationId))throw Object.assign(Error('missing'),{code:'CODEX_OPERATION_MISSING'});return operations.get(input.operationId).operation;}
      if(method==='create'){
        submits++;const body=JSON.parse(input.text.split('--- 证据材料开始 ---\n')[1].split('\n--- 证据材料结束 ---')[0]);
        const envelope=JSON.parse(input.text.split('信封：')[1].split('\nresult schema：')[0]), citations=body.sourceMap?Object.keys(body.sourceMap):[body.messages[0].sourceId];
        const fact={key:'draft',title:'合成草稿',goal:'形成草稿',result:'仅草稿，未验证',stage:'implemented',openItems:['实际验证'],citations};
        envelope.result=body.sourceMap?{summary:'合成草稿待验证',workItems:[fact],findings:[],suggestions:[],chatClosures:[{taskId,closed:false,reason:'实际验证尚未完成',openItems:['实际验证'],unknownOperations:[],citations}]}:{facts:[fact],notes:'',artifacts:[]};
        const operation={operationId:input.operationId,status:'accepted',threadId:input.operationId,turnId:'native-turn'};
        operations.set(input.operationId,{operation,records:[{id:'user',role:'user',turnId:'native-turn',text:input.text},{id:'result',role:'assistant',turnId:'native-turn',phase:'final_answer',text:JSON.stringify(envelope)}]});return operation;
      }
      if(method==='read'){const ksf=proof();ksf.route.abilities[0].definitionDigest=definitionDigest;ksf.routeTurnId='native-turn';ksf.chat.system.turnId='native-turn';return{status:active?'running':'idle',version:'v',ksf};}
      if(method==='history')return{records:operations.get(input.threadId).records,version:'v',nextOffset:null};
    }
    throw Error(service+'/'+method);
  }}};
  let app=createReviews(context,{now:()=>Date.parse('2026-10-30T05:00:00Z'),timerMs:100000});
  t.after(async()=>{await app.dispose();rmSync(root,{recursive:true,force:true});});
  await app.call('review.configure',{enabled:false,profileId:'',executionKind:'desktop',desktopProject:{name:'fixture',scope:'current'},timeZone:'Asia/Shanghai',time:'06:00'});
  const accepted=await app.call('review.generate',{date:'2026-10-30'});await app.pump();assert.equal(submits,1);await app.dispose();active=false;
  app=createReviews(context,{now:()=>Date.parse('2026-10-30T05:00:00Z'),timerMs:100000});await app.pump();
  const report=await app.call('review.read',{id:accepted.id});assert.equal(submits,2);assert.equal(report.execution.kind,'desktop');assert.equal(report.executionReceipts.length,2);assert.equal(report.reviewedAt,null);assert.equal(report.closures[0].eligible,false);
  await app.dispose();app=createReviews(context,{timerMs:100000});assert.deepEqual((await app.call('review.read',{id:report.id})).executionReceipts,report.executionReceipts);
  assert.equal((await app.call('review.generate',{date:'2026-10-30'})).id,report.id);assert.equal(submits,2);
  definitionDigest='e'.repeat(64);const revised=await app.call('review.generate',{date:'2026-10-30'});assert.notEqual(revised.id,report.id);await app.pump();
  assert.equal(submits,4);const next=await app.call('review.read',{id:revised.id});assert.equal(next.execution.capability.definitionDigest,definitionDigest);assert.equal(next.executionReceipts.length,2);
});
