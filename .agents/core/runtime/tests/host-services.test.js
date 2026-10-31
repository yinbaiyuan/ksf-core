import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApplicationStorage} from '../src/services/application-storage.js';
import {decodePackage,compareVersions} from '../src/applications/protocol.js';
import {createJSONStore} from '../../applications/sdk/server/storage.mjs';
const store=fileURLToPath(new URL('../../applications/store/',import.meta.url));
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'ksf-host-storage-'));t.after(()=>rm(root,{recursive:true,force:true}));return {root,host:createApplicationStorage(root),caller:{appId:'com.example.a'}};}
test('host storage preserves flat app schemas, rejects stale writes across managers and isolates apps',async t=>{const {root,host,caller}=await fixture(t);const first=await host.read(caller,'state.json');assert.equal(first.exists,false);const result=await host.write(caller,'state.json','{"schemaVersion":1,"中文":"空 格"}',{ifMatch:null});assert.equal((await createApplicationStorage(root).read(caller,'state.json')).text,'{"schemaVersion":1,"中文":"空 格"}');assert.equal((await host.read({appId:'com.example.b'},'state.json')).exists,false);const other=createApplicationStorage(root);const race=await Promise.allSettled([host.write(caller,'state.json','one',{ifMatch:result.etag}),other.write(caller,'state.json','two',{ifMatch:result.etag})]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.find(x=>x.status==='rejected').reason.code,'APP_DATA_CONFLICT');await assert.rejects(host.write(caller,'../state.json','bad'),{code:'APP_PATH_INVALID'});});
test('SDK JSON store uses host durability and preserves revision/migration/unknown-schema guarantees',async t=>{const {root,host,caller}=await fixture(t),context={dataDirectory:join(root,'unused'),storage:{read:name=>host.read(caller,name),write:(...args)=>host.write(caller,...args)}};const s=createJSONStore(context,{initial:{count:0},validate:data=>Number.isInteger(data.count)});assert.equal((await s.read()).revision,0);await s.update(data=>({...data,count:data.count+1}),{revision:0});assert.deepEqual((await s.read()).data,{count:1});await assert.rejects(s.update(data=>data,{revision:0}),{code:'APP_DATA_CONFLICT'});const before=(await context.storage.read('state.json')).text;await assert.rejects(s.update(()=>({count:'bad'})),{code:'APP_DATA_INVALID'});assert.equal((await context.storage.read('state.json')).text,before);const future=createJSONStore(context,{schemaVersion:2});await assert.rejects(future.read(),/不兼容/);assert.equal((await context.storage.read('state.json')).text,before);});
test('latest Terminal and Git use universal packages and contain no native platform implementation',async()=>{const index=JSON.parse(await readFile(join(store,'index.json'),'utf8'));for(const id of ['com.ksf.terminal','com.ksf.git']){const app=index.apps.filter(a=>a.manifest.id===id).sort((a,b)=>compareVersions(b.manifest.version,a.manifest.version))[0];assert.equal(app.manifest.target,undefined);assert.equal(app.manifest.nodeAbi,undefined);const decoded=decodePackage(await readFile(join(store,app.package.url)));for(const [path,file] of decoded.files){assert.doesNotMatch(path,/node_modules|prebuilds|\.node$|\.dll$/);if(path.startsWith('backend/'))assert.doesNotMatch(file.data.toString(),/process\.platform|node:child_process|node-pty|createWorkbenchGit/);}}});
test('runtime storage is durable and isolated from user data and other apps',async t=>{
 const {root,host,caller}=await fixture(t),runtimeDataDirectory=join(root,'.agents/runtime-data/applications/data',caller.appId);
 const context={dataDirectory:join(root,'.agents/user-data/applications/data',caller.appId),runtimeDataDirectory,storage:{read:(...args)=>host.read(caller,...args),write:(...args)=>host.write(caller,...args)}};
 const user=createJSONStore(context,{initial:{value:'user'}}),local=createJSONStore(context,{scope:'runtime',initial:{value:'local'}});
 await user.update(x=>x);await local.update(x=>({...x,value:'本机状态'}));assert.equal((await user.read()).data.value,'user');assert.equal((await local.read()).data.value,'本机状态');
 const restarted=createApplicationStorage(root);assert.equal((await restarted.read(caller,'state.json',{scope:'runtime'})).text,(await host.read(caller,'state.json',{scope:'runtime'})).text);
 assert.equal((await host.read({appId:'com.example.b'},'state.json',{scope:'runtime'})).exists,false);
 const original=await host.read(caller,'state.json',{scope:'runtime'});await host.write(caller,'state.json',original.text,{scope:'runtime',ifMatch:original.etag});await assert.rejects(host.write(caller,'state.json','stale',{scope:'runtime',ifMatch:null}),{code:'APP_DATA_CONFLICT'});
 await assert.rejects(host.read(caller,'state.json',{scope:'../other'}),{code:'APP_STORAGE_SCOPE_INVALID'});
 assert.throws(()=>createJSONStore({dataDirectory:root},{scope:'runtime'}),{code:'APP_STORAGE_SCOPE_UNAVAILABLE'});
 assert.throws(()=>createJSONStore(context,{scope:'unknown'}),{code:'APP_STORAGE_SCOPE_INVALID'});
});
