import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApplicationManager} from '../src/applications/manager.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
import {verifyInstalledRelease,planCoreApplications} from '../src/applications/core-upgrade.js';
import {inspectCoreDataCompatibility} from '../src/data-compatibility.js';

const id='com.example.local-app';
const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',id,name:'本地应用',description:'Synthetic',version:'1.0.0',dataStores:[{name:'state.json',scope:'user',schemaVersion:1,migrateFrom:[]}],permissions:[],window:{entry:'frontend/index.js'},cards:[],backend:{runtime:'node',entry:'backend/index.mjs',lifecycle:'on-demand'}};
const file=text=>({content:Buffer.from(text).toString('base64'),sha256:checksum(Buffer.from(text)),mode:0o644});
function pack(marker,m=manifest){return encodePackage(m,{'frontend/index.js':file(`export function mount(root){root.textContent=${JSON.stringify(marker)}}`),'backend/index.mjs':file(`export function activate(ctx){return{async call(method,p){const fs=await import('node:fs/promises');if(method==='write')await fs.writeFile(ctx.dataDirectory+'/notes.txt',p.text);return {marker:${JSON.stringify(marker)},text:await fs.readFile(ctx.dataDirectory+'/notes.txt','utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e))};}}}`)});}
async function setup(t,{formal=false}={}){
 const root=await mkdtemp(join(tmpdir(),'ksf-local-install-')),store=join(root,'store');await mkdir(store);
 const bytes=pack('source'),entry={manifest,package:{url:'source.ksfapp',size:bytes.length,sha256:checksum(bytes)}};
 await writeFile(join(store,entry.package.url),bytes);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[entry]}));
 const manager=createApplicationManager(root,{defaultSource:null,storeDirectory:store});t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
 const sourceInstall=()=>manager.install({appId:id,version:manifest.version,sourceId:'builtin',digest:entry.package.sha256,trusted:true});if(formal)await sourceInstall();
 const build=async(marker,m)=>{const bytes=pack(marker,m),packagePath=join(root,checksum(bytes)+'.ksfapp');await writeFile(packagePath,bytes);return {packagePath,digest:checksum(bytes)};};
 const install=async(marker,extra={})=>manager.localApplication({action:'install',appId:id,...await build(marker),trusted:true,...extra});
 return {root,store,manager,build,install,bytes,sourceInstall};
}
test('local package installation needs no source directory, project or repository and supports same-version iterations',async t=>{
 const f=await setup(t),{manager}=f;await f.install('first');let app=(await manager.snapshot()).installed[0];
 assert.equal(app.installationType,'local');assert.equal(app.active.source.id,'local-app');assert.equal(app.local.appDirectory,undefined);assert.equal(app.local.project,undefined);assert.equal(app.local.repository,undefined);assert.equal(app.development,undefined);verifyInstalledRelease(f.root,app.active);
 const identity=app.installationId;await manager.invoke(id,'write',{text:'已有中文内容'});await f.install('second');app=(await manager.snapshot()).installed[0];assert.equal(app.installationId,identity);assert.equal(app.active.manifest.version,'1.0.0');assert.equal(app.active.localBuild.number,2);assert.equal(app.previous.localBuild.number,1);assert.equal((await manager.invoke(id,'read')).text,'已有中文内容');
 assert.equal((await manager.catalog()).applications[0].candidate,null);assert.equal((await f.install('second')).unchanged,true);await assert.rejects(f.sourceInstall(),{code:'APP_SOURCE_CHANGED'});
 await manager.close();const reopened=createApplicationManager(f.root,{defaultSource:null,storeDirectory:f.store});t.after(()=>reopened.close());assert.equal((await reopened.invoke(id,'read')).marker,'second');assert.equal((await reopened.localApplication({appId:id})).installationType,'local');
 assert.deepEqual(await readFile(join(f.store,'source.ksfapp')),f.bytes);
});
test('replacing a source installation is explicit, waits for saved windows and keeps installation identity and data',async t=>{
 const f=await setup(t,{formal:true}),{manager}=f;const original=(await manager.snapshot()).installed[0],win=await manager.launch(id,original.active.digest);await manager.call(win.id,'write',{text:'原画布'});
 await assert.rejects(f.install('local'),{code:'APP_SOURCE_CHANGED'});assert.equal((await f.install('local',{replaceSource:true})).pending,true);assert.equal((await manager.snapshot()).installed[0].installationType,'source');
 await manager.release(win.id);const app=(await manager.snapshot()).installed[0];assert.equal(app.installationType,'local');assert.equal(app.installationId,original.installationId);assert.equal(app.enabled,original.enabled);assert.equal(app.previous,null);assert.equal(app.development,undefined);assert.equal((await manager.invoke(id,'read')).text,'原画布');
 await assert.rejects(manager.localApplication({action:'exit',appId:id}),{code:'APP_LOCAL_INVALID'});
});
test('optional associations can be added or cleared and unavailable source does not block running',async t=>{
 const f=await setup(t);await f.install('local');const source=join(f.root,'optional-source');await mkdir(source);await writeFile(join(source,'manifest.json'),JSON.stringify(manifest));
 await f.manager.localApplication({action:'link',appId:id,appDirectory:source});await rm(source,{recursive:true});assert.equal((await f.manager.invoke(id,'read')).marker,'local');
 await f.manager.localApplication({action:'link',appId:id,appDirectory:'',project:'',repository:''});const status=await f.manager.localApplication({appId:id});assert.equal(status.local.appDirectory,undefined);assert.equal(status.local.project,undefined);assert.equal(status.local.repository,undefined);
});
test('invalid identity, untrusted builds, corrupt data and schema changes preserve active package and business bytes',async t=>{
 const f=await setup(t),{manager}=f;await f.install('original');const original=(await manager.snapshot()).installed[0].active,candidate=await f.build('next');
 await assert.rejects(manager.localApplication({action:'install',appId:id,...candidate}),{code:'APP_TRUST_REQUIRED'});
 const dataPath=join(f.root,'.agents/user-data/applications/data',id);await mkdir(dataPath,{recursive:true});const data=JSON.stringify({schemaVersion:1,revision:1,data:{text:'保留原件'}});await writeFile(join(dataPath,'state.json'),data);
 const wrong=await f.build('wrong',{...manifest,id:'com.example.other'});await assert.rejects(manager.localApplication({action:'install',appId:id,...wrong,trusted:true}),{code:'APP_LOCAL_ID_MISMATCH'});
 const migrated=await f.build('v2',{...manifest,dataStores:[{...manifest.dataStores[0],schemaVersion:2,migrateFrom:[1]}]});await assert.rejects(manager.localApplication({action:'install',appId:id,...migrated,trusted:true}),{code:'APP_DATA_MIGRATION_REQUIRED'});
 await writeFile(candidate.packagePath,'broken');await assert.rejects(manager.localApplication({action:'install',appId:id,...candidate,trusted:true}),{code:'APP_PACKAGE_INVALID'});assert.equal(await readFile(join(dataPath,'state.json'),'utf8'),data);
 await writeFile(join(dataPath,'state.json'),'损坏的 JSON');await assert.rejects(f.install('valid'));assert.equal(await readFile(join(dataPath,'state.json'),'utf8'),'损坏的 JSON');assert.deepEqual((await manager.snapshot()).installed[0].active,original);
});
test('local app can update from the import dialog; stale previews cannot overwrite a newer build',async t=>{
 const f=await setup(t),{manager}=f;await f.install('first');const preview=await manager.prepareImport(pack('second'),'本地.ksfapp');assert.equal(preview.action,'update');await manager.installImport({importId:preview.importId,digest:preview.package.sha256,trusted:true});assert.equal((await manager.invoke(id,'read')).marker,'second');
 const stale=await manager.prepareImport(pack('stale'),'本地.ksfapp');await f.install('newer');await assert.rejects(manager.installImport({importId:stale.importId,digest:stale.package.sha256,trusted:true}),{code:'APP_RELEASE_CHANGED'});assert.equal((await manager.invoke(id,'read')).marker,'newer');
});
test('Core change retains local origin and rejects a Core without local installation support',async t=>{
 const f=await setup(t);await f.install('local');const target=join(f.root,'target');await mkdir(join(target,'applications/store'),{recursive:true});await writeFile(join(target,'build.json'),JSON.stringify({version:'1.0.0'}));await writeFile(join(target,'applications/store/index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[]}));
 const compatibility=JSON.parse(await readFile(new URL('../../data-compatibility.json',import.meta.url),'utf8'));await writeFile(join(target,'data-compatibility.json'),JSON.stringify(compatibility));assert.equal((await planCoreApplications(f.root,target)).changed,false);
 delete compatibility.localApplications;await writeFile(join(target,'data-compatibility.json'),JSON.stringify(compatibility));await assert.rejects(planCoreApplications(f.root,target),{code:'APP_CORE_INCOMPATIBLE'});assert.equal((await inspectCoreDataCompatibility(f.root,target)).compatible,false);
});
