import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAITaskService } from '../src/ai-tasks/service.js';
import { fail, sha256, canonical } from '../src/ai-tasks/schema.js';

const caller={appId:'example.test',version:'1.0.0',releaseDigest:'a'.repeat(64)};
const connection={id:'api',kind:'api',enabled:true,protocolId:'openai-responses-v1',baseURL:'https://example.invalid/v1',credentialRef:'env:SYNTHETIC_AI_KEY',concurrency:1};
const profile={id:'text',executorId:'api',enabled:true,model:'synthetic-model',timeoutMs:1000,maxAttempts:2,retryDelayMs:0,maxInputBytes:1048576,maxOutputBytes:4096};
const request=(extra={})=>({contractVersion:'ai-task-v1',idempotencyKey:'one',profileId:'text',instruction:'整理材料',inputs:[{kind:'text',text:'虚构输入'}],outputSpec:{format:'text'},...extra});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,check,limit=3000){const end=Date.now()+limit;let value;do{value=await fn();if(check(value))return value;await pause(10);}while(Date.now()<end);assert.fail('condition timed out: '+JSON.stringify(value));}
async function fixture(t,execute=async()=>({text:'完成'}),options={}){
  const root=await mkdtemp(join(tmpdir(),'ksf-ai-test-'));
  const service=createAITaskService(root,{pollMs:10,executors:{'openai-responses-v1':{execute}},...options});
  const extra=[];t.after(async()=>{for(const item of extra)await item.close();await service.close();await rm(root,{recursive:true,force:true});});
  await service.config('connections',{revision:0,items:[connection]});await service.config('profiles',{revision:0,items:[profile]});
  return {root,service,extra,get:id=>service.get(caller,id)};
}
test('monitor cancellation distinguishes requested stop, settled stop and unknown execution',async t=>{
  let finish;const f=await fixture(t,()=>new Promise(resolve=>{finish=resolve;}));const one=await f.service.submit(caller,request());await until(()=>f.get(one.aiTaskId),v=>v.status==='running');
  const current=(await f.service.monitorSnapshot()).tasks[0];await assert.rejects(f.service.monitorCancel(one.aiTaskId,'old'),{code:'MONITOR_STALE'});await f.service.monitorCancel(one.aiTaskId,current.version);assert.equal((await f.service.monitorSnapshot()).tasks[0].status,'cancelling');finish({text:'late'});await until(()=>f.service.monitorSnapshot(),v=>v.tasks[0].status==='cancelled');
  const unknown=await fixture(t,async()=>{throw fail('AI_EXECUTION_UNKNOWN','unknown',{outcomeUnknown:true});});const two=await unknown.service.submit(caller,request());await until(()=>unknown.get(two.aiTaskId),v=>v.status==='reconciling');const row=(await unknown.service.monitorSnapshot()).tasks[0];await unknown.service.monitorCancel(two.aiTaskId,row.version);assert.equal((await unknown.service.monitorSnapshot()).tasks[0].status,'unknown');
});
test('service drain preserves queued AI work and resumes dispatch without replaying active work',async t=>{
  let finish,calls=0;const settled=new Promise(resolve=>{finish=resolve;});const f=await fixture(t,async()=>{calls++;await settled;return {text:'done'};});
  const first=await f.service.submit(caller,request());await until(async()=>f.service.runtimeStatus(),v=>v.active===1);
  const second=await f.service.submit(caller,request({idempotencyKey:'two'}));await f.service.pauseDispatch();finish();
  await until(()=>f.get(first.aiTaskId),v=>v.status==='succeeded');await f.service.tick();assert.equal((await f.get(second.aiTaskId)).status,'queued');assert.equal(calls,1);
  await assert.rejects(f.service.submit(caller,request({idempotencyKey:'three'})),{code:'AI_SERVICE_STOPPING'});
  f.service.resumeDispatch();await until(()=>f.get(second.aiTaskId),v=>v.status==='succeeded');assert.equal(calls,2);
});
test('C01: accepted tasks publish a durable result before success and replay ordered events',async t=>{
  const f=await fixture(t);const accepted=await f.service.submit(caller,request());assert.equal(accepted.status,'queued');
  const done=await until(()=>f.get(accepted.aiTaskId),v=>v.status==='succeeded');assert.equal(done.output.value,'完成');
  const result=JSON.parse(await readFile(join(f.root,'.agents/user-data/ai/results',done.aiTaskId+'.json'),'utf8'));assert.equal(result.value,'完成');
  assert.equal((await f.service.readResult(caller,done.aiTaskId)).value,'完成');await assert.rejects(f.service.readResult({appId:'other'},done.aiTaskId),{code:'AI_TASK_NOT_FOUND'});
  const batch=await f.service.events(caller,done.aiTaskId,1);assert.equal(batch.events[0].seq,2);assert.equal(new Set(batch.events.map(e=>e.seq)).size,batch.events.length);assert.equal(batch.snapshot.revision,done.revision);
});
test('C02/C03: concurrent duplicate keys execute once; key reuse with changed input conflicts',async t=>{
  let calls=0;const f=await fixture(t,async()=>{calls++;return{text:'ok'};});
  const all=await Promise.all(Array.from({length:12},()=>f.service.submit(caller,request())));assert.equal(new Set(all.map(v=>v.aiTaskId)).size,1);
  await until(()=>f.get(all[0].aiTaskId),v=>v.status==='succeeded');assert.equal(calls,1);
  await assert.rejects(f.service.submit(caller,request({instruction:'变更'})),{code:'AI_IDEMPOTENCY_CONFLICT'});
});
test('identity is scoped to the managed application; caller parameters cannot bypass it',async t=>{
  const f=await fixture(t);const task=await f.service.submit(caller,request());
  await assert.rejects(f.service.get({appId:'other'},task.aiTaskId),{code:'AI_TASK_NOT_FOUND'});
  await assert.rejects(f.service.cancel({appId:'other'},task.aiTaskId),{code:'AI_TASK_NOT_FOUND'});
  await assert.rejects(f.service.submit(caller,request({appId:'other'})),{code:'AI_REQUEST_INVALID'});
  const other=await f.service.submit({appId:'other'},request());assert.notEqual(task.aiTaskId,other.aiTaskId);
});
test('C04: profile edits never replace accepted snapshots or invalidate idempotent replay',async t=>{
  const seen=[];const f=await fixture(t,async({task})=>{seen.push(task.snapshot.profile.model);return{text:'ok'};});
  const one=await f.service.submit(caller,request());await f.service.config('profiles',{revision:1,items:[{...profile,model:'changed'}]});
  assert.equal((await f.service.submit(caller,request())).aiTaskId,one.aiTaskId);
  const two=await f.service.submit(caller,request({idempotencyKey:'two'}));await until(()=>f.get(two.aiTaskId),v=>v.status==='succeeded');assert.deepEqual(seen,['synthetic-model','changed']);
  await assert.rejects(f.service.config('profiles',{revision:1,items:[]}),{code:'AI_CONFIG_CONFLICT'});
});
test('C04/C18: registered text material is immutable, digest checked and application scoped',async t=>{
  const f=await fixture(t);const material=await f.service.register(caller,{name:'稿件.txt',mimeType:'text/plain'},'转写原文');
  const input={kind:'material',materialId:material.materialId,sha256:material.sha256};
  await assert.rejects(f.service.submit({appId:'other'},request({inputs:[input]})),{code:'AI_MATERIAL_INVALID'});
  await writeFile(join(f.root,'.agents/user-data/ai/materials',material.materialId+'.bin'),'被修改');
  await assert.rejects(f.service.submit(caller,request({inputs:[input]})),{code:'AI_MATERIAL_INVALID'});
});
test('C05: a deadline exhausted in the queue never creates an attempt',async t=>{
  let calls=0;const f=await fixture(t,async()=>{calls++;return{text:'ok'};});
  const task=await f.service.submit(caller,request({deadlineAt:'2020-01-01T08:00:00+08:00'}));const done=await until(()=>f.get(task.aiTaskId),v=>v.status==='failed');assert.equal(done.error.code,'AI_DEADLINE_EXCEEDED');assert.equal(done.execution.attempts.length,0);assert.equal(calls,0);
});
test('C06: safe transient failure retries a bounded attempt under the original identity',async t=>{
  let calls=0;const f=await fixture(t,async()=>{if(++calls===1)throw fail('AI_RATE_LIMITED','合成限流',{retryable:true});return{text:'ok'};});
  const task=await f.service.submit(caller,request());const done=await until(()=>f.get(task.aiTaskId),v=>v.status==='succeeded');assert.equal(done.execution.attempts.length,2);assert.equal(new Set(done.execution.attempts.map(a=>a.attemptId)).size,2);
});
test('JSON format failures retry but malformed or unsupported schema is rejected before acceptance',async t=>{
  let calls=0;const f=await fixture(t,async()=>({text:++calls===1?'not json':'{"value":null}'}));
  const spec={format:'json',schema:{type:'object',additionalProperties:false,properties:{value:{type:['string','null']}},required:['value']}};
  const task=await f.service.submit(caller,request({outputSpec:spec}));const done=await until(()=>f.get(task.aiTaskId),v=>v.status==='succeeded');assert.deepEqual(done.output.value,{value:null});assert.equal(calls,2);
  await assert.rejects(f.service.submit(caller,request({outputSpec:{format:'json',schema:{type:'string',pattern:'x'}}})),{code:'AI_REQUEST_INVALID'});
  await assert.rejects(f.service.submit(caller,request({idempotencyKey:'invalid-limits',limits:{maxAttempts:99}})),{code:'AI_REQUEST_INVALID'});
});
test('C07/C08: unknown outcomes retain concurrency even after task cancellation',async t=>{
  let calls=0;const f=await fixture(t,async()=>{calls++;throw fail('AI_EXECUTION_UNKNOWN','合成未知',{outcomeUnknown:true});});
  const one=await f.service.submit(caller,request());await until(()=>f.get(one.aiTaskId),v=>v.status==='reconciling');await f.service.cancel(caller,one.aiTaskId);
  const two=await f.service.submit(caller,request({idempotencyKey:'two'}));await pause(80);assert.equal((await f.get(two.aiTaskId)).status,'queued');assert.equal(calls,1);assert.equal((await f.get(one.aiTaskId)).execution.attempts[0].stopConfirmed,false);
});
test('C08/C10: cancellation wins over a late completion and retains the slot until settled',async t=>{
  let finish;let calls=0;const f=await fixture(t,async()=>{calls++;if(calls===1)return new Promise(resolve=>{finish=resolve;});return{text:'two'};});
  const one=await f.service.submit(caller,request());await until(()=>f.get(one.aiTaskId),v=>v.status==='running');
  await f.service.cancel(caller,one.aiTaskId);const two=await f.service.submit(caller,request({idempotencyKey:'two'}));await pause(30);assert.equal(calls,1);
  finish({text:'late'});await until(()=>f.get(two.aiTaskId),v=>v.status==='succeeded');const cancelled=await f.get(one.aiTaskId);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.output,null);assert.equal(cancelled.execution.attempts[0].stopConfirmed,true);
});
test('C08: success committed before cancellation stays successful',async t=>{
  const f=await fixture(t);const task=await f.service.submit(caller,request());await until(()=>f.get(task.aiTaskId),v=>v.status==='succeeded');assert.equal((await f.service.cancel(caller,task.aiTaskId)).status,'succeeded');
});
test('C09: reopening recovers queued data and never blindly replays an unknown execution',async t=>{
  const f=await fixture(t,async()=>{throw fail('AI_EXECUTION_UNKNOWN','合成未知',{outcomeUnknown:true});});const task=await f.service.submit(caller,request());await until(()=>f.get(task.aiTaskId),v=>v.status==='reconciling');await f.service.close();
  let calls=0;const restored=createAITaskService(f.root,{pollMs:10,executors:{'openai-responses-v1':{execute:async()=>{calls++;return{text:'wrong'};}}}});f.extra.push(restored);
  assert.equal((await restored.get(caller,task.aiTaskId)).status,'reconciling');await pause(30);assert.equal(calls,0);
});
test('C09: missing successful artifacts and future storage versions fail closed',async t=>{
  const f=await fixture(t);const task=await f.service.submit(caller,request());await until(()=>f.get(task.aiTaskId),v=>v.status==='succeeded');await f.service.close();
  await rm(join(f.root,'.agents/user-data/ai/results',task.aiTaskId+'.json'));
  const restored=createAITaskService(f.root);f.extra.push(restored);await assert.rejects(restored.start());
});
test('single writer ownership prevents two services from dispatching the same root',async t=>{
  const f=await fixture(t);const other=createAITaskService(f.root);t.after(()=>other.close());await assert.rejects(other.start(),{code:'AI_SERVICE_BUSY'});
});
test('C18/C19: credential values and unsupported capability declarations never enter snapshots',async t=>{
  const f=await fixture(t);await assert.rejects(f.service.config('connections',{revision:1,items:[{...connection,apiKey:'synthetic-secret'}]}),{code:'AI_REQUEST_INVALID'});
  await assert.rejects(f.service.submit(caller,request({requirements:['web-retrieval']})),{code:'AI_CAPABILITY_UNSUPPORTED'});
  const task=await f.service.submit(caller,request());await until(()=>f.get(task.aiTaskId),v=>v.status==='succeeded');const data=await readFile(join(f.root,'.agents/user-data/ai/tasks',task.aiTaskId+'.json'),'utf8');assert.ok(!data.includes('synthetic-secret'));assert.ok(data.includes('env:SYNTHETIC_AI_KEY'));
});
test('binary material uploads enforce a separate bounded streaming path',async t=>{
  const f=await fixture(t);const chunks=[Buffer.alloc(600000,1),Buffer.alloc(600000,2)];const value=await f.service.upload(caller,{name:'录音.wav',mimeType:'audio/wav'},chunks);assert.equal(value.size,1200000);assert.equal(value.sha256,sha256(Buffer.concat(chunks)));
  assert.ok((await readdir(join(f.root,'.agents/user-data/ai/materials'))).includes(value.materialId+'.bin'));
});
test('C19: unknown persisted schema is preserved without dispatch or overwrite',async t=>{
  const f=await fixture(t);const accepted=await f.service.submit(caller,request());await until(()=>f.get(accepted.aiTaskId),v=>v.status==='succeeded');await f.service.close();const path=join(f.root,'.agents/user-data/ai/tasks',accepted.aiTaskId+'.json');const stored=JSON.parse(await readFile(path,'utf8'));stored.schemaVersion=999;const bytes=JSON.stringify(stored);await writeFile(path,bytes);
  const restored=createAITaskService(f.root);f.extra.push(restored);await assert.rejects(restored.start(),{code:'AI_STORAGE_VERSION'});assert.equal(await readFile(path,'utf8'),bytes);
});
export { fixture, caller, request, until, connection, profile };
test('application discovery exposes enabled profile capabilities and limits without credentials or paths',async t=>{const f=await fixture(t);const description=await f.service.describe(caller);assert.equal(description.contractVersion,'ai-task-v1');assert.equal(description.profiles[0].id,'text');assert.equal(description.profiles[0].executorId,'api');assert.equal(description.profiles[0].kind,'api');assert.equal(description.profiles[0].protocolId,'openai-responses-v1');assert.deepEqual(description.profiles[0].capabilities,['text','json']);assert.doesNotMatch(JSON.stringify(description),/credential|SYNTHETIC_AI_KEY|baseURL|executablePath/);await f.service.config('profiles',{revision:1,items:[{...profile,enabled:false}]});assert.equal((await f.service.describe(caller)).profiles.length,0);});

test('terminal event history paginates completely after restart',async t=>{const f=await fixture(t);const task=await f.service.submit(caller,request());const done=await until(()=>f.get(task.aiTaskId),v=>v.status==='succeeded');await f.service.close();const path=join(f.root,'.agents/user-data/ai/tasks',task.aiTaskId+'.json');const saved=JSON.parse(await readFile(path,'utf8'));saved.events=Array.from({length:205},(_,i)=>({seq:i+1,type:'fixture',status:done.status,at:done.timestamps.updatedAt}));saved.revision=205;await writeFile(path,JSON.stringify(saved));const restored=createAITaskService(f.root);f.extra.push(restored);let cursor=0,count=0;for(;;){const page=await restored.events(caller,task.aiTaskId,cursor);cursor=page.afterSeq;count+=page.events.length;if(!page.hasMore)break;}assert.equal(count,205);assert.equal(cursor,205);});
test('material limits reject oversized text and binary streams without leaving partial uploads',async t=>{const f=await fixture(t);await assert.rejects(f.service.register(caller,{name:'large.txt',mimeType:'text/plain'},'x'.repeat(512*1024+1)),{code:'AI_INPUT_TOO_LARGE'});async function* stream(){const chunk=Buffer.alloc(1024*1024);for(let i=0;i<129;i++)yield chunk;}await assert.rejects(f.service.upload(caller,{name:'large.wav',mimeType:'audio/wav'},stream()),{code:'AI_INPUT_TOO_LARGE'});assert.deepEqual(await readdir(join(f.root,'.agents/user-data/ai/materials')),[]);});
