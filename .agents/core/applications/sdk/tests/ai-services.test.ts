import test from 'node:test';
import assert from 'node:assert/strict';
import {createAIServiceClient} from '../src/ai-services.ts';
import type {AIServiceDescription} from '../src/ai-tasks.ts';

const limits={maxInputBytes:1024,maxOutputBytes:1024,timeoutMs:1000,maxAttempts:1};
const description:AIServiceDescription={contractVersion:'ai-task-v1',limits:{requestBytes:1024,textMaterialBytes:1024,uploadBytes:1024},profiles:[{id:'api-summary',executorId:'remote',kind:'api',protocolId:'openai-responses-v1',model:'synthetic',capabilities:['text','json'],limits},{id:'cli-summary',executorId:'local',kind:'codex',model:null,capabilities:['text','json'],limits}]};
function fixture(action:(service:string,method:string,params:unknown[])=>unknown=()=>({available:true})){
 const calls:{service:string;method:string;params:unknown[]}[]=[];
 const client=createAIServiceClient({services:{async call<T>(service:string,method:string,params:unknown[]=[]):Promise<T>{calls.push({service,method,params});return (service==='ai'&&method==='describe'?description:await action(service,method,params)) as T;}}});
 return {client,calls};
}
test('discovery returns API, CLI and Desktop choices without starting a task or conversation',async()=>{
 const f=fixture(),catalog=await f.client.describe();assert.deepEqual(catalog.targets.map(x=>x.provider),['api','codex-cli','codex-desktop']);assert.equal(catalog.targets[0].id,'task:api-summary');assert.equal(catalog.targets[2].kind,'conversation');assert.equal(catalog.targets[2].available,true);assert.deepEqual(catalog.issues,[]);assert.deepEqual(f.calls.map(x=>x.method).sort(),['check','describe']);
});
test('capability and kind filters keep JSON workflows on task routes and avoid Desktop checks',async()=>{
 const f=fixture();assert.equal((await f.client.describe({kind:'task',capabilities:['json']})).targets.length,2);assert.deepEqual(f.calls.map(x=>x.service),['ai']);
 f.calls.length=0;assert.equal((await f.client.describe({kind:'conversation',capabilities:['interactive']})).targets[0].id,'codex-desktop');assert.deepEqual(f.calls.map(x=>x.service),['codex-conversations']);
 assert.equal((await f.client.describe({capabilities:['audio-transcription']})).targets.length,0);
});
test('Desktop permission denial and offline state leave task choices usable and visible reasons',async()=>{
 for(const denied of [true,false]){const f=fixture(()=>{if(denied)throw Object.assign(Error('应用未声明会话权限'),{code:'APP_PERMISSION_REQUIRED'});return {available:false,code:'CODEX_OFFLINE',message:'Desktop 未运行'};});const result=await f.client.describe();assert.equal(result.targets.length,3);assert.equal(result.targets[2].available,false);assert.equal(result.issues[0].code,denied?'APP_PERMISSION_REQUIRED':'CODEX_OFFLINE');assert.equal(f.calls.length,2);}
});
test('task discovery failure does not hide an available Desktop; old catalog metadata is not guessed',async()=>{
 for(const response of ['failure','old']){const calls:string[]=[];const client=createAIServiceClient({services:{async call<T>(service:string):Promise<T>{calls.push(service);if(service==='codex-conversations')return {available:true} as T;if(response==='failure')throw Object.assign(Error('任务服务离线'),{code:'AI_OFFLINE'});return {profiles:[{id:'unknown',capabilities:['text']}]} as T;}}});const result=await client.describe();assert.equal(result.targets.length,1);assert.equal(result.targets[0].id,'codex-desktop');assert.equal(result.issues[0].code,response==='old'?'AI_SERVICE_CATALOG_UNSUPPORTED':'AI_OFFLINE');assert.equal(calls.length,2);}
});
test('selection sends exactly the chosen contract with stable IDs, raw text and distinct result kinds',async()=>{
 const f=fixture((service)=>service==='ai'?{aiTaskId:'task-one',status:'queued'}:{operationId:'operation-one',status:'queued'});
 const request={contractVersion:'ai-task-v1' as const,idempotencyKey:'stable-business-task',instruction:'原文\r\n',inputs:[],outputSpec:{format:'text' as const}};
 const one=await f.client.start({kind:'task',profileId:'cli-summary',request});assert.equal(one.kind,'task');assert.deepEqual(f.calls[0],{service:'ai',method:'submit',params:[{...request,profileId:'cli-summary'}]});
 const conversation={operationId:'stable-conversation-operation',project:{name:'虚构业务',scope:'current' as const},text:'原始业务请求\r\n'};
 const two=await f.client.start({kind:'conversation',request:conversation});assert.equal(two.kind,'conversation');assert.deepEqual(f.calls[1],{service:'codex-conversations',method:'create',params:[conversation]});assert.equal(f.calls.length,2);
});
test('selected Desktop failure or unknown delivery never falls back to CLI/API or invents a new ID',async()=>{
 const f=fixture(()=>{throw Object.assign(Error('待核对原回执'),{code:'CODEX_OUTCOME_UNKNOWN'});});await assert.rejects(f.client.start({kind:'conversation',request:{operationId:'original-operation',project:{name:'虚构',scope:'current'},text:'input'}}),{code:'CODEX_OUTCOME_UNKNOWN'});assert.equal(f.calls.length,1);assert.equal(f.calls[0].service,'codex-conversations');
 await assert.rejects(f.client.start({kind:'desktop'} as any),{code:'AI_SERVICE_SELECTION_INVALID'});await assert.rejects(f.client.start(null as any),{code:'AI_SERVICE_SELECTION_INVALID'});assert.equal(f.calls.length,1);
});
