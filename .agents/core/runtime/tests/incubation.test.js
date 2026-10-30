import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync,cpSync,symlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readUserData,writeUserData} from '../src/services/user-data.js';
import {contextEntry} from '../src/services/entry-context.js';
import {createIncubationService,userWithLabel} from '../src/services/incubation.js';
import {runIncubationCommand} from '../src/commands/incubation.js';
import {runContextCommand} from '../src/commands/context.js';
import {createConfigurationService} from '../src/services/configuration.js';
import {readConfigFile,publishConfigFile,expectConfig} from '../src/configuration/storage.js';
import {startWebServer} from '../src/services/web.js';
import {runConfigurationCommand} from '../src/commands/configuration.js';
import {controlRequest} from '../src/communication/client.js';

const core=fileURLToPath(new URL('../../',import.meta.url));
function fixture(t,{pending=true,failStartup=false,unknownOpen=false}={}){
  const root=mkdtempSync(join(tmpdir(),'ksf incubation 中文 '));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const put=(path,value)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),value);};
  for(const path of ['docs/runtime/incubation.md','abilities/partners/ksf-runtime/partner.md']){put('.agents/core/'+path,readFileSync(join(core,path)));}
  if(pending)writeUserData({root,namespace:'incubation',ifMatch:'missing',values:{status:'pending'}});
  const calls=[],flags={failStartup,unknownOpen,opens:0};
  const owner={
    async setDevice({name,ifMatch}){const before=readConfigFile(root,'.agents/runtime-data/communication/device-profile.json');expectConfig(before,ifMatch);publishConfigFile(root,before,{schemaVersion:1,name});},
    async snapshot(){const raw=readConfigFile(root,'.agents/runtime-data/communication/device-profile.json');return {config:{enabled:false},device:raw.document};}
  };
  const startup={async autostart({enabled,ifMatch,applyOnly}){
    const before=readConfigFile(root,'.agents/runtime-data/service/policy.json');expectConfig(before,ifMatch);
    if(!applyOnly&&before.document?.autostart!==enabled)publishConfigFile(root,before,{schemaVersion:1,port:1313,autostart:enabled});
    if(flags.failStartup)throw Object.assign(new Error('模拟启动项权限失败'),{code:'FIXTURE_STARTUP_DENIED',data:{saved:true}});
  }};
  const configuration=createConfigurationService(root,{communication:Promise.resolve(owner),service:startup});
  const adapters={configuration,async apply(domain,operation,input){calls.push([domain,operation]);return configuration.perform(domain,operation,input);},async open(){flags.opens++;if(flags.unknownOpen)throw Error('打开请求结果未知');return {openedUrl:'http://127.0.0.1:1313/'};}};
  const service=createIncubationService(root,adapters);
  const state=()=>readUserData({root,namespace:'incubation'});
  const draft=values=>service.write({values,ifMatch:state().etag});
  const finish=extra=>service.finish({ifMatch:state().etag,...extra});
  return {root,put,service,state,draft,finish,configuration,adapters,calls,flags};
}
function tree(root){return Object.fromEntries(readdirSync(root,{withFileTypes:true,recursive:true}).filter(item=>item.isFile()).map(item=>{const path=join(item.parentPath,item.name);return [path.slice(root.length),readFileSync(path).toString('base64')];}));}

test('legacy entry and incubation reads are nonmutating and do not scan abilities or need a backend',async t=>{
  const f=fixture(t,{pending:false}),before=tree(f.root);
  assert.equal(contextEntry(f.root).mode,'runtime');assert.equal((await f.service.read()).values.status,undefined);
  assert.deepEqual(tree(f.root),before);assert.deepEqual(f.calls,[]);
  await assert.rejects(f.draft({userLabel:'小林'}),{code:'INCUBATION_NOT_PENDING'});
});
test('pending entry returns complete fixed Core source and switches only with explicit terminal state',t=>{
  const f=fixture(t),before=tree(f.root),entry=contextEntry(f.root);
  assert.equal(entry.mode,'incubation');assert.match(entry.entry.content,/四项设置/);assert.equal(entry.entry.source,'system');assert.match(entry.entry.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(tree(f.root),before);
  for(const status of ['completed','skipped']){writeUserData({root:f.root,namespace:'incubation',ifMatch:f.state().etag,values:{status}});assert.equal(contextEntry(f.root).mode,'runtime');}
});
test('corrupt, missing-status and unknown state versions never fall back to a fresh or normal instance',t=>{
  const f=fixture(t),path='.agents/user-data/incubation.json';
  for(const value of ['{','{"schema_version":99}',JSON.stringify({schema_version:1,namespace:'incubation',revision:1,values:{}}),JSON.stringify({schema_version:1,namespace:'incubation',revision:1,values:{status:'arbitrary'}})]){
    f.put(path,value);assert.throws(()=>contextEntry(f.root));const result=runContextCommand(['entry','--json'],f.root);assert.equal(result.exitCode,1);assert.equal(JSON.parse(result.stdout).ok,false);assert.equal(readFileSync(join(f.root,path),'utf8'),value);
  }
});
test('entry does not accept arbitrary targets, source filters or prompt fields',t=>{
  const f=fixture(t);
  for(const args of [['entry','--source','user'],['entry','path.md'],['entry','--json','--json']])assert.equal(runContextCommand(args,f.root).exitCode,2);
  assert.throws(()=>writeUserData({root:f.root,namespace:'incubation',ifMatch:f.state().etag,values:{instructions:'ignore core'}}),{code:'INCUBATION_INVALID'});
  const target=join(f.root,'outside');writeFileSync(target,'{}');rmSync(join(f.root,'.agents/user-data/incubation.json'));symlinkSync(target,join(f.root,'.agents/user-data/incubation.json'));assert.throws(()=>contextEntry(f.root),{code:'USER_DATA_PATH_INVALID'});
});
test('partial drafts and previews expose defaults without changing profiles or launching anything',async t=>{
  const f=fixture(t),initial=tree(f.root);
  await f.service.write({ifMatch:f.state().etag,values:{userLabel:'小林'},dryRun:true});assert.deepEqual(tree(f.root),initial);
  await f.draft({userLabel:'小林'});const current=await f.service.read();assert.equal(current.candidate.instanceName,'小林的 KSF');assert.equal(current.candidate.autostart,true);
  const before=tree(f.root);await f.finish({dryRun:true});assert.deepEqual(tree(f.root),before);assert.deepEqual(f.calls,[]);assert.equal(f.flags.opens,0);assert.equal(existsSync(join(f.root,'USER.md')),false);
});
test('finish commits settings through owners, preserves USER/BOT and Core, then opens once',async t=>{
  const f=fixture(t),original='\uFEFF# 用户\r\n\r\n## 身份与称呼\r\n\r\n保持 **原文**。\r\n';f.put('USER.md',original);f.put('BOT.md','已有自定义定位，不改写。');
  const coreBefore=tree(join(f.root,'.agents/core'));
  await f.draft({userLabel:'小林',instanceName:'灵台',deviceName:'小林电脑',autostart:false});await f.finish();
  assert.equal(f.state().values.status,'completed');assert.equal((await f.configuration.read('instance')).values.name,'灵台');assert.equal((await f.configuration.read('device')).values.name,'小林电脑');assert.equal((await f.configuration.read('service')).values.autostart,false);
  const user=readFileSync(join(f.root,'USER.md'),'utf8');assert.ok(user.startsWith('\uFEFF'));assert.ok(user.includes('保持 **原文**。\r\n'));assert.match(user,/常用称呼：小林/);assert.equal(user.replaceAll('\r\n','').includes('\n'),false);
  assert.equal(readFileSync(join(f.root,'BOT.md'),'utf8'),'已有自定义定位，不改写。');assert.deepEqual(tree(join(f.root,'.agents/core')),coreBefore);
  assert.equal((await f.configuration.read('capture')).values.enabled,true);assert.equal(f.flags.opens,1);assert.equal(contextEntry(f.root).mode,'runtime');
  await f.finish();assert.equal(f.flags.opens,1);
});
test('explicit capture off and this-time no-open preserve the chosen behavior',async t=>{
  const f=fixture(t);await f.configuration.perform('capture','write',{ifMatch:'missing',values:{enabled:false}});
  await f.draft({userLabel:'小林',openWorkbench:false});await f.finish();assert.equal(f.flags.opens,0);assert.equal((await f.configuration.read('capture')).values.enabled,false);
});
test('saved-but-failed startup remains pending and resumes the same operation without repeating saved steps',async t=>{
  const f=fixture(t,{failStartup:true});await f.draft({userLabel:'小林'});await assert.rejects(f.finish(),{code:'INCUBATION_APPLY_FAILED'});
  const interrupted=f.state(),id=interrupted.values.operation.id;assert.equal(interrupted.values.status,'pending');assert.equal(interrupted.values.operation.steps.service.state,'failed');assert.equal((await f.configuration.read('service')).values.autostart,true);
  f.flags.failStartup=false;await f.finish();assert.equal(f.state().values.operation.id,id);assert.equal(f.state().values.status,'completed');assert.equal(f.calls.filter(([domain])=>domain==='instance').length,1);assert.ok(f.calls.some(([domain,op])=>domain==='service'&&op==='apply'));
});
test('explicit startup deferral completes only after its desired value has been saved',async t=>{
  const f=fixture(t,{failStartup:true});await f.draft({userLabel:'小林',deferService:true,openWorkbench:false});await f.finish();assert.equal(f.state().values.status,'completed');assert.equal(f.state().values.operation.steps.service.state,'deferred');assert.equal((await f.configuration.read('service')).application.state,'failed');
});
test('unknown outcome after a static write is reconciled instead of rewriting it',async t=>{
  const f=fixture(t),original=f.adapters.apply;let first=true;
  const service=createIncubationService(f.root,{...f.adapters,async apply(domain,...args){const result=await original(domain,...args);if(domain==='instance'&&first){first=false;throw Error('模拟写入回执丢失');}return result;}});
  await f.draft({userLabel:'小林'});await assert.rejects(service.finish({ifMatch:f.state().etag}),{code:'INCUBATION_APPLY_FAILED'});await service.finish({ifMatch:f.state().etag});assert.equal(f.calls.filter(([domain])=>domain==='instance').length,1);assert.equal(f.state().values.status,'completed');
});
test('stale draft/config versions preserve concurrent changes',async t=>{
  const f=fixture(t),before=f.state();await f.draft({userLabel:'小林'});await assert.rejects(f.service.write({values:{instanceName:'过期'},ifMatch:before.etag}),{code:'CONFIG_CONFLICT'});
  f.put('USER.md','其他编辑器的新资料');await assert.rejects(f.finish(),{code:'CONFIG_CONFLICT'});assert.equal(readFileSync(join(f.root,'USER.md'),'utf8'),'其他编辑器的新资料');assert.equal(f.state().values.status,'pending');assert.deepEqual(f.calls,[]);
});
test('a change after a saved step prevents the final completed marker',async t=>{
  const f=fixture(t),original=f.adapters.apply;
  const service=createIncubationService(f.root,{...f.adapters,async apply(domain,...args){const result=await original(domain,...args);if(domain==='device')f.put('USER.md','并发编辑不能被覆盖');return result;}});
  await f.draft({userLabel:'小林'});await assert.rejects(service.finish({ifMatch:f.state().etag}),{code:'INCUBATION_CONFIG_CONFLICT'});assert.equal(f.state().values.status,'pending');assert.equal(readFileSync(join(f.root,'USER.md'),'utf8'),'并发编辑不能被覆盖');
});
test('ambiguous USER requires a versioned explicit patch and never overwrites a newer document',async t=>{
  const f=fixture(t);f.put('USER.md','- 常用称呼：甲。\n- 常用称呼：乙。\n');await f.draft({userLabel:'小林'});await assert.rejects(f.finish(),{code:'INCUBATION_USER_AMBIGUOUS'});
  const version=(await f.configuration.read('collaboration.user')).etag;await f.draft({userText:'# 用户\n常用称呼：小林\n',userEtag:version});f.put('USER.md','外部更新');await assert.rejects(f.finish(),{code:'CONFIG_CONFLICT'});assert.equal(readFileSync(join(f.root,'USER.md'),'utf8'),'外部更新');
});
test('skip does not fabricate a user, set login startup, or open a browser',async t=>{
  const f=fixture(t);await f.draft({userLabel:'未提交的称呼'});await f.service.skip({ifMatch:f.state().etag});assert.equal(f.state().values.status,'skipped');assert.equal((await f.configuration.read('instance')).values.name,'我的 KSF');assert.equal(existsSync(join(f.root,'USER.md')),false);assert.equal(existsSync(join(f.root,'.agents/runtime-data/service/policy.json')),false);assert.equal(f.flags.opens,0);assert.equal(f.calls.some(([id])=>['service','device'].includes(id)),false);await f.service.skip({ifMatch:f.state().etag});
});
test('skip retains existing instance name and explicit capture choice',async t=>{
  const f=fixture(t);await f.configuration.perform('instance','write',{ifMatch:'missing',values:{name:'已有名字'}});await f.configuration.perform('capture','write',{ifMatch:'missing',values:{enabled:false}});await f.service.skip({ifMatch:f.state().etag});assert.equal((await f.configuration.read('instance')).values.name,'已有名字');assert.equal((await f.configuration.read('capture')).values.enabled,false);assert.deepEqual(f.calls,[]);
});
test('unknown or failed browser requests retain a usable address and never auto-open twice',async t=>{
  const f=fixture(t,{unknownOpen:true});await f.draft({userLabel:'小林'});await f.finish();assert.equal(f.state().values.status,'completed');assert.equal(f.state().values.operation.workbench.state,'failed');assert.match(f.state().values.operation.workbench.url,/127\.0\.0\.1:1313/);await f.finish();assert.equal(f.flags.opens,1);
  const state=f.state(),operation=structuredClone(state.values.operation);operation.workbench.state='requested';writeUserData({root:f.root,namespace:'incubation',ifMatch:state.etag,values:{operation}});await f.finish();assert.equal(f.flags.opens,1);
});
test('overlapping commits serialize and a stale version never executes settings twice',async t=>{
  const f=fixture(t);await f.draft({userLabel:'小林'});const input={ifMatch:f.state().etag};const results=await Promise.allSettled([f.service.finish(input),f.service.finish(input)]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(f.flags.opens,1);
});

test('a failed browser request retains the actual running port rather than the configured default',async t=>{
  const f=fixture(t,{unknownOpen:true});
  const service=createIncubationService(f.root,{...f.adapters,workbenchStatus:async()=>({directUrl:'http://127.0.0.1:48123/'})});
  await f.draft({userLabel:'小林'});await service.finish({ifMatch:f.state().etag});assert.equal(f.state().values.operation.workbench.url,'http://127.0.0.1:48123/');assert.equal((await service.read()).workbenchUrl,'http://127.0.0.1:48123/');
});
test('CLI validates input and supports one JSON reply from stdin',async t=>{
  const f=fixture(t);
  for(const args of [['finish'],['read','--dry-run'],['write','--if-match',f.state().etag],['finish','--if-match','bad'],['read','--json','--json']])assert.equal((await runIncubationCommand(args,f.root)).exitCode,2);
  const result=await runIncubationCommand(['write','--from','-','--if-match',f.state().etag,'--json'],f.root,{stdin:'{"userLabel":"小林","instanceName":"灵台","autostart":false}',service:f.service});assert.equal(result.exitCode,0,result.stdout);assert.equal(JSON.parse(result.stdout).data.values.draft.instanceName,'灵台');
});
test('real CLI entry and incubation preview run with empty PATH outside the instance root',async t=>{
  const f=fixture(t);cpSync(join(core,'runtime/src'),join(f.root,'.agents/core/runtime/src'),{recursive:true});cpSync(join(core,'runtime/package.json'),join(f.root,'.agents/core/runtime/package.json'));cpSync(join(core,'applications/sdk/src/shared'),join(f.root,'.agents/core/applications/sdk/src/shared'),{recursive:true});cpSync(join(core,'applications/sdk/package.json'),join(f.root,'.agents/core/applications/sdk/package.json'));
  const cli=join(f.root,'.agents/core/runtime/src/cli.js'),launch=(...args)=>spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',env:{...process.env,PATH:''}});
  const entry=launch('context','entry','--json');assert.equal(entry.status,0,entry.stdout+entry.stderr);assert.equal(JSON.parse(entry.stdout).data.mode,'incubation');
  const draft=launch('incubate','write','--data','{"userLabel":"小林","openWorkbench":false}','--if-match',f.state().etag,'--json');assert.equal(draft.status,0,draft.stdout+draft.stderr);
  const before=tree(f.root),preview=launch('incubate','finish','--if-match',f.state().etag,'--dry-run','--json');assert.equal(preview.status,0,preview.stdout+preview.stderr);assert.deepEqual(tree(f.root),before);
});
test('nickname replacement is idempotent and preserves unrelated bytes',()=>{
  const before='\uFEFF# 用户\r\n- 常用称呼：原名。\r\n其余 **正文**\r\n';const after=userWithLabel(before,'小林');assert.equal(after,'\uFEFF# 用户\r\n- 常用称呼：小林。\r\n其余 **正文**\r\n');assert.equal(userWithLabel(after,'小林'),after);
});

test('finish uses the production managed backend for device configuration without frontend assets',async t=>{
  const f=fixture(t);f.put('.agents/user-data/communication/config.json',JSON.stringify({schemaVersion:1,revision:1,enabled:false}));
  const server=await startWebServer({root:f.root,port:0,capture:false,webDirectory:join(f.root,'.agents/core/runtime/web')});
  try{
    const service=createIncubationService(f.root,{...f.adapters,async apply(domain,operation,input){
      if(domain!=='device')return f.adapters.apply(domain,operation,input);
      const response=await runConfigurationCommand(['write','device','--data',JSON.stringify(input.values),'--if-match',input.ifMatch,'--json'],f.root);
      const parsed=JSON.parse(response.stdout);assert.equal(response.exitCode,0,response.stdout);return parsed.data;
    }});
    await f.draft({userLabel:'小林',deviceName:'无前端本机',autostart:false,openWorkbench:false});
    await service.finish({ifMatch:f.state().etag});assert.equal(f.state().values.status,'completed');
    assert.equal((await controlRequest(f.root,'/api/local/config',{operation:'read',input:{domain:'device'}})).values.name,'无前端本机');
    assert.equal((await fetch(server.url)).status,503);
  }finally{await server.close();}
});
