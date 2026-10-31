import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRuntimeMonitor} from '../src/services/runtime-monitor.js';
import {createProcessMetrics,parseDarwinProcesses,parseWindowsProcesses,cpuMilliseconds} from '../src/services/process-metrics.js';
import {createApplicationManager} from '../src/applications/manager.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
import {createAITaskService} from '../src/ai-tasks/service.js';
import {createWorkbenchTerminal} from '../src/services/workbench-terminal.js';

test('macOS and Windows process adapters preserve CPU time, bytes and process identities',()=>{
  assert.equal(cpuMilliseconds('1-02:03:04.50'),93784500);assert.equal(cpuMilliseconds('15:50.99'),950990);assert.equal(cpuMilliseconds('invalid'),null);
  assert.deepEqual(parseDarwinProcesses(' 12 1 02:03.40 2048 Thu Oct 29 20:40:00 2026\n'),[{pid:12,ppid:1,cpuMs:123400,memoryBytes:2097152,start:'Thu Oct 29 20:40:00 2026'}]);
  assert.deepEqual(parseWindowsProcesses('\ufeff[{"pid":12,"ppid":1,"cpuMs":150.5,"memoryBytes":2048,"start":"638000001"}]'),[{pid:12,ppid:1,cpuMs:150.5,memoryBytes:2048,start:'638000001'}]);
});
test('resource samples deduplicate descendants, override specific ownership, reset on PID reuse and expire history',async()=>{
  let at=100000,rows=[{pid:1,ppid:0,start:'host',cpuMs:100,memoryBytes:1024},{pid:2,ppid:1,start:'app',cpuMs:20,memoryBytes:2048},{pid:3,ppid:2,start:'worker',cpuMs:10,memoryBytes:512},{pid:9,ppid:0,start:'other',cpuMs:30,memoryBytes:9999}],reads=0;
  const metrics=createProcessMetrics({now:()=>at,read:async()=>{reads++;return rows;}}),owners=[{id:'service',pid:1,processStart:'host'},{id:'app',pid:2,processStart:'app'}];
  const first=await metrics.sample(owners);assert.equal(first.total.cpuPercent,null);assert.equal(first.total.memoryBytes,3584);assert.equal(first.processes.find(p=>p.pid===3).ownerId,'app');await metrics.sample(owners);assert.equal(reads,1);
  at+=2000;rows=rows.map(p=>({...p,cpuMs:p.cpuMs+1000}));assert.equal((await metrics.sample(owners)).total.cpuPercent,150);
  at+=2000;rows[1]={...rows[1],start:'reused',cpuMs:0};const replaced=await metrics.sample(owners);assert.equal(replaced.processes.find(p=>p.pid===2)?.ownerId,'service');assert.equal(replaced.processes.find(p=>p.pid===2)?.cpuPercent,null);
  at+=700000;const resumed=await metrics.sample(owners);assert.equal(resumed.history.length,1);assert.equal(resumed.total.cpuPercent,null);
});
function monitorFixture(overrides={}){
  const calls=[],app={id:'com.example.app',name:'应用',version:'1.0.0',enabled:true,lifecycle:'on-demand',state:'running',stopped:false,windows:1,restarts:0,monitorVersion:'app-v1',runtimes:[{id:'r1',pid:20,startedAt:'2026-10-29T00:00:00Z',reason:'window',calls:0,jobs:1}],holds:{},errors:[]};
  const applications={authorizeMonitor:async(id,permission)=>{calls.push(['auth',permission]);assert.equal(id,'lease');},monitorSnapshot:async()=>({applications:[app],tasks:[{id:'job:r1:j1',kind:'background',appId:app.id,name:'等待取消',status:'running',version:'1',startedAt:'2026-10-29T00:00:00Z',actions:['stop']}],terminals:[],errors:[]}),monitorCancelTask:async(...args)=>{calls.push(['cancel',...args]);return {state:'cancelling'};},runtimeManage:async input=>{calls.push(['app',input]);return {state:'stopped'};}};
  const service={status:async()=>({pid:1,state:'running'}),stop:async input=>{calls.push(['service-stop',input]);return {state:'stopping'};},logs:async()=>({log:'synthetic log'}),doctor:async()=>({health:'healthy',issues:[]})};
  const monitor=createRuntimeMonitor({applications,ai:{monitorSnapshot:async()=>({tasks:[],owners:[]})},conversations:{monitorSnapshot:async()=>({tasks:[]})},service,metrics:{sample:async()=>({at:'now',total:{cpuPercent:null,memoryBytes:100,processCount:1},processes:[],history:[]})},identity:{pid:1,processStart:'host'},...overrides});
  return {monitor,calls,app,applications};
}
const request={instanceId:'lease',operation:'act',kind:'task',id:'job:r1:j1',version:'1',action:'stop',operationId:'operation-1'};
test('monitor checks read/manage permission and deduplicates stop operations',async()=>{
  const f=monitorFixture();await f.monitor.perform({instanceId:'lease',operation:'snapshot'});await Promise.all([f.monitor.perform(request),f.monitor.perform(request)]);assert.equal(f.calls.filter(c=>c[0]==='cancel').length,1);assert.ok(f.calls.some(c=>c[1]==='runtime.read'));assert.ok(f.calls.some(c=>c[1]==='runtime.manage'));await assert.rejects(f.monitor.perform({...request,version:'2'}),{code:'MONITOR_OPERATION_CONFLICT'});
});
test('stale task versions never reach cancellation and service commands carry force separately',async()=>{
  const f=monitorFixture();await assert.rejects(f.monitor.perform({...request,version:'old'}),{code:'MONITOR_STALE'});assert.equal(f.calls.filter(c=>c[0]==='cancel').length,0);const snapshot=await f.monitor.snapshot();await f.monitor.perform({...request,kind:'service',id:'service',version:snapshot.service.version,force:true,operationId:'service-stop'});assert.deepEqual(f.calls.find(c=>c[0]==='service-stop')[1],{force:true});
});
test('slow/offline providers are isolated and never erase available application information',async()=>{
  let reject;const f=monitorFixture({conversations:{monitorSnapshot:()=>new Promise((_,r)=>{reject=r;})},metrics:{sample:async()=>{throw Object.assign(Error('采集不可用'),{code:'METRICS_READ_FAILED'});}}});
  const first=await f.monitor.snapshot();assert.equal(first.applications.length,1);assert.equal(first.resources.total.cpuPercent,null);assert.ok(first.issues.some(i=>i.code==='MONITOR_LOADING'));reject(Error('Desktop offline'));await new Promise(r=>setTimeout(r,0));const next=await f.monitor.snapshot();assert.ok(next.issues.some(i=>i.source==='conversations'));assert.equal(next.tasks[0].status,'running');
});
test('all active jobs are returned while completed history is bounded to 100',async()=>{
  const jobs=Array.from({length:250},(_,i)=>({id:'job:'+i,kind:'background',appId:'a',name:'job',status:i<120?'running':'succeeded',version:'1',actions:[]}));const f=monitorFixture({applications:{authorizeMonitor:async()=>{},monitorSnapshot:async()=>({applications:[],tasks:jobs,terminals:[]})}});const result=await f.monitor.snapshot();assert.equal(result.tasks.filter(t=>t.status==='running').length,120);assert.equal(result.tasks.length,220);
});
test('fresh monitor AI inspection does not initialize or dispatch AI service',async t=>{const root=await mkdtemp(join(tmpdir(),'ksf-monitor-fresh-'));t.after(()=>rm(root,{recursive:true,force:true}));const ai=createAITaskService(root);assert.deepEqual(await ai.monitorSnapshot(),{tasks:[],owners:[]});assert.deepEqual(await readdir(root),[]);await ai.close();});
async function application(t){
  const root=await mkdtemp(join(tmpdir(),'ksf-monitor-app-')),store=join(root,'store');await mkdir(store);const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',dataStores:[],id:'com.example.monitor-jobs',name:'受管任务',version:'1.0.0',description:'fixture',window:{entry:'frontend/index.js'},backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'},permissions:['runtime.read','runtime.manage']};
  const code=`import {setTimeout} from 'node:timers/promises';export function activate(ctx){return {call(method){if(method==='old')return ctx.tasks.run(()=>setTimeout(80,'old-result'));if(method==='named')return ctx.tasks.run(async signal=>{try{await setTimeout(15000,null,{signal});return 'done'}catch(e){return 'cancelled'}},{name:'可取消工作',cancellable:true});return {}}}}`;
  const files=Object.fromEntries(Object.entries({'frontend/index.js':'export function mount(){}','backend/index.mjs':code}).map(([name,text])=>{const b=Buffer.from(text);return [name,{content:b.toString('base64'),sha256:checksum(b),mode:0o644}];})),bytes=encodePackage(manifest,files),digest=checksum(bytes);
  await writeFile(join(store,'app.ksfapp'),bytes);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[{manifest,package:{url:'app.ksfapp',size:bytes.length,sha256:digest}}]}));
  const manager=createApplicationManager(root,{storeDirectory:store,defaultSource:null});t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});await manager.install({trusted:true,sourceId:'builtin',appId:manifest.id,version:manifest.version,digest});const lease=await manager.launch(manifest.id,digest);return {manager,lease,manifest};
}
test('real child preserves legacy tasks.run and cancels a named job cooperatively',async t=>{
  const f=await application(t);assert.equal(await f.manager.call(f.lease.id,'old'),'old-result');assert.equal((await f.manager.monitorSnapshot()).tasks[0].name,'应用后台任务');const pending=f.manager.call(f.lease.id,'named');let task;for(let i=0;i<100;i++){task=(await f.manager.monitorSnapshot()).tasks.find(t=>t.name==='可取消工作');if(task)break;await new Promise(r=>setTimeout(r,10));}assert.equal(task.cancellable,true);await f.manager.monitorCancelTask(task.id,task.version);assert.equal(await pending,'cancelled');const ended=(await f.manager.monitorSnapshot()).tasks.find(t=>t.id===task.id);assert.equal(ended.status,'cancelled');await assert.rejects(f.manager.monitorCancelTask(task.id,task.version),{code:'MONITOR_STALE'});
});
test('application lease and version gates reject unknown viewers and replaced application versions',async t=>{
  const f=await application(t);await assert.rejects(f.manager.authorizeMonitor('wrong','runtime.read'),{code:'APP_PROCESS_EXITED'});await assert.rejects(f.manager.authorizeMonitor(f.lease.id,'filesystem'),{code:'APP_PERMISSION_REQUIRED'});assert.equal((await f.manager.authorizeMonitor(f.lease.id,'runtime.read')).appId,f.manifest.id);await assert.rejects(f.manager.runtimeManage({action:'stop',appId:f.manifest.id,expectedVersion:'old'}),{code:'MONITOR_STALE'});
  await f.manager.runtimeManage({action:'stop',appId:f.manifest.id});await f.manager.startBackground();assert.equal((await f.manager.runtimeSnapshot()).applications[0].state,'stopped');
});
test('terminal monitoring lists only existing scopes and closes only the matched session identity',async()=>{
  let exit;let kills=0;const terminal=createWorkbenchTerminal(tmpdir(),{loadPTY:async()=>({spawn(){return {pid:99999999,onData(){},onExit(cb){exit=cb;},kill(){kills++;exit({exitCode:0});},write(){},resize(){}};}})}),caller={appId:'terminal',runtimeId:'r',instanceId:'w'};
  assert.deepEqual(await terminal.monitorSnapshot(),[]);await terminal.create(caller,{cols:80,rows:24});const [row]=await terminal.monitorSnapshot();assert.equal(row.appId,'terminal');await assert.rejects(terminal.monitorClose({monitorId:'wrong'}),{code:'MONITOR_STALE'});await terminal.monitorClose({monitorId:row.monitorId});assert.equal(kills,1);const ended=(await terminal.monitorSnapshot())[0];assert.equal(ended.stopped,true);assert.ok(ended.finishedAt);await assert.rejects(terminal.monitorClose({monitorId:row.monitorId}),{code:'MONITOR_STALE'});await terminal.dispose();
});
