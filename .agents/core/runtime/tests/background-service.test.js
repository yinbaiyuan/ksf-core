import {runApplicationCommand} from '../src/commands/application-cli.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,realpath,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {startWebServer} from '../src/services/web.js';
import {ensureService,stopService,serviceStatus,serviceDoctor,redactLog} from '../src/services/service-manager.js';
import {processIdentity} from '../src/services/service-lock.js';
import {controlRequest} from '../src/communication/client.js';
import {createApplicationManager} from '../src/applications/manager.js';
import {encodePackage,checksum,validateManifest,OFFICIAL_APPLICATIONS} from '../src/applications/protocol.js';
import {createCommunicationService} from '../src/communication/service.js';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';

const cleanups=new Map();
const cleanup=(root,action)=>cleanups.get(root).push(action);
async function temporary(t){const root=await mkdtemp(join(tmpdir(),'ksf-background-'));cleanups.set(root,[]);t.after(async()=>{for(const action of cleanups.get(root).reverse())await action();cleanups.delete(root);await rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});});return root;}
async function availablePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
test('frontend failure cannot prevent health, local control and application CLI metadata',async t=>{
  const root=await temporary(t),server=await startWebServer({root,port:0,capture:false,webDirectory:join(root,'missing-ui')});cleanup(root,()=>server.close());
  const response=await fetch(server.url);assert.equal(response.status,503);assert.equal((await response.json()).error.code,'WEB_FRONTEND_UNAVAILABLE');
  const health=await (await fetch(new URL('/api/health',server.url))).json();assert.equal(health.service,'ksf-core');assert.equal(health.frontend.state,'unavailable');
  assert.deepEqual(await controlRequest(root,'/api/local/apps',{operation:'list'}),[]);
  const status=await controlRequest(root,'/api/local/service',{operation:'status'});assert.equal(status.state,'running');assert.equal(status.port,server.port);
  const diagnosis=await serviceDoctor(root);assert.equal(diagnosis.health,'degraded');assert.ok(diagnosis.issues.some(issue=>issue.service==='frontend'));
});
test('offline diagnosis creates no service, application or user data',async t=>{
  const root=await temporary(t);assert.equal((await serviceDoctor(root)).state,'stopped');assert.deepEqual(await readdir(root),[]);
});
test('a bodyless catalog GET may outlive the incoming-body deadline',async t=>{
  const root=await temporary(t),server=await startWebServer({root,port:0,capture:false,applications:{fetcher:async()=>{await new Promise(r=>setTimeout(r,10300));return new Response(JSON.stringify({protocol:'ksf-app-registry-v1',apps:[]}));}}});cleanup(root,()=>server.close());
  const response=await fetch(new URL('/api/apps/catalog',server.url));assert.equal(response.status,200);assert.ok((await response.json()).data.applications.length>0);
});
test('status never probes a non-loopback control address',async t=>{
  const root=await temporary(t);await mkdir(join(root,'.agents/runtime-data/web'),{recursive:true});await writeFile(join(root,'.agents/runtime-data/web/control.json'),JSON.stringify({...processIdentity(),root:await realpath(root),url:'http://example.invalid/',token:'synthetic'}));await assert.rejects(serviceStatus(root),{code:'SERVICE_CONTROL_INVALID'});
});
test('one root cannot own two hosts even on different ports',async t=>{
  const root=await temporary(t),first=await startWebServer({root,port:0,capture:false});cleanup(root,()=>first.close());
  await assert.rejects(startWebServer({root,port:0,capture:false}),{code:'SERVICE_ALREADY_RUNNING'});
});
test('concurrent cold starts share one detached host and explicit stop stays stopped',async t=>{
  const root=await temporary(t),port=await availablePort();cleanup(root,()=>stopService(root,{force:true}));
  const results=await Promise.all(Array.from({length:6},()=>ensureService(root,{port,timeoutMs:15000})));
  assert.equal(new Set(results.map(r=>r.pid)).size,1);assert.equal(results[0].port,port);
  await stopService(root);assert.equal((await serviceStatus(root)).state,'stopped');
});
test('service restart preserves its explicit non-default port and root',async t=>{
  const root=await temporary(t),port=await availablePort();cleanup(root,()=>stopService(root,{force:true}));const first=await ensureService(root,{port});
  assert.equal((await controlRequest(root,'/api/local/service',{operation:'restart'})).state,'restarting');
  let next;const deadline=Date.now()+15000;while(Date.now()<deadline){next=await serviceStatus(root);if(next.state==='running'&&next.pid!==first.pid)break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(next.state,'running');assert.notEqual(next.pid,first.pid);assert.equal(next.port,port);assert.equal(await realpath(next.root),await realpath(root));
});
test('occupied port fails precisely and cleans up host ownership',async t=>{
  const root=await temporary(t),other=createServer();await new Promise(r=>other.listen(0,'127.0.0.1',r));cleanup(root,()=>new Promise(r=>other.close(r)));
  await assert.rejects(ensureService(root,{port:other.address().port,timeoutMs:10000}),{code:'WEB_ADDRESS_IN_USE'});
  assert.equal((await serviceStatus(root)).state,'stopped');
});
test('startup timeout does not send business work or prevent a later readiness check',async t=>{
  const root=await temporary(t),port=await availablePort();cleanup(root,()=>stopService(root,{force:true}));
  await assert.rejects(ensureService(root,{port,timeoutMs:1}),{code:'SERVICE_START_TIMEOUT'});
  const ready=await ensureService(root,{port});assert.equal(ready.state,'running');assert.equal((await ensureService(root,{port})).pid,ready.pid);
});
test('application runtime reads never activate a host that is transitioning',async t=>{
  const {root}=await application(t);await mkdir(join(root,'.agents/runtime-data/service'),{recursive:true});await writeFile(join(root,'.agents/runtime-data/service/host.lock'),JSON.stringify(processIdentity()));
  for(const action of ['list','status','logs']){const result=await runApplicationCommand(['runtime',action,'com.example.headless','--json'],root);assert.equal(JSON.parse(result.stdout).ok,true);}
  await assert.rejects(readFile(join(root,'.agents/runtime-data/service/start-request.json')),{code:'ENOENT'});
});
test('detached supervisor rotates UTF-8 output and exits with its worker',async t=>{
  const root=await temporary(t),home=join(root,'.agents/runtime-data/service');await mkdir(home,{recursive:true});
  await writeFile(join(home,'service.log'),Buffer.alloc(2*1024*1024,120));cleanup(root,()=>stopService(root,{force:true}));
  await ensureService(root,{port:await availablePort()});await stopService(root);
  const deadline=Date.now()+3000;while(Date.now()<deadline&&!await stat(join(home,'service.log.1')).catch(()=>null))await new Promise(r=>setTimeout(r,20));
  assert.equal((await stat(join(home,'service.log.1'))).size,2*1024*1024);
  assert.equal(JSON.parse((await readFile(join(home,'service.log'),'utf8')).trim()).service,'ksf-core');
});
test('stale process records are recoverable, status does not start a service',async t=>{
  const root=await temporary(t);await mkdir(join(root,'.agents/runtime-data/service'),{recursive:true});
  await writeFile(join(root,'.agents/runtime-data/service/host.lock'),JSON.stringify({pid:99999999,processStart:'gone',nonce:'stale'}));
  assert.equal((await serviceStatus(root)).state,'stopped');
  const server=await startWebServer({root,port:0,capture:false});cleanup(root,()=>server.close());assert.equal((await serviceStatus(root)).state,'running');
});
test('matched deployment prevents incidental CLI and login activation',async t=>{
  const root=await temporary(t);await mkdir(join(root,'.agents/runtime-data/service'),{recursive:true});await writeFile(join(root,'.agents/runtime-data/service/deployment.json'),JSON.stringify({id:'synthetic-cutover',reason:'matched deployment'}));
  await assert.rejects(ensureService(root),{code:'SERVICE_DEPLOYING'});await assert.rejects(startWebServer({root,port:0,capture:false}),{code:'SERVICE_DEPLOYING'});assert.equal((await serviceStatus(root)).deployment.id,'synthetic-cutover');
});
async function application(t,lifecycle='on-demand',cli=false,messages=false){
  const root=await temporary(t),store=join(root,'store');await mkdir(store);
  const manifest={schemaVersion:1,minCoreVersion:'0.3.0',dataStores:[],sdkVersion:1,id:'com.example.headless',name:'Headless',version:'1.0.0',description:'Synthetic headless service',backend:{runtime:'node',entry:'backend/index.mjs',lifecycle},permissions:['background']};
  if(messages){manifest.permissions.push('messages.receive');manifest.activation={messages:{channels:['message.v1']}};}
  if(cli)manifest.cli={contractVersion:1,entry:'cli/index.mjs',documentation:'docs/cli.md',commands:[{id:'read'},{id:'slow'},{id:'writeThenWait'}]};
  const code=`import {writeFile,readFile} from 'node:fs/promises';export function activate(ctx){return {call(method){if(method==='writeThenWait')return ctx.tasks.run(async()=>{const path=ctx.dataDirectory+'/executions',count=Number(await readFile(path,'utf8').catch(()=>0));await writeFile(path,String(count+1));await new Promise(r=>setTimeout(r,3000));return {written:true};});if(method==='slow')return ctx.tasks.run(()=>new Promise(r=>setTimeout(()=>r({sdk:ctx.sdkVersion,pid:process.pid}),180)));return {sdk:ctx.sdkVersion,pid:process.pid,background:!!ctx.background,messages:!!ctx.messages};},startBackground(){return writeFile(ctx.dataDirectory+'/started',String(process.pid));},dispose(){}}}`;
  const data=Buffer.from(code),files={'backend/index.mjs':{content:data.toString('base64'),sha256:checksum(data),mode:0o644}};if(cli)for(const [path,text] of Object.entries({'cli/index.mjs':'export function createCLI(ctx){return {execute(command,input){return ctx.invoke(command,input)}}}','docs/cli.md':'# Synthetic CLI\n'})){const bytes=Buffer.from(text);files[path]={content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};}const bytes=encodePackage(manifest,files),digest=checksum(bytes);
  await writeFile(join(store,'headless.ksfapp'),bytes);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[{manifest,package:{url:'headless.ksfapp',sha256:digest,size:bytes.length}}]}));
  const manager=createApplicationManager(root,{storeDirectory:store,defaultSource:null});cleanup(root,()=>manager.close());await manager.install({trusted:true,sourceId:'builtin',appId:manifest.id,version:manifest.version,digest});
  // A detached host uses the real bundled store, unlike this synthetic manager.
  // Default-install behavior has separate coverage; retain explicit choices so
  // a crash/replay test does not first unpack every unrelated official app.
  const statePath=join(root,'.agents/user-data/applications/state.json'),state=JSON.parse(await readFile(statePath,'utf8'));
  state.defaults=[...OFFICIAL_APPLICATIONS];await writeFile(statePath,JSON.stringify(state));
  return {root,manager,manifest,digest};
}
test('new v1 rejects legacy v1 structures and requires explicit backend lifecycle',()=>{
  const manifest={schemaVersion:1,minCoreVersion:'0.3.0',dataStores:[],sdkVersion:1,id:'com.example.old',name:'Old',description:'',version:'1.0.0',frontend:{entry:'frontend/index.js'},permissions:[]};
  assert.throws(()=>validateManifest(manifest),{code:'APP_MANIFEST_INVALID'});
  assert.throws(()=>validateManifest({...manifest,window:undefined,backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'}}),{code:'APP_MANIFEST_INVALID'});
});
test('pure headless on-demand app receives full SDK v1 and exits after leases drain',async t=>{
  const {manager,digest}=await application(t);const instance=await manager.launch('com.example.headless',digest,{kind:'service'});
  const result=await manager.call(instance.id,'read');assert.equal(result.sdk,1);assert.equal(result.background,true);assert.equal(result.messages,true);
  await manager.release(instance.id);assert.equal((await manager.runtimeSnapshot()).applications[0].runtimes.length,0);
});
test('resident app starts without a surface; explicit stop blocks reactivation until start',async t=>{
  const {manager,digest}=await application(t,'resident');await manager.startBackground();assert.equal((await manager.runtimeSnapshot()).applications[0].state,'running');
  await manager.runtimeManage({action:'stop',appId:'com.example.headless'});await manager.startBackground();
  await assert.rejects(manager.launch('com.example.headless',digest,{kind:'service'}),{code:'APP_RUNTIME_STOPPED'});
  await manager.runtimeManage({action:'start',appId:'com.example.headless'});assert.equal((await manager.runtimeSnapshot()).applications[0].state,'running');
});
test('graceful application stop waits for in-flight work',async t=>{
  const {manager,digest}=await application(t),instance=await manager.launch('com.example.headless',digest,{kind:'service'});
  const pending=manager.call(instance.id,'slow');await new Promise(r=>setTimeout(r,40));
  await manager.runtimeManage({action:'stop',appId:'com.example.headless'});assert.equal((await pending).sdk,1);
});
test('manually retained on-demand backend recovers after an unexpected child exit',async t=>{
  const {manager}=await application(t);await manager.runtimeManage({action:'start',appId:'com.example.headless'});const first=(await manager.runtimeSnapshot()).applications[0].runtimes[0].pid;process.kill(first,'SIGKILL');
  const deadline=Date.now()+6000;let next;while(Date.now()<deadline){next=(await manager.runtimeSnapshot()).applications[0].runtimes[0]?.pid;if(next&&next!==first)break;await new Promise(r=>setTimeout(r,50));}assert.ok(next&&next!==first);
});
test('diagnostic logs redact credentials',()=>{assert.equal(redactLog('Bearer abc.def token=secret api_key="private"'),'Bearer [redacted] token=[redacted] api_key="[redacted]"');});

test('host death marks the accepted request unknown and restart never replays it',async t=>{
  const {root,manager,digest}=await application(t,'on-demand',true);await manager.close();const port=await availablePort();cleanup(root,()=>stopService(root,{force:true}));const host=await ensureService(root,{port});
  const pending=controlRequest(root,'/api/local/apps',{operation:'exec',input:{appId:'com.example.headless',commandId:'writeThenWait',request:{expectedPackageDigest:digest,operationId:'00000000-0000-4000-8000-000000000001'}}}).then(value=>({value}),error=>({error}));
  const path=join(root,'.agents/user-data/applications/data/com.example.headless/executions'),deadline=Date.now()+7000;let count;
  while(Date.now()<deadline){count=await readFile(path,'utf8').catch(()=>null);if(count)break;await new Promise(r=>setTimeout(r,20));}assert.equal(count,'1');process.kill(host.pid,'SIGKILL');
  const outcome=await pending;assert.equal(outcome.error?.data?.outcomeUnknown,true);
  const ready=await ensureService(root,{port});assert.notEqual(ready.pid,host.pid);assert.equal(await readFile(path,'utf8'),'1');
});

test('actual application CLI cold-starts the host before dispatch and reuses it',{skip:process.platform==='win32'?'The isolated fixture has no installed PowerShell launcher; Windows scheduled-task cold starts are covered by native daily-instance acceptance.':false},async t=>{
  const {root,manager,digest}=await application(t,'on-demand',true);await manager.close();const port=await availablePort();await mkdir(join(root,'.agents/runtime-data/service'),{recursive:true});await writeFile(join(root,'.agents/runtime-data/service/policy.json'),JSON.stringify({schemaVersion:1,port,autostart:false}));cleanup(root,()=>stopService(root,{force:true}));
  const input=join(root,'request.json');await writeFile(input,JSON.stringify({expectedPackageDigest:digest}));const args=['exec','com.example.headless','slow','--from',input,'--json'];
  const results=await Promise.all([runApplicationCommand(args,root),runApplicationCommand(args,root)]);for(const result of results){const reply=JSON.parse(result.stdout);assert.equal(reply.ok,true,reply.errors[0]?.message);assert.equal(reply.data.sdk,1);}assert.equal(JSON.parse(results[0].stdout).data.pid,JSON.parse(results[1].stdout).data.pid);assert.equal((await serviceStatus(root)).state,'running');
});

test('a stale failure timestamp cannot reject a new startup attempt',async t=>{
  const root=await temporary(t);await mkdir(join(root,'.agents/runtime-data/service'),{recursive:true});await writeFile(join(root,'.agents/runtime-data/service/last-start.json'),JSON.stringify({attemptId:'stale',at:Date.now()+86400000,code:'OLD_FAILURE'}));cleanup(root,()=>stopService(root,{force:true}));const status=await ensureService(root,{port:await availablePort()});assert.equal(status.state,'running');
});

test('port acquisition failure never activates installed resident work',async t=>{
  const {root,manager}=await application(t,'resident');await manager.startBackground();await manager.close();const marker=join(root,'.agents/user-data/applications/data/example.headless/started');await rm(marker,{force:true});const occupied=createServer();await new Promise(r=>occupied.listen(0,'127.0.0.1',r));cleanup(root,()=>new Promise(r=>occupied.close(r)));
  await assert.rejects(startWebServer({root,port:occupied.address().port,capture:false}),{code:'WEB_ADDRESS_IN_USE'});await assert.rejects(readFile(marker),{code:'ENOENT'});
});

test('host drain preserves an admitted application transfer through durable commit',async t=>{
  const {root,manager}=await application(t,'on-demand',false,true),senderRoot=await temporary(t);
  const a=await createCommunicationService(senderRoot),b=await createCommunicationService(root,{applications:manager});
  cleanup(senderRoot,()=>a.close());cleanup(root,()=>b.close());
  await Promise.all([a,b].map(s=>s.configure({enabled:true,host:'127.0.0.1',port:0,discovery:false})));
  const [sa,sb]=await Promise.all([a.snapshot(),b.snapshot()]);
  await a.trust({identity:sb.identity,fingerprint:sb.identity.fingerprint,host:'127.0.0.1',port:sb.listener.port});
  await b.trust({identity:sa.identity,fingerprint:sa.identity.fingerprint,host:'127.0.0.1',port:sa.listener.port});
  await b.grant({appId:'com.example.headless',channel:'message.v1',peers:[sa.identity.nodeId],activation:true});
  const {endpoint:caller}=await a.openEndpoint({key:'sender',channels:['message.v1'],peers:[sb.identity.nodeId]});
  const material=await a.registerMaterial(caller,Readable.from([Buffer.from('admitted before drain')]),{name:'body.txt',mediaType:'text/plain'});
  const entered=Promise.withResolvers(),release=Promise.withResolvers(),putPart=b.store.putPart;
  b.store.putPart=async(...args)=>{entered.resolve();await release.promise;return putPart(...args);};
  const operation=await a.send(caller,{operationId:randomUUID(),to:{nodeId:sb.identity.nodeId,endpoint:{kind:'app',id:'com.example.headless'}},channel:'message.v1',payloadPartId:'body',parts:[{partId:'body',materialId:material.materialId}]});
  await entered.promise;b.pauseDispatch();await manager.quiesce();
  try{assert.equal((await manager.messageRoute('com.example.headless','message.v1')).enabled,true);}finally{release.resolve();}
  let result;for(let n=0;n<200;n++){result=await a.getOperation(caller,operation.operationId);if(['delivered','failed','unconfirmed'].includes(result.status))break;await new Promise(r=>setTimeout(r,25));}
  assert.equal(result.status,'delivered',JSON.stringify(result.error));assert.equal(b.runtimeStatus().receiving,0);
  assert.equal((await b.store.record(operation.messageId)).delivery.state,'pending');
});
