import test from 'node:test';
import {fork} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApplicationStorage} from '../src/services/application-storage.js';
import {createJSONStore} from '../../applications/sdk/server/storage.mjs';
import {validateManifest,assertCompatible,encodePackage,checksum} from '../src/applications/protocol.js';
import {createApplicationManager} from '../src/applications/manager.js';
import {runApplicationCommand} from '../src/commands/application-cli.js';

const declaration=(version=2,scope='user')=>({name:'state.json',scope,schemaVersion:version,migrateFrom:version===1?[]:[1]});
const caller=(version=2,scope='user')=>({appId:'com.example.migration',releaseDigest:'b'.repeat(64),dataStores:[declaration(version,scope)]});
const manifest=(version='1.0.0',schemaVersion=2)=>({schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',dataStores:[declaration(schemaVersion)],id:'com.example.migration',name:'Migration',description:'Synthetic migration acceptance',version,permissions:[],backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'}});
async function fixture(t,options={},deferCleanup=false){
  const root=await mkdtemp(join(tmpdir(),'ksf-data-'));if(!deferCleanup)t.after(()=>rm(root,{recursive:true,force:true}));
  const host=createApplicationStorage(root,options),who=caller();
  const context={storage:Object.fromEntries(['read','write','inspect','migrate'].map(method=>[method,(...args)=>host[method](who,...args)]))};
  async function seed(value,scope='user'){const path=join(root,'.agents/'+(scope==='user'?'user-data':'runtime-data')+'/applications/data/com.example.migration/state.json');await mkdir(join(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value));return path;}
  return {root,host,who,context,seed};
}
test('initial manifest contract requires host and explicit data declarations',()=>{
  const valid=manifest();assert.equal(validateManifest(valid),valid);
  for(const patch of [{minCoreVersion:undefined},{minCoreVersion:'>=0.3.0'},{dataStores:undefined},{dataStores:[declaration(),declaration()]},{dataStores:[{...declaration(),migrateFrom:[2]}]},{dataStores:[{...declaration(),scope:'../x'}]},{dataStores:[{...declaration(),name:'../state.json'}]}])assert.throws(()=>validateManifest({...valid,...patch}),{code:'APP_MANIFEST_INVALID'});
  assert.throws(()=>assertCompatible(valid,{coreVersion:'0.2.0'}),{code:'APP_CORE_INCOMPATIBLE'});
  assert.doesNotThrow(()=>assertCompatible(valid,{coreVersion:'0.3.0'}));
});
test('missing-data inspection is read only and offline CLI does not start services',async t=>{
  const f=await fixture(t);assert.equal((await f.host.inspect(f.who,'state.json')).state,'missing');await assert.rejects(lstat(join(f.root,'.agents')),{code:'ENOENT'});
  const state=join(f.root,'.agents/user-data/applications/state.json');await mkdir(join(state,'..'),{recursive:true});await writeFile(state,JSON.stringify({schemaVersion:1,installed:{'com.example.migration':{active:{manifest:manifest(),digest:'b'.repeat(64)}}}}));
  const before=await readFile(state,'utf8'),result=await runApplicationCommand(['data','inspect','com.example.migration','--json'],f.root);
  assert.equal(result.exitCode,0);assert.equal(JSON.parse(result.stdout).data.stores[0].state,'missing');assert.equal(await readFile(state,'utf8'),before);
  await assert.rejects(lstat(join(f.root,'.agents/runtime-data')),{code:'ENOENT'});await assert.rejects(lstat(join(f.root,'.agents/user-data/applications/data')),{code:'ENOENT'});
});
test('SDK explicit migration preserves exact original, increments revision and is replay safe',async t=>{
  const f=await fixture(t),path=await f.seed({schemaVersion:1,revision:4,data:{count:2}}),before=await readFile(path,'utf8');let conversions=0;
  const store=createJSONStore(f.context,{schemaVersion:2,validate:d=>Number.isInteger(d.total),migrations:{1:data=>{conversions++;return{total:data.count};}}});
  assert.equal((await store.inspect()).state,'migration-required');await assert.rejects(store.read(),{code:'APP_DATA_MIGRATION_REQUIRED'});assert.equal(await readFile(path,'utf8'),before);
  const migrated=await store.migrate();assert.equal(migrated.changed,true);assert.equal(migrated.document.revision,5);assert.deepEqual((await store.read()).data,{total:2});assert.equal(await readFile(join(f.root,migrated.backupRef),'utf8'),before);
  assert.equal((await store.migrate()).changed,false);assert.equal(conversions,1);await store.update(d=>({total:d.total+1}));assert.equal((await store.read()).revision,6);
});
test('ordinary JSON and runtime scopes use the same protected migration',async t=>{
  const f=await fixture(t),path=await f.seed({schemaVersion:1,items:['a']},'runtime'),who=caller(2,'runtime'),original=await f.host.read(who,'state.json',{scope:'runtime'});
  const result=await f.host.migrate(who,'state.json',{scope:'runtime',ifMatch:original.etag,fromVersion:1,toVersion:2,text:JSON.stringify({schemaVersion:2,items:['a'],enabled:true})});
  assert.match(result.backupRef,/runtime-data/);assert.equal(JSON.parse(await readFile(path,'utf8')).schemaVersion,2);assert.equal((await f.host.inspect(caller(2),'state.json')).state,'missing');
  await assert.rejects(f.host.write(caller(1,'runtime'),'state.json',JSON.stringify({schemaVersion:1}),{scope:'runtime'}),{code:'APP_DATA_MIGRATION_REQUIRED'});
});
test('failed conversion, failed validation and future schemas preserve originals',async t=>{
  const f=await fixture(t),path=await f.seed({schemaVersion:1,revision:0,data:{count:3}}),before=await readFile(path,'utf8');
  const bad=createJSONStore(f.context,{schemaVersion:2,migrations:{1(){throw Error('conversion failed');}}});await assert.rejects(bad.migrate(),/conversion failed/);assert.equal(await readFile(path,'utf8'),before);
  const invalid=createJSONStore(f.context,{schemaVersion:2,validate:()=>false,migrations:{1:d=>d}});await assert.rejects(invalid.migrate(),{code:'APP_DATA_INVALID'});assert.equal(await readFile(path,'utf8'),before);
  await f.seed({schemaVersion:3,revision:0,data:{}});assert.equal((await bad.inspect()).state,'unsupported');await assert.rejects(bad.migrate(),{code:'APP_DATA_MIGRATION_UNSUPPORTED'});assert.equal(JSON.parse(await readFile(path,'utf8')).schemaVersion,3);
});
for(const phase of ['before-backup','before-replace','after-replace'])test('interruption at '+phase+' preserves a whole file and supports reconciliation',async t=>{
  let enabled=true;const f=await fixture(t,{fault(stage){if(enabled&&stage===phase)throw Object.assign(Error('injected interruption'),{code:'EIO'});}}),path=await f.seed({schemaVersion:1,revision:0,data:{count:1}});
  const store=createJSONStore(f.context,{schemaVersion:2,migrations:{1:d=>d}});await assert.rejects(store.migrate(),/injected interruption/);
  const current=JSON.parse(await readFile(path,'utf8'));assert.equal(current.schemaVersion,phase==='after-replace'?2:1);enabled=false;
  const result=await store.migrate();assert.equal(result.changed,phase!=='after-replace');assert.equal((await store.read()).schemaVersion,2);
});
test('concurrent edit after before-image is preserved and migration aborts',async t=>{
  let path;const f=await fixture(t,{async fault(stage){if(stage==='backup-written')await writeFile(path,JSON.stringify({schemaVersion:1,revision:1,data:{count:9}}));}});path=await f.seed({schemaVersion:1,revision:0,data:{count:1}});
  const store=createJSONStore(f.context,{schemaVersion:2,migrations:{1:d=>d}});await assert.rejects(store.migrate(),{code:'APP_DATA_CONFLICT'});assert.equal(JSON.parse(await readFile(path,'utf8')).data.count,9);
});
test('host tracks pending durable operations until they actually settle',async t=>{
  let release,entered;const barrier=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
  const f=await fixture(t,{async fault(stage){if(stage==='backup-written'){entered();await barrier;}}});await f.seed({schemaVersion:1,revision:0,data:{}});
  const store=createJSONStore(f.context,{schemaVersion:2,migrations:{1:d=>d}}),operation=store.migrate();await waiting;assert.equal(f.host.pending(f.who.appId),1);let settled=false;const wait=f.host.wait(f.who.appId).then(()=>settled=true);await new Promise(r=>setTimeout(r,10));assert.equal(settled,false);release();await operation;await wait;assert.equal(f.host.pending(f.who.appId),0);
});
const file=text=>{const bytes=Buffer.from(text);return{content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};};
async function appFixture(t,options={}){
  const f=await fixture(t,{},true),storeDirectory=join(f.root,'store');await mkdir(storeDirectory);const entries=[];
  const manager=createApplicationManager(f.root,{defaultSource:null,storeDirectory,...options});t.after(async()=>{await manager.close();await rm(f.root,{recursive:true,force:true});});
  async function add(m,backend){const bytes=encodePackage(m,{'backend/index.mjs':file(backend)}),entry={manifest:m,package:{url:m.id+'-'+m.version+'.ksfapp',sha256:checksum(bytes),size:bytes.length}};entries.push(entry);await writeFile(join(storeDirectory,entry.package.url),bytes);await writeFile(join(storeDirectory,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:entries}));return entry;}
  const install=entry=>manager.install({appId:entry.manifest.id,version:entry.manifest.version,digest:entry.package.sha256,sourceId:'builtin',trusted:true});
  return {...f,manager,add,install};
}
const backend=`export async function prepareData(ctx){const saved=await ctx.storage.read('state.json');if(saved.exists&&JSON.parse(saved.text).schemaVersion===1)await ctx.storage.migrate('state.json',{text:JSON.stringify({...JSON.parse(saved.text),schemaVersion:2}),ifMatch:saved.etag,fromVersion:1,toVersion:2});}export function activate(ctx){return{async call(){return JSON.parse((await ctx.storage.read('state.json')).text)}}}`;
test('prepareData migrates before activation; incompatible rollback leaves current application intact',async t=>{
  const f=await appFixture(t),first=await f.add(manifest('1.0.0',1),'export function activate(){return{call(){return 1}}}');await f.seed({schemaVersion:1,items:['kept']});await f.install(first);
  const second=await f.add(manifest('1.1.0',2),backend);await f.install(second);const instance=await f.manager.launch('com.example.migration',second.package.sha256,{kind:'service'});
  assert.equal((await f.manager.call(instance.id,'read')).schemaVersion,2);await f.manager.release(instance.id);await assert.rejects(f.manager.changeApp('com.example.migration','rollback'),{code:'APP_DATA_INCOMPATIBLE'});assert.equal((await f.manager.snapshot()).installed[0].active.manifest.version,'1.1.0');
});
test('prepareData cannot perform business writes; migration declarations require an entry',async t=>{
  const f=await appFixture(t),entry=await f.add(manifest(),`export async function prepareData(ctx){await ctx.storage.write('state.json','{}');}export function activate(){throw Error('business must not start');}`);await f.install(entry);
  await assert.rejects(f.manager.launch('com.example.migration',entry.package.sha256,{kind:'service'}),{code:'APP_DATA_PREPARE_RESTRICTED'});
});
test('preparation has its own deadline and keeps the data intact',async t=>{
  const f=await appFixture(t,{prepareTimeoutMs:30}),entry=await f.add(manifest(),`export async function prepareData(){await new Promise(r=>setTimeout(r,200));}export function activate(){throw Error('must not activate');}`);const path=await f.seed({schemaVersion:1,value:'kept'}),before=await readFile(path,'utf8');await f.install(entry);
  await assert.rejects(f.manager.launch('com.example.migration',entry.package.sha256,{kind:'service'}),{code:'APP_DATA_PREPARE_TIMEOUT'});assert.equal(await readFile(path,'utf8'),before);
});
test('a declared migration without prepareData is parked and does not activate',async t=>{
 const f=await appFixture(t),entry=await f.add(manifest(),'export function activate(){throw Error("must not activate")}');await f.install(entry);
 await assert.rejects(f.manager.launch('com.example.migration',entry.package.sha256,{kind:'service'}),{code:'APP_DATA_PREPARE_REQUIRED'});
 assert.equal((await f.manager.runtimeSnapshot()).applications.find(a=>a.id==='com.example.migration').state,'blocked');
});
test('rollback succeeds when both application versions read the current schema',async t=>{
 const f=await appFixture(t),one=await f.add(manifest('1.0.0',1),'export function activate(){return{call(){return 1}}}');await f.seed({schemaVersion:1,value:'kept'});await f.install(one);
 const two=await f.add(manifest('1.0.1',1),'export function activate(){return{call(){return 2}}}');await f.install(two);await f.manager.changeApp('com.example.migration','rollback');
 assert.equal((await f.manager.snapshot()).installed[0].active.manifest.version,'1.0.0');
});
test('multi-file preparation resumes after a partial commit without reverting the completed file',async t=>{
 const f=await appFixture(t),m=manifest();m.dataStores.push({...declaration(),name:'second.json'});
 const entry=await f.add(m,`export async function prepareData(ctx){for(const name of ['state.json','second.json']){const v=await ctx.storage.read(name),d=JSON.parse(v.text);if(d.schemaVersion===2)continue;if(d.fail)throw Error('second file failed');await ctx.storage.migrate(name,{text:JSON.stringify({...d,schemaVersion:2}),ifMatch:v.etag,fromVersion:1,toVersion:2});}}export function activate(){return{call(){return 'ready'}}}`);
 const first=await f.seed({schemaVersion:1,value:'first'}),second=join(first,'../second.json');await writeFile(second,JSON.stringify({schemaVersion:1,fail:true}));await f.install(entry);
 await assert.rejects(f.manager.launch(m.id,entry.package.sha256,{kind:'service'}),{code:'APP_DATA_PREPARE_FAILED'});const committed=await readFile(first,'utf8');assert.equal(JSON.parse(committed).schemaVersion,2);assert.equal(JSON.parse(await readFile(second,'utf8')).schemaVersion,1);
 await writeFile(second,JSON.stringify({schemaVersion:1,fail:false}));await f.manager.runtimeManage({appId:m.id,action:'start'});assert.equal(await readFile(first,'utf8'),committed);assert.equal(JSON.parse(await readFile(second,'utf8')).schemaVersion,2);
});
test('SDK refuses revision overflow without modifying the stored document',async t=>{
 const f=await fixture(t),path=await f.seed({schemaVersion:1,revision:Number.MAX_SAFE_INTEGER,data:{}}),before=await readFile(path,'utf8'),store=createJSONStore(f.context,{schemaVersion:2,migrations:{1:d=>d}});await assert.rejects(store.migrate(),{code:'APP_DATA_INVALID'});assert.equal(await readFile(path,'utf8'),before);
});
test('a timed out preparation cannot switch packages while a host migration is still writing',async t=>{
 let release,entered;const barrier=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
 const f=await appFixture(t,{prepareTimeoutMs:100,storageOptions:{async fault(stage){if(stage==='backup-written'){entered();await barrier;}}}}),one=await f.add(manifest('1.0.0',2),backend);await f.seed({schemaVersion:1,items:['kept']});await f.install(one);
 const launch=f.manager.launch('com.example.migration',one.package.sha256,{kind:'service'});const observed=launch.then(()=>({ok:true}),error=>({error}));await waiting;
 try{
  const healthy={...manifest('1.0.0',1),id:'com.example.other',dataStores:[]},good=await f.add(healthy,'export function activate(){return{call(){return \"works\"}}}');await f.install(good);const lease=await f.manager.launch(healthy.id,good.package.sha256,{kind:'service'});assert.equal(await f.manager.call(lease.id,'read'),'works');
  const two=await f.add(manifest('1.0.1',2),backend);await f.install(two);await new Promise(r=>setTimeout(r,150));
  const state=await f.manager.snapshot(),app=state.installed.find(a=>a.id==='com.example.migration');assert.equal(app.active.manifest.version,'1.0.0');assert.equal(app.pending.manifest.version,'1.0.1');
  await assert.rejects(f.manager.changeApp('com.example.migration','rollback'),{code:'APP_BUSY'});
 }finally{release();}
 assert.equal((await observed).error.code,'APP_DATA_PREPARE_TIMEOUT');assert.equal((await f.manager.snapshot()).installed.find(a=>a.id==='com.example.migration').active.manifest.version,'1.0.1');
});
test('corrupted data parks only its application and leaves another application callable',async t=>{
 const f=await appFixture(t),one=await f.add(manifest('1.0.0',1),'export function activate(){return{call(){return 1}}}');await f.install(one);const path=await f.seed({schemaVersion:1});await writeFile(path,'{broken');
 await assert.rejects(f.manager.launch('com.example.migration',one.package.sha256,{kind:'service'}),{code:'APP_DATA_INVALID'});
 const m={...manifest('1.0.0',1),id:'com.example.healthy',dataStores:[]},two=await f.add(m,'export function activate(){return{call(){return "healthy"}}}');await f.install(two);const lease=await f.manager.launch(m.id,two.package.sha256,{kind:'service'});assert.equal(await f.manager.call(lease.id,'read'),'healthy');
 assert.equal(await readFile(path,'utf8'),'{broken');assert.equal((await f.manager.runtimeSnapshot()).applications.find(a=>a.id==='com.example.migration').errors.length,1);
});

for(const phase of ['before-replace','after-replace'])test('real worker termination at '+phase+' leaves an entire formal file',async t=>{
 const f=await fixture(t,{},true),data={schemaVersion:1,revision:0,data:{text:'原件'.repeat(10000)}},path=await f.seed(data),worker=join(f.root,'migration-worker.mjs'),moduleURL=new URL('../src/services/application-storage.js',import.meta.url).href;
 await writeFile(worker,`import {createApplicationStorage} from ${JSON.stringify(moduleURL)};const hold=setInterval(()=>{},1000);const who=${JSON.stringify(f.who)},host=createApplicationStorage(${JSON.stringify(f.root)},{async fault(stage){if(stage===${JSON.stringify(phase)}){process.send({stage});await new Promise(()=>{});}}});const old=await host.read(who,'state.json');await host.migrate(who,'state.json',{text:JSON.stringify({...JSON.parse(old.text),schemaVersion:2}),ifMatch:old.etag,fromVersion:1,toVersion:2});clearInterval(hold);`);
 const child=fork(worker,[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc']});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await stopped;}await rm(f.root,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker did not reach replacement boundary')),10000);child.once('message',message=>{clearTimeout(timer);assert.equal(message.stage,phase);resolve();});child.once('error',reject);child.once('exit',()=>reject(Error('worker exited too early')));});
 const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;
 const actual=JSON.parse(await readFile(path,'utf8'));assert.equal(actual.schemaVersion,phase==='before-replace'?1:2);assert.deepEqual(actual.data,data.data);
 const store=createJSONStore(f.context,{schemaVersion:2,migrations:{1:d=>d}});await store.migrate();assert.deepEqual((await store.read()).data,data.data);
});
test('a storage failure with its original OS error code parks preparation without retrying conversion',async t=>{
 let attempts=0;const f=await appFixture(t,{storageOptions:{fault(stage){if(stage==='before-backup'){attempts++;throw Object.assign(Error('synthetic backup permission failure'),{code:'EACCES'});}}}}),m={...manifest(),permissions:['background'],backend:{...manifest().backend,lifecycle:'resident'}},entry=await f.add(m,backend.replace('async call(){','startBackground(){},async call(){'));await f.seed({schemaVersion:1,items:['kept']});await f.install(entry);await f.manager.startBackground();assert.equal((await f.manager.runtimeSnapshot()).applications[0].state,'blocked');assert.equal((await f.manager.runtimeSnapshot()).applications[0].errors[0].code,'EACCES');await f.manager.startBackground();assert.equal(attempts,1);
});
