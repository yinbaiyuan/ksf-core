import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWebBuild} from '../src/web/assets.js';
import {uiRuntimeFixture} from './helpers/ui-runtime-fixture.js';
test('current complete frontend snapshots have no shared component map or renderer admission contract',t=>{
 const f=uiRuntimeFixture(t),assets=verifyWebBuild(f.web),runtime=assets.frontendRuntime;
 assert.equal(runtime.protocol,'ksf-frontend-runtime-v1');assert.equal(runtime.imports,undefined);assert.equal(runtime.rendererFamily,undefined);assert.match(assets.get('/').bytes.toString(),/ksf-frontend-runtime/);assert.doesNotMatch(assets.get('/').bytes.toString(),/importmap|ksf-ui-runtime-descriptor/);
 f.info.frontendRuntime.resources['assets/ksf-ui-123.js'].push('assets/lost.js');f.save();assert.throws(()=>verifyWebBuild(f.web),/resource reference/);
});
