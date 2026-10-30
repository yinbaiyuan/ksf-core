import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {createWorkbenchHTTP} from '../src/services/workbench-http.js';
import {createApplicationManager} from '../src/applications/manager.js';
import {checksum,encodePackage,decodePackage,validateManifest,assertCompatible} from '../src/applications/protocol.js';
const file=text=>{const data=Buffer.from(text);return {content:data.toString('base64'),sha256:checksum(data),mode:0o644};};
async function fixture(t,options={},applicationId='com.example.team'){const root=await mkdtemp(join(tmpdir(),'ksf-cli-')),storeDirectory=join(root,'store');await mkdir(storeDirectory);const manifest={schemaVersion:1,minCoreVersion:'0.3.0',dataStores:[],sdkVersion:1,id:applicationId,name:'Synthetic team',description:'CLI lifecycle fixture',version:'1.0.0',window:{entry:'frontend/index.js'},backend:{entry:'backend/index.mjs',runtime:'node',lifecycle:'on-demand'},permissions:['background','messages.receive'],activation:{messages:{channels:['team.feedback.v1']}},cli:{contractVersion:1,entry:'cli/index.mjs',documentation:'docs/cli.md',commands:[{id:'task.create'},{id:'task.get'},{id:'background.retain'},{id:'background.release'}]}};
 const backend=`import {writeFile} from 'node:fs/promises';let count=0;export function activate(ctx){return {async call(method,input,caller){if(method==='background.retain')return ctx.background.retain({key:'run-1',reason:'Synthetic business'});if(method==='background.release')return ctx.background.release('run-1');if(method==='tasks.create')count++;return {count,pid:process.pid,caller}},async onMessage(event){if(event.delayMs)await new Promise(r=>setTimeout(r,event.delayMs));await writeFile(ctx.dataDirectory+'/event.json',JSON.stringify(event));return {acknowledged:true}},async startBackground(){await writeFile(ctx.dataDirectory+'/resumed','yes')}}}`;
 const cli=`import {writeFile} from 'node:fs/promises';await writeFile(${JSON.stringify(join(root,'cli-loaded'))},'yes');export function createCLI(ctx){return {execute(command,input){return ctx.invoke(command==='task.create'?'tasks.create':command==='task.get'?'tasks.get':command,input)}}}`;
 const files={'frontend/index.js':file('export function mount(){}'),'backend/index.mjs':file(backend),'cli/index.mjs':file(cli),'docs/cli.md':file('# Synthetic CLI\nOnly load after explicit choice.\n')},bytes=encodePackage(manifest,files),digest=checksum(bytes);await writeFile(join(storeDirectory,'team.ksfapp'),bytes);await writeFile(join(storeDirectory,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[{manifest,package:{url:'team.ksfapp',sha256:digest,size:bytes.length}}]}));const managers=[];const manager=()=>{const m=createApplicationManager(root,{storeDirectory,...options});managers.push(m);return m;};t.after(async()=>{await Promise.all(managers.map(m=>m.close()));await rm(root,{recursive:true,force:true});});const m=manager();await m.install({trusted:true,sourceId:'builtin',appId:manifest.id,version:manifest.version,digest});return {m,manager,root,digest,manifest,files};}
test('app list and docs never execute CLI; explicit CLI executes packaged adapter and shares backend',async t=>{const f=await fixture(t);assert.equal((await f.m.listApplications())[0].hasCLI,true);const docs=await f.m.cliDocs('com.example.team');assert.equal(docs.packageDigest,f.digest);await assert.rejects(readFile(join(f.root,'cli-loaded')),{code:'ENOENT'});const window=await f.m.launch('com.example.team',f.digest);const result=await f.m.cliExec('com.example.team','task.create',{expectedPackageDigest:f.digest,operationId:'test-1',params:{}});assert.equal(result.count,1);assert.equal(result.caller.source,'cli');assert.equal((await f.m.call(window.id,'tasks.get')).pid,result.pid);assert.equal((await f.m.call(window.id,'tasks.get')).count,1);assert.equal(await readFile(join(f.root,'cli-loaded'),'utf8'),'yes');});
test('app CLI rejects unknown commands and stale document digest before code execution',async t=>{const f=await fixture(t);await assert.rejects(f.m.cliExec('com.example.team','task.create',{expectedPackageDigest:'0'.repeat(64)}),{code:'APP_RELEASE_CHANGED'});await assert.rejects(f.m.cliExec('com.example.team','arbitrary',{expectedPackageDigest:f.digest}),{code:'APP_CLI_COMMAND_UNKNOWN'});await assert.rejects(f.m.cliDocs('com.example.team',{path:'backend/index.mjs'}),{code:'APP_CLI_DOCUMENT_INVALID'});await assert.rejects(readFile(join(f.root,'cli-loaded')),{code:'ENOENT'});await f.m.changeApp('com.example.team','disable');assert.equal((await f.m.cliDocs('com.example.team')).packageDigest,f.digest);await assert.rejects(f.m.cliExec('com.example.team','task.get',{expectedPackageDigest:f.digest}),{code:'APP_CLI_UNAVAILABLE'});});
test('persistent business hold survives frontend absence and backend restart, then releases',async t=>{const f=await fixture(t);await f.m.cliExec('com.example.team','background.retain',{expectedPackageDigest:f.digest});assert.equal(Object.keys((await f.m.backgroundHolds()).applications['com.example.team']).length,1);await f.m.close();const restarted=f.manager();await restarted.startBackground();assert.equal(await readFile(join(f.root,'.agents/user-data/applications/data/com.example.team/resumed'),'utf8'),'yes');await restarted.cliExec('com.example.team','background.release',{expectedPackageDigest:f.digest});assert.equal(Object.keys((await restarted.backgroundHolds()).applications['com.example.team']).length,0);});
test('message activation starts an idle application without opening a frontend',async t=>{const f=await fixture(t);assert.equal((await f.m.messageRoute('com.example.team','team.feedback.v1')).running,false);await f.m.deliverMessage('com.example.team',{eventId:'e1',messageId:'m1',channel:'team.feedback.v1'});const event=JSON.parse(await readFile(join(f.root,'.agents/user-data/applications/data/com.example.team/event.json')));assert.equal(event.messageId,'m1');await assert.rejects(f.m.deliverMessage('com.example.team',{channel:'unknown.v1'}),{code:'APP_MESSAGE_UNAVAILABLE'});});
test('new v1 requires CLI entry/docs and rejects other SDK versions',async t=>{const f=await fixture(t);assertCompatible(f.manifest,{coreVersion:'0.3.0'});assert.throws(()=>validateManifest({...f.manifest,sdkVersion:2}),{code:'APP_MANIFEST_INVALID'});const files={...f.files};delete files['cli/index.mjs'];assert.throws(()=>decodePackage(encodePackage(f.manifest,files)),{code:'APP_PACKAGE_INVALID'});assert.throws(()=>validateManifest({...f.manifest,cli:{...f.manifest.cli,entry:'../escape.mjs'}}),{code:'APP_MANIFEST_INVALID'});});
test('message call timeout preserves its real execution lease until the handler finishes',async t=>{const f=await fixture(t,{callTimeoutMs:30});const lease=await f.m.launch('com.example.team',f.digest);let settled=false;const delivery=f.m.deliverMessage('com.example.team',{eventId:'slow',messageId:'slow',channel:'team.feedback.v1',delayMs:180}).finally(()=>{settled=true;});await new Promise(r=>setTimeout(r,90));assert.equal(settled,false);assert(f.m.getBackgroundErrors().some(v=>v.code==='APP_MESSAGE_TIMEOUT'));await delivery;assert.equal(settled,true);assert.equal(JSON.parse(await readFile(join(f.root,'.agents/user-data/applications/data/com.example.team/event.json'))).eventId,'slow');await f.m.release(lease.id);});
test('closing during background reconciliation never acquires a configuration lock after shutdown',async t=>{const f=await fixture(t);await f.m.cliExec('com.example.team','background.retain',{expectedPackageDigest:f.digest});let current=f.m;for(let n=0;n<4;n++){const pending=current.startBackground();await current.close();current=f.manager();await current.startBackground();await pending.catch(()=>{});}assert.equal(await readFile(join(f.root,'.agents/user-data/applications/data/com.example.team/resumed'),'utf8'),'yes');await current.cliExec('com.example.team','background.release',{expectedPackageDigest:f.digest});});
test('reinstalling the same immutable CLI package reuses verified bytes without executing code',async t=>{const f=await fixture(t);for(let n=0;n<2;n++){const result=await f.m.install({trusted:true,sourceId:'builtin',appId:f.manifest.id,version:f.manifest.version,digest:f.digest});assert.equal(result.release.digest,f.digest);assert.equal(result.pending,false);}await assert.rejects(readFile(join(f.root,'cli-loaded')),{code:'ENOENT'});});
test('a surviving application child blocks takeover even after its recorded host has died',async t=>{const f=await fixture(t);await f.m.launch('com.example.team',f.digest);const directory=join(f.root,'.agents/runtime-data/applications/instances');for(const name of await readdir(directory)){const path=join(directory,name),record=JSON.parse(await readFile(path,'utf8'));if(record.kind==='runtime'){assert(Number.isSafeInteger(record.childPid));record.ownerPid=2147483000;await writeFile(path,JSON.stringify(record));}}const other=f.manager();await assert.rejects(other.launch('com.example.team',f.digest),{code:'APP_OTHER_HOST_RUNNING'});await f.m.close();const lease=await other.launch('com.example.team',f.digest);assert(lease.id);await other.release(lease.id);});
test('managed application context exposes separate durable user and runtime storage',async t=>{
 const f=await fixture(t),manifest={...f.manifest,id:'com.example.local-storage'},backend=`export function activate(ctx){return{async call(method){if(method==='save'){await ctx.storage.write('local.json','本机',{scope:'runtime',ifMatch:null});await ctx.storage.write('local.json','用户',{ifMatch:null});}return{local:await ctx.storage.read('local.json',{scope:'runtime'}),user:await ctx.storage.read('local.json'),runtimeDataDirectory:ctx.runtimeDataDirectory}},onMessage(){}}}`;
 const bytes=encodePackage(manifest,{...f.files,'backend/index.mjs':file(backend)}),preview=await f.m.prepareImport(bytes,'storage.ksfapp');await f.m.installImport({importId:preview.importId,digest:preview.package.sha256,trusted:true});const lease=await f.m.launch(manifest.id,preview.package.sha256),saved=await f.m.call(lease.id,'save');assert.equal(saved.local.text,'本机');assert.equal(saved.user.text,'用户');assert.equal(saved.local.path,join(saved.runtimeDataDirectory,'local.json'));assert(saved.runtimeDataDirectory.includes('runtime-data'));
 await f.m.close();const restarted=f.manager(),next=await restarted.launch(manifest.id,preview.package.sha256),read=await restarted.call(next.id,'read');assert.equal(read.local.text,'本机');assert.equal(read.user.text,'用户');
});

test('HTTP CLI docs bind the installed digest and read disabled applications without executing or changing data',async t=>{
 const f=await fixture(t);await f.m.changeApp('com.example.team','disable');
 const before=await readFile(join(f.root,'.agents/user-data/applications/state.json'));
 const wb=createWorkbenchHTTP(f.root,{applications:{storeDirectory:join(f.root,'store'),defaultSource:null}});
 const server=createServer((req,res)=>{void wb.handle(req,new URL(req.url,'http://localhost'),(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(body);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
 const url='http://127.0.0.1:'+server.address().port+'/api/apps/cli/docs',read=params=>fetch(url+'?'+new URLSearchParams({appId:f.manifest.id,digest:f.digest,...params}));
 const response=await read({});assert.equal(response.status,200);const docs=(await response.json()).data;
 assert.equal(docs.name,f.manifest.name);assert.equal(docs.version,'1.0.0');assert.deepEqual(docs.commands,f.manifest.cli.commands);
 assert.equal((await fetch(url+'?appId='+f.manifest.id)).status,400);
 assert.equal((await read({digest:'0'.repeat(64)})).status,409);
 for(const path of ['../docs/cli.md','docs/../backend/index.mjs','/docs/cli.md','backend/index.mjs','docs/missing.md'])assert.equal((await read({path})).status>=400,true);
 assert.equal((await fetch(url+'?appId='+f.manifest.id+'&digest='+f.digest+'&digest='+f.digest)).status,400);
 assert.deepEqual(await readFile(join(f.root,'.agents/user-data/applications/state.json')),before);
 assert.equal((await f.m.snapshot()).instances.length,0);
 await assert.rejects(readFile(join(f.root,'cli-loaded')),{code:'ENOENT'});
 await assert.rejects(readFile(join(f.root,'.agents/user-data/applications/data/com.example.team/resumed')),{code:'ENOENT'});
 }finally{await new Promise(r=>server.close(r));await wb.close();}
});
test('CLI reads reject corrupt package files and invalid referenced documents',async t=>{
 const f=await fixture(t);
 const badFiles={...f.files,'docs/bad.json':file(Buffer.from([0xff])),'docs/large.txt':file('a'.repeat(256*1024+1))};
 const preview=await f.m.prepareImport(encodePackage({...f.manifest,id:'com.example.docs'},badFiles),'docs.ksfapp');await f.m.installImport({trusted:true,importId:preview.importId,digest:preview.package.sha256});
 await assert.rejects(f.m.cliDocs('com.example.docs',{path:'docs/bad.json'}),{code:'APP_CLI_DOCUMENT_INVALID'});
 await assert.rejects(f.m.cliDocs('com.example.docs',{path:'docs/large.txt'}),{code:'APP_CLI_DOCUMENT_TOO_LARGE'});
 const release=(await f.m.snapshot()).installed.find(app=>app.id==='com.example.docs').active;
 const candidates=await readdir(join(f.root,'.agents/user-data/applications/packages'));
 // Locate the actual immutable release rather than modifying the registry or another package.
 async function corrupt(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()){if(await corrupt(path))return true;}else if(entry.name==='cli.md'&&path.includes(release.digest)){await writeFile(path,'tampered');return true;}}return false;}
 assert(candidates.length);assert(await corrupt(join(f.root,'.agents/user-data/applications/packages')));
 await assert.rejects(f.m.cliDocs('com.example.docs'),error=>['APP_PACKAGE_INTEGRITY'].includes(error.code));
});

test('pending upgrades keep CLI documents bound to the active version until its final lease closes',async t=>{
 const f=await fixture(t),lease=await f.m.launch(f.manifest.id,f.digest);
 const manifest={...f.manifest,version:'1.0.1',cli:undefined},bytes=encodePackage(manifest,f.files),digest=checksum(bytes);
 await writeFile(join(f.root,'store','next.ksfapp'),bytes);await writeFile(join(f.root,'store','index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[{manifest,package:{url:'next.ksfapp',size:bytes.length,sha256:digest}}]}));
 assert.equal((await f.m.install({trusted:true,sourceId:'builtin',appId:manifest.id,version:manifest.version,digest})).pending,true);
 assert.equal((await f.m.cliDocs(manifest.id,{expectedPackageDigest:f.digest})).version,'1.0.0');await assert.rejects(f.m.cliDocs(manifest.id,{expectedPackageDigest:digest}),{code:'APP_RELEASE_CHANGED'});
 await f.m.release(lease.id);assert.equal((await f.m.snapshot()).installed[0].active.digest,digest);await assert.rejects(f.m.cliDocs(manifest.id),{code:'APP_CLI_UNAVAILABLE'});
});


test('both registered cooperation aliases route CLI docs, execution and diagnostics to the single installation',async t=>{
 const appId='com.ksf.cooperation-center',aliases=['yinbaiyuan.lan-messenger','com.yinbaiyuan.lan-messenger'],f=await fixture(t,{},appId);
 for(const alias of aliases)await assert.rejects(f.m.cliDocs(alias),{code:'APP_CLI_UNAVAILABLE'});
 const path=join(f.root,'.agents/user-data/applications/state.json'),state=JSON.parse(await readFile(path,'utf8'));state.installed[appId].legacyIds=aliases;await writeFile(path,JSON.stringify(state));const lease=await f.m.launch(appId,f.digest);
 const {inspectApplicationData}=await import('../src/applications/data.js'),{runApplicationCommand}=await import('../src/commands/application-cli.js');let count=0;
 for(const alias of aliases){
  assert.equal((await f.m.cliDocs(alias)).appId,appId);
  await assert.rejects(f.m.cliExec(alias,'task.create',{expectedPackageDigest:'0'.repeat(64)}),{code:'APP_RELEASE_CHANGED'});
  const result=await f.m.cliExec(alias,'task.create',{expectedPackageDigest:f.digest,operationId:'alias-'+(++count),params:{}});assert.equal(result.count,count);assert.equal(result.caller.appId,appId);
  assert.equal((await f.m.runtimeSnapshot(alias)).applications[0].id,appId);
  assert.equal((await inspectApplicationData(f.root,alias)).packageDigest,f.digest);
  const offline=JSON.parse((await runApplicationCommand(['runtime','status',alias,'--json'],f.root)).stdout);assert.equal(offline.data.applications[0].id,appId);
 }
 assert.deepEqual((await f.m.snapshot()).installed.map(a=>a.id),[appId]);await f.m.release(lease.id);
});
