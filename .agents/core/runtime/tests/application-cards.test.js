import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApplicationManager } from '../src/applications/manager.js';
import { encodePackage, decodePackage, checksum, validateManifest } from '../src/applications/protocol.js';
const file=text=>{const bytes=Buffer.from(text);return {content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};};
function release(version='1.0.0',window=false,permissions=[]){
  const card=id=>({id,name:id,description:'test card',entry:'frontend/main.js',defaultSize:{w:2,h:2},minSize:{w:1,h:1}});
  const manifest={schemaVersion:1,minCoreVersion:'0.3.0',dataStores:[],sdkVersion:1,id:'com.example.cards',name:'Card fixture',description:'Two independent card types',version,cards:[card('summary'),card('detail')],...(window?{window:{entry:'frontend/main.js'}}:{}),backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/main.mjs'},permissions};
  const bytes=encodePackage(manifest,{'frontend/main.js':file('export function mount(){}'),'backend/main.mjs':file(`export function activate(ctx){let calls=0;return {async call(method,input,caller){if(method==='payload')return input.text.length;if(method==='error')throw Object.assign(new Error('conflict'),{code:'CONFLICT',status:409,data:{disk:{text:'original'}}});if(method==='job'){void ctx.tasks.run(async()=>{const fs=await import('node:fs/promises');if(input.gated){while(!await fs.stat(ctx.dataDirectory+'/finish-job').catch(()=>null))await new Promise(r=>setTimeout(r,5));}else await new Promise(r=>setTimeout(r,input.delay));await fs.writeFile(ctx.dataDirectory+'/done',ctx.version);});return true;}return {pid:process.pid,version:ctx.version,calls:++calls,caller,environment:process.env.KSF_TEST_APP_ENV??null};}}}`)});
  return {bytes,entry:{manifest,package:{url:`cards-${version}.ksfapp`,size:bytes.length,sha256:checksum(bytes)}}};
}
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'ksf-cards-')),store=join(root,'store');await mkdir(store);const manager=createApplicationManager(root, { defaultSource: null, storeDirectory:store});t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});return {root,store,manager,async publish(...releases){for(const value of releases)await writeFile(join(store,value.entry.package.url),value.bytes);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:releases.map(r=>r.entry)}));},install:r=>manager.install({appId:r.entry.manifest.id,version:r.entry.manifest.version,digest:r.entry.package.sha256,sourceId:'builtin',trusted:true})};}
test('v2 allows card-only apps, verifies every card entry and rejects ambiguous definitions',()=>{
  const one=release();assert.equal(decodePackage(one.bytes).manifest.cards.length,2);
  assert.doesNotThrow(()=>validateManifest({...one.entry.manifest,cards:[]}));
  assert.throws(()=>validateManifest({...one.entry.manifest,cards:[one.entry.manifest.cards[0],one.entry.manifest.cards[0]]}),/卡片/);
  assert.throws(()=>decodePackage(encodePackage({...one.entry.manifest,cards:[{...one.entry.manifest.cards[0],entry:'frontend/missing.js'}]},{'frontend/main.js':file('x'),'backend/main.mjs':file('x')})),/缺少入口/);
});
test('multiple card types and instances share one v2 runtime while preserving caller identity and structured errors',async t=>{
  const f=await fixture(t),one=release();await f.publish(one);await f.install(one);
  await assert.rejects(f.manager.launch('com.example.cards',one.entry.package.sha256),{code:'APP_WINDOW_UNAVAILABLE'});
  const launch=cardId=>f.manager.launch('com.example.cards',one.entry.package.sha256,{kind:'card',cardId});
  const a=await launch('summary'),b=await launch('summary'),c=await launch('detail');
  const values=await Promise.all([a,b,c].map(value=>f.manager.call(value.id,'read')));
  assert.equal(new Set(values.map(value=>value.pid)).size,1);assert.deepEqual(values.map(value=>value.caller.cardId),['summary','summary','detail']);assert.equal(new Set(values.map(value=>value.caller.instanceId)).size,3);
  await assert.rejects(f.manager.call(a.id,'error'),error=>error.code==='CONFLICT'&&error.status===409&&error.data.disk.text==='original');
  await f.manager.release(a.id);assert.equal((await f.manager.call(b.id,'read')).pid,values[0].pid);
  await f.manager.release(b.id);await f.manager.release(c.id);assert.equal((await f.manager.snapshot()).instances.length,0);
  const next=await launch('detail');assert.notEqual((await f.manager.call(next.id,'read')).pid,values[0].pid);
});
test('persistent cards do not block upgrades; old windows pin the release until closed',async t=>{
  const f=await fixture(t),one=release('1.0.0',true),two=release('1.1.0',true);await f.publish(one);await f.install(one);await f.publish(one,two);
  const window=await f.manager.launch('com.example.cards',one.entry.package.sha256),card=await f.manager.launch('com.example.cards',one.entry.package.sha256,{kind:'card',cardId:'summary'});
  assert.equal((await f.install(two)).pending,true);assert.equal((await f.manager.snapshot()).installed[0].active.manifest.version,'1.0.0');
  await f.manager.release(window.id);const after=await f.manager.snapshot();assert.equal(after.installed[0].active.manifest.version,'1.1.0');assert.equal(after.instances.length,0);await assert.rejects(f.manager.call(card.id,'read'),{code:'APP_PROCESS_EXITED'});
  const next=await f.manager.launch('com.example.cards',two.entry.package.sha256,{kind:'card',cardId:'detail'});await f.manager.changeApp('com.example.cards','disable');await assert.rejects(f.manager.call(next.id,'read'),{code:'APP_PROCESS_EXITED'});
  await f.manager.changeApp('com.example.cards','enable');await f.manager.changeApp('com.example.cards','uninstall');assert.equal((await f.manager.snapshot()).installed.length,0);
});
test('in-flight jobs outlive their last surface and block changes until completion',async t=>{
  const f=await fixture(t),one=release();await f.publish(one);await f.install(one);
  const a=await f.manager.launch('com.example.cards',one.entry.package.sha256,{kind:'card',cardId:'summary'});
  await f.manager.call(a.id,'job',{delay:150});await f.manager.release(a.id);
  await assert.rejects(f.manager.changeApp('com.example.cards','uninstall',true),{code:'APP_BUSY'});
  await new Promise(resolve=>setTimeout(resolve,250));assert.equal(await readFile(join(f.root,'.agents/user-data/applications/data/com.example.cards/done'),'utf8'),'1.0.0');
  await f.manager.changeApp('com.example.cards','uninstall');
});

test('upgrading a background job without remaining card leases still waits for its pinned release',async t=>{
  const f=await fixture(t),one=release(),two=release('1.1.0');await f.publish(one);await f.install(one);await f.publish(one,two);
  const a=await f.manager.launch('com.example.cards',one.entry.package.sha256,{kind:'card',cardId:'summary'});await f.manager.call(a.id,'job',{gated:true});await f.manager.release(a.id);
  assert.equal((await f.install(two)).pending,true);assert.equal((await f.manager.snapshot()).installed[0].active.manifest.version,'1.0.0');
  // Release the retained job explicitly; filesystem load must not decide whether
  // this assertion observes a running or already-completed operation.
  await writeFile(join(f.root,'.agents/user-data/applications/data/com.example.cards/finish-job'),'go');
  const deadline=Date.now()+3000;let version;do{version=(await f.manager.snapshot()).installed[0].active.manifest.version;if(version==='1.1.0')break;await new Promise(resolve=>setTimeout(resolve,10));}while(Date.now()<deadline);assert.equal(version,'1.1.0');
});

test('trusted legacy HTTP adapters keep large document/Git payloads while public application calls remain bounded',async t=>{
  const f=await fixture(t),one=release();await f.publish(one);await f.install(one);
  const text='文'.repeat(800000);
  assert.equal(await f.manager.invoke('com.example.cards','payload',{text}),text.length);
  const a=await f.manager.launch('com.example.cards',one.entry.package.sha256,{kind:'card',cardId:'summary'});
  await assert.rejects(f.manager.call(a.id,'payload',{text}),{code:'APP_CALL_INVALID'});
});
test('bundled defaults install once and respect disable/uninstall across manager restarts',async t=>{
  const f=await fixture(t),sample=release();const decoded=decodePackage(sample.bytes),manifest={...decoded.manifest,id:'com.ksf.conversations'};
  const bytes=encodePackage(manifest,Object.fromEntries([...decoded.files].map(([path,value])=>[path,file(value.data.toString('utf8'))])));
  const official={bytes,entry:{manifest,package:{url:'official.ksfapp',size:bytes.length,sha256:checksum(bytes)}}};await f.publish(official);
  assert.equal((await f.manager.snapshot()).installed[0].id,'com.ksf.conversations');
  await f.manager.changeApp('com.ksf.conversations','disable');assert.equal((await f.manager.snapshot()).installed[0].enabled,false);
  await f.manager.changeApp('com.ksf.conversations','uninstall');const fresh=createApplicationManager(f.root, { defaultSource: null, storeDirectory:f.store});t.after(()=>fresh.close());assert.equal((await fresh.snapshot()).installed.length,0);
});

test('declared v2 environment inheritance preserves Git/SSH settings without changing the default filtered environment',async t=>{
  const previous=process.env.KSF_TEST_APP_ENV;process.env.KSF_TEST_APP_ENV='synthetic-marker';t.after(()=>{if(previous===undefined)delete process.env.KSF_TEST_APP_ENV;else process.env.KSF_TEST_APP_ENV=previous;});
  const f=await fixture(t),one=release('1.0.0',false,['environment']),two=release('1.1.0');await f.publish(one);await f.install(one);await f.publish(one,two);
  let instance=await f.manager.launch('com.example.cards',one.entry.package.sha256,{kind:'card',cardId:'summary'});assert.equal((await f.manager.call(instance.id,'read')).environment,'synthetic-marker');await f.manager.release(instance.id);
  await f.install(two);instance=await f.manager.launch('com.example.cards',two.entry.package.sha256,{kind:'card',cardId:'summary'});assert.equal((await f.manager.call(instance.id,'read')).environment,null);
});

// A legacy HTTP surface can release while a real window opens the same app.
test('a retiring backend cannot remove the replacement runtime from the shared registry',async t=>{
  const f=await fixture(t),base=release('1.0.0',true);
  const backend=`export function activate(ctx){return {call(){return process.pid},async dispose(){const fs=await import('node:fs/promises');await fs.writeFile(ctx.dataDirectory+'/closing','yes');await new Promise(r=>setTimeout(r,300));}}}`;
  const bytes=encodePackage(base.entry.manifest,{'frontend/main.js':file('export function mount(){}'),'backend/main.mjs':file(backend)});
  const app={bytes,entry:{...base.entry,package:{...base.entry.package,size:bytes.length,sha256:checksum(bytes)}}};await f.publish(app);await f.install(app);
  const service=await f.manager.launch('com.example.cards',app.entry.package.sha256,{kind:'service'}),old=await f.manager.call(service.id,'read');
  const retiring=f.manager.release(service.id);
  for(let attempt=0;attempt<100;attempt++){if(await readFile(join(f.root,'.agents/user-data/applications/data/com.example.cards/closing'),'utf8').catch(()=>null))break;await new Promise(r=>setTimeout(r,5));}
  const window=await f.manager.launch('com.example.cards',app.entry.package.sha256),current=await f.manager.call(window.id,'read');assert.notEqual(current,old);await retiring;
  const another=await f.manager.launch('com.example.cards',app.entry.package.sha256,{kind:'card',cardId:'summary'});assert.equal(await f.manager.call(another.id,'read'),current);
});
test('idle cards switch during installation without registry polling or a later browser request',async t=>{const f=await fixture(t),one=release('1.0.0'),two=release('1.1.0');await f.publish(one);await f.install(one);await f.publish(one,two);const card=await f.manager.launch('com.example.cards',one.entry.package.sha256,{kind:'card',cardId:'summary'});assert.equal((await f.install(two)).pending,false);const next=await f.manager.launch('com.example.cards',two.entry.package.sha256,{kind:'card',cardId:'detail'});assert.ok(next.id);await assert.rejects(f.manager.call(card.id,'read'),{code:'APP_PROCESS_EXITED'});});
