import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplicationManager } from '../src/applications/manager.js';
import { encodePackage, checksum } from '../src/applications/protocol.js';
const file=text=>{const bytes=Buffer.from(text);return{content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};};
test('only declared v2 applications receive the Codex conversation bridge; caller identity comes from the host',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ksf-codex-bridge-')),store=join(root,'store');await mkdir(store);t.after(()=>rm(root,{recursive:true,force:true}));
  const seen=[];
  const apps=await Promise.all([false,true].map(async allowed=>{
    const manifest={schemaVersion:2,sdkVersion:2,id:'example.'+(allowed?'allowed':'denied'),version:'1.0.0',name:'Synthetic',description:'Synthetic bridge test',permissions:allowed?['codex-conversations']:[],window:{entry:'frontend/index.js'},backend:{runtime:'node',entry:'backend/index.mjs'}};
    const bytes=encodePackage(manifest,{'frontend/index.js':file('export function mount(){}'),'backend/index.mjs':file("export function activate(ctx){return{call(method,params){return ctx.services.call('codex-conversations',method,[params])}}}")});
    const entry={manifest,package:{url:manifest.id+'.ksfapp',sha256:checksum(bytes),size:bytes.length}};await writeFile(join(store,entry.package.url),bytes);return entry;
  }));
  await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps}));
  const manager=createApplicationManager(root,{storeDirectory:store,services:{'codex-conversations':{check(caller,params){seen.push(caller);return{appId:caller.appId,argument:params.appId};}}}});t.after(()=>manager.close());
  for(const entry of apps){await manager.install({trusted:true,sourceId:'builtin',appId:entry.manifest.id,version:'1.0.0',digest:entry.package.sha256});const instance=await manager.launch(entry.manifest.id,entry.package.sha256);if(entry.manifest.permissions.length){const result=await manager.call(instance.id,'check',{appId:'forged.identity'});assert.equal(result.appId,'example.allowed');assert.equal(result.argument,'forged.identity');}else await assert.rejects(manager.call(instance.id,'check',{}),{code:'APP_PERMISSION_REQUIRED'});await manager.release(instance.id);}
  assert.equal(seen.length,1);assert.equal(seen[0].version,'1.0.0');assert.match(seen[0].releaseDigest,/^[a-f0-9]{64}$/);
});
