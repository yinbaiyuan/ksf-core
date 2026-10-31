import test from 'node:test';
import {createServer} from 'node:http';
import {realpath} from 'node:fs/promises';
import {processIdentity} from '../src/services/service-lock.js';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encodePackage,checksum} from '../src/applications/protocol.js';
import {inspectMatchedSwitch,prepareMatchedSwitch,applyMatchedSwitch} from '../src/distribution/matched-switch.js';
const contract=await readFile(new URL('../../data-compatibility.json',import.meta.url));
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'ksf-switch-'));t.after(()=>rm(root,{recursive:true,force:true}));const candidate=join(root,'delivery');
 const write=async(path,bytes)=>{await mkdir(join(path,'..'),{recursive:true});await writeFile(path,typeof bytes==='string'||Buffer.isBuffer(bytes)?bytes:JSON.stringify(bytes)+'\n');};
 const m={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',dataStores:[{name:'state.json',scope:'user',schemaVersion:1,migrateFrom:[]}],id:'com.example.switch',version:'1.0.1',name:'Switch',description:'Synthetic',permissions:[],backend:{runtime:'node',entry:'backend/index.mjs',lifecycle:'on-demand'}};
 const b=Buffer.from('export function activate(){return{call(){return 1}}}'),bytes=encodePackage(m,{'backend/index.mjs':{content:b.toString('base64'),sha256:checksum(b),mode:0o644}}),entry={manifest:m,package:{url:'switch.ksfapp',sha256:checksum(bytes),size:bytes.length}};
 await write(join(candidate,'.agents/core/build.json'),{version:'0.3.0'});await write(join(candidate,'.agents/core/data-compatibility.json'),contract);await write(join(candidate,'application-store/index.json'),{protocol:'ksf-app-registry-v1',apps:[entry]});await write(join(candidate,'application-store/switch.ksfapp'),bytes);
 const files={};for(const path of ['.agents/core/build.json','.agents/core/data-compatibility.json','application-store/index.json','application-store/switch.ksfapp']){const data=await readFile(join(candidate,path));files[path]={sha256:checksum(data),size:data.length};}await write(join(candidate,'inventory.json'),{schemaVersion:1,files});
 await write(join(root,'.agents/core/build.json'),{version:'0.2.0'});
 const state={schemaVersion:1,revision:1,sources:[{id:'personal',url:'http://127.0.0.1:1/index.json',enabled:false}],defaults:[],installed:{[m.id]:{enabled:false,active:{manifest:{...m,version:'1.0.0'},digest:'a'.repeat(64),source:{id:'personal'}},previous:null,pending:null}}};
 const statePath=join(root,'.agents/user-data/applications/state.json'),dataPath=join(root,'.agents/user-data/applications/data',m.id,'state.json');await write(statePath,state);await write(dataPath,{schemaVersion:1,items:['original']});
 return{root,candidate,statePath,dataPath,write};
}
test('matched preview is read only; switch preserves user data, sources and enabled state',async t=>{
 const f=await fixture(t),before=await readFile(f.dataPath,'utf8'),state=JSON.parse(await readFile(f.statePath,'utf8'));
 const inspect=await inspectMatchedSwitch(f.root,f.candidate);assert.equal(inspect.core.compatible,true);await assert.rejects(lstat(join(f.root,'.agents/runtime-data')),{code:'ENOENT'});
 const p=await prepareMatchedSwitch(f.root,f.candidate);assert.equal((await readFile(f.dataPath,'utf8')),before);const result=await applyMatchedSwitch(f.root,p.receipt);assert.equal(result.phase,'complete');
 const after=JSON.parse(await readFile(f.statePath,'utf8'));assert.equal(after.sources[0].id,'ksf-apps');assert.deepEqual(after.sources.slice(1),state.sources);assert.equal(after.installed['com.example.switch'].enabled,false);assert.equal(after.installed['com.example.switch'].active.source.id,'personal');assert.equal(await readFile(f.dataPath,'utf8'),before);assert.equal(JSON.parse(await readFile(join(f.root,'.agents/core/build.json'))).version,'0.3.0');
 assert.equal((await applyMatchedSwitch(f.root,p.receipt)).phase,'complete');
});
for(const phase of ['switching','old-core-saved','core-installed','index-installed','committed'])test('interrupted matched switch resumes at '+phase,async t=>{
 const f=await fixture(t),p=await prepareMatchedSwitch(f.root,f.candidate),before=await readFile(f.dataPath,'utf8');await assert.rejects(applyMatchedSwitch(f.root,p.receipt,{fault:stage=>{if(stage===phase)throw Error('interrupted');}}),/interrupted/);
 const done=await applyMatchedSwitch(f.root,p.receipt,{recover:true});assert.equal(done.phase,'complete');assert.equal(await readFile(f.dataPath,'utf8'),before);assert.equal(JSON.parse(await readFile(f.statePath)).installed['com.example.switch'].active.manifest.version,'1.0.1');
});
test('changed user settings reject a prepared switch before replacing Core',async t=>{
 const f=await fixture(t),p=await prepareMatchedSwitch(f.root,f.candidate),state=JSON.parse(await readFile(f.statePath));state.installed['com.example.switch'].enabled=true;await f.write(f.statePath,state);await assert.rejects(applyMatchedSwitch(f.root,p.receipt),{code:'APP_DATA_CONFLICT'});assert.equal(JSON.parse(await readFile(join(f.root,'.agents/core/build.json'))).version,'0.2.0');
});
test('preparation ignores Finder files and removes its own failed Core copy',async t=>{
 const f=await fixture(t);await f.write(join(f.root,'.agents/core/applications/.DS_Store'),'Finder');
 const p=await prepareMatchedSwitch(f.root,f.candidate);assert.equal(p.phase,'prepared');
 await f.write(join(f.candidate,'.agents/core/release.json'),{schema_version:3});
 const inventory=JSON.parse(await readFile(join(f.candidate,'inventory.json'))),bytes=await readFile(join(f.candidate,'.agents/core/release.json'));
 inventory.files['.agents/core/release.json']={sha256:checksum(bytes),size:bytes.length};await f.write(join(f.candidate,'inventory.json'),inventory);
 await assert.rejects(prepareMatchedSwitch(f.root,f.candidate),{code:'MATCHED_INVENTORY_INVALID'});
 const {readdir}=await import('node:fs/promises');let failures=0;
 for(const name of await readdir(join(f.root,'.agents/runtime-data/t15-switch'))){const base=join(f.root,'.agents/runtime-data/t15-switch',name);try{await lstat(join(base,'prepare-failure.json'));failures++;await assert.rejects(lstat(join(base,'core')),{code:'ENOENT'});}catch(error){if(error.code!=='ENOENT')throw error;}}
 assert.equal(failures,1);assert.equal(JSON.parse(await readFile(join(f.root,'.agents/core/build.json'))).version,'0.2.0');
});
test('a concurrent Core edit is preserved and blocks the prepared replacement',async t=>{
 const f=await fixture(t),p=await prepareMatchedSwitch(f.root,f.candidate);await f.write(join(f.root,'.agents/core/build.json'),{version:'0.2.1'});await assert.rejects(applyMatchedSwitch(f.root,p.receipt),{code:'MATCHED_CORE_CHANGED'});assert.equal(JSON.parse(await readFile(join(f.root,'.agents/core/build.json'))).version,'0.2.1');
});
test('service restoration executes the installed Core rather than the unpacked delivery source',async t=>{
 const f=await fixture(t),relative='.agents/core/runtime/src/services/service-manager.js',source="import{writeFile}from'node:fs/promises';export async function ensureService(root){await writeFile(root+'/restored-service.txt',import.meta.url);}";await f.write(join(f.candidate,relative),source);const inventory=JSON.parse(await readFile(join(f.candidate,'inventory.json'))),bytes=await readFile(join(f.candidate,relative));inventory.files[relative]={sha256:checksum(bytes),size:bytes.length};await f.write(join(f.candidate,'inventory.json'),inventory);
 const p=await prepareMatchedSwitch(f.root,f.candidate);await applyMatchedSwitch(f.root,p.receipt);const receipt=JSON.parse(await readFile(p.receipt));receipt.wasRunning=true;receipt.serviceRestored=false;await f.write(p.receipt,receipt);await applyMatchedSwitch(f.root,p.receipt,{recover:true});const location=await readFile(join(f.root,'restored-service.txt'),'utf8');assert(location.endsWith('/.agents/core/runtime/src/services/service-manager.js'));assert(!location.includes('/delivery/'));
});

test('an open application window keeps the matched switch prepared without stopping its host',async t=>{
 const f=await fixture(t),identity=processIdentity(),server=createServer((request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(request.url==='/api/health'?{...identity,nonce:'synthetic-nonce'}:{ok:true,data:{instances:[{appId:'com.example.switch',kind:'window',status:'running'}]}}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 await f.write(join(f.root,'.agents/runtime-data/web/control.json'),{...identity,nonce:'synthetic-nonce',root:await realpath(f.root),url:'http://127.0.0.1:'+server.address().port+'/'});const p=await prepareMatchedSwitch(f.root,f.candidate);await assert.rejects(applyMatchedSwitch(f.root,p.receipt),{code:'APP_BUSY'});assert.equal(JSON.parse(await readFile(p.receipt)).phase,'prepared');assert.equal(JSON.parse(await readFile(join(f.root,'.agents/core/build.json'))).version,'0.2.0');await assert.rejects(lstat(join(f.root,'.agents/runtime-data/service/deployment.json')),{code:'ENOENT'});
});

test('recovery retains the original running intention after interruption during drained preparation',async t=>{const f=await fixture(t),relative='.agents/core/runtime/src/services/service-manager.js',source="import{writeFile}from'node:fs/promises';export async function ensureService(root){await writeFile(root+'/restored-service.txt',import.meta.url);}";await f.write(join(f.candidate,relative),source);const inventory=JSON.parse(await readFile(join(f.candidate,'inventory.json'))),bytes=await readFile(join(f.candidate,relative));inventory.files[relative]={sha256:checksum(bytes),size:bytes.length};await f.write(join(f.candidate,'inventory.json'),inventory);const p=await prepareMatchedSwitch(f.root,f.candidate),receipt=JSON.parse(await readFile(p.receipt));receipt.wasRunning=true;await f.write(p.receipt,receipt);const done=await applyMatchedSwitch(f.root,p.receipt,{recover:true});assert.equal(done.wasRunning,true);assert.equal(done.serviceRestored,true);assert((await readFile(join(f.root,'restored-service.txt'),'utf8')).endsWith('/.agents/core/runtime/src/services/service-manager.js'));});

test('Core baseline retains a newer compatible application and migrates only its builtin origin',async t=>{
 const f=await fixture(t),state=JSON.parse(await readFile(f.statePath));state.sources.unshift({id:'builtin',name:'旧随包',url:'builtin:',enabled:true});state.installed['com.example.switch'].active.manifest.version='9.0.0';state.installed['com.example.switch'].active.source={id:'builtin'};await writeFile(f.statePath,JSON.stringify(state));
 const plan=await inspectMatchedSwitch(f.root,f.candidate);assert.equal(plan.applications[0].retained,true);assert.equal(plan.next.installed['com.example.switch'].active.manifest.version,'9.0.0');assert.equal(plan.next.installed['com.example.switch'].active.digest,'a'.repeat(64));assert.equal(plan.next.installed['com.example.switch'].active.source.id,'ksf-apps');assert.equal(plan.next.sources.some(s=>s.id==='builtin'),false);
});
