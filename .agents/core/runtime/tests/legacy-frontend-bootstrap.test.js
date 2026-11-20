import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createUIBootstrap, injectUIBootstrap} from './helpers/legacy-ui-bootstrap.mjs';

function fixture() {
  const names = ['ksf-ui','ksf-ui-bridge','ksf-ui-ai','ksf-ui-domain','ksf-ui-desktop','ksf-ui-files','ksf-ui-compat','ksf-react','ksf-react-dom','ksf-react-dom-client','ksf-jsx-runtime'];
  const manifest = Object.fromEntries(names.map(name => [name, {name, isEntry:true, file:`assets/${name}-abc.js`, imports:['shared'], css:name==='ksf-ui'?['assets/ui-abc.css']:[]}]));
  manifest.shared={file:'assets/shared-abc.js',css:['assets/shared-abc.css']};
  const files=Object.fromEntries(Object.values(manifest).flatMap(item=>[item.file,...(item.css??[])]).map(path=>[path,'a'.repeat(64)]));
  files['index.html']='d'.repeat(64);
  return {manifest,options:{sourceDigest:'b'.repeat(64),contractVersion:'1.0.0',rendererFamily:'ksf-react-v1',files}};
}
test('all public UI and renderer specifiers share one immutable build with complete styles',()=>{
  const {manifest,options}=fixture(),value=createUIBootstrap(manifest,options);
  assert.equal(Object.keys(value.imports).length,11);
  assert.deepEqual(value.styles,['/assets/shared-abc.css','/assets/ui-abc.css']);
  assert.equal(value.importMapHash,createHash('sha256').update(value.importMap).digest('base64'));
  assert.match(value.frontendReleaseId,/^[a-f0-9]{64}$/);
  assert.equal(value.frontendReleaseId,createUIBootstrap(manifest,options).frontendReleaseId);
  assert.notEqual(value.frontendReleaseId,createUIBootstrap(manifest,{...options,sourceDigest:'c'.repeat(64)}).frontendReleaseId);
});
test('map and descriptor precede the shell module and duplicate injection is rejected',()=>{
  const {manifest,options}=fixture(),value=createUIBootstrap(manifest,options),html='<html><head><script type="module" src="/assets/main-abc.js"></script></head></html>';
  const output=injectUIBootstrap(html,value);
  assert.ok(output.indexOf('ksf-ui-import-map')<output.indexOf('type="module"'));
  assert.ok(output.includes('ksf-ui-runtime-descriptor'));assert.ok(output.includes(value.frontendReleaseId));
  assert.throws(()=>injectUIBootstrap(output,value),/already present/);
});
test('missing module, stylesheet or transitive dependency prevents a partial runtime',()=>{
  for(const missing of ['ksf-react','shared','ksf-ui-domain','ksf-ui-ai','ksf-ui-domain','ksf-ui-desktop','ksf-ui-files','ksf-ui-compat']){
    const {manifest,options}=fixture();delete manifest[missing];assert.throws(()=>createUIBootstrap(manifest,options),/Missing/);
  }
  const {manifest,options}=fixture();delete options.files['assets/ui-abc.css'];assert.throws(()=>createUIBootstrap(manifest,options),/stylesheet|resource/);
});
test('an optional export feature still requires its real module even without the bridge base feature',()=>{
 const {manifest,options}=fixture();delete manifest['ksf-ui-bridge'];assert.throws(()=>createUIBootstrap(manifest,{...options,features:['ui.provider','ui.run']}),/Missing shared runtime entry ksf-ui-bridge/);
});
test('a previous nine-module shared snapshot remains valid when it never advertised the new AI component capability',()=>{
 const {manifest,options}=fixture();delete manifest['ksf-ui-ai'];delete manifest['ksf-ui-domain'];
 const value=createUIBootstrap(manifest,{...options,features:['ui.provider','ui.policy','ui.compatibility','ui.save','ui.run','ui.session','ui.overlay','ui.commands','ui.loader','ui.primitives','ui.composites','ui.resources','ui.desktop','ui.files','ui.legacy','ui.document-boot']});
 assert.equal(Object.keys(value.imports).length,9);assert.equal(Object.hasOwn(value.imports,'@ksf/runtime/ui-ai/v1'),false);
});

test('the previous ten-module snapshot stays valid without advertising domain components',()=>{
 const {manifest,options}=fixture();delete manifest['ksf-ui-domain'];
 const features=['ui.provider','ui.policy','ui.compatibility','ui.save','ui.run','ui.session','ui.overlay','ui.commands','ui.loader','ui.primitives','ui.composites','ui.resources','ui.ai','ui.desktop','ui.files','ui.legacy','ui.document-boot'];
 const value=createUIBootstrap(manifest,{...options,features});assert.equal(Object.keys(value.imports).length,10);assert.equal(Object.hasOwn(value.imports,'@ksf/runtime/ui-domain/v1'),false);
});
