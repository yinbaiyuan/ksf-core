import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApplicationManager} from '../../../runtime/src/applications/manager.js';
import {DEFAULT_APPLICATIONS,decodePackage,assertCompatible,checksum} from '../../../runtime/src/applications/protocol.js';
import {managedPath} from '../../../runtime/src/distribution/paths.js';
import {project} from '../../../runtime/src/services/projects.js';
import {projectManagement} from '../../../runtime/src/services/project-management.js';
import {projectGovernance} from '../../../runtime/src/services/project-governance.js';
import {fixture} from '../../../runtime/tests/helpers/governance-fixture.js';
import {buildApplication} from '../../sdk/build.mjs';
import {fileURLToPath} from 'node:url';

const sourceStore=new URL('../../store/',import.meta.url);
const releaseURL=e=>e.package.url.startsWith('fixture-projects-')?new URL('./fixtures/'+e.package.url,import.meta.url):new URL(e.package.url,sourceStore);
async function historicalProject(version){const url='fixture-projects-'+version+'.ksfapp',bytes=await readFile(new URL('./fixtures/'+url,import.meta.url));return {manifest:decodePackage(bytes).manifest,package:{url,size:bytes.length,sha256:checksum(bytes)}};}
test('Core project source is distributable; bundled package upgrades the old identity and installs offline by default',async t=>{
  assert(DEFAULT_APPLICATIONS.includes('com.ksf.projects'));
  assert(managedPath('.agents/core/applications/projects/backend.mjs'));
  assert(!managedPath('.agents/core/applications/projects/node_modules/marked/lib/marked.esm.js'));
  const index=JSON.parse(await readFile(new URL('index.json',sourceStore),'utf8'));
  const previous=await historicalProject('0.2.9');
  const current=index.apps.find(e=>e.manifest.id==='com.ksf.projects');assert(previous&&current);assert.equal(current.manifest.name,'KSF项目');
  for(const id of ['com.ksf.projects','com.ksf.conversations','com.ksf.knowledge','com.ksf.abilities']){const entry=index.apps.find(e=>e.manifest.id===id);assert(entry);assert.equal(entry.manifest.minCoreVersion,'0.5.5');assert.throws(()=>assertCompatible(entry.manifest,{coreVersion:'0.5.4'}),{code:'APP_CORE_INCOMPATIBLE'});assert.doesNotThrow(()=>assertCompatible(entry.manifest,{coreVersion:'0.5.5'}));}
  const bytes=await readFile(new URL(current.package.url,sourceStore)),pkg=decodePackage(bytes);
  assert(pkg.files.get('frontend/THIRD_PARTY_NOTICES.txt').data.toString().includes('## marked@16.4.2'));
  const root=await mkdtemp(join(tmpdir(),'ksf-core-projects-')),store=join(root,'store');await mkdir(store);let manager;
  t.after(async()=>{await manager?.close();await rm(root,{recursive:true,force:true});});
  const publish=async entries=>{for(const e of entries)await copyFile(releaseURL(e),join(store,e.package.url));await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:entries}));};
  await mkdir(join(root,'.agents'));await mkdir(join(root,'项目/示例/任务'),{recursive:true});
  const projectText='---\nname: 示例\nstatus: active\n---\n# 示例\n';await writeFile(join(root,'项目/示例/project.md'),projectText);
  const stub=`#!${process.execPath}\nconst args=process.argv.slice(2);const project={name:'示例',scope:'current',directory:'项目/示例',path:'项目/示例/project.md',metadata:{name:'示例',status:'active'},body:'# 示例'};console.log(JSON.stringify({ok:true,data:args[1]==='read'?{project}:{projects:[{name:'示例',title:'示例',scope:'current'}]},errors:[]}));`;
  await writeFile(join(root,'.agents/ksf'),stub,{mode:0o755});
  const start=()=>createApplicationManager(root,{storeDirectory:store,defaultSource:null,services:{projects:{managementRead:input=>projectManagement({root,operation:'read',...input}),managementWrite:input=>projectManagement({root,operation:'write',...input}),managementCheck:input=>projectManagement({root,operation:'check',...input}),list:input=>project({root,operation:'list',scope:input.scope}),read:input=>project({root,operation:'read',...input})}},fetcher:async()=>{throw Error('Network forbidden');}});
  await publish([previous]);manager=start();let snapshot=await manager.snapshot();assert(snapshot.installed.some(a=>a.id==='com.ksf.projects'));
  let instance=await manager.launch('com.ksf.projects',previous.package.sha256);await manager.call(instance.id,'preferences.save',{selected:'current:示例',tab:'tasks'});await manager.release(instance.id);await manager.close();
  await publish([previous,current]);manager=start();await manager.install({trusted:true,sourceId:'builtin',appId:current.manifest.id,version:current.manifest.version,digest:current.package.sha256});
  instance=await manager.launch(current.manifest.id,current.package.sha256);assert.equal((await manager.call(instance.id,'preferences.read')).tab,'tasks');assert.equal((await manager.call(instance.id,'list')).projects[0].name,'示例');
  const detail=await manager.call(instance.id,'detail',{name:'示例',scope:'current'});assert.equal(detail.title,'示例');const management=await manager.call(instance.id,'management.read',{name:'示例',scope:'current'});assert.equal(management.state,'missing');management.plan.purpose='离线安装后保存';const saved=await manager.call(instance.id,'management.write',{name:'示例',scope:'current',data:{plan:management.plan,ifMatch:management.etag,operationId:'install-test-save'}});assert.equal(saved.revision,1);assert.equal(JSON.parse(await readFile(join(root,'项目/示例/项目管理.json'),'utf8')).plan.purpose,'离线安装后保存');await manager.release(instance.id);await manager.close();
  const fresh=await mkdtemp(join(tmpdir(),'ksf-core-projects-fresh-'));t.after(()=>rm(fresh,{recursive:true,force:true}));manager=createApplicationManager(fresh,{storeDirectory:store,defaultSource:null,fetcher:async()=>{throw Error('Network forbidden');}});snapshot=await manager.snapshot();const installed=snapshot.installed.find(a=>a.id===current.manifest.id);assert.equal(installed.active.manifest.version,current.manifest.version);assert.equal(installed.active.manifest.name,'KSF项目');assert.equal(await readFile(join(root,'项目/示例/project.md'),'utf8'),projectText);
});

test('matching packaged app opens migrated Markdown projects after upgrade and preserves legacy access',async t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);
  const material=f.pp.replace('project.md','P10-包/原件.md');
  assert.deepEqual(f.apply([{path:material,ifMatch:'missing',body:'# 编号原件\n'}]).errors,[]);
  const store=join(f.root,'store'),candidateStore=join(f.root,'candidate');await mkdir(store);
  const bundledIndex=await readFile(new URL('index.json',sourceStore),'utf8'),index=JSON.parse(bundledIndex);
  const old=await historicalProject('0.3.4');assert(old);
  await copyFile(releaseURL(old),join(store,old.package.url));
  await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[old]}));
  await mkdir(join(f.root,'项目/旧项目'),{recursive:true});
  const legacy='---\nname: 旧项目\nstatus: active\n---\n# 旧项目\n';
  await writeFile(join(f.root,'项目/旧项目/project.md'),legacy);
  const original=await readFile(join(f.root,f.pp));
  const manager=createApplicationManager(f.root,{storeDirectory:store,defaultSource:null,fetcher:async()=>{throw Error('Network forbidden');},services:{projects:{
    read:input=>project({root:f.root,operation:'read',...input}),
    list:input=>project({root:f.root,operation:'list',...input}),
    managementRead:input=>projectManagement({root:f.root,operation:'read',...input}),
    governanceRead:input=>projectGovernance({root:f.root,operation:'read',...input}),
    governanceContextList:input=>projectGovernance({root:f.root,operation:'context-list',...input}),
    archive:input=>project({root:f.root,operation:'archive',...input}),
    restore:input=>project({root:f.root,operation:'restore',...input}),
    resolve:input=>project({root:f.root,operation:'locate',name:input.path,source:input.source,digest:input.digest})
  }}});
  t.after(()=>manager.close());
  await manager.snapshot();
  const params={name:f.name,scope:'current'};
  let instance=await manager.launch(old.manifest.id,old.package.sha256);
  await manager.call(instance.id,'preferences.save',{selected:'current:'+f.name,tab:'plan'});
  await assert.rejects(manager.call(instance.id,'management.read',params),e=>e.code==='PROJECT_MODEL_MIGRATED');
  await manager.release(instance.id);
  // Build into an isolated store: exercising an upgrade must never publish the
  // candidate into Core's automatically reconciled bundled distribution.
  const options=JSON.parse(await readFile(new URL('../ksf-build.json',import.meta.url),'utf8'));
  await buildApplication(fileURLToPath(new URL('../',import.meta.url)),{...options,storeDirectory:candidateStore,quiet:true});
  const candidates=JSON.parse(await readFile(join(candidateStore,'index.json'),'utf8'));
  const current=candidates.apps.find(e=>e.manifest.id===old.manifest.id);assert(current);
  await copyFile(join(candidateStore,current.package.url),join(store,current.package.url));
  await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[old,current]}));
  await manager.install({trusted:true,sourceId:'builtin',appId:current.manifest.id,version:current.manifest.version,digest:current.package.sha256},{bundled:true});
  instance=await manager.launch(current.manifest.id,current.package.sha256);
  assert.equal((await manager.call(instance.id,'preferences.read')).tab,'plan');
  const detail=await manager.call(instance.id,'detail',params);
  assert.equal(detail.governance.format,'documents');assert.equal(detail.governance.valid,true);
  assert(detail.tasks.some(task=>task.taskId==='t1'));
  assert(detail.governance.lifecycle.supported);
  const contextPackage=detail.governance.contextEntries.find(entry=>entry.code==='P10');
  assert.equal(contextPackage.kind,'directory');
  const context=await manager.call(instance.id,'governance.context-list',{...params,data:{path:contextPackage.path}});
  assert.deepEqual(context.entries.map(entry=>entry.path),[material]);
  const archivePreview=await manager.call(instance.id,'lifecycle.archive',{...params,data:{reason:'隔离发行包预览',actor:'测试',targets:[{id:'p1',path:f.pp}]},dryRun:true});assert.equal(archivePreview.allowed,false);assert(archivePreview.blockers.some(b=>b.code==='PROJECT_ARCHIVE_STATE'));
  for(const ownerPath of [f.pp,f.mp,f.tp]){
    const note=await manager.call(instance.id,'inspiration.read',{...params,ownerPath});
    assert.equal(note.exists,true);assert.equal(note.text,'# 灵感闪现\n');assert.equal(note.ownerPath,ownerPath);
  }
  const legacyParams={name:'旧项目',scope:'current'};
  assert.equal((await manager.call(instance.id,'detail',legacyParams)).governance,undefined);
  assert.equal((await manager.call(instance.id,'management.read',legacyParams)).state,'missing');
  await manager.release(instance.id);
  assert.deepEqual(await readFile(join(f.root,f.pp)),original);
  assert.equal(await readFile(join(f.root,'项目/旧项目/project.md'),'utf8'),legacy);
  assert.equal(await readFile(new URL('index.json',sourceStore),'utf8'),bundledIndex);
});
