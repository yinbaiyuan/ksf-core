import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplicationManager} from '../src/applications/manager.js';

const fixed={id:'ksf-apps',name:'KSF 公共应用源',url:'https://yinbaiyuan.github.io/ksf-apps/index.json',enabled:true,locked:true,default:true};
async function fixture(t,state){
  const root=await mkdtemp(join(tmpdir(),'ksf-fixed-source-')),store=join(root,'store');await mkdir(store);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[]}));
  if(state){await mkdir(join(root,'.agents/user-data/applications'),{recursive:true});await writeFile(join(root,'.agents/user-data/applications/state.json'),JSON.stringify(state));}
  const manager=createApplicationManager(root,{storeDirectory:store,fetcher:async()=>new Response(JSON.stringify({protocol:'ksf-app-registry-v1',apps:[]}))});
  t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});return{manager,root};
}
test('fresh and existing workspaces always expose the canonical locked public source',async t=>{
  const legacy={schemaVersion:1,revision:8,defaults:['conversations','markdown','git'],installed:{},sources:[{id:'builtin',name:'KSF 默认应用源',url:'builtin:',enabled:false},{id:'a'.repeat(36),name:'Team',url:'https://team.invalid/index.json',enabled:false}]};
  for(const state of [undefined,legacy,{...legacy,sources:[{...fixed,url:'https://evil.invalid/index.json',enabled:false,locked:false},...legacy.sources]}]){
    const {manager}=await fixture(t,state),snapshot=await manager.snapshot();assert.deepEqual(snapshot.sources[0],fixed);assert.equal(snapshot.sources.filter(s=>s.id===fixed.id).length,1);
    if(state){assert.equal(snapshot.sources.find(s=>s.id==='builtin').enabled,false);assert.equal(snapshot.sources.find(s=>s.name==='Team').enabled,false);}
  }
});
test('source writes and removals enforce the policy and retain normal source management',async t=>{
  const {manager,root}=await fixture(t);for(const input of [{...fixed,enabled:false},{...fixed,name:'Changed'},{...fixed,url:'https://evil.invalid/index.json'},{id:fixed.id}])await assert.rejects(manager.saveSource(input),{code:'APP_SOURCE_LOCKED'});
  await assert.rejects(manager.removeSource(fixed.id),{code:'APP_SOURCE_LOCKED'});
  await assert.rejects(manager.saveSource({name:'Alias',url:fixed.url,enabled:true}),{code:'APP_SOURCE_INVALID'});
  const source=await manager.saveSource({name:'Team',url:'https://team.invalid/index.json',enabled:true,locked:true,default:true});assert.equal(source.locked,undefined);assert.equal(source.default,undefined);
  await manager.saveSource({...source,enabled:false});await manager.removeSource(source.id);
  await manager.saveSource({id:'builtin',name:'随附应用',enabled:false});const snapshot=await manager.snapshot();assert.deepEqual(snapshot.sources[0],fixed);assert.equal(snapshot.sources.find(s=>s.id==='builtin').enabled,false);
  const stored=JSON.parse(await readFile(join(root,'.agents/user-data/applications/state.json'),'utf8'));assert.deepEqual(stored.sources[0],fixed);
});
test('a failed public registry leaves the bundled catalog and installed state available',async t=>{
  const {manager,root}=await fixture(t);await manager.close();const offline=createApplicationManager(root,{storeDirectory:join(root,'store'),fetcher:async()=>{throw Error('offline');}});t.after(()=>offline.close());
  const catalog=await offline.catalog();assert.equal(catalog.errors.length,1);assert.equal(catalog.errors[0].sourceId,fixed.id);assert.equal((await offline.snapshot()).sources[0].enabled,true);
});


test('default source wins equal versions while installed apps retain their origin',async()=>{
  const {groupStoreApplications}=await import('../src/applications/protocol.js');
  const manifest={id:'example.equal',version:'1.10.0',name:'Equal'},builtin={id:'builtin',enabled:true},team={id:'team',enabled:true};
  const entries=[builtin,team,fixed].map(source=>({manifest,source,incompatibility:null})),sources=[fixed,builtin,team];
  assert.equal(groupStoreApplications(entries,sources)[0].candidate.source.id,fixed.id);
  assert.equal(groupStoreApplications(entries,sources,{'example.equal':{active:{manifest,source:team}}})[0].candidate.source.id,team.id);
});
test('HTTP refuses to change or remove the fixed source without restarting',async t=>{
  const {startWebServer}=await import('../src/services/web.js'),f=await fixture(t),server=await startWebServer({root:f.root,port:0,capture:false,applications:{storeDirectory:join(f.root,'store'),fetcher:async()=>new Response(JSON.stringify({protocol:'ksf-app-registry-v1',apps:[]}))}});t.after(()=>server.close());
  const base=server.url.slice(0,-1),session=(await(await fetch(base+'/api/workbench/session')).json()).data,started=(await(await fetch(base+'/api/health')).json()).startedAt;
  for(const [path,input] of [['/api/apps/source',{...fixed,enabled:false}],['/api/apps/source/remove',{id:fixed.id}]]){
    const response=await fetch(base+path,{method:'POST',headers:{Origin:base,'X-KSF-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(response.status,403);assert.equal((await response.json()).error.code,'APP_SOURCE_LOCKED');
  }
  assert.deepEqual((await(await fetch(base+'/api/apps/installed')).json()).data.sources[0],fixed);assert.equal((await(await fetch(base+'/api/health')).json()).startedAt,started);
});
