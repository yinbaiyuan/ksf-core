import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,symlink,utimes} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createBackend} from '../backend.mjs';
import {briefDigest} from '../project-brief-source.mjs';
import {fixture} from '../../../runtime/tests/helpers/governance-fixture.js';
import {projectGovernance} from '../../../runtime/src/services/project-governance.js';
import {defaultMetadata} from '../../../runtime/src/projects/governance/model.js';
import {canonical,sha256} from '../../../runtime/src/ai-tasks/schema.js';

const coreDigest=value=>sha256(canonical(value));
const value=label=>({content:'Agent 实际输出：'+label,sections:{plan:'目标与范围分析 '+label,progress:'记录、缺口与建议 '+label,materials:'结果、证据和待核实 '+label}});
function agent(){
  const tasks=new Map(),requests=[];let sequence=0;
  const ai={tasks,requests,available:true,unavailable:false,loseNext:false,getGate:null,
    async call(method,input){
      if(ai.unavailable)throw Object.assign(Error('当前 Core 没有受管 AI 服务'),{code:'APP_SERVICE_UNKNOWN'});
      if(method==='describe')return {profiles:ai.available?[{id:'configured',kind:'codex',model:'fixture-model',capabilities:['text','json'],limits:{maxInputBytes:131072,maxOutputBytes:32768,timeoutMs:60000,maxAttempts:1}}]:[]};
      if(method==='submit'){
        requests.push(structuredClone(input));let task=[...tasks.values()].find(task=>task.request.idempotencyKey===input.idempotencyKey);
        if(!task){task={id:'fixture-'+(++sequence),request:structuredClone(input),status:'running',value:value('报告'+sequence)};tasks.set(task.id,task);}
        if(ai.loseNext){ai.loseNext=false;throw Object.assign(Error('提交回执暂时丢失'),{code:'ECONNRESET',outcomeUnknown:true});}
        return {aiTaskId:task.id,status:task.status};
      }
      const task=tasks.get(input);assert(task,'AI task exists');
      if(method==='get'){
        if(ai.getGate){const gate=ai.getGate;ai.getGate=null;gate.started();await gate.promise;}
        return {aiTaskId:task.id,application:{appId:'com.ksf.projects'},context:task.context??task.request.context,status:task.status,error:task.error,execution:{model:'fixture-model'},timestamps:{finishedAt:task.finishedAt??'2026-11-07T09:00:00.000Z'}};
      }
      if(method==='readResult')return {resultId:task.id,format:'json',value:task.value,sha256:task.badDigest?'0'.repeat(64):coreDigest(task.value)};
      throw Error('Unexpected AI method '+method);
    }};
  return ai;
}
function setup(t,{storage,ai=agent()}={}){
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);
  const context={workspace:f.root,dataDirectory:join(f.root,'.app-data'),...(storage?{storage}:{}),services:{call:(service,method,args)=>{assert.equal(service,'ai');return ai.call(method,args?.[0]);}}};
  const dependencies={governance:(operation,input)=>projectGovernance({...input,root:f.root,operation})};
  const app=createBackend(context,dependencies);t.after(()=>app.dispose());
  const target={name:f.name,scope:'current'};
  return {...f,ai,app,target,context,dependencies,call:(method,input={})=>app.call('brief.'+method,{...target,...input}),generate:operationId=>app.call('brief.generate',{...target,profileId:'configured',operationId})};
}
async function complete(f,operation='generate-first'){
  const pending=await f.generate(operation),task=f.ai.tasks.get(pending.run.aiTaskId);task.status='succeeded';
  return f.call('read');
}

test('project brief fingerprints use the exact Core AI canonical JSON digest',()=>{
  const sample={sections:{progress:'进度',plan:'方案',materials:'成果'},content:'实际输出',nested:[{b:2,a:1},null,'中文']};
  assert.equal(briefDigest(sample),sha256(canonical(sample)));
  assert.equal(briefDigest({a:1,b:2}),briefDigest({b:2,a:1}));
});

test('missing profiles and missing managed service leave the base view readable and never invent a brief',async t=>{
  const f=setup(t);f.ai.available=false;
  assert.equal((await f.call('profiles')).available,false);
  assert.equal((await f.call('read')).report,null);
  const empty=await f.generate('without-agent');assert.equal(empty.available,false);assert.equal(empty.report,null);assert.equal(empty.run,null);
  f.ai.unavailable=true;
  const unavailable=await f.call('read');assert.equal(unavailable.available,false);assert.match(unavailable.message,/没有受管/);assert.equal(unavailable.report,null);
  assert.equal(f.ai.requests.length,0);
});

test('only a verified successful Agent response becomes the report and it remains stable when reread',async t=>{
  const f=setup(t),before=await readFile(join(f.root,f.pp),'utf8');
  const pending=await f.generate('manual-generation');assert.equal(pending.report,null);assert.equal(pending.run.status,'running');
  const task=f.ai.tasks.get(pending.run.aiTaskId);task.status='succeeded';
  const result=await f.call('read');assert.equal(result.report.content,task.value.content);assert.deepEqual(result.report.sections,task.value.sections);
  assert.equal(result.report.receipt.sha256,coreDigest(task.value));assert.equal(result.report.model,'fixture-model');assert.equal(result.report.generatedAt,task.finishedAt??'2026-11-07T09:00:00.000Z');
  assert(result.report.sources.some(source=>source.path===f.pp));assert.equal(result.stale,false);assert.equal(result.report.sourceDigest,result.sourceVersion);
  const again=await f.call('read');assert.deepEqual(again.report,result.report);assert.equal(f.ai.requests.length,1);
  assert.equal(await readFile(join(f.root,f.pp),'utf8'),before);
  assert(!JSON.stringify(result).includes('只读分析 Agent'));
});

test('failed and malformed generations preserve the previous successful report',async t=>{
  const f=setup(t),first=await complete(f);
  const pending=await f.generate('failed-generation'),task=f.ai.tasks.get(pending.run.aiTaskId);
  assert.equal(pending.report.id,first.report.id);task.status='failed';task.error={code:'PROVIDER_STOPPED',message:'模型连接失败'};
  const failed=await f.call('read');assert.equal(failed.report.id,first.report.id);assert.equal(failed.run.status,'failed');assert.match(failed.error,/模型连接失败/);
  const invalid=await f.generate('malformed-generation'),other=f.ai.tasks.get(invalid.run.aiTaskId);other.status='succeeded';other.value={content:'缺少各区内容'};
  const rejected=await f.call('read');assert.equal(rejected.report.id,first.report.id);assert.equal(rejected.run.error.code,'PROJECT_BRIEF_OUTPUT_INVALID');
});

test('wrong-request receipts and wrong result hashes never become Agent briefs',async t=>{
  const f=setup(t),pending=await f.generate('wrong-request');
  const task=f.ai.tasks.get(pending.run.aiTaskId);task.status='succeeded';task.context={...task.request.context,sourceDigest:'other-project'};
  const mismatch=await f.call('read');assert.equal(mismatch.report,null);assert.equal(mismatch.run.error.code,'PROJECT_BRIEF_RESULT_MISMATCH');
  const next=await f.generate('wrong-result-hash'),other=f.ai.tasks.get(next.run.aiTaskId);other.status='succeeded';other.badDigest=true;
  const corrupt=await f.call('read');assert.equal(corrupt.report,null);assert.equal(corrupt.run.error.code,'PROJECT_BRIEF_RESULT_MISMATCH');
});

test('same-project concurrent requests converge on one run and retries retain the immutable operation',async t=>{
  const f=setup(t),[first,second]=await Promise.all([f.generate('window-one'),f.generate('window-two')]);
  assert.equal(first.run.id,second.run.id);assert.equal(f.ai.tasks.size,1);assert.equal(f.ai.requests.length,1);
  const retry=await f.generate('window-one');assert.equal(retry.run.id,first.run.id);assert.equal(f.ai.requests.length,1);
  await assert.rejects(f.call('generate',{profileId:'different',operationId:'window-one'}),{code:'PROJECT_BRIEF_OPERATION_CONFLICT'});
});

test('different projects keep separate runs and selected project inputs',async t=>{
  const f=setup(t),otherPath='项目/另一个/project.md';
  assert.deepEqual(f.apply([{path:otherPath,ifMatch:'missing',metadata:defaultMetadata('project','other-project','另一个'),body:'# 不同项目\n'}]).errors,[]);
  const [first,second]=await Promise.all([f.generate('same-client-operation'),f.app.call('brief.generate',{name:'另一个',scope:'current',profileId:'configured',operationId:'same-client-operation'})]);
  assert.notEqual(first.run.id,second.run.id);assert.equal(f.ai.tasks.size,2);
  assert.deepEqual(new Set(f.ai.requests.map(request=>request.context.projectPath)),new Set([f.pp,otherPath]));
  for(const request of f.ai.requests){const input=JSON.parse(request.inputs[0].text);assert(input.documents.every(doc=>doc.path.startsWith(dirname(request.context.projectPath)+'/')));}
});

test('lost submission responses reconcile the original immutable AI task instead of duplicating it',async t=>{
  const f=setup(t);f.ai.loseNext=true;
  const unknown=await f.generate('lost-response');assert.equal(unknown.run.status,'pending');assert.equal(f.ai.tasks.size,1);
  const resumed=await f.call('read');assert.equal(resumed.run.status,'running');assert.equal(f.ai.tasks.size,1);assert.equal(f.ai.requests.length,2);assert.deepEqual(f.ai.requests[0],f.ai.requests[1]);
  f.ai.tasks.get(resumed.run.aiTaskId).status='succeeded';assert((await f.call('read')).report);
});

test('latest tail paragraphs survive bounded input and unopened source changes mark the report stale',async t=>{
  const f=setup(t),body='# 原目标\n\n'+'旧过程记录。'.repeat(1800)+'\n\n## 最新结果\n最新尾段必须保留：用户验收仍待确认。\n';
  assert.deepEqual(f.apply([f.change(f.tp,undefined,body)]).errors,[]);
  const contextPath=dirname(f.pp)+'/P00-输入.md';await writeFile(join(f.root,contextPath),'初始上下文');
  const pending=await f.generate('bounded-input'),request=f.ai.requests[0],input=JSON.parse(request.inputs[0].text);
  const task=input.documents.find(doc=>doc.path===f.tp);assert.match(task.body,/原目标/);assert.match(task.body,/最新尾段必须保留/);assert.match(task.body,/中间内容省略/);assert(Buffer.byteLength(task.body)<=2048);
  f.ai.tasks.get(pending.run.aiTaskId).status='succeeded';const report=await f.call('read');assert.equal(report.stale,false);assert.equal(report.report.scope.partial,true);
  await utimes(join(f.root,contextPath),new Date(),new Date());assert.equal((await f.call('read')).stale,false);
  await writeFile(join(f.root,contextPath),'未在编辑器打开的新上下文字节');assert.equal((await f.call('read')).stale,true);
  await writeFile(join(f.root,contextPath),'初始上下文');assert.equal((await f.call('read')).stale,false);
  const next=body.replace('旧过程记录。','中间发生更新。');assert.deepEqual(f.apply([f.change(f.tp,undefined,next)]).errors,[]);
  assert.equal((await f.call('read')).stale,true);
});

test('context scope is bounded and refuses private, external, symlink and oversized materials',async t=>{
  const f=setup(t),base=dirname(f.pp);
  await mkdir(join(f.root,'.agents/user-data'),{recursive:true});await writeFile(join(f.root,'.agents/user-data/private.txt'),'PRIVATE_SHOULD_NOT_REACH_AGENT');
  await writeFile(join(f.root,base,'P00-输入.md'),'可读取内容');
  await writeFile(join(f.root,base,'P02-过大.md'),'x'.repeat(2*1024*1024+1));
  if(process.platform!=='win32')await symlink(join(f.root,'.agents/user-data/private.txt'),join(f.root,base,'P01-链接.md'));
  const original=f.dependencies.governance;
  const app=createBackend(f.context,{...f.dependencies,governance:(operation,input)=>{const response=original(operation,input);if(operation==='read')response.data.contextEntries.push(...[{path:'.agents/user-data/private.txt',kind:'file',owner:{id:'p1',path:f.pp}},...(process.platform==='win32'?[]:[{path:base+'/P01-链接.md',kind:'file',owner:{id:'p1',path:f.pp}}])]);return response;}});t.after(()=>app.dispose());
  const pending=await app.call('brief.generate',{...f.target,profileId:'configured',operationId:'safe-source-input'});
  const request=f.ai.requests[0];assert(!JSON.stringify(request).includes('PRIVATE_SHOULD_NOT_REACH_AGENT'));assert(!JSON.stringify(request).includes('.agents/user-data/private.txt'));
  assert(Buffer.byteLength(request.inputs[0].text)<96*1024);assert.match(pending.issues.join('\n'),/未读取上下文/);
  await assert.rejects(f.call('read',{name:'../示例'}));
});

test('a stale poll cannot overwrite a newer report adopted by another backend',async t=>{
  let content=null;
  const storage={async read(){return {text:content,etag:content?coreDigest(content):null};},async write(_name,text,{ifMatch}){if(ifMatch!==(content?coreDigest(content):null))throw Object.assign(Error('CAS'),{code:'APP_DATA_CONFLICT'});content=text;}};
  const f=setup(t,{storage}),other=createBackend(f.context,f.dependencies);t.after(()=>other.dispose());
  const pending=await f.generate('older-operation'),task=f.ai.tasks.get(pending.run.aiTaskId);task.status='succeeded';
  let release,started;const startedPromise=new Promise(resolve=>{started=resolve;});f.ai.getGate={started,promise:new Promise(resolve=>{release=resolve;})};
  const staleRead=f.call('read');await startedPromise;
  const first=await other.call('brief.read',f.target);assert.equal(first.report.id,pending.run.id);
  const next=await other.call('brief.generate',{...f.target,profileId:'configured',operationId:'newer-operation'});f.ai.tasks.get(next.run.aiTaskId).status='succeeded';
  const latest=await other.call('brief.read',f.target);assert.notEqual(latest.report.id,first.report.id);
  release();const late=await staleRead;assert.equal(late.report.id,latest.report.id);assert.deepEqual((await f.call('read')).report,latest.report);
});
