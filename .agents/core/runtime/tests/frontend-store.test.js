import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createFrontendStore} from '../src/web/frontend-store.js';
import {uiRuntimeFixture} from './helpers/ui-runtime-fixture.js';
import {createApplicationManager} from '../src/applications/manager.js';
import {encodePackage,checksum,assertCompatible} from '../src/applications/protocol.js';

async function fixture(t,options={}){
 const root=await mkdtemp(join(tmpdir(),'ksf-frontend-store-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=createFrontendStore(root,{coreVersion:'0.6.0',withConsumers:action=>action([]),...options});
 const request=async()=>({operationId:randomUUID(),ifMatch:(await store.status()).etag});
 const stage=async page=>{await store.stage(page.web,await request());return page.info.uiRuntime.frontendReleaseId;};
 const activate=async id=>store.activate(id,await request());
 return {root,store,request,stage,activate};
}
test('real staged snapshots remain complete and immutable across A to B to A without rewriting business data',async t=>{
 const f=await fixture(t),a=uiRuntimeFixture(t,{suffix:'a'}),b=uiRuntimeFixture(t,{suffix:'b'});
 const business=join(f.root,'business.json');await writeFile(business,'{"draft":"未保存内容","operationId":"original"}');const original=await readFile(business);
 const A=await f.stage(a);await f.activate(A);const B=await f.stage(b);await f.activate(B);
 assert.equal((await f.store.current()).releaseId,B);
 assert.equal((await f.store.asset('/assets/ksf-ui-a.js')).bytes.toString(),'export const fixture="a";');
 await f.activate(A);const selected=await f.store.current();assert.equal(selected.releaseId,A);assert.ok(selected.assets.has('/assets/ui-a.css'));
 assert.equal((await f.store.status()).lastKnownGood,null);assert.deepEqual(await readFile(business),original);
 const reopened=createFrontendStore(f.root,{coreVersion:'0.6.0',withConsumers:action=>action([])});
 assert.equal((await reopened.current()).releaseId,A);
});
test('replaying a lost activation receipt returns its original outcome; CAS and operation reuse cannot override later choices',async t=>{
 const f=await fixture(t),a=uiRuntimeFixture(t,{suffix:'a'}),b=uiRuntimeFixture(t,{suffix:'b'}),A=await f.stage(a),B=await f.stage(b);
 const request=await f.request(),one=await f.store.activate(A,request);const two=await f.store.activate(A,request);
 assert.equal(two.replayed,true);assert.equal(two.revision,one.revision);
 await assert.rejects(f.store.activate(B,{...request,operationId:randomUUID()}),{code:'UI_FRONTEND_CONFLICT'});
 await assert.rejects(f.store.activate(B,request),{code:'UI_OPERATION_REUSED'});
 assert.equal((await f.store.current()).releaseId,A);
});
test('incomplete or damaged candidates never become active and cannot change the working release',async t=>{
 const f=await fixture(t),a=uiRuntimeFixture(t,{suffix:'a'}),b=uiRuntimeFixture(t,{suffix:'b'}),A=await f.stage(a);await f.activate(A);
 const B=await f.stage(b),path=join(f.root,'.agents/runtime-data/ui-runtime/releases',B,'dist/assets/ui-b.css');await writeFile(path,'damaged candidate');
 const before=(await f.store.status()).etag;
 await assert.rejects(f.activate(B),{code:'WEB_BUILD_INVALID'});
 assert.equal((await f.store.status()).etag,before);assert.equal((await f.store.current()).releaseId,A);
 assert.ok((await f.store.asset('/assets/ui-a.css')).bytes.length);
});
test('a candidate cannot reuse an immutable asset URL for different bytes',async t=>{
 const f=await fixture(t),a=uiRuntimeFixture(t,{suffix:'same',content:'a'}),b=uiRuntimeFixture(t,{suffix:'same',content:'b'});
 const A=await f.stage(a);await f.activate(A);const before=await f.store.status();
 await assert.rejects(f.stage(b),{code:'UI_ASSET_COLLISION'});
 assert.equal((await f.store.status()).etag,before.etag);
 assert.equal((await f.store.asset('/assets/ksf-ui-same.js')).bytes.toString(),'export const fixture="a";');
});
test('host Core ranges and workbench protocol approval are independent gates',async t=>{
 const f=await fixture(t),future=uiRuntimeFixture(t,{hostCompatibility:{workbenchContract:'ksf-workbench-v1',minimumCoreVersion:'0.7.0',maximumCoreVersionExclusive:'0.8.0'}});
 await assert.rejects(f.stage(future),{code:'UI_CORE_INCOMPATIBLE'});
 assert.equal((await f.store.status()).active,null);
 const noApproval=await fixture(t,{coreVersion:'0.5.7'}),a=uiRuntimeFixture(t);
 await assert.rejects(noApproval.stage(a),{code:'UI_CORE_INCOMPATIBLE'});
});
test('normal switching reports incompatible consumers and never disables or downgrades them',async t=>{
 let consumers=[];
 const f=await fixture(t,{withConsumers:action=>action(consumers)}),a=uiRuntimeFixture(t),A=await f.stage(a);await f.activate(A);
 consumers=[{manifest:{schemaVersion:1,sdkVersion:1,minCoreVersion:'0.6.0',id:'com.example.future',name:'fixture',description:'fixture',version:'1.0.0',permissions:[],dataStores:[],window:{entry:'frontend/index.js'},sdkApiVersion:'2.0.0'}}];
 await assert.rejects(f.store.preview(A),error=>error.code==='UI_CONSUMER_INCOMPATIBLE'&&error.data.blocked[0].appId==='com.example.future');
 assert.equal(consumers.length,1);assert.equal((await f.store.current()).releaseId,A);
});
test('absence of a consumer lock or independent qualification fails closed',async t=>{
 const f=await fixture(t,{withConsumers:undefined}),a=uiRuntimeFixture(t),A=await f.stage(a);
 await assert.rejects(f.activate(A),{code:'UI_CONSUMER_GATE_UNAVAILABLE'});
 await assert.rejects(f.store.markKnownGood(A,await f.request()),{code:'UI_QUALIFICATION_REQUIRED'});
 assert.equal((await f.store.status()).lastKnownGood,null);
});
test('GC retains live client references, active and pending; expired clients must reload and old URLs never change bytes',async t=>{
 let clock=10000;const f=await fixture(t,{now:()=>clock,leaseMs:1000});
 const a=uiRuntimeFixture(t,{suffix:'a'}),b=uiRuntimeFixture(t,{suffix:'b'}),c=uiRuntimeFixture(t,{suffix:'c'});
 const A=await f.stage(a);await f.activate(A);const lease=await f.store.retain(A),B=await f.stage(b);await f.activate(B);const C=await f.stage(c);
 assert.deepEqual((await f.store.collect(await f.request())).removed,[]);
 clock=12000;await assert.rejects(f.store.heartbeat(lease.clientId),{code:'UI_CLIENT_EXPIRED'});
 const collected=await f.store.collect(await f.request());assert.deepEqual(collected.removed,[A]);
 assert.ok((await f.store.status()).releases[B]);assert.ok((await f.store.status()).releases[C]);
 await assert.rejects(f.store.asset('/assets/ksf-ui-a.js'),{code:'UI_ASSET_NOT_FOUND'});assert.ok(await f.store.asset('/assets/ksf-ui-b.js'));
});
test('only an independent qualification can designate LKG, which remains protected after activating another release',async t=>{
 const evidence=Object.freeze({id:'fixture-full-acceptance',evidence:[{path:'fixture-report',digest:'a'.repeat(64)}]});
 const f=await fixture(t,{qualifySnapshot:async(_id,qualificationId)=>qualificationId===evidence.id?evidence:null});
 const A=await f.stage(uiRuntimeFixture(t,{suffix:'a'}));await f.activate(A);
 await assert.rejects(f.store.markKnownGood(A,{...await f.request(),qualificationId:'boot-succeeded'}),{code:'UI_QUALIFICATION_REQUIRED'});
 await f.store.markKnownGood(A,{...await f.request(),qualificationId:evidence.id});
 const B=await f.stage(uiRuntimeFixture(t,{suffix:'b'}));await f.activate(B);assert.deepEqual((await f.store.collect(await f.request())).removed,[]);
 assert.equal((await f.store.status()).lastKnownGood,A);
});
async function startupFixture(t,{qualified=true,withConsumers=action=>action([])}={}){
 const evidence={id:'fixture-full-acceptance',evidence:[{path:'fixture-report',digest:'a'.repeat(64)}]},f=await fixture(t,{withConsumers,qualifySnapshot:async(_id,id)=>id===evidence.id?evidence:null});
 const A=await f.stage(uiRuntimeFixture(t,{suffix:'a',features:['ui.provider','ui.policy','ui.compatibility']}));await f.activate(A);if(qualified)await f.store.markKnownGood(A,{...await f.request(),qualificationId:evidence.id});
 const B=await f.stage(uiRuntimeFixture(t,{suffix:'b'}));await f.activate(B);const lease=await f.store.retain(B);
 const input={...await f.request(),operationId:lease.clientId,clientId:lease.clientId,releaseId:B,reason:'asset-error',resource:'/assets/ui-b.css'};
 return {...f,A,B,lease,input};
}
test('one attributable unready boot can select qualified LKG, preserve data and old clients, and reconcile without another switch',async t=>{
 const f=await startupFixture(t),path=join(f.root,'business.json'),bytes='{"draft":"中文草稿","operationId":"original"}';await writeFile(path,bytes);
 const receipt=await f.store.startupFallback(f.input);assert.equal(receipt.releaseId,f.A);assert.equal((await f.store.current()).releaseId,f.A);assert.equal(await readFile(path,'utf8'),bytes);
 assert.equal((await f.store.heartbeat(f.lease.clientId)).releaseId,f.B);
 await assert.rejects(f.store.startupReady({clientId:f.lease.clientId,releaseId:f.B}),{code:'UI_BOOT_FALLBACK_EXHAUSTED'});
 const C=await f.stage(uiRuntimeFixture(t,{suffix:'c'}));await f.activate(C);
 const replay=await f.store.startupFallback(f.input);assert.equal(replay.replayed,true);assert.equal(replay.releaseId,f.A);assert.equal((await f.store.current()).releaseId,C);
 assert.equal((await f.store.status()).releases[f.B].lastStartupFailure.clientId,f.lease.clientId);
});
test('application resource errors and already ready documents cannot initiate global startup fallback',async t=>{
 const f=await startupFixture(t);
 await assert.rejects(f.store.startupFallback({...f.input,resource:'/app-assets/com.example.app/main.js'}),{code:'UI_BOOT_INVALID'});
 await f.store.startupReady({clientId:f.lease.clientId,releaseId:f.B});
 await assert.rejects(f.store.startupFallback(f.input),{code:'UI_BOOT_FALLBACK_EXHAUSTED'});assert.equal((await f.store.current()).releaseId,f.B);
});
test('absence of LKG consumes the single startup attempt and never creates a boot-derived qualification',async t=>{
 const f=await startupFixture(t,{qualified:false});
 await assert.rejects(f.store.startupFallback(f.input),{code:'UI_QUALIFICATION_REQUIRED'});
 await assert.rejects(f.store.startupFallback(f.input),{code:'UI_BOOT_FALLBACK_EXHAUSTED'});assert.equal((await f.store.current()).releaseId,f.B);assert.equal((await f.store.status()).lastKnownGood,null);
});
test('an old boot CAS cannot overwrite a later host choice, including when retried with a fresh selector',async t=>{
 const f=await startupFixture(t),C=await f.stage(uiRuntimeFixture(t,{suffix:'c'}));await f.activate(C);
 await assert.rejects(f.store.startupFallback(f.input),{code:'UI_FRONTEND_CONFLICT'});
 await assert.rejects(f.store.startupFallback({...f.input,ifMatch:(await f.store.status()).etag}),{code:'UI_BOOT_INVALID'});assert.equal((await f.store.current()).releaseId,C);
});
test('a once-qualified fallback is rejected against current consumers instead of hiding their new requirements',async t=>{
 let consumers=[];const f=await startupFixture(t,{withConsumers:action=>action(consumers)});
 consumers=[{manifest:{schemaVersion:1,sdkVersion:1,minCoreVersion:'0.6.0',id:'com.example.new',name:'fixture',description:'fixture',version:'1.0.0',permissions:[],dataStores:[],window:{entry:'frontend/index.js'},sdkApiVersion:'2.0.0'}}];
 await assert.rejects(f.store.startupFallback(f.input),error=>error.code==='UI_CONSUMER_INCOMPATIBLE'&&error.data.blocked[0].appId==='com.example.new');
 assert.equal((await f.store.current()).releaseId,f.B);assert.equal(consumers.length,1);
 await assert.rejects(f.store.startupFallback(f.input),{code:'UI_BOOT_FALLBACK_EXHAUSTED'});
});
test('real application installation and frontend activation share the registry lock and cannot publish an incompatible pair',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-ui-race-')),catalog=join(root,'catalog');await mkdir(catalog);
 let store;const manager=createApplicationManager(root,{defaultSource:null,storeDirectory:catalog,coreVersion:'0.6.0'});
 t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
 store=createFrontendStore(root,{coreVersion:'0.6.0',withConsumers:action=>manager.withFrontendConsumers(action)});
 const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.6.0',id:'com.example.capability',name:'race fixture',description:'isolated contract fixture',version:'1.0.0',permissions:[],dataStores:[],window:{entry:'frontend/index.js'}};
 const code=Buffer.from('export function mount(root){root.textContent="fixture"}'),bytes=encodePackage(manifest,{'frontend/index.js':{content:code.toString('base64'),sha256:checksum(code),mode:420}});
 const entry={manifest,package:{url:'fixture.ksfapp',size:bytes.length,sha256:checksum(bytes)}};
 await writeFile(join(catalog,entry.package.url),bytes);await writeFile(join(catalog,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[entry]}));
 const a=uiRuntimeFixture(t,{suffix:'a',features:['ui.provider','ui.policy','ui.compatibility','ui.custom']}),b=uiRuntimeFixture(t,{suffix:'b'});
 const request=async()=>({operationId:randomUUID(),ifMatch:(await store.status()).etag});
 await store.stage(a.web,await request());const A=a.info.uiRuntime.frontendReleaseId;await store.activate(A,await request());
 await store.stage(b.web,await request());const B=b.info.uiRuntime.frontendReleaseId;
 const results=await Promise.allSettled([manager.install({trusted:true,sourceId:'builtin',appId:manifest.id,version:'1.0.0',digest:entry.package.sha256}),store.activate(B,await request())]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
 const selected=await store.current(),installed=(await manager.snapshot()).installed;
 for(const app of installed)assertCompatible(app.active.manifest,{coreVersion:'0.6.0',uiRuntime:selected.assets.uiRuntime});
 assert.equal(selected.releaseId,B);assert.equal(installed.length,1);
});
test('a corrupted selection recovers from verified checkpoints, preserves the raw original, receipts and live-client resources',async t=>{
 const f=await fixture(t),A=await f.stage(uiRuntimeFixture(t,{suffix:'a'}));await f.activate(A);
 const B=await f.stage(uiRuntimeFixture(t,{suffix:'b'}));await f.activate(B);const lease=await f.store.retain(B),before=await f.store.status();
 const path=join(f.root,'.agents/user-data/ui-runtime/state.json'),broken=Buffer.from('{broken selection');await writeFile(path,broken);
 await assert.rejects(f.store.status(),{code:'UI_FRONTEND_STATE_INVALID'});
 const catalog=await f.store.recoveryStates(),chosen=catalog.states.filter(row=>row.active===A).at(-1),input={operationId:randomUUID(),ifMatchRaw:catalog.selectionDigest};
 const recovered=await f.store.recoverSelection(chosen.checkpoint,input);assert.equal(recovered.releaseId,A);assert.ok(recovered.revision>before.revision);
 assert.deepEqual(await readFile(join(f.root,'.agents/runtime-data/ui-runtime/selection-history','.corrupt-'+catalog.selectionDigest+'.bin')),broken);
 assert.equal((await f.store.heartbeat(lease.clientId)).releaseId,B);
 assert.equal((await f.store.asset('/assets/ksf-ui-b.js')).bytes.toString(),'export const fixture="b";');
 const restored=await f.store.status();for(const id of Object.keys(before.operations))assert.deepEqual(restored.operations[id],before.operations[id]);
 assert.equal((await f.store.recoverSelection(chosen.checkpoint,input)).replayed,true);
});
test('recovery cannot overwrite a changed raw selection or bypass a still-valid normal activation path',async t=>{
 const f=await fixture(t),A=await f.stage(uiRuntimeFixture(t));await f.activate(A);const valid=await f.store.recoveryStates(),checkpoint=valid.states[0].checkpoint;
 await assert.rejects(f.store.recoverSelection(checkpoint,{operationId:randomUUID(),ifMatchRaw:valid.selectionDigest}),{code:'UI_FRONTEND_RECOVERY_NOT_REQUIRED'});
 const path=join(f.root,'.agents/user-data/ui-runtime/state.json');await writeFile(path,'{first corruption');const old=await f.store.recoveryStates();await writeFile(path,'{later corruption');
 await assert.rejects(f.store.recoverSelection(checkpoint,{operationId:randomUUID(),ifMatchRaw:old.selectionDigest}),{code:'UI_FRONTEND_CONFLICT'});
 assert.equal(await readFile(path,'utf8'),'{later corruption');
 const history=join(f.root,'.agents/runtime-data/ui-runtime/selection-history',checkpoint+'.json');await writeFile(history,'{}');assert.equal((await f.store.recoveryStates()).states.some(item=>item.checkpoint===checkpoint),false);
});
test('a missing selection with valid history is never mistaken for first installation',async t=>{
 const f=await fixture(t),A=await f.stage(uiRuntimeFixture(t));await f.activate(A);
 await rm(join(f.root,'.agents/user-data/ui-runtime/state.json'));
 await assert.rejects(f.store.status(),{code:'UI_FRONTEND_STATE_MISSING'});
 const history=await f.store.recoveryStates();assert.equal(history.selectionDigest,null);
 await f.store.recoverSelection(history.states[0].checkpoint,{operationId:randomUUID(),ifMatchRaw:null});
 assert.equal((await f.store.current()).releaseId,A);
});
test('verified history can reconcile an original operation while the selector is corrupt and cannot reuse its identity for recovery',async t=>{
 const f=await fixture(t),A=await f.stage(uiRuntimeFixture(t)),input=await f.request();await f.store.activate(A,input);
 const path=join(f.root,'.agents/user-data/ui-runtime/state.json');await writeFile(path,'{corrupt');
 const result=await f.store.operation(input.operationId);assert.equal(result.provenance,'checkpoint');assert.equal(result.receipt.releaseId,A);
 const history=await f.store.recoveryStates();await assert.rejects(f.store.recoverSelection(history.states[0].checkpoint,{operationId:input.operationId,ifMatchRaw:history.selectionDigest}),{code:'UI_OPERATION_REUSED'});
 assert.equal(await readFile(path,'utf8'),'{corrupt');
});
