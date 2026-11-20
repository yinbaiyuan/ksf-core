import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {planUpdate} from '../src/distribution/system.js';
import {sha256} from '../src/shared/hash.js';
import {fileMode} from '../src/distribution/files.js';

const path='.agents/core/docs/catalog.json';
const catalog=(version,title,digest)=>({schemaVersion:1,coreVersion:version,contentDigest:digest.repeat(64),groups:[],documents:[{id:'guide',title}]});
async function plan(t,{target=path,local=catalog('0.5.7','Updated guide','b'),remote=catalog('0.6.0','Updated guide','c')}={}){
 const root=mkdtempSync(join(tmpdir(),'ksf-doc-index-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const base=Buffer.from(JSON.stringify(catalog('0.5.7','Original guide','a'))),bytes=Buffer.from(typeof local==='string'?local:JSON.stringify(local)),next=Buffer.from(JSON.stringify(remote));
 const absolute=join(root,target);mkdirSync(dirname(absolute),{recursive:true});writeFileSync(absolute,bytes);
 const mode=fileMode(absolute),entry=value=>({sha256:sha256(value),mode});
 const result=await planUpdate(root,{files:{[target]:entry(base)},read:async()=>base},{files:{[target]:entry(next)}},new Map([[target,{bytes:next,mode}]]));
 assert.deepEqual(readFileSync(absolute),bytes,'planning must preserve the installed bytes');
 return {result,next,target};
}

test('documentation index adopts incoming version and digest only when its complete payload already matches',async t=>{
 const {result,next}=await plan(t);
 assert.deepEqual(result.conflicts,[]);
 assert.deepEqual(result.files.get(path).bytes,next);
 assert.deepEqual(result.changes,[{path,operation:'update',preservesLocalChanges:true}]);
});

test('documentation metadata resolution preserves real content, malformed input and unrelated JSON conflicts',async t=>{
 for(const options of [
  {local:catalog('0.5.7','Private guide','b')},
  {local:'{invalid JSON'},
  {target:'.agents/core/custom.json'},
  {remote:{...catalog('0.6.0','Updated guide','c'),contentDigest:'invalid'}},
  {remote:{...catalog('0.6.0','Updated guide','c'),coreVersion:'invalid'}}
 ]){
  const {result,target}=await plan(t,options);
  assert.equal(result.conflicts.length,1);
  assert.equal(result.conflicts[0].path,target);
  assert.equal(result.files.has(target),false);
 }
});
