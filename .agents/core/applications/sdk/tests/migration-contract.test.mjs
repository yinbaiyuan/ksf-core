import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePackage,checksum,assertCompatible} from '../server/protocol.js';
import {validateBuiltPackage} from '../server/pack.mjs';
const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',dataStores:[{name:'state.json',scope:'user',schemaVersion:2,migrateFrom:[1]}],id:'com.example.migration',version:'1.0.0',name:'Migration',description:'Synthetic',permissions:[],backend:{runtime:'node',entry:'backend/index.mjs',lifecycle:'on-demand'}};
const bytes=code=>{const b=Buffer.from(code);return encodePackage(manifest,{'backend/index.mjs':{content:b.toString('base64'),sha256:checksum(b),mode:0o644}});};
test('packer requires an explicit data preparation export for declared migrations',async()=>{
 await assert.rejects(validateBuiltPackage(bytes('export function activate(){return {}}')),{code:'APP_DATA_PREPARE_REQUIRED'});await validateBuiltPackage(bytes('export function prepareData(){}export function activate(){return {}}'));
});
test('compatibility distinguishes SDK, platform, ABI and minimum Core requirements',()=>{
 const options={coreVersion:'0.3.0'};assert.throws(()=>assertCompatible({...manifest,sdkVersion:2},options),{code:'APP_MANIFEST_INVALID'});assert.throws(()=>assertCompatible({...manifest,target:process.platform==='win32'?'darwin-arm64':'win32-x64'},options),{code:'APP_PLATFORM_UNSUPPORTED'});assert.throws(()=>assertCompatible({...manifest,nodeAbi:'0'},options),{code:'APP_RUNTIME_INCOMPATIBLE'});assert.throws(()=>assertCompatible(manifest,{coreVersion:'0.2.9'}),{code:'APP_CORE_INCOMPATIBLE'});
});
