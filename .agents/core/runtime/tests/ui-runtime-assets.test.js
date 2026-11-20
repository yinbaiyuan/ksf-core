import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyWebBuild,verifyFrontendSnapshot} from '../src/web/assets.js';
import {uiRuntimeFixture} from './helpers/ui-runtime-fixture.js';
const fixture=(t,options={})=>uiRuntimeFixture(t,{...options,legacy:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('verified host assets retain the exact shared runtime and import-map CSP hash',t=>{
  const f=fixture(t),assets=verifyWebBuild(f.web);
  assert.equal(assets.uiRuntime.frontendReleaseId,f.info.uiRuntime.frontendReleaseId);
  assert.equal(assets.uiRuntime.importMapHash,f.info.uiRuntime.importMapHash);
  assert.ok(assets.has(f.info.uiRuntime.imports['@ksf/runtime/react/v1']));
});
test('adding an optional bridge never invalidates a previously valid five-module snapshot',t=>{
 const f=fixture(t,{bridge:false,features:['ui.provider','ui.policy','ui.compatibility']}),assets=verifyWebBuild(f.web);
 assert.equal(Object.keys(assets.uiRuntime.imports).length,5);
 assert.equal(assets.uiRuntime.features.includes('ui.save'),false);
});
test('desktop, picker and legacy additions keep a previous six-module descriptor valid when it advertises none of those features',t=>{
 const f=fixture(t,{features:['ui.provider','ui.policy','ui.compatibility','ui.save','ui.run','ui.session','ui.overlay','ui.commands','ui.loader','ui.primitives','ui.composites','ui.resources','ui.document-boot']}),assets=verifyWebBuild(f.web);
 assert.equal(Object.keys(assets.uiRuntime.imports).length,6);assert.equal(assets.uiRuntime.features.includes('ui.desktop'),false);
 assert.equal(assets.uiRuntime.imports['@ksf/runtime/ui-desktop/v1'],undefined);assert.equal(assets.uiRuntime.imports['@ksf/runtime/ui-files/v1'],undefined);assert.equal(assets.uiRuntime.imports['@ksf/runtime/ui-compat/v1'],undefined);
});
test('a shared entry cannot resolve outside the verified local asset set',t=>{
  const f=fixture(t);f.info.uiRuntime.imports['@ksf/runtime/ui/v1']='https://example.invalid/ui.js';f.save();
  assert.throws(()=>verifyWebBuild(f.web),/not in the verified build/);
});
test('an incomplete public renderer map fails before the workbench can launch',t=>{
  const f=fixture(t);delete f.info.uiRuntime.imports['@ksf/runtime/react-dom-client/v1'];f.save();
  assert.throws(()=>verifyWebBuild(f.web),/incomplete/);
});
test('stylesheet loss and module tampering cannot become a partially usable runtime',t=>{
  const f=fixture(t);f.write(join(f.dist,'assets/ui-123.css'),'changed after build');
  assert.throws(()=>verifyWebBuild(f.web),/checksum mismatch/);
});
test('metadata cannot grant a different import-map inline-script hash',t=>{
  const f=fixture(t);f.info.uiRuntime.importMapHash='not-the-map-hash';f.save();
  assert.throws(()=>verifyWebBuild(f.web),/import map integrity/);
});
test('a map placed after the host module is rejected even when file hashes match',t=>{
  const f=fixture(t),path=join(f.dist,'index.html'),html=readFileSync(path,'utf8'),marker=`<script type="importmap" id="ksf-ui-import-map">${f.info.uiRuntime.importMap}</script>`;
  const changed=html.replace(marker,'').replace('</html>',marker+'</html>');f.write(path,changed);f.info.files['index.html']=hash(changed);f.save();
  assert.throws(()=>verifyWebBuild(f.web),/precede/);
});
test('release identity cannot be changed independently of the complete verified snapshot',t=>{
  const f=fixture(t);f.info.uiRuntime.frontendReleaseId='f'.repeat(64);f.save();
  assert.throws(()=>verifyWebBuild(f.web),/bootstrap|identity/);
});
test('historical snapshots use a registered manifest digest while current builds still require matching source',t=>{
 const f=fixture(t),registered=verifyWebBuild(f.web).snapshotInfo;
 f.write(join(f.web,'src/changed.ts'),'export const next=true;');
 assert.throws(()=>verifyWebBuild(f.web),/stale/);
 const old=verifyFrontendSnapshot(f.dist,{expectedBuildDigest:registered.buildDigest});
 assert.equal(old.uiRuntime.frontendReleaseId,f.info.uiRuntime.frontendReleaseId);
 assert.throws(()=>verifyFrontendSnapshot(f.dist),/provenance/);
 f.info.extra='unregistered manifest change';f.save();
 assert.throws(()=>verifyFrontendSnapshot(f.dist,{expectedBuildDigest:registered.buildDigest}),/manifest digest/);
});
test('registered provenance never bypasses file integrity and exposed runtime descriptions are immutable',t=>{
 const f=fixture(t),assets=verifyWebBuild(f.web),registered=assets.snapshotInfo;
 assert.throws(()=>assets.uiRuntime.features.push('ui.fake'),TypeError);
 assert.throws(()=>{assets.uiRuntime.imports['@ksf/runtime/ui/v1']='/different.js';},TypeError);
 f.write(join(f.dist,'assets/ui-123.css'),'damaged history');
 assert.throws(()=>verifyFrontendSnapshot(f.dist,{expectedBuildDigest:registered.buildDigest}),/checksum mismatch/);
});
test('a transitive resource omitted from the verified local closure cannot pass startup',t=>{
 const f=fixture(t);f.info.uiRuntime.resources['assets/ksf-ui-123.js'].push('assets/missing-lazy-123.js');f.save();
 assert.throws(()=>verifyWebBuild(f.web),/resource reference is missing/);
});
