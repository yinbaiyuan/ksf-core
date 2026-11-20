import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {startWebServer} from '../src/services/web.js';
import {createFrontendStore} from '../src/web/frontend-store.js';
import {routingFixture} from './helpers/routing-fixture.js';
import {uiRuntimeFixture} from './helpers/ui-runtime-fixture.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
async function fixture(t){
 let server;t.after(()=>server?.close());
 const {root}=routingFixture(t),page=uiRuntimeFixture(t,{suffix:'a'}),catalog=join(root,'catalog');await mkdir(catalog);await writeFile(join(catalog,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[]}));
 server=await startWebServer({root,port:0,capture:false,webDirectory:page.web,applications:{coreVersion:'0.6.0',defaultSource:null,storeDirectory:catalog}});
 async function call(path,input,auth){const response=await fetch(new URL(path,server.url),{...(input===undefined?{}:{method:'POST',headers:{Origin:server.url.slice(0,-1),'Content-Type':'application/json',...(auth?{'X-KSF-Token':auth.token}:{})},body:JSON.stringify(input)})});return {status:response.status,headers:response.headers,body:await response.text()};}
 const auth=JSON.parse((await call('/api/workbench/session')).body).data;
 const status=async()=>JSON.parse((await call('/api/ui-runtime/status')).body).data;
 const post=(path,input)=>call('/api/ui-runtime/'+path,input,auth);
 const store=createFrontendStore(root,{coreVersion:'0.6.0',withConsumers:action=>action([])});
 async function stage(other){await store.stage(other.web,{operationId:randomUUID(),ifMatch:(await store.status()).etag});return other.info.uiRuntime.frontendReleaseId;}
 return {root,page,server,call,status,post,stage,catalog,appPost:(operation,input)=>call('/api/apps/'+operation,input,auth)};
}
const jsonScript=(html,id)=>JSON.parse(html.match(new RegExp('<script type="application/json" id="'+id+'">([\\s\\S]*?)<\\/script>'))[1]);
test('HTTP binds each document before module execution, preserves exact CSP and protects administrative writes',async t=>{
 const f=await fixture(t),page=await f.call('/');assert.equal(page.status,200);
 const runtime=jsonScript(page.body,'ksf-frontend-runtime'),lease=jsonScript(page.body,'ksf-frontend-client');
 assert.equal(lease.releaseId,runtime.frontendReleaseId);assert.match(lease.clientId,/^[a-f0-9-]{36}$/);
 assert.ok(page.body.indexOf('ksf-frontend-client')<page.body.indexOf('type="module"'));
 assert.ok(page.body.indexOf('/ui-recovery/boot.js')<page.body.indexOf('ksf-frontend-runtime'));
 assert.equal(lease.selectionEtag,(await f.status()).etag);assert.ok(lease.styles.includes('/assets/ui-a.css'));
 assert.equal((await f.call('/ui-recovery/boot.js')).status,200);
 const nonce=page.body.match(/<meta name="ksf-style-nonce" content="([^"]+)">/)[1];
 assert.ok(page.body.indexOf('ksf-style-nonce')<page.body.indexOf('type="module"'));
 assert.ok(page.headers.get('content-security-policy').includes("'nonce-"+nonce+"'"));
 assert.doesNotMatch(page.body,/type="importmap"/);
 assert.doesNotMatch(page.headers.get('content-security-policy'),/sha256-undefined/);
 assert.doesNotMatch(page.headers.get('content-security-policy'),/unsafe-inline|unsafe-eval/);
 const clientPath=join(f.root,'.agents/runtime-data/ui-runtime/clients'),before=await readdir(clientPath);
 await fetch(f.server.url,{method:'HEAD'});assert.deepEqual(await readdir(clientPath),before);
 const status=await f.status(),denied=await f.call('/api/ui-runtime/activate',{releaseId:status.active,operationId:randomUUID(),ifMatch:status.etag});
 assert.equal(denied.status,403);assert.equal((await f.status()).etag,status.etag);
});
test('boot readiness is authenticated and old snapshots opt out of the new startup monitor',async t=>{
 const f=await fixture(t),page=await f.call('/'),lease=jsonScript(page.body,'ksf-frontend-client'),ready={action:'ready',clientId:lease.clientId,releaseId:lease.releaseId};
 assert.equal((await f.call('/api/ui-runtime/boot',ready)).status,403);
 assert.equal((await f.post('boot',ready)).status,200);
 const failed=await f.post('boot',{action:'failed',...lease,operationId:lease.clientId,ifMatch:lease.selectionEtag,reason:'asset-error',resource:'/assets/ui-a.css'});
 assert.equal(failed.status,409);assert.equal(JSON.parse(failed.body).error.code,'UI_BOOT_FALLBACK_EXHAUSTED');
 const legacy=await f.stage(uiRuntimeFixture(t,{legacy:true,suffix:'old-boot',features:['ui.provider','ui.policy','ui.compatibility']}));await f.post('activate',{releaseId:legacy,operationId:randomUUID(),ifMatch:(await f.status()).etag});
 const old=await f.call('/');assert.equal(old.status,200);assert.doesNotMatch(old.body,/src="\/ui-recovery\/boot\.js"/);assert.equal(jsonScript(old.body,'ksf-frontend-client').releaseId,legacy);
});
test('HTTP activation and replay select a new complete document while a retained old document keeps its original resources',async t=>{
 const f=await fixture(t),old=await f.call('/'),A=jsonScript(old.body,'ksf-frontend-runtime').frontendReleaseId,lease=jsonScript(old.body,'ksf-frontend-client');
 const B=await f.stage(uiRuntimeFixture(t,{suffix:'b'})),request={releaseId:B,operationId:randomUUID(),ifMatch:(await f.status()).etag};
 const applied=await f.post('activate',request);assert.equal(applied.status,200);assert.equal(JSON.parse(applied.body).data.releaseId,B);
 const replay=await f.post('activate',request);assert.equal(JSON.parse(replay.body).data.replayed,true);
 assert.equal((await f.post('activate',{...request,operationId:randomUUID()})).status,409);
 const next=await f.call('/');assert.equal(jsonScript(next.body,'ksf-frontend-runtime').frontendReleaseId,B);
 assert.equal(jsonScript(old.body,'ksf-frontend-runtime').frontendReleaseId,A);
 assert.equal((await f.call('/assets/ksf-ui-a.js')).body,'export const fixture="a";');
 assert.match((await f.call('/assets/ksf-ui-a.js')).headers.get('cache-control'),/immutable/);
 const heartbeat=await f.post('client',{action:'heartbeat',clientId:lease.clientId});assert.equal(heartbeat.status,200);assert.equal(JSON.parse(heartbeat.body).data.releaseId,A);
});
test('a damaged selected UI serves an independent recovery page without breaking old assets or unrelated services',async t=>{
 const f=await fixture(t),first=await f.call('/'),A=jsonScript(first.body,'ksf-frontend-runtime').frontendReleaseId,B=await f.stage(uiRuntimeFixture(t,{suffix:'b'}));
 await f.post('activate',{releaseId:B,operationId:randomUUID(),ifMatch:(await f.status()).etag});
 await writeFile(join(f.root,'.agents/runtime-data/ui-runtime/releases',B,'dist/assets/ui-b.css'),'damaged');
 const page=await f.call('/');assert.equal(page.status,503);assert.match(page.body,/KSF 基础恢复/);assert.doesNotMatch(page.body,/type="importmap"/);
 const script=await f.call('/ui-recovery/recovery.js');assert.equal(script.status,200);assert.doesNotMatch(script.body,/@ksf\/runtime|from ['"]react/);
 assert.equal((await f.call('/ui-recovery/recovery.css')).status,200);assert.equal((await f.call('/api/health')).status,200);
 assert.equal((await f.call('/assets/ksf-ui-a.js')).body,'export const fixture="a";');
 const status=await f.status();assert.equal(status.activeUsable,false);assert.equal(status.diagnostic.code,'WEB_BUILD_INVALID');
 const restored=await f.post('activate',{releaseId:A,operationId:randomUUID(),ifMatch:status.etag});assert.equal(restored.status,200);assert.equal((await f.call('/')).status,200);
});
test('a corrupted selection remains diagnosable and can recover a verified checkpoint through the same authorized HTTP boundary',async t=>{
 const f=await fixture(t);await f.call('/');const original=(await f.status()).active,broken='{broken selector';
 await writeFile(join(f.root,'.agents/user-data/ui-runtime/state.json'),broken);
 const status=await f.status();assert.equal(status.diagnostic.code,'UI_FRONTEND_STATE_INVALID');assert.ok(status.recovery.states.length);
 const request={checkpoint:status.recovery.states[0].checkpoint,ifMatchRaw:status.recovery.selectionDigest,operationId:randomUUID()};
 const recovered=await f.post('recover',request);assert.equal(recovered.status,200);assert.equal((await f.status()).active,original);
 assert.equal(await readFile(join(f.root,'.agents/runtime-data/ui-runtime/selection-history','.corrupt-'+status.recovery.selectionDigest+'.bin'),'utf8'),broken);
 assert.equal((await f.call('/')).status,200);
});
test('a retained document launches against its own verified runtime even if the newer active snapshot fails',async t=>{
 const f=await fixture(t),first=await f.call('/'),lease=jsonScript(first.body,'ksf-frontend-client');
 const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.6.0',id:'com.example.document-gate',name:'document fixture',description:'isolated fixture',version:'1.0.0',permissions:[],dataStores:[],window:{entry:'frontend/index.js'}};
 const code=Buffer.from('export function mount(){}'),bytes=encodePackage(manifest,{'frontend/index.js':{content:code.toString('base64'),sha256:checksum(code),mode:420}}),entry={manifest,package:{url:'fixture.ksfapp',size:bytes.length,sha256:checksum(bytes)}};
 await writeFile(join(f.catalog,'fixture.ksfapp'),bytes);await writeFile(join(f.catalog,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[entry]}));
 const installed=await f.appPost('install',{trusted:true,sourceId:'builtin',appId:manifest.id,version:'1.0.0',digest:entry.package.sha256});assert.equal(installed.status,200,installed.body);
 const B=await f.stage(uiRuntimeFixture(t,{suffix:'b'}));await f.post('activate',{releaseId:B,operationId:randomUUID(),ifMatch:(await f.status()).etag});
 await writeFile(join(f.root,'.agents/runtime-data/ui-runtime/releases',B,'dist/assets/ui-b.css'),'damaged active');
 const input={appId:manifest.id,digest:entry.package.sha256,surface:{kind:'window',pageId:'fixture',surfaceId:'fixture-window',frontend:lease}};
 const opened=await f.appPost('launch',input);assert.equal(opened.status,200,opened.body);await f.appPost('release',{instanceId:JSON.parse(opened.body).data.id});
 const mismatched=await f.appPost('launch',{...input,surface:{...input.surface,frontend:{...lease,releaseId:B}}});assert.equal(mismatched.status,409);assert.equal(JSON.parse(mismatched.body).error.code,'UI_CLIENT_INVALID');
 const path=join(f.root,'.agents/runtime-data/ui-runtime/clients',lease.clientId+'.json'),record=JSON.parse(await readFile(path,'utf8'));record.expiresAt=0;await writeFile(path,JSON.stringify(record));
 const expired=await f.appPost('launch',input);assert.equal(expired.status,410);assert.equal(JSON.parse(expired.body).error.code,'UI_CLIENT_EXPIRED');
});
test('host window checkpoints use the authorized HTTP boundary and retain their original immutable operation',async t=>{
 const f=await fixture(t),operationId=randomUUID(),value={schemaVersion:1,frontendReleaseId:(await f.status()).active,windows:[],activeId:null,desktop:true,activeGroupId:'default'},input={action:'write',operationId,value};
 const auth=JSON.parse((await f.call('/api/workbench/session')).body).data;assert.ok(auth.capabilities.includes('ui-document-sessions-v1'));
 assert.equal((await f.call('/api/ui-runtime/document-session',input)).status,403);
 const first=await f.post('document-session',input);assert.equal(first.status,200,first.body);const receipt=JSON.parse(first.body).data;assert.equal(receipt.resumeToken,operationId);
 const read=await f.call('/api/ui-runtime/document-session?resumeToken='+operationId);assert.equal(read.status,200);assert.deepEqual(JSON.parse(read.body).data.record.value,value);
 const exported=await f.call('/api/ui-runtime/document-session-export?resumeToken='+operationId);assert.equal(exported.status,200);assert.match(exported.headers.get('content-disposition'),/attachment/);assert.deepEqual(JSON.parse(exported.body).value,value);
 const replay=await f.post('document-session',input);assert.equal(JSON.parse(replay.body).data.etag,receipt.etag);
 const conflict=await f.post('document-session',{...input,value:{...value,desktop:false}});assert.equal(conflict.status,409);assert.equal(JSON.parse(conflict.body).error.code,'UI_DOCUMENT_OPERATION_CONFLICT');assert.equal((await f.status()).active,value.frontendReleaseId);
});
