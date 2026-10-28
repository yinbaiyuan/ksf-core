import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createWorkbenchHTTP } from '../src/services/workbench-http.js';
import { encodePackage, checksum } from '../src/applications/protocol.js';
const file=text=>{const bytes=Buffer.from(text);return{content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};};
const request={contractVersion:'ai-task-v1',idempotencyKey:'one',profileId:'test',instruction:'整理虚构材料',inputs:[],outputSpec:{format:'text'}};
async function fixture(t,execute=async()=>({text:'完成'})){
  const root=await mkdtemp(join(tmpdir(),'ksf-ai-workbench-')),store=join(root,'store');await mkdir(store);
  const manifest={schemaVersion:2,sdkVersion:2,id:'example.ai',version:'1.0.0',name:'AI acceptance',description:'Synthetic service bridge acceptance',window:{entry:'frontend/index.js'},backend:{runtime:'node',entry:'backend/index.mjs'},permissions:[]};
  const bytes=encodePackage(manifest,{'frontend/index.js':file('export function mount(){}'),'backend/index.mjs':file("export function activate(ctx){return{call(method,params){return ctx.services.call('ai',method,params)}}}")});
  const entry={manifest,package:{url:'example.ksfapp',sha256:checksum(bytes),size:bytes.length}};await writeFile(join(store,'example.ksfapp'),bytes);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[entry]}));
  const wb=createWorkbenchHTTP(root,{applications:{storeDirectory:store},ai:{pollMs:10,executors:{'openai-responses-v1':{execute}}}});
  const server=createServer((req,res)=>{void wb.handle(req,new URL(req.url,'http://localhost'),(status,body,type)=>{res.writeHead(status,{'content-type':type??'application/json'});res.end(body);}).then(handled=>{if(!handled){res.writeHead(404);res.end();}});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await wb.close();await rm(root,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${server.address().port}`;
  const session=(await(await fetch(url+'/api/workbench/session')).json()).data;
  async function post(path,input,headers={}){return fetch(url+path,{method:'POST',headers:{origin:url,'x-ksf-token':session.token,'content-type':'application/json',...headers},body:JSON.stringify(input)});}
  async function call(instance,method,params){const response=await post('/api/apps/call',{instanceId:instance.id,method,params});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error.message),result.error);return result.data;}
  await wb.ai.config('connections',{revision:0,items:[{id:'api',kind:'api',enabled:true,protocolId:'openai-responses-v1',baseURL:'https://example.invalid/v1',credentialRef:'env:SYNTHETIC',concurrency:1}]});
  await wb.ai.config('profiles',{revision:0,items:[{id:'test',executorId:'api',model:'synthetic',enabled:true,timeoutMs:2000,maxAttempts:1,retryDelayMs:0,maxInputBytes:1000000,maxOutputBytes:4096}]});
  await wb.applications.install({trusted:true,sourceId:'builtin',appId:manifest.id,version:manifest.version,digest:entry.package.sha256});
  const launch=()=>wb.applications.launch(manifest.id,entry.package.sha256);
  return {wb,url,session,post,call,launch};
}
test('C15/C16: installed v2 app binds its identity, submits asynchronously and recovers after closing its window',async t=>{
  let finish,seen;const f=await fixture(t,async({task})=>{seen=task.caller;return new Promise(resolve=>{finish=resolve;});});const instance=await f.launch();const accepted=await f.call(instance,'submit',[request]);assert.equal(accepted.status,'queued');
  const deadline=Date.now()+3000;while(!finish&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.equal(seen.appId,'example.ai');assert.equal(seen.version,'1.0.0');assert.match(seen.releaseDigest,/^[a-f0-9]{64}$/);
  await f.wb.applications.release(instance.id);finish({text:'窗口关闭后完成'});let task;
  do{task=(await f.wb.ai.inspect()).tasks[0];if(task.status==='succeeded')break;await new Promise(r=>setTimeout(r,10));}while(Date.now()<deadline);
  const reopened=await f.launch();const result=await f.call(reopened,'get',[accepted.aiTaskId]);assert.equal(result.status,'succeeded');assert.equal(result.output.value,'窗口关闭后完成');
  await assert.rejects(f.call(reopened,'submit',[{...request,appId:'forged'}]),{code:'AI_REQUEST_INVALID'});
});
test('C18: streaming material upload is separate from JSON calls and requires a valid managed application lease',async t=>{
  const f=await fixture(t),instance=await f.launch();const bytes=Buffer.alloc(1200000,5);const params=new URLSearchParams({instanceId:instance.id,name:'synthetic.wav'});
  const response=await fetch(f.url+'/api/ai/material-upload?'+params,{method:'POST',headers:{origin:f.url,'x-ksf-token':f.session.token,'content-type':'audio/wav'},body:bytes});assert.equal(response.status,201);assert.equal((await response.json()).data.size,bytes.length);
  await f.wb.applications.release(instance.id);const expired=await fetch(f.url+'/api/ai/material-upload?'+params,{method:'POST',headers:{origin:f.url,'x-ksf-token':f.session.token,'content-type':'audio/wav'},body:Buffer.from('x')});assert.equal(expired.status,410);
});
test('AI configuration requires a workbench session; old application services and capabilities remain available',async t=>{
  const f=await fixture(t);assert.ok(f.session.capabilities.includes('applications-v1'));assert.ok(f.session.capabilities.includes('ai-tasks-v1'));
  const forbidden=await fetch(f.url+'/api/ai/config',{method:'POST',headers:{'content-type':'application/json'},body:'{"kind":"profiles"}'});assert.equal(forbidden.status,403);
  const config=await f.post('/api/ai/config',{kind:'profiles'});assert.equal(config.status,200);assert.equal((await config.json()).data.items[0].id,'test');
  const inspect=await f.post('/api/ai/inspect',{});assert.equal(inspect.status,200);assert.deepEqual((await inspect.json()).data.tasks,[]);
});
