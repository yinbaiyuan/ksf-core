import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,readdir}from'node:fs/promises';import {join}from'node:path';import{tmpdir}from'node:os';
import {PNG}from'../src/vendor/icon-codecs/index.mjs';
import {separateIcon,resizeForeground}from'../src/applications/icon-layers/separate.js';
import {createIconWorker,createIconLayers}from'../src/applications/icon-layers/index.js';
import {checksum,encodePackage}from'../src/applications/protocol.js';import {createApplicationManager}from'./helpers/application-catalog.js';
function image({gradient=false,alpha=false,complex=false}={}){
 const width=96,height=96,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,t=gradient?(x+y)/190:0,bg=[30+60*t,95+35*t,150-20*t],shape=(x>22&&x<73&&y>19&&y<77)&&!(x>38&&x<56&&y>37&&y<57);
  const rgb=shape?(x<48?[245,220,65]:[240,90,120]):complex?[(x*23+y*7)%256,(x*11+y*17)%256,(x*3+y*41)%256]:bg;
  data.set([...rgb,alpha&&!shape?0:255],i);
 }return{width,height,data};
}
const png=im=>PNG.sync.write(im);
for(const [name,options]of [['transparent',{alpha:true}],['solid',{}],['gradient',{gradient:true}]])test(name+' retains coloured foreground and cutout',()=>{
 const result=separateIcon(image(options));assert.equal(result.status,'ready');const out=result.image.data;
 assert.equal(out[(30*96+30)*4+3],255);assert.deepEqual([...out.subarray((30*96+30)*4,(30*96+30)*4+3)],[245,220,65]);assert.equal(out[(45*96+45)*4+3],0);assert.equal(out[3],0);assert.equal(resizeForeground(result.image).data.length,256*256*4);
});
test('complex, blank, uniform and oversized icons never invent a subject',()=>{
 assert.equal(separateIcon(image({complex:true})).status,'fallback');const empty=image();empty.data.fill(0);assert.equal(separateIcon(empty).invalid,true);
 const flat=image();for(let i=0;i<flat.data.length;i+=4)flat.data.set([40,80,120,255],i);assert.equal(separateIcon(flat).status,'fallback');assert.equal(separateIcon({width:4096,height:4096,data:new Uint8Array(0)}).invalid,true);
});
test('offline worker decodes PNG and recovers from damaged and oversized images',async t=>{
 const worker=createIconWorker();t.after(()=>worker.close());
 for(const bytes of [png(image())]){const r=await worker.process({bytes});assert.equal(r.status,'ready',r.reason);assert.equal(PNG.sync.read(Buffer.from(r.png)).width,256);}
 assert.equal((await worker.process({bytes:Buffer.from('broken')})).reason,'png-required');assert.equal((await worker.process({bytes:png(image())})).status,'ready');const huge=png(image());huge.writeUInt32BE(50000,16);assert.equal((await worker.process({bytes:huge})).invalid,true);
});
test('timeout terminates CPU work and resolves subsequent queued work',async t=>{
 const home=await mkdtemp(join(tmpdir(),'icon-worker-'));t.after(()=>rm(home,{recursive:true,force:true}));const script=join(home,'slow.mjs');await writeFile(script,"import{parentPort}from'node:worker_threads';parentPort.on('message',()=>{while(true){}})");
 const worker=createIconWorker({workerURL:new URL('file://'+script),timeoutMs:70});t.after(()=>worker.close());const at=Date.now(),results=await Promise.all([worker.process({}),worker.process({})]);assert.ok(results.every(r=>r.reason==='timeout'));assert.ok(Date.now()-at<1500);
});
test('atomic disposable cache, same-image reuse, orphan recovery and managed read-only assets',async t=>{
 const root=await mkdtemp(join(tmpdir(),'icon-layers-'));t.after(()=>rm(root,{recursive:true,force:true}));const bytes=png(image()),cache=createIconLayers(root,{readImage:async()=>bytes});t.after(()=>cache.close());
 const release={digest:'a'.repeat(64),manifest:{id:'com.example.icons'},source:{id:'local-import'},listing:{icon:{url:'store/icon.png',sha256:checksum(bytes),size:bytes.length}}};
 const one=await cache.prepare('com.example.icons',release);assert.equal(one.status,'ready');const two=await cache.prepare('com.example.icons',{...release,digest:'b'.repeat(64)});assert.equal(two.foreground.url,one.foreground.url);assert.equal(two.releaseDigest,'b'.repeat(64));
 const url=new URL(one.foreground.url,'http://localhost'),key=url.searchParams.get('key');assert.equal((await cache.asset(key,one.foreground.sha256)).type,'image/png');await assert.rejects(cache.asset('../state',one.foreground.sha256),{code:'APP_ASSET_NOT_FOUND'});
 const home=join(root,'.agents/runtime-data/applications/icon-layers');await writeFile(join(home,one.foreground.sha256+'.png'),'broken');await assert.rejects(cache.asset(key,one.foreground.sha256),{code:'APP_ASSET_NOT_FOUND'});assert.equal((await cache.prepare('com.example.icons',release)).status,'ready');
 await rm(join(home,key+'.json'));await writeFile(join(home,key+'.lock'),JSON.stringify({pid:2147483647}));await writeFile(join(home,key+'.png.interrupted.tmp'),'partial');assert.equal((await cache.prepare('com.example.icons',release)).status,'ready');
 const snapshot=await cache.snapshot({'com.example.icons':{active:release,pending:{...release,digest:'b'.repeat(64)}}});assert.equal(snapshot['com.example.icons'].releaseDigest,release.digest);assert.ok(snapshot['com.ksf.app-store']);assert.ok(snapshot['com.ksf.ability-store']);assert.ok(snapshot['ksf.host.application-launcher']);
});
test('builtin recipes keep nonblank transparent original-colour foregrounds',async t=>{
 const root=await mkdtemp(join(tmpdir(),'builtin-layers-'));t.after(()=>rm(root,{recursive:true,force:true}));const cache=createIconLayers(root);t.after(()=>cache.close());
 for(const id of ['com.ksf.documentation','com.ksf.projects','com.ksf.knowledge','com.ksf.abilities','com.ksf.markdown','com.ksf.conversations','com.ksf.git','com.ksf.cooperation-center','com.ksf.activity-monitor','com.ksf.app-store','com.ksf.ability-store','ksf.host.application-launcher']){const r=await cache.prepare(id);assert.equal(r.status,'ready',id+':'+r.reason);const url=new URL(r.foreground.url,'http://localhost'),im=PNG.sync.read((await cache.asset(url.searchParams.get('key'),r.foreground.sha256)).bytes);assert.equal(im.data[3],0);assert.ok(im.data.some((v,i)=>i%4===3&&v>240));}
});
const file=bytes=>({content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644});
function pack(version,bytes){const listing={icon:{url:'store/icon.png',sha256:checksum(bytes),size:bytes.length}};return encodePackage({schemaVersion:1,minCoreVersion:'0.3.0',dataStores:[],sdkVersion:1,id:'com.example.icons',name:'分层图标测试',description:'Synthetic',version,permissions:[],window:{entry:'frontend/index.js'}},{'frontend/index.js':file(Buffer.from('export function mount(){return {dispose(){}}}')),'store/icon.png':file(bytes),'store/listing.json':file(Buffer.from(JSON.stringify(listing)))});}
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'icon-install-')),store=join(root,'store');await mkdir(store);await writeFile(join(store,'index.json'),'{"protocol":"ksf-app-registry-v1","apps":[]}');const manager=createApplicationManager(root,{storeDirectory:store,defaultSource:null});t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});return{root,manager,store};}
test('import hooks, pending update, rollback, startup backfill and package integrity',async t=>{
 const {root,manager}=await fixture(t),one=pack('1.0.0',png(image())),two=pack('2.0.0',png(image({gradient:true})));
 const install=async bytes=>{const p=await manager.prepareImport(bytes,'icons.ksfapp');return manager.installImport({importId:p.importId,digest:p.package.sha256,trusted:true});};
 await install(one);const first=(await manager.snapshot()).iconLayers['com.example.icons'];assert.equal(first.status,'ready');const lease=await manager.launch('com.example.icons',checksum(one));await install(two);const pending=await manager.snapshot();assert.equal(pending.installed[0].pending.digest,checksum(two));assert.equal(pending.iconLayers['com.example.icons'].sourceDigest,first.sourceDigest);
 await manager.release(lease.id);assert.notEqual((await manager.snapshot()).iconLayers['com.example.icons'].sourceDigest,first.sourceDigest);await manager.changeApp('com.example.icons','rollback');assert.equal((await manager.snapshot()).iconLayers['com.example.icons'].foreground.url,first.foreground.url);
 const original=join(root,'.agents/user-data/applications/packages/com.example.icons',checksum(one),'store/icon.png');assert.equal(checksum(await readFile(original)),checksum(png(image())));
 await rm(join(root,'.agents/runtime-data/applications/icon-layers'),{recursive:true,force:true});assert.equal((await manager.snapshot()).iconLayers['com.example.icons'].status,'processing');
 for(let n=0;n<30;n++){await new Promise(r=>setTimeout(r,20));if((await manager.snapshot()).iconLayers['com.example.icons'].status==='ready')return;}assert.fail('background fill did not complete');
});
test('corrupt icon cannot invalidate successful import or local build installation',async t=>{
 const {manager}=await fixture(t),bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]),packed=pack('1.0.0',bytes),p=await manager.prepareImport(packed,'broken.ksfapp');await manager.installImport({importId:p.importId,digest:p.package.sha256,trusted:true});assert.equal((await manager.snapshot()).installed.length,1);assert.equal((await manager.snapshot()).iconLayers['com.example.icons'].invalid,true);
 await manager.localApplication({action:'install',appId:'com.example.icons',bytes:pack('2.0.0',png(image())),trusted:true});assert.equal((await manager.snapshot()).iconLayers['com.example.icons'].status,'ready');
});
test('processing timeout is outside installation lock and cannot turn a committed installation into failure',async t=>{
 const root=await mkdtemp(join(tmpdir(),'icon-timeout-')),store=join(root,'store');await mkdir(store);await writeFile(join(store,'index.json'),'{"protocol":"ksf-app-registry-v1","apps":[]}');const slow=join(root,'slow.mjs');await writeFile(slow,"import{parentPort}from'node:worker_threads';parentPort.on('message',()=>{while(true){}})");
 const manager=createApplicationManager(root,{storeDirectory:store,defaultSource:null,iconLayerOptions:{workerOptions:{workerURL:new URL('file://'+slow),timeoutMs:150}}});t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});const bytes=pack('1.0.0',png(image())),p=await manager.prepareImport(bytes,'timeout.ksfapp'),installing=manager.installImport({importId:p.importId,digest:p.package.sha256,trusted:true});
 let committed=false;for(let n=0;n<100;n++){try{if(JSON.parse(await readFile(join(root,'.agents/user-data/applications/state.json'))).installed['com.example.icons']){committed=true;break;}}catch{}await new Promise(r=>setTimeout(r,5));}assert.ok(committed);await manager.changeApp('com.example.icons','disable');assert.equal((await installing).pending,false);const snapshot=await manager.snapshot();assert.equal(snapshot.installed[0].enabled,false);assert.equal(snapshot.iconLayers['com.example.icons'].reason,'timeout');
});
test('application icon standard accepts only PNG and leaves screenshot formats supported',async t=>{
 const {manager}=await fixture(t);const {decodePackage,validateStoreListing}=await import('../src/applications/protocol.js');const bytes=png(image()),ref={url:'store/icon.jpg',sha256:checksum(bytes),size:bytes.length};
 assert.throws(()=>validateStoreListing({icon:ref}),{code:'APP_LISTING_INVALID'});assert.doesNotThrow(()=>validateStoreListing({screenshots:[{...ref,alt:'Synthetic screenshot'}]}));
 const jpeg=Buffer.from([255,216,255,224,0,0,0,0]);assert.throws(()=>decodePackage(pack('1.0.0',jpeg)),{code:'APP_LISTING_INVALID'});
 const worker=createIconWorker();t.after(()=>worker.close());assert.equal((await worker.process({bytes:jpeg})).reason,'png-required');
});
test('source installation prepares PNG layers and HTTP endpoint only serves managed derived bytes',async t=>{
 const {manager,root,store}=await fixture(t),bytes=pack('1.0.0',png(image())),{decodePackage}=await import('../src/applications/protocol.js'),decoded=decodePackage(bytes),entry={manifest:decoded.manifest,listing:decoded.listing,package:{url:'icons.ksfapp',sha256:checksum(bytes),size:bytes.length}};
 await writeFile(join(store,'icons.ksfapp'),bytes);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[entry]}));await manager.install({appId:entry.manifest.id,version:'1.0.0',digest:entry.package.sha256,sourceId:'builtin',trusted:true});const layers=(await manager.snapshot()).iconLayers['com.example.icons'];assert.equal(layers.status,'ready');
 await manager.close();const {startWebServer}=await import('../src/services/web.js'),server=await startWebServer({root,port:0,capture:false,applications:{storeDirectory:store,defaultSource:null}});t.after(()=>server.close());
 const asset=await fetch(new URL(layers.foreground.url,server.url));assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/png');assert.equal(asset.headers.get('x-content-type-options'),'nosniff');assert.match(asset.headers.get('cache-control'),/immutable/);assert.equal(checksum(Buffer.from(await asset.arrayBuffer())),layers.foreground.sha256);assert.equal((await fetch(new URL('/api/apps/icon-layer?key=../state&digest='+layers.foreground.sha256,server.url))).status,404);
});
test('a killed preparation process leaves no published partial descriptor and can be rebuilt',async t=>{
 const root=await mkdtemp(join(tmpdir(),'icon-killed-'));t.after(()=>rm(root,{recursive:true,force:true}));const bytes=png(image()),release={digest:'a'.repeat(64),manifest:{id:'com.example.icons'},source:{id:'local-import'},listing:{icon:{url:'store/icon.png',sha256:checksum(bytes),size:bytes.length}}};
 const slow=join(root,'slow.mjs'),script=join(root,'child.mjs');await writeFile(slow,"import{parentPort}from'node:worker_threads';parentPort.on('message',()=>{while(true){}})");await writeFile(script,`import{createIconLayers}from ${JSON.stringify(new URL('../src/applications/icon-layers/index.js',import.meta.url).href)};const p=createIconLayers(${JSON.stringify(root)},{readImage:async()=>Buffer.from(${JSON.stringify(bytes.toString('base64'))},'base64'),workerOptions:{workerURL:new URL(${JSON.stringify('file://'+slow)})}});await p.prepare('com.example.icons',${JSON.stringify(release)});await p.close();`);
 const {spawn}=await import('node:child_process'),child=spawn(process.execPath,[script],{stdio:'ignore'});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});const home=join(root,'.agents/runtime-data/applications/icon-layers');let lock;
 for(let n=0;n<100;n++){try{lock=(await readdir(home)).find(n=>n.endsWith('.lock'));}catch{}if(lock)break;await new Promise(r=>setTimeout(r,5));}assert.ok(lock);const exited=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exited;assert.ok(!(await readdir(home)).some(n=>n.endsWith('.json')));
 const cache=createIconLayers(root,{readImage:async()=>bytes});t.after(()=>cache.close());assert.equal((await cache.prepare('com.example.icons',release)).status,'ready');
});

test('generic builtin glyph keeps the original blue-grey foreground instead of whitening it',async t=>{
 const root=await mkdtemp(join(tmpdir(),'icon-colour-'));t.after(()=>rm(root,{recursive:true,force:true}));const cache=createIconLayers(root);t.after(()=>cache.close());
 const layer=await cache.prepare('com.example.unknown'),url=new URL(layer.foreground.url,'http://localhost'),im=PNG.sync.read((await cache.asset(url.searchParams.get('key'),layer.foreground.sha256)).bytes);
 assert.ok(im.data.some((v,i)=>i%4===0&&v===100&&im.data[i+1]===132&&im.data[i+2]===174&&im.data[i+3]>240));
});
test('historical local PNG paths remain readable as originals when separation is unreliable',async t=>{
 const {manager,root}=await fixture(t);await manager.localApplication({action:'install',appId:'com.example.icons',bytes:pack('1.0.0',png(image())),trusted:true});const bytes=png(image({complex:true})),hash=checksum(bytes),path=join(root,'.agents/user-data/applications/state.json'),state=JSON.parse(await readFile(path));state.installed['com.example.icons'].active.listing={};state.installed['com.example.icons'].local.listing={icon:{url:'media/'+hash+'.png',sha256:hash,size:bytes.length}};state.revision++;await writeFile(path,JSON.stringify(state));await mkdir(join(root,'.agents/user-data/applications/local/media'),{recursive:true});await writeFile(join(root,'.agents/user-data/applications/local/media',hash+'.png'),bytes);const result=await manager.media({sourceId:'local-app',appId:'com.example.icons',version:'1.0.0',digest:hash});assert.equal(result.type,'image/png');assert.deepEqual(result.bytes,bytes);
});
