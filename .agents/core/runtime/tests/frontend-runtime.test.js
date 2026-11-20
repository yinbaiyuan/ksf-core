import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createFrontendRuntime} from '../src/web/frontend-runtime.js';
import {verifyWebBuild} from '../src/web/assets.js';
import {uiRuntimeFixture} from './helpers/ui-runtime-fixture.js';

async function fixture(t){const root=await mkdtemp(join(tmpdir(),'ksf-frontend-runtime-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
function runtime(root,page,options={}){return createFrontendRuntime(root,{coreVersion:'0.6.0',webDirectory:page.web,bundledAssets:()=>verifyWebBuild(page.web),applications:()=>({withFrontendConsumers:action=>action([])}),...options});}
test('first document registers a complete production-shaped bundle; a new Core bundle changes only the next document selection',async t=>{
 const root=await fixture(t),a=uiRuntimeFixture(t,{suffix:'a'}),b=uiRuntimeFixture(t,{suffix:'b'}),one=runtime(root,a),first=await one.selected();
 const A=first.releaseId;assert.equal(A,a.info.uiRuntime.frontendReleaseId);assert.equal((await one.status()).lastKnownGood,null);
 const two=runtime(root,b),second=await two.selected();assert.equal(second.releaseId,b.info.uiRuntime.frontendReleaseId);assert.notEqual(A,second.releaseId);
 assert.equal(first.assets.uiRuntime.frontendReleaseId,A);assert.equal((await two.asset('/assets/ksf-ui-a.js')).bytes.toString(),'export const fixture="a";');
});
test('an explicit compatible rollback persists through another host process instead of reapplying the same known bundle',async t=>{
 const root=await fixture(t),a=uiRuntimeFixture(t,{suffix:'a'}),b=uiRuntimeFixture(t,{suffix:'b'}),A=(await runtime(root,a).selected()).releaseId;
 const upgraded=runtime(root,b);await upgraded.selected();const status=await upgraded.status();await upgraded.activate(A,{operationId:randomUUID(),ifMatch:status.etag});
 assert.equal((await runtime(root,b).selected()).releaseId,A);
});
test('a damaged packaged candidate does not stop a registered compatible active snapshot',async t=>{
 const root=await fixture(t),a=uiRuntimeFixture(t,{suffix:'a'}),b=uiRuntimeFixture(t,{suffix:'b'}),A=(await runtime(root,a).selected()).releaseId;
 await writeFile(join(b.dist,'assets/ui-b.css'),'damaged candidate');const service=runtime(root,b);
 assert.equal((await service.selected()).releaseId,A);assert.equal((await service.status()).diagnostic.code,'WEB_BUILD_INVALID');
});
test('damage to a newly selected snapshot cannot prevent old clients from loading their own original lazy assets',async t=>{
 const root=await fixture(t),a=uiRuntimeFixture(t,{suffix:'a'}),b=uiRuntimeFixture(t,{suffix:'b'}),A=(await runtime(root,a).selected()).releaseId;
 const upgraded=runtime(root,b),B=(await upgraded.selected()).releaseId;
 await writeFile(join(root,'.agents/runtime-data/ui-runtime/releases',B,'dist/assets/ui-b.css'),'damaged active B');
 await assert.rejects(upgraded.selected(),{code:'WEB_BUILD_INVALID'});
 assert.equal((await upgraded.asset('/assets/ksf-ui-a.js')).bytes.toString(),'export const fixture="a";');
 assert.notEqual(A,B);
});
test('a pre-shared Core preserves the original packaged path and never creates a shared selection store',async t=>{
 const root=await fixture(t),a=uiRuntimeFixture(t),service=runtime(root,a,{coreVersion:'0.5.7'});
 assert.equal((await service.status()).enabled,false);assert.ok((await service.selected()).assets.has('/index.html'));
 assert.equal(existsSync(join(root,'.agents/user-data/ui-runtime')),false);
});
