import {writeNodeExecutable,testEndpoint} from './helpers/platform.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAITaskService } from '../src/ai-tasks/service.js';
import { createResponsesExecutor } from '../src/ai-tasks/executors/api-text.js';
import { createCodexExecutor } from '../src/ai-tasks/executors/codex.js';
import { createTranscriptionExecutor } from '../src/ai-tasks/executors/api-transcription.js';

const caller={appId:'example.adapter'};
const connection={id:'api',kind:'api',enabled:true,protocolId:'openai-responses-v1',baseURL:'https://example.invalid/v1',credentialRef:'env:SYNTHETIC_AI_KEY',concurrency:1};
const profile={id:'test',executorId:'api',enabled:true,model:'synthetic-model',timeoutMs:2000,maxAttempts:1,retryDelayMs:10,maxInputBytes:1000000,maxOutputBytes:4096};
const request=(extra={})=>({contractVersion:'ai-task-v1',idempotencyKey:'one',profileId:'test',instruction:'仅整理输入',inputs:[{kind:'text',text:'虚构材料'}],outputSpec:{format:'text'},...extra});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(service,id,status='succeeded'){const end=Date.now()+5000;let task;do{task=await service.get(caller,id);if(task.status===status)return task;if(['failed','reconciling'].includes(task.status)&&task.status!==status)assert.fail(JSON.stringify(task));await delay(10);}while(Date.now()<end);assert.fail('timeout '+JSON.stringify(task));}
async function fixture(t,{fetcher,kind='api',executablePath,protocolId='openai-responses-v1',environment={SYNTHETIC_AI_KEY:'fixture-never-persist'}}={}){
  const root=await mkdtemp(join(tmpdir(),'ksf-ai-adapter-'));
  const service=createAITaskService(root,{pollMs:10,env:{...process.env,...environment},executors:{'openai-responses-v1':createResponsesExecutor({fetcher}),'openai-transcription-v1':createTranscriptionExecutor({fetcher}),codex:createCodexExecutor()}});
  t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
  await service.config('connections',{revision:0,items:[kind==='api'?{...connection,protocolId}:{id:'api',kind:'codex',enabled:true,executablePath,concurrency:1}]});
  await service.config('profiles',{revision:0,items:[profile]});return{root,service};
}
const response=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
test('C11/C12 fixture: Responses maps complete text, identity and usage without saving raw reasoning or credentials',async t=>{
  let submitted;const f=await fixture(t,{fetcher:async(url,options)=>{assert.equal(url,'https://example.invalid/v1/responses');assert.equal(options.redirect,'error');submitted=JSON.parse(options.body);return response({id:'resp_fixture',status:'completed',model:'actual-fixture',usage:{input_tokens:12,output_tokens:3},output:[{type:'reasoning',summary:[{text:'must-not-be-saved'}]},{type:'message',content:[{type:'output_text',text:'完成'}]}]});}});
  const accepted=await f.service.submit(caller,request());const done=await wait(f.service,accepted.aiTaskId);assert.equal(done.output.value,'完成');assert.equal(done.usage.inputTokens,12);assert.equal(done.execution.attempts[0].providerResponseId,'resp_fixture');assert.equal(submitted.store,false);assert.deepEqual(submitted.tools,[]);
  const disk=await readFile(join(f.root,'.agents/user-data/ai/tasks',accepted.aiTaskId+'.json'),'utf8');assert.ok(!disk.includes('must-not-be-saved'));assert.ok(!disk.includes('fixture-never-persist'));
});
for(const [name,body,code] of [['refusal',{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'raw'}]}]},'AI_PROVIDER_REFUSED'],['incomplete',{status:'incomplete',output:[]},'AI_OUTPUT_INCOMPLETE'],['tool',{status:'completed',output:[{type:'function_call',name:'unsafe'}]},'AI_TOOL_UNSUPPORTED'],['protocol',{hello:'world'},'AI_PROTOCOL_INVALID']]){
  test('C11/C12 fixture: '+name+' never becomes an empty success',async t=>{const f=await fixture(t,{fetcher:async()=>response(body)});const accepted=await f.service.submit(caller,request());const done=await wait(f.service,accepted.aiTaskId,'failed');assert.equal(done.error.code,code);assert.equal(done.output,null);});
}
test('C12 fixture: lost POST response is unknown and never blindly retried',async t=>{
  let calls=0;const f=await fixture(t,{fetcher:async()=>{calls++;throw new Error('raw network token=fixture-never-persist');}});const accepted=await f.service.submit(caller,request());const done=await wait(f.service,accepted.aiTaskId,'reconciling');assert.equal(done.error.code,'AI_EXECUTION_UNKNOWN');assert.ok(!JSON.stringify(done).includes('fixture-never-persist'));await delay(50);assert.equal(calls,1);
});
test('API auth failure is known and safe; missing environment credentials cause no network request',async t=>{
  let calls=0;const f=await fixture(t,{environment:{SYNTHETIC_AI_KEY:''},fetcher:async()=>{calls++;return new Response('',{status:401});}});const accepted=await f.service.submit(caller,request());const done=await wait(f.service,accepted.aiTaskId,'failed');assert.equal(done.error.code,'AI_AUTH_REQUIRED');assert.equal(calls,0);assert.equal(done.execution.attempts[0].stopConfirmed,true);
});
test('transcription adapter uses multipart audio and leaves unsupported speaker/timestamp data null',async t=>{
  let submitted;const f=await fixture(t,{protocolId:'openai-transcription-v1',fetcher:async(url,options)=>{assert.equal(url,'https://example.invalid/v1/audio/transcriptions');submitted=options.body;return response({text:'虚构转写'});}});
  const audio=await f.service.upload(caller,{name:'test.wav',mimeType:'audio/wav'},[Buffer.from('synthetic-no-real-audio')]);
  const accepted=await f.service.submit(caller,request({inputs:[{kind:'material',materialId:audio.materialId,sha256:audio.sha256}],requirements:['audio-transcription'],outputSpec:{format:'json',schema:{type:'object',additionalProperties:false,properties:{text:{type:'string'},segments:{type:'null'},speakers:{type:'null'}},required:['text','segments','speakers']}}}));
  const done=await wait(f.service,accepted.aiTaskId);assert.deepEqual(done.output.value,{text:'虚构转写',segments:null,speakers:null});assert.equal(submitted.get('model'),'synthetic-model');assert.equal(submitted.get('file').name,'test.wav');assert.equal(done.warnings.length,1);
});
async function fakeCLI(t,mode='success'){
  const dir=await mkdtemp(join(tmpdir(),'ksf-fake-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'codex');
  const source=`#!${process.execPath}\nimport {writeFileSync} from 'node:fs';\nif(process.argv.includes('--version')){console.log('codex-cli 0.163.0');process.exit(0);}\nconst args=process.argv.slice(2);\nif(!args.includes('--ignore-user-config')||!args.includes('read-only'))process.exit(10);\nlet prompt='';for await(const x of process.stdin)prompt+=x;\nconsole.log(JSON.stringify({type:'thread.started',thread_id:'synthetic-session'}));\nconsole.log(JSON.stringify({type:'item.completed',item:{type:'reasoning',text:'private-synthetic-reasoning'}}));\n${mode==='hang'?"await new Promise(r=>setTimeout(r,20000));":''}\nwriteFileSync(args[args.indexOf('-o')+1],'完成');\nconsole.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:2}}));\n`;
  return writeNodeExecutable(path,source);
}
test('C13 fixture: managed CLI worker decodes completion, saves final output and strips raw reasoning',async t=>{
  const executablePath=await fakeCLI(t);const f=await fixture(t,{kind:'codex',executablePath});const accepted=await f.service.submit(caller,request());const done=await wait(f.service,accepted.aiTaskId);assert.equal(done.output.value,'完成');assert.equal(done.execution.attempts[0].nativeSessionId,'synthetic-session');assert.match(done.execution.attempts[0].cliVersion,/0.163.0/);
  const data=await readFile(join(f.root,'.agents/user-data/ai/tasks',done.aiTaskId+'.json'),'utf8');assert.ok(!data.includes('private-synthetic-reasoning'));
});
test('C14 fixture: cancellation stops only the owned worker and reports actual settlement separately',async t=>{
  const executablePath=await fakeCLI(t,'hang');const f=await fixture(t,{kind:'codex',executablePath});const accepted=await f.service.submit(caller,request());
  const end=Date.now()+4000;let running;do{running=await f.service.get(caller,accepted.aiTaskId);if(running.execution.attempts[0]?.pid)break;await delay(10);}while(Date.now()<end);
  assert.ok(running.execution.attempts[0].pid);const cancelled=await f.service.cancel(caller,accepted.aiTaskId);assert.equal(cancelled.status,'cancelled');
  let settled;do{settled=await f.service.get(caller,accepted.aiTaskId);if(settled.execution.attempts[0].stopConfirmed)break;await delay(10);}while(Date.now()<end);
  assert.equal(settled.execution.attempts[0].stopConfirmed,true);assert.equal(settled.output,null);
});
