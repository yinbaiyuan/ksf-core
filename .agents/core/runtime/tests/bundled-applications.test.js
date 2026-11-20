import {shellCommands} from './helpers/platform.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { startWebServer } from '../src/services/web.js';
import { createApplicationManager } from './helpers/application-catalog.js';
import { decodePackage,compareVersions,encodePackage,checksum } from '../src/applications/protocol.js';
const store=fileURLToPath(new URL('../../applications/builtin/',import.meta.url));
async function root(){return mkdtemp(join(tmpdir(),'ksf-bundled-apps-'));}
test('all migrated apps are self-contained packages with declared CSS, windows, backend and app-owned cards',async()=>{
  const catalog=JSON.parse(await readFile(join(store,'index.json'),'utf8'));
  for(const id of ['com.ksf.conversations','com.ksf.markdown','com.ksf.git']){
    const entry=catalog.apps.filter(item=>item.manifest.id===id).sort((a,b)=>compareVersions(b.manifest.version,a.manifest.version))[0],pkg=decodePackage(await readFile(join(store,entry.package.url)));assert.equal(pkg.manifest.sdkVersion,1);assert.ok(pkg.manifest.window);assert.ok(pkg.manifest.backend);
    for(const surface of [pkg.manifest.window,...pkg.manifest.cards]){assert.ok(surface.styles.length>0);const css=surface.styles.map(path=>pkg.files.get(path).data.toString()).join('\n');assert.match(css,/window-toolbar/);assert.match(css,/ksf-app-/);}
    for(const [path,file] of pkg.files)if(path.endsWith('.js')||path.endsWith('.mjs'))assert.doesNotMatch(file.data.toString(),/from\s*['"](?:@ksf\/sdk|\/Users\/|\.\.\/.*runtime\/)/,path);
    if(id==='com.ksf.conversations')assert.deepEqual(pkg.manifest.cards.map(card=>card.id),['work-stats']);
  }
});
test('packaged Git coordinates with Core file writes and preserves operation results after the last window closes',async t=>{
  const workspace=await root(t);await mkdir(join(workspace,'项目/演示'),{recursive:true});await writeFile(join(workspace,'项目/演示/notes.md'),'before\n');await writeFile(join(workspace,'.gitignore'),'.agents/\n');
  for(const args of [['init','-b','main'],['config','user.name','KSF Test'],['config','user.email','test@example.invalid'],['add','.'],['commit','-m','baseline']]){const value=spawnSync('git',args,{cwd:workspace,encoding:'utf8'});assert.equal(value.status,0,value.stderr);}
  const server=await startWebServer({root:workspace,port:0,capture:false});t.after(async()=>{await server.close();await rm(workspace,{recursive:true,force:true});});
  const read=async path=>{const response=await fetch(server.url+path);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.data;};
  const session=await read('api/workbench/session');
  const post=async(path,input)=>{const response=await fetch(server.url+path,{method:'POST',headers:{Origin:server.url.slice(0,-1),'Content-Type':'application/json','X-KSF-Token':session.token},body:JSON.stringify(input)});const body=await response.json();assert.ok(response.ok,JSON.stringify(body));return body.data;};
  const snapshot=await read('api/apps/installed'),git=snapshot.installed.find(item=>item.id==='com.ksf.git'),lease=await post('api/apps/launch',{appId:'com.ksf.git',digest:git.active.digest});
  let catalog;for(let attempt=0;attempt<100;attempt++){catalog=await read('api/git/repositories');if(catalog.repositories.length||!catalog.scanning)break;await new Promise(resolve=>setTimeout(resolve,20));}const repoId=catalog.repositories[0]?.id;
  assert.ok(repoId,JSON.stringify(catalog));
  const original=await read('api/workspace/file?path='+encodeURIComponent('项目/演示/notes.md'));
  const text='after\n'+'测'.repeat(600000);await post('api/workspace/save',{path:original.path,version:original.version,text});
  const status=await read(`api/git/repositories/${repoId}/status`);const started=await post('api/git/operations',{repo:repoId,action:'stage',paths:[original.path],version:status.version,requestId:'large-file-stage'});
  await post('api/apps/release',{instanceId:lease.id});
  let operation;for(let attempt=0;attempt<100;attempt++){operation=await read('api/git/operations/'+started.id);if(['completed','failed'].includes(operation.status))break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(operation.status,'completed',JSON.stringify(operation));assert.equal((await read('api/workspace/file?path='+encodeURIComponent(original.path))).text,text);
  const fresh=await post('api/apps/launch',{appId:'com.ksf.git',digest:git.active.digest});assert.equal((await read('api/git/operations/'+started.id)).status,'completed');await post('api/apps/release',{instanceId:fresh.id});
});
test('Core payload contains exactly nine defaults and never offers offline Terminal',async t=>{
 const {DEFAULT_APPLICATIONS}=await import('../src/applications/protocol.js');const catalog=JSON.parse(await readFile(join(store,'index.json'),'utf8'));assert.deepEqual([...new Set(catalog.apps.map(e=>e.manifest.id))].sort(),[...DEFAULT_APPLICATIONS].sort());assert.equal(new Set(catalog.apps.map(e=>JSON.stringify([e.manifest.id,e.manifest.version,e.manifest.target??null,e.manifest.nodeAbi??null]))).size,catalog.apps.length,'历史版本按原发布身份保留，不重复登记同一载荷');
 const workspace=await root(),manager=createApplicationManager(workspace,{fetcher:async()=>{throw Error('offline');}});t.after(async()=>{await manager.close();await rm(workspace,{recursive:true,force:true});});const snapshot=await manager.snapshot();assert.deepEqual(snapshot.installed.map(app=>app.id).sort(),[...DEFAULT_APPLICATIONS].sort());assert.ok(snapshot.installed.every(app=>app.distribution==='core'&&app.active.source.id==='core'));await assert.rejects(manager.previewInstall({appId:'com.ksf.terminal'}),{code:'APP_RELEASE_UNAVAILABLE'});assert.equal((await manager.snapshot()).installed.some(app=>app.id==='com.ksf.terminal'),false);
});

// The optional v1 compatibility fixture is assembled from source, never shipped as a Core store mirror.
test('existing v1 Terminal still launches independent PTYs and closes through the same manager',{skip:!['darwin-arm64','darwin-x64','win32-x64','win32-arm64'].includes(`${process.platform}-${process.arch}`)},async t=>{
  const workspace=await mkdtemp(join(tmpdir(),'ksf-bundled-terminal-')),scenarioStore=join(workspace,'test-source');await mkdir(scenarioStore);const manifest={schemaVersion:1,sdkVersion:1,id:'com.ksf.terminal',name:'Terminal v1 compatibility fixture',description:'PTY compatibility',version:'0.1.0',minCoreVersion:'0.1.0',dataStores:[],permissions:['shell','filesystem','network'],backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'},window:{entry:'frontend/index.js',styles:['frontend/index.css'],multiInstance:true}},file=bytes=>({content:bytes.toString('base64'),sha256:checksum(bytes),mode:420}),archive=encodePackage(manifest,{'backend/index.mjs':file(Buffer.from("export async function activate(context){const methods=new Set(['create','list','read','write','resize','close']);return{call(method,input={}){if(!methods.has(method))throw Error('Unknown terminal operation');return context.services.call('terminal',method,[input]);}};}")),'frontend/index.js':file(Buffer.from('export function mount(){}')),'frontend/index.css':file(Buffer.from(''))}),entry={manifest,package:{url:'terminal.ksfapp',size:archive.length,sha256:checksum(archive)}};await writeFile(join(scenarioStore,'terminal.ksfapp'),archive);await writeFile(join(scenarioStore,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[entry]}));const manager=createApplicationManager(workspace,{defaultSource:null,storeDirectory:scenarioStore});t.after(async()=>{await manager.close();await rm(workspace,{recursive:true,force:true});});const app=await manager.previewInstall({appId:'com.ksf.terminal'});assert.ok(app);
  await manager.install({appId:app.manifest.id,version:app.manifest.version,digest:app.package.sha256,sourceId:'builtin',trusted:true});
  const one=await manager.launch(app.manifest.id,app.package.sha256),two=await manager.launch(app.manifest.id,app.package.sha256);
  const a=await manager.call(one.id,'create',{cols:80,rows:24}),b=await manager.call(two.id,'create',{cols:80,rows:24});assert.notEqual(a.pid,b.pid);
  await manager.call(one.id,'write',{id:a.id,data:shellCommands.echo('KSF_V1_COMPAT_OK')});let output='',after=0;for(let attempt=0;attempt<20;attempt++){const result=await manager.call(one.id,'read',{id:a.id,after});after=result.seq;output+=result.chunks.map(item=>item.data).join('');if(output.includes('KSF_V1_COMPAT_OK'))break;}
  assert.match(output,/KSF_V1_COMPAT_OK/);await manager.release(one.id);assert.equal((await manager.call(two.id,'list')).length,1);await manager.release(two.id);
});
