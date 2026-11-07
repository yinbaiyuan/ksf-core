import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCompatible,stampSDKManifest,SDK_COMPATIBILITY,checksum,encodePackage} from '../src/applications/protocol.js';
const legacy={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',id:'com.example.compatibility',name:'SDK compatibility',description:'fixture',version:'1.0.0',dataStores:[],permissions:[],backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'}};
const app=version=>({...legacy,minCoreVersion:'0.5.3',sdkApiVersion:version,builtWithSdkVersion:version});
test('SDK API range includes both bounds and rejects future and retired APIs',()=>{
  const sdkCompatibility={version:'1.4.0',minCompatibleVersion:'1.1.0'};
  for(const v of ['1.1.0','1.2.0','1.4.0'])assert.doesNotThrow(()=>assertCompatible(app(v),{coreVersion:'0.6.0',sdkCompatibility}));
  for(const v of ['1.0.0','1.4.1','2.0.0'])assert.throws(()=>assertCompatible(app(v),{coreVersion:'0.6.0',sdkCompatibility}),{code:'APP_SDK_INCOMPATIBLE'});
});
test('legacy packages remain byte-identical and retain their Core floor',()=>{
  const file=Buffer.from('export function activate(){}'),files={'backend/index.mjs':{content:file.toString('base64'),mode:420,sha256:checksum(file)}};
  const before=checksum(encodePackage(legacy,files));assertCompatible(legacy,{coreVersion:'0.5.3'});
  assert.equal(legacy.sdkApiVersion,undefined);assert.equal(checksum(encodePackage(legacy,files)),before);
  assert.throws(()=>assertCompatible({...legacy,minCoreVersion:'0.7.0'},{coreVersion:'0.5.3'}),{code:'APP_CORE_INCOMPATIBLE'});
});
test('builder stamps actual SDK and protects old hosts without mutating source',()=>{
  const stamped=stampSDKManifest(legacy);assert.equal(stamped.sdkApiVersion,'1.1.0');assert.equal(stamped.builtWithSdkVersion,'1.1.0');assert.equal(stamped.minCoreVersion,'0.5.3');assert.equal(legacy.minCoreVersion,'0.3.0');
  assert.throws(()=>stampSDKManifest(app('1.0.0')),{code:'APP_SDK_BUILD_MISMATCH'});
  assert.throws(()=>assertCompatible({...stamped,minCoreVersion:'0.5.2'},{coreVersion:'0.5.3'}),{code:'APP_MANIFEST_INVALID'});
});
test('target host contract wins over the checker own SDK version',()=>{
  assert.equal(SDK_COMPATIBILITY.version,'1.1.0');
  assert.throws(()=>assertCompatible(app('1.1.0'),{coreVersion:'0.6.0',sdkCompatibility:{version:'1.0.0',minCompatibleVersion:'1.0.0'}}),{code:'APP_SDK_INCOMPATIBLE'});
  assert.doesNotThrow(()=>assertCompatible(app('1.2.0'),{coreVersion:'0.6.0',sdkCompatibility:{version:'1.2.0',minCompatibleVersion:'1.0.0'}}));
});
