import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApplicationManager} from '../src/applications/manager.js';
import {encodePackage,checksum,MAX_PACKAGE} from '../src/applications/protocol.js';
import {startWebServer} from '../src/services/web.js';

const file=text=>({content:Buffer.from(text).toString('base64'),sha256:checksum(Buffer.from(text)),mode:0o644});
function pack(version='1.0.0',extra={},text='export function mount(root){root.textContent="Shared app";return{dispose(){root.replaceChildren()}}}'){
  return encodePackage({schemaVersion:2,sdkVersion:2,id:'example.shared',name:'分享测试',description:'虚构验收应用',version,permissions:[],window:{entry:'frontend/index.js'},...extra},{'frontend/index.js':file(text),'backend/main.mjs':file('export function activate(){return{call(){return "ok"}}}')});
}
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'ksf-import-')),store=join(root,'store');await mkdir(store);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[]}));
  let time=Date.now();const manager=createApplicationManager(root, { defaultSource: null, storeDirectory:store,now:()=>time});t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
  const preview=(bytes=pack())=>manager.prepareImport(bytes,'分享测试.ksfapp');
  const install=review=>manager.installImport({importId:review.importId,digest:review.package.sha256,trusted:true});
  return{root,store,manager,preview,install,advance:ms=>{time+=ms;}};
}
test('import preview validates but neither installs nor runs code; confirmation is explicit and idempotent',async t=>{
  const f=await fixture(t),review=await f.preview();assert.equal(review.action,'install');assert.equal(review.manifest.id,'example.shared');assert.equal((await f.manager.snapshot()).installed.length,0);
  await assert.rejects(f.manager.installImport({importId:review.importId,digest:review.package.sha256}),{code:'APP_TRUST_REQUIRED'});
  await assert.rejects(f.manager.installImport({importId:review.importId,digest:'a'.repeat(64),trusted:true}),{code:'APP_IMPORT_CHANGED'});
  assert.equal((await f.install(review)).pending,false);await f.install(review);
  const app=(await f.manager.snapshot()).installed[0];assert.equal(app.active.source.id,'local-import');assert.equal(app.previous,null);
  const catalog=await f.manager.catalog();assert.equal(catalog.applications.length,1);assert.equal(catalog.applications[0].unavailableReason,null);assert.equal(catalog.applications[0].candidate,null);
  const instance=await f.manager.launch(app.id,app.active.digest);assert.match((await f.manager.asset(app.id,app.active.digest,'frontend/index.js')).bytes.toString(),/Shared app/);await f.manager.release(instance.id);
  assert.equal((await f.preview()).action,'installed');
});
test('import supports v1, card-only apps and persists across manager restart',async t=>{
  const f=await fixture(t),card={id:'summary',name:'摘要',description:'虚构卡片',entry:'frontend/index.js',defaultSize:{w:2,h:2},minSize:{w:1,h:1}};
  for(const extra of [{schemaVersion:1,sdkVersion:1,id:'example.legacy',window:undefined,frontend:{entry:'frontend/index.js'}},{id:'example.cards',window:undefined,cards:[card]}])await f.install(await f.preview(pack('1.0.0',extra)));
  const fresh=createApplicationManager(f.root, { defaultSource: null, storeDirectory:f.store});t.after(()=>fresh.close());assert.equal((await fresh.snapshot()).installed.length,2);assert.equal((await fresh.catalog()).applications.length,2);
});
test('invalid, oversized, incompatible and reserved packages are rejected before installation',async t=>{
  const f=await fixture(t);
  for(const [bytes,code] of [[Buffer.from('broken'),'APP_PACKAGE_INVALID'],[Buffer.alloc(MAX_PACKAGE+1),'APP_PACKAGE_TOO_LARGE'],[pack('1.0.0',{target:'other-platform'}),'APP_PLATFORM_UNSUPPORTED'],[pack('1.0.0',{sdkVersion:99}),'APP_SDK_INCOMPATIBLE'],[pack('1.0.0',{nodeAbi:'1'}),'APP_RUNTIME_INCOMPATIBLE'],[pack('1.0.0',{id:'conversations'}),'APP_ID_RESERVED']])await assert.rejects(f.preview(bytes),{code});
  await assert.rejects(f.manager.prepareImport(pack(),'wrong.zip'),{code:'APP_IMPORT_INVALID'});assert.equal((await f.manager.snapshot()).installed.length,0);
});
test('newer imports wait for old windows and preserve disabled state, data and uninstall recovery',async t=>{
  const f=await fixture(t),one=await f.preview();await f.install(one);const instance=await f.manager.launch(one.manifest.id,one.package.sha256),two=await f.preview(pack('2.0.0'));
  assert.equal(two.action,'update');assert.equal((await f.install(two)).pending,true);assert.equal((await f.preview(pack('2.0.0'))).action,'pending');
  await assert.rejects(f.preview(pack('3.0.0')),{code:'APP_UPDATE_PENDING'});await f.manager.release(instance.id);assert.equal((await f.manager.snapshot()).installed[0].active.manifest.version,'2.0.0');
  await f.manager.changeApp(one.manifest.id,'disable');await f.install(await f.preview(pack('3.0.0')));assert.equal((await f.manager.snapshot()).installed[0].enabled,false);
  const data=join(f.root,'.agents/user-data/applications/data/example.shared');await mkdir(data,{recursive:true});await writeFile(join(data,'keep.txt'),'kept');
  await f.manager.changeApp(one.manifest.id,'uninstall');await f.install(await f.preview(pack('3.0.0')));assert.equal(await readFile(join(data,'keep.txt'),'utf8'),'kept');
});
test('imports reject downgrades, reused versions, stale confirmation and source replacement',async t=>{
  const f=await fixture(t),one=await f.preview();await f.install(one);const two=await f.preview(pack('2.0.0')),three=await f.preview(pack('3.0.0'));await f.install(three);
  await assert.rejects(f.install(two),{code:'APP_RELEASE_CHANGED'});await assert.rejects(f.preview(pack()),{code:'APP_RELEASE_CHANGED'});
  await assert.rejects(f.preview(pack('3.0.0',{},'changed')),{code:'APP_VERSION_REUSED'});
  await f.manager.changeApp(one.manifest.id,'uninstall');await assert.rejects(f.preview(pack('3.0.0',{},'changed')),{code:'APP_VERSION_REUSED'});await assert.rejects(f.preview(pack()),{code:'APP_RELEASE_CHANGED'});
  const bytes=pack('4.0.0');await writeFile(join(f.store,'shared.ksfapp'),bytes);const manifest={...three.manifest,version:'4.0.0'};await writeFile(join(f.store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[{manifest,package:{url:'shared.ksfapp',size:bytes.length,sha256:checksum(bytes)}}]}));
  await f.manager.install({sourceId:'builtin',appId:manifest.id,version:manifest.version,digest:checksum(bytes),trusted:true});await assert.rejects(f.preview(pack('5.0.0')),{code:'APP_SOURCE_CHANGED'});
});
test('expired and discarded previews cannot install; concurrent confirmations cannot downgrade',async t=>{
  const f=await fixture(t),expired=await f.preview();f.advance(16*60*1000);await assert.rejects(f.install(expired),{code:'APP_IMPORT_EXPIRED'});
  const discarded=await f.preview();await f.manager.discardImport(discarded.importId);await assert.rejects(f.install(discarded),{code:'APP_IMPORT_EXPIRED'});
  const one=await f.preview(),two=await f.preview(pack('2.0.0')),results=await Promise.allSettled([f.install(two),f.install(one)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1); // A changed installation requires review, even for an upgrade.
  await f.install(await f.preview(pack('2.0.0')));await assert.rejects(f.install(one),{code:'APP_RELEASE_CHANGED'});assert.equal((await f.manager.snapshot()).installed[0].active.manifest.version,'2.0.0');
});
test('preview quota prevents unbounded retained uploads and cancellation releases a slot',async t=>{
  const f=await fixture(t),reviews=[];for(let i=0;i<8;i++)reviews.push(await f.preview());await assert.rejects(f.preview(),{code:'APP_IMPORT_LIMIT'});await f.manager.discardImport(reviews[0].importId);await f.preview();
});
test('binary HTTP imports require a session, reject over-limit streams and install without service restart',async t=>{
  const f=await fixture(t),server=await startWebServer({root:f.root,port:0,capture:false,applications: { defaultSource: null, storeDirectory:f.store}});t.after(()=>server.close());
  const base=server.url.slice(0,-1),get=async path=>(await(await fetch(base+path)).json()),start=(await get('/api/health')).startedAt,auth=(await get('/api/workbench/session')).data;
  const upload=(bytes,token=auth.token,type='application/octet-stream')=>fetch(base+'/api/apps/import/preview?name='+encodeURIComponent('朋友分享.ksfapp'),{method:'POST',headers:{Origin:base,'Content-Type':type,'X-KSF-Token':token},body:bytes});
  assert.equal((await upload(pack(),'bad')).status,403);assert.equal((await upload(pack(),auth.token,'text/plain')).status,415);assert.equal((await upload(Buffer.alloc(MAX_PACKAGE+1))).status,413);
  const response=await upload(pack());assert.equal(response.status,200);const review=(await response.json()).data;assert.equal((await get('/api/apps/installed')).data.installed.length,0);
  const post=async input=>fetch(base+'/api/apps/import/install',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-KSF-Token':auth.token},body:JSON.stringify(input)});
  assert.equal((await post({importId:review.importId,digest:review.package.sha256})).status,400);assert.equal((await post({importId:review.importId,digest:review.package.sha256,trusted:true})).status,200);
  assert.equal((await get('/api/apps/installed')).data.installed[0].active.source.id,'local-import');assert.equal((await get('/api/health')).startedAt,start);
});
