import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildApplication} from '../build.mjs';
import {decodePackage} from '../server/protocol.js';

test('headless build needs no frontend entry, React or browser assets',async t=>{
  const base=await mkdtemp(join(tmpdir(),'ksf-headless-build-'));t.after(()=>rm(base,{recursive:true,force:true}));const root=join(base,'app'),store=join(base,'store');await mkdir(root);
  await writeFile(join(root,'package.json'),JSON.stringify({type:'module',dependencies:{}}));await writeFile(join(root,'manifest.json'),JSON.stringify({schemaVersion:1,minCoreVersion:'0.3.0',dataStores:[],sdkVersion:1,id:'com.example.worker',version:'1.0.0',name:'Worker',description:'Synthetic service',backend:{runtime:'node',entry:'backend/index.mjs',lifecycle:'resident'},permissions:['background']}));
  await writeFile(join(root,'backend.mjs'),'export function activate(){return {startBackground(){},dispose(){}}}');const entry=await buildApplication(root,{storeDirectory:store,quiet:true});const pkg=decodePackage(await readFile(join(store,entry.package.url)));
  assert.equal(pkg.manifest.sdkVersion,1);assert.equal(pkg.manifest.window,undefined);assert.ok(pkg.files.has('backend/index.mjs'));assert.ok(![...pkg.files.keys()].some(path=>path.startsWith('frontend/')));
  await mkdir(join(root,'tests'));await writeFile(join(root,'tests/fixture.mjs'),'export function activate(){}');
  await assert.rejects(buildApplication(root,{storeDirectory:store,quiet:true,entries:{backend:'tests/fixture.mjs'}}),/测试|tests|ksf-production-only/);
});
