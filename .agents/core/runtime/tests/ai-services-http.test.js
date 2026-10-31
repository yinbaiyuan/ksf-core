import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createWorkbenchHTTP} from '../src/services/workbench-http.js';

function fixture(available=true){
 let checks=0;
 const host={files:{instanceId:'synthetic-instance'},control:{publish(){}},draining:()=>false,codexConversations:{async check(caller){checks++;assert.equal(caller.appId,'ksf.workbench');return {available,contractVersion:'codex-conversations-v1',platform:'darwin',...(available?{executable:'/synthetic/Desktop/codex',permissions:{id:'existing-profile',stateProfileBlock:'must-not-leak'}}:{code:'CODEX_OFFLINE',message:'Desktop 尚未运行'})};}}};
 const http=createWorkbenchHTTP('/synthetic',{host});
 async function request(path,method='GET',body={},headers={}){let result;const stream=Readable.from(method==='POST'?[Buffer.from(JSON.stringify(body))]:[]);stream.method=method;stream.headers={'content-type':'application/json',...headers};await http.handle(stream,new URL(path,'http://127.0.0.1:9999'),(status,text)=>{result={status,...JSON.parse(text)};});return result;}
 return {request,checks:()=>checks,setAvailable:value=>{available=value;}};
}
test('Desktop status requires POST and the current workbench session; it exposes only read-only health fields',async()=>{
 const f=fixture();assert.equal((await f.request('/api/ai/desktop')).status,405);assert.equal((await f.request('/api/ai/desktop','POST',{},{})).status,403);assert.equal(f.checks(),0);
 const session=await f.request('/api/workbench/session'),headers={origin:'http://127.0.0.1:9999','x-ksf-token':session.data.token};
 assert.equal((await f.request('/api/ai/desktop','POST',{method:'create'},headers)).status,400);assert.equal(f.checks(),0);
 const result=await f.request('/api/ai/desktop','POST',{},headers);assert.equal(result.status,200);assert.equal(result.data.available,true);assert.equal(result.data.permissionProfile,'existing-profile');assert.match(result.data.checkedAt,/^20/);assert.doesNotMatch(JSON.stringify(result),/must-not-leak|stateProfileBlock/);assert.equal(f.checks(),1);
});
test('Desktop offline is an explicit state and a later check can recover without submitting a model turn',async()=>{
 const f=fixture(false),session=await f.request('/api/workbench/session'),headers={origin:'http://127.0.0.1:9999','x-ksf-token':session.data.token};const result=await f.request('/api/ai/desktop','POST',{},headers);assert.equal(result.status,200);assert.equal(result.data.available,false);assert.equal(result.data.code,'CODEX_OFFLINE');assert.equal(result.data.executable,undefined);assert.equal(f.checks(),1);f.setAvailable(true);const recovered=await f.request('/api/ai/desktop','POST',{},headers);assert.equal(recovered.data.available,true);assert.equal(recovered.data.code,undefined);assert.equal(f.checks(),2);
});
