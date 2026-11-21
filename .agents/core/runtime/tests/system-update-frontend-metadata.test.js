import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {planUpdate} from '../src/distribution/system.js';
import {sha256} from '../src/shared/hash.js';
import {fileMode} from '../src/distribution/files.js';
const buildPath='.agents/core/runtime/web/dist/build.json',htmlPath='.agents/core/runtime/web/dist/index.html';
const build=id=>({protocol:'ksf-web-build-v1',sourceDigest:id.repeat(64),files:{'index.html':id.repeat(64),'assets/main.js':'d'.repeat(64)},frontendRuntime:{protocol:'ksf-frontend-runtime-v1',frontendReleaseId:id.repeat(64),hostCompatibility:{minimumCoreVersion:'0.6.0'}}});
const identity=id=>'<script type="application/json" id="ksf-frontend-runtime">'+JSON.stringify({frontendReleaseId:id.repeat(64)})+'</script>';
const html=id=>'<html><main>应用内容</main>'+identity(id)+'<script type="module" src="/assets/main.js"></script></html>';
const bytes=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value));
async function plan(t,path,local,remote,original){
 const root=mkdtempSync(join(tmpdir(),'ksf-frontend-metadata-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const absolute=join(root,path),before=bytes(local),next=bytes(remote),base=bytes(original);mkdirSync(dirname(absolute),{recursive:true});writeFileSync(absolute,before);const mode=fileMode(absolute),entry=b=>({sha256:sha256(b),mode});
 const result=await planUpdate(root,{files:{[path]:entry(base)},read:async()=>base},{files:{[path]:entry(next)}},new Map([[path,{bytes:next,mode}]]));assert.deepEqual(readFileSync(absolute),before);return {result,next};
}
test('frontend build metadata adopts derived identities only when all resources and host contracts match',async t=>{
 const {result,next}=await plan(t,buildPath,build('b'),build('c'),{...build('a'),files:{'index.html':'a'.repeat(64),'assets/main.js':'a'.repeat(64)}});
 assert.deepEqual(result.conflicts,[]);assert.deepEqual(result.files.get(buildPath).bytes,next);assert.equal(result.changes[0].preservesLocalChanges,true);
});
test('generated frontend document identities can advance without changing any other HTML',async t=>{
 const {result,next}=await plan(t,htmlPath,html('b'),html('c'),html('a').replace(identity('a'),''));
 assert.deepEqual(result.conflicts,[]);assert.deepEqual(result.files.get(htmlPath).bytes,next);assert.equal(result.changes[0].preservesLocalChanges,true);
});
test('frontend metadata resolution preserves resource, contract, custom HTML, unknown-field and unrelated-path conflicts',async t=>{
 const changedResource=build('b');changedResource.files['assets/main.js']='e'.repeat(64);
 const changedContract=build('b');changedContract.frontendRuntime.hostCompatibility.minimumCoreVersion='0.7.0';
 for(const [path,local,remote,base] of [
  [buildPath,changedResource,build('c'),build('a')],
  [buildPath,changedContract,build('c'),build('a')],
  [buildPath,{...build('b'),privateNote:'keep'},build('c'),build('a')],
  [buildPath,build('b'),{...build('c'),sourceDigest:'invalid'},build('a')],
  ['.agents/core/custom-build.json',build('b'),build('c'),build('a')],
  [htmlPath,html('b').replace('应用内容','私有内容'),html('c'),html('a')],
  [htmlPath,html('b')+identity('b'),html('c'),html('a')],
  ['.agents/core/custom.html',html('b'),html('c'),html('a')]
 ]){const {result}=await plan(t,path,local,remote,base);assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].path,path);assert.equal(result.files.has(path),false);}
});
