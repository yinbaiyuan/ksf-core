import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplicationManager} from './helpers/application-catalog.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
const uiRuntime=undefined;
function release(id,shared,backend=false){
  const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:shared?'0.6.0':'0.5.7',id,name:'UI contract fixture',description:'Isolated test',version:'1.0.0',permissions:[],dataStores:[],window:{entry:'frontend/index.js'},};
  if(backend)manifest.backend={runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'};
  const data=Buffer.from('export function mount(root){root.textContent="fixture"}'),files={'frontend/index.js':{content:data.toString('base64'),sha256:checksum(data),mode:420}};
  if(backend){const source=Buffer.from('export function activate(){return {call(method,input){return {method,input,alive:true}}}}');files['backend/index.mjs']={content:source.toString('base64'),sha256:checksum(source),mode:420};}
  const bytes=encodePackage(manifest,files);
  return {bytes,entry:{manifest,package:{url:id+'.ksfapp',size:bytes.length,sha256:checksum(bytes)}}};
}
test('ordinary applications install and launch without any host component runtime',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-open-install-')),store=join(root,'store');await mkdir(store);
 const modern=release('com.example.bundled',true),legacy=release('com.example.legacy',false);
 for(const item of [modern,legacy])await writeFile(join(store,item.entry.package.url),item.bytes);
 await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[modern.entry,legacy.entry]}));
 const manager=createApplicationManager(root,{defaultSource:null,storeDirectory:store,coreVersion:'0.6.0'});
 t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
 for(const item of [modern,legacy]){
  await manager.install({trusted:true,sourceId:'builtin',appId:item.entry.manifest.id,version:'1.0.0',digest:item.entry.package.sha256});
  const instance=await manager.launch(item.entry.manifest.id,item.entry.package.sha256);await manager.release(instance.id);
  assert.equal((await manager.asset(item.entry.manifest.id,item.entry.package.sha256,'frontend/index.js')).bytes.toString(),'export function mount(root){root.textContent="fixture"}');
 }
 assert.equal((await manager.snapshot()).installed.length,2);
});
test('an ordinary application backend remains callable without any component runtime',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ksf-ui-headless-')),store=join(root,'store');await mkdir(store);
  const item=release('com.example.headless',true,true);await writeFile(join(store,item.entry.package.url),item.bytes);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[item.entry]}));
  let current=uiRuntime;const manager=createApplicationManager(root,{defaultSource:null,storeDirectory:store,coreVersion:'0.6.0',uiRuntime:()=>current});
  t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
  await manager.install({trusted:true,sourceId:'builtin',appId:item.entry.manifest.id,version:'1.0.0',digest:item.entry.package.sha256});
  current=undefined;
  const instance=await manager.launch(item.entry.manifest.id,item.entry.package.sha256,{kind:'window'});await manager.release(instance.id);
  assert.deepEqual(await manager.invoke(item.entry.manifest.id,'ping',{originalRequest:'kept'}),{method:'ping',input:{originalRequest:'kept'},alive:true});
  assert.equal((await manager.snapshot()).installed[0].active.digest,item.entry.package.sha256);
});
