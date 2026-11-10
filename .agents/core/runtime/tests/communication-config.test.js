import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir,readFile,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCommunicationStore} from '../src/communication/store.js';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'ksf-comm-config-')),store=await createCommunicationStore(root);
 t.after(async()=>{await store.close();await rm(root,{recursive:true,force:true});});
 return {root,store};
}

test('configuration updates do not wait on readers whose handle release needs the event loop',async t=>{
 const {root}=await fixture(t),moduleURL=new URL('../src/communication/store.js',import.meta.url).href;
 // Model Windows sharing denial in a child so native-module patches cannot
 // affect another test. An async reader stays busy until its timer can run.
 const script=`
 import fs from 'node:fs';import {join,resolve} from 'node:path';import {syncBuiltinESMExports} from 'node:module';import assert from 'node:assert/strict';
 const path=resolve(join(process.argv[1],'.agents/user-data/communication/config.json')),read=fs.promises.readFile,rename=fs.renameSync;
 const entered=Promise.withResolvers();let active=0,held=false;
 fs.promises.readFile=async(file,...args)=>{
  if(resolve(String(file))!==path)return read(file,...args);
  active++;try{const bytes=await read(file,...args);if(!held){held=true;entered.resolve();await new Promise(r=>setTimeout(r,40));}return bytes;}finally{active--;}
 };
 fs.renameSync=(source,target)=>{if(resolve(String(target))===path&&active)throw Object.assign(Error('modeled reader sharing denial'),{code:'EPERM'});return rename(source,target);};
 syncBuiltinESMExports();
 const {createCommunicationStore}=await import(${JSON.stringify(moduleURL)}),store=await createCommunicationStore(process.argv[1]);
 try{
  await store.update(value=>{value.testCounter=0;});
  const reading=store.config();await Promise.race([entered.promise,reading]);
  const outcomes=await Promise.allSettled([reading,store.update(value=>{value.testCounter++;})]);
  assert.deepEqual(outcomes.filter(o=>o.status==='rejected').map(o=>o.reason.code),[]);
  assert.equal((await store.config()).testCounter,1);
 }finally{await store.close();}
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script,root],{encoding:'utf8',timeout:10000});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
});

test('parallel configuration snapshots and writes preserve complete revisions',async t=>{
 const {store}=await fixture(t);await store.update(value=>{value.testCounter=0;});
 const readers=Array.from({length:6},async()=>{for(let i=0;i<48;i++){const value=await store.config();assert.equal(value.schemaVersion,1);assert(Number.isSafeInteger(value.revision));assert(Number.isSafeInteger(value.testCounter));}});
 const writes=Array.from({length:32},()=>store.update(value=>{value.testCounter++;}));
 await Promise.all([...readers,...writes]);const value=await store.config();assert.equal(value.testCounter,32);assert.equal(value.revision,33);
});

test('configuration reads keep missing defaults independent and reject malformed records',async t=>{
 const {root,store}=await fixture(t);const before=await store.config();before.peers.changed=true;assert.deepEqual((await store.config()).peers,{});
 const home=join(root,'.agents/user-data/communication');await mkdir(home,{recursive:true});const path=join(home,'config.json');
 await writeFile(path,'{broken');await assert.rejects(store.config(),{code:'COMM_STORAGE_INVALID'});
 await writeFile(path,'null');assert.equal(await store.config(),null);
});


test('configuration snapshots preserve oversized records and reject symbolic links',async t=>{
 const {root,store}=await fixture(t),home=join(root,'.agents/user-data/communication');await mkdir(home,{recursive:true});
 const path=join(home,'config.json'),oversized=JSON.stringify('x'.repeat(8*1024*1024));await writeFile(path,oversized);
 await assert.rejects(store.config(),{code:'COMM_STORAGE_INVALID'});assert.equal((await stat(path)).size,Buffer.byteLength(oversized));
 await rm(path);const target=join(home,'original.json');await writeFile(target,'{"sentinel":true}');await symlink(target,path,'file');
 await assert.rejects(store.config(),{code:'COMM_STORAGE_INVALID'});assert.equal(await readFile(target,'utf8'),'{"sentinel":true}');
});
