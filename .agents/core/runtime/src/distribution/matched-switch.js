import {readFile,mkdir,readdir,lstat,cp,open,rm} from 'node:fs/promises';
import {join,dirname,resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {decodePackage,checksum,sameManifest,compareVersions,assertCompatible,validPath} from '../applications/protocol.js';
import {inspectCoreDataCompatibility} from '../data-compatibility.js';
import {createApplicationStorage} from '../services/application-storage.js';
import {atomicJSON,replaceFile,syncDirectory} from '../shared/durable-json.js';
import {serviceStatus,stopService} from '../services/service-manager.js';
import {assert} from '../services/workbench-common.js';
import {walkFiles,readRegular,fileMode,checkedPath} from './files.js';
import {developmentPath} from './paths.js';
import {retainRuntimeArtifacts} from './retention.js';
import {migrateApplicationOrigins} from '../applications/default-source.js';
import {LEGACY_APPLICATION_IDS,inspectApplicationIdentityMigration,prepareApplicationIdentityMigration,applyApplicationIdentityMigration} from './application-identities.js';
const coreEtag=root=>sha(JSON.stringify(walkFiles(root,'.agents/core',{exclude:path=>developmentPath(path)||path.endsWith('/.DS_Store')}).sort().map(path=>[path,sha(readRegular(root,path)),fileMode(checkedPath(root,path))])));
async function restoreInstalledService(root){const {ensureService}=await import(pathToFileURL(join(root,'.agents/core/runtime/src/services/service-manager.js')).href);return ensureService(root,{reason:'t15-matched-switch'});}
const settingsEtag=state=>sha(JSON.stringify({...state,revision:0}));
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
async function durableWrite(path,bytes,{mode=0o600,flag='wx'}={}){let file;try{file=await open(path,flag,mode);await file.writeFile(bytes);await file.sync();}finally{await file?.close();}await syncDirectory(dirname(path));}
const exists=async path=>{try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
async function ordinary(root,path){let at=root;for(const part of relative(root,path).split(/[\\/]/)){assert(part&&part!=='.'&&part!=='..','MATCHED_PATH_INVALID','配套包路径无效。');at=join(at,part);assert(!(await lstat(at)).isSymbolicLink(),'MATCHED_PATH_INVALID','配套包不允许符号链接。');}assert((await lstat(path)).isFile(),'MATCHED_PATH_INVALID','配套文件必须是普通文件。');return readFile(path);}
async function payload(candidate){
 const inventory=await json(join(candidate,'inventory.json'));
 assert(inventory.schemaVersion===1&&inventory.files&&typeof inventory.files==='object','MATCHED_INVENTORY_INVALID','配套包缺少逐文件索引。');
 for(const [path,entry] of Object.entries(inventory.files)){
  assert(validPath(path)&&(path.startsWith('.agents/core/')||path.startsWith('application-store/'))&&!path.split('/').includes('node_modules'),'MATCHED_PATH_INVALID','配套包只包含 Core 与应用源。');
  const bytes=await ordinary(candidate,join(candidate,path));assert(bytes.length===entry.size&&sha(bytes)===entry.sha256,'MATCHED_INTEGRITY','配套文件摘要不符：'+path);
 }
 const build=await json(join(candidate,'.agents/core/build.json'));
 const catalog=await json(join(candidate,'application-store/index.json'));
 assert(catalog.protocol==='ksf-app-registry-v1'&&Array.isArray(catalog.apps),'MATCHED_INVENTORY_INVALID','配套应用索引无效。');
 const entries=new Map();for(const entry of catalog.apps){assert(!entries.has(entry.manifest.id),'MATCHED_INVENTORY_INVALID','重复的应用 ID。');entries.set(entry.manifest.id,entry);}
 return {inventory,build,entries};
}
/** Read-only. Does not launch a host, create directories or execute application code. */
export async function inspectMatchedSwitch(root,candidate,{migrateIds=false}={}){
 root=resolve(root);candidate=resolve(candidate);assert(!await exists(join(root,'.agents/runtime-data/system/transaction')),'MATCHED_BUSY','请先使用固定启动器恢复或完成现有 Core 事务。');assert(root!==candidate,'MATCHED_PATH_INVALID','配套包必须与实例目录分开。');
 const {inventory,build,entries}=await payload(candidate),statePath=join(root,'.agents/user-data/applications/state.json'),before=await readFile(statePath),state=JSON.parse(before),next=migrateApplicationOrigins(state),applications=[],storage=createApplicationStorage(root);
 assert(state.schemaVersion===1&&Number.isSafeInteger(state.revision)&&state.installed&&Array.isArray(state.sources),'APP_STATE_INVALID','应用安装索引无效，原件已保留。');
 const idMap=migrateIds?Object.fromEntries(Object.keys(state.installed).filter(id=>Object.hasOwn(LEGACY_APPLICATION_IDS,id)).map(id=>[id,LEGACY_APPLICATION_IDS[id]])):{};
 assert(new Set(Object.values(idMap)).size===Object.keys(idMap).length,'APP_ID_MIGRATION_COLLISION','两个旧合作中心身份同时安装，请先核对冲突。',409);
 for(const [appId,app] of Object.entries(state.installed)){
  const targetId=idMap[appId]??appId;assert(targetId===appId||!state.installed[targetId],'APP_ID_MIGRATION_COLLISION','新旧应用身份同时存在，保留安装记录并核对。',409);
  const entry=entries.get(targetId);
  // A Core baseline does not replace newer compatible independently upgraded apps.
  if(targetId===appId&&(!entry||compareVersions(app.pending?.manifest.version??app.active.manifest.version,entry.manifest.version)>0)){
    for(const release of [app.active,app.pending].filter(Boolean))assertCompatible(release.manifest,{coreVersion:build.version});
    const data=await storage.inspectAll({appId,dataStores:app.active.manifest.dataStores,releaseDigest:app.active.digest});assert(data.canPrepare,'APP_DATA_INCOMPATIBLE','保留应用的数据不兼容。',409,data);
    applications.push({appId,previousId:appId,from:app.active.manifest.version,to:app.active.manifest.version,enabled:app.enabled,data,retained:true});continue;
  }
  assert(entry,'MATCHED_APP_MISSING','配套包缺少已安装应用：'+targetId);assertCompatible(entry.manifest,{coreVersion:build.version});
  assert(!app.pending||compareVersions(entry.manifest.version,app.pending.manifest.version)>=0,'APP_VERSION_DOWNGRADE','配套包版本低于已等待切换的应用版本。');assert(compareVersions(entry.manifest.version,app.active.manifest.version)>=0,'APP_VERSION_DOWNGRADE','配套切换不允许应用业务版本倒退。');
  assert(entry.manifest.version!==app.active.manifest.version||entry.package.sha256===app.active.digest,'APP_VERSION_REUSED','同版本不能更换内容。');
  assert(validPath(entry.package.url)&&!entry.package.url.includes('/'),'MATCHED_PATH_INVALID','应用包必须在配套应用源根目录。');
  const packagePath='application-store/'+entry.package.url;assert(inventory.files[packagePath]?.sha256===entry.package.sha256,'MATCHED_INTEGRITY','应用包不在受检索引内。');
  const bytes=await ordinary(candidate,join(candidate,packagePath));assert(bytes.length===entry.package.size&&checksum(bytes)===entry.package.sha256,'MATCHED_INTEGRITY','应用包摘要不符。');
  const decoded=decodePackage(bytes);assert(sameManifest(decoded.manifest,entry.manifest),'MATCHED_INTEGRITY','应用清单与包不一致。');
  const data=await storage.inspectAll({appId,dataStores:entry.manifest.dataStores,releaseDigest:entry.package.sha256});assert(data.canPrepare,'APP_DATA_INCOMPATIBLE','现有数据不支持配套切换。',409,data);
  const release={manifest:entry.manifest,digest:entry.package.sha256,source:next.installed[appId].active.source,installedAt:new Date().toISOString()};
  if(targetId!==appId)delete next.installed[appId];
  next.installed[targetId]={...app,...(targetId!==appId?{installationId:app.installationId??`legacy:${appId}`,legacyIds:[...new Set([...(app.legacyIds??[]),appId])]}:{}),active:release,previous:null,pending:null};applications.push({appId:targetId,previousId:appId,from:app.active.manifest.version,to:entry.manifest.version,enabled:app.enabled,data});
 }
 if(next.defaults)next.defaults=[...new Set(next.defaults.map(id=>idMap[id]??id))];
 next.revision++;
 const core=await inspectCoreDataCompatibility(root,join(candidate,'.agents/core'),{applicationState:next});assert(core.compatible,'CORE_DATA_INCOMPATIBLE','配套 Core 与实例数据不兼容。',409,core);
 const identity=Object.keys(idMap).length?await inspectApplicationIdentityMigration(root,idMap):null;
 return {root,candidate,targetVersion:build.version,beforeCoreEtag:coreEtag(root),beforeEtag:sha(before),beforeSettingsEtag:settingsEtag(state),candidateEtag:sha(JSON.stringify(inventory)),applications,core,next,inventory,migrateIds,identity};
}
async function verifyCore(core,files){for(const [path,digest] of Object.entries(files??{}))assert(sha(await ordinary(core,join(core,path)))===digest,'MATCHED_INTEGRITY','已准备 Core 文件变化：'+path);}
async function installPackages(root,candidate,plan){
 const home=join(root,'.agents/user-data/applications');
 for(const {appId} of plan.applications){
  if(plan.applications.find(item=>item.appId===appId)?.retained)continue;
  const release=plan.next.installed[appId].active,entry=(await payloadCatalog(candidate)).get(appId),pkg=decodePackage(await readFile(join(candidate,'application-store',entry.package.url))),target=join(home,'packages',appId,release.digest);
  for(const name of await readdir(join(home,'packages',appId)).catch(e=>{if(e.code==='ENOENT')return [];throw e;}))if(/^[a-f0-9]{64}$/.test(name)){const prior=(await json(join(home,'packages',appId,name,'release.json'))).release;assert(prior.manifest.version!==release.manifest.version||prior.digest===release.digest||prior.manifest.target!==release.manifest.target||prior.manifest.nodeAbi!==release.manifest.nodeAbi,'APP_VERSION_REUSED','历史同版本已有不同内容。');}
  if(!await exists(target)){
   const staging=join(home,'staging','t15-'+randomUUID());await mkdir(staging,{recursive:true});
   for(const [path,file] of pkg.files){const out=join(staging,path);await mkdir(dirname(out),{recursive:true});await durableWrite(out,file.data,{mode:file.mode});}
   await durableWrite(join(staging,'release.json'),JSON.stringify({release,files:Object.fromEntries([...pkg.files].map(([p,f])=>[p,{sha256:f.sha256,mode:f.mode}]))}));
   await mkdir(dirname(target),{recursive:true});await replaceFile(staging,target);await syncDirectory(dirname(target));
  }
  const receipt=await json(join(target,'release.json'));assert(sameManifest(receipt.release.manifest,release.manifest)&&receipt.release.digest===release.digest,'APP_PACKAGE_INTEGRITY','现存应用包回执不符。');
  for(const [path,file] of pkg.files)assert(sha(await ordinary(target,join(target,path)))===file.sha256,'APP_PACKAGE_INTEGRITY','现存应用包内容不符。');
 }
}
async function payloadCatalog(candidate){return new Map((await json(join(candidate,'application-store/index.json'))).apps.map(e=>[e.manifest.id,e]));}
export async function prepareMatchedSwitch(root,candidate,options={}){
 const plan=await inspectMatchedSwitch(root,candidate,options),id=randomUUID(),folder=join(plan.root,'.agents/runtime-data/t15-switch',id);await mkdir(folder,{recursive:true,mode:0o700});
 await durableWrite(join(folder,'before-state.json'),await readFile(join(plan.root,'.agents/user-data/applications/state.json')));
 const core=join(folder,'core');await mkdir(core);
 try{
 for(const [path,entry] of Object.entries(plan.inventory.files))if(path.startsWith('.agents/core/')){const target=join(core,path.slice('.agents/core/'.length));await mkdir(dirname(target),{recursive:true});await durableWrite(target,await ordinary(plan.candidate,join(plan.candidate,path)),{mode:entry.mode??0o644});}
 const receiptPath=join(core,'release.json');if(await exists(receiptPath)){const receipt=await json(receiptPath);assert(receipt.schema_version===4,'MATCHED_INVENTORY_INVALID','配套切换使用紧凑开发版 Core 回执。');receipt.platform=process.platform+'-'+process.arch;await atomicJSON(receiptPath,receipt);}
 // Build dependencies are local tooling, never carried in the delivery archive.
 for(const path of ['applications/sdk/node_modules','runtime/web/node_modules','runtime/vendor-build/node_modules','runtime/native-build/node_modules','runtime/web/.vite','runtime/web/coverage','runtime/web/test-results','runtime/web/.impeccable/review',...(await readdir(join(plan.root,'.agents/core/applications'),{withFileTypes:true}).catch(()=>[])).filter(item=>item.isDirectory()&&!item.isSymbolicLink()).flatMap(item=>['applications/'+item.name+'/node_modules','applications/'+item.name+'/.build'])]){
  const source=join(plan.root,'.agents/core',path),target=join(core,path);if(await exists(source)&&!await exists(target)){await mkdir(dirname(target),{recursive:true});await cp(source,target,{recursive:true,dereference:false});}
 }
 await installPackages(plan.root,plan.candidate,plan);
 await atomicJSON(join(folder,'next-state.json'),plan.next);
 const coreFiles={};for(const path of Object.keys(plan.inventory.files).filter(path=>path.startsWith('.agents/core/'))){const rel=path.slice('.agents/core/'.length);coreFiles[rel]=sha(await readFile(join(core,rel)));}
 const receipt={schemaVersion:1,id,coreFiles,root:plan.root,candidate:plan.candidate,beforeCoreEtag:plan.beforeCoreEtag,beforeEtag:plan.beforeEtag,beforeSettingsEtag:plan.beforeSettingsEtag,candidateEtag:plan.candidateEtag,nextEtag:sha(await readFile(join(folder,'next-state.json'))),targetVersion:plan.targetVersion,migrateIds:plan.migrateIds,phase:'prepared',applications:plan.applications,at:new Date().toISOString()};
 await atomicJSON(join(folder,'switch.json'),receipt);await syncDirectory(dirname(folder));await syncDirectory(join(plan.root,'.agents/runtime-data'));return {receipt:join(folder,'switch.json'),...receipt};
 }catch(error){
  // Preparation has not switched Core or the install index. Its owned staging
  // copy is disposable; preserve only the original index and bounded diagnosis.
  await atomicJSON(join(folder,'prepare-failure.json'),{schemaVersion:1,at:new Date().toISOString(),code:error.code??'MATCHED_PREPARE_FAILED',message:error.message.slice(0,2000)});
  await rm(join(folder,'switch.json'),{force:true});
  await rm(core,{recursive:true,force:true});throw error;
 }
}
async function receiptFor(root,path){root=resolve(root);path=resolve(path);const base=join(root,'.agents/runtime-data/t15-switch'),rel=relative(base,path);assert(/^[a-f0-9-]{36}[\\/]switch\.json$/.test(rel),'MATCHED_RECEIPT_INVALID','恢复必须使用本实例的切换回执。');const receipt=await json(path);assert(receipt.schemaVersion===1&&receipt.root===root,'MATCHED_RECEIPT_INVALID','回执不属于当前实例。');return {receipt,path,folder:dirname(path),root};}
export async function applyMatchedSwitch(root,path,{recover=false,fault}={}){
 const context=await receiptFor(root,path),r=context.receipt,folder=context.folder;root=context.root;
 if(r.phase!=='complete')assert(!await exists(join(folder,'retention.json')),'MATCHED_ARTIFACTS_RETIRED','此候选已按保留策略退役，请重新准备；原回执保留。');
 if(r.phase==='complete'){if(r.wasRunning&&!r.serviceRestored){await restoreInstalledService(root);r.serviceRestored=true;await atomicJSON(path,r);}return r;}
 assert(recover||r.phase==='prepared','MATCHED_RECOVERY_REQUIRED','上次切换尚未完成，请使用 recover。');
 const statePath=join(root,'.agents/user-data/applications/state.json'),marker=join(root,'.agents/runtime-data/service/deployment.json'),core=join(root,'.agents/core'),previous=join(folder,'previous-core');
 const save=async phase=>{r.phase=phase;await atomicJSON(path,r);await fault?.(phase);};
 if(r.phase==='prepared'){
  await verifyCore(join(folder,'core'),r.coreFiles);const fresh=await inspectMatchedSwitch(root,r.candidate,{migrateIds:r.migrateIds});assert(fresh.beforeCoreEtag===r.beforeCoreEtag,'MATCHED_CORE_CHANGED','Core 在准备后变化，请保留改动并重新准备。');assert(fresh.candidateEtag===r.candidateEtag,'MATCHED_INTEGRITY','配套包在准备后变化。');assert(fresh.beforeSettingsEtag===r.beforeSettingsEtag,'APP_DATA_CONFLICT','应用设置已变化，请重新预演和准备。',409);
  await mkdir(dirname(marker),{recursive:true});const existing=await exists(marker);if(existing){assert(recover&&(await json(marker)).id===r.id,'MATCHED_RECOVERY_REQUIRED','已有部署标记，请核对原回执。');}let fd;try{if(!existing){fd=await open(marker,'wx',0o600);await fd.writeFile(JSON.stringify({id:r.id,reason:'T15 matched switch',receipt:path}));await fd.sync();}}finally{await fd?.close();}
  try{const status=await serviceStatus(root),running=status.state==='running';r.wasRunning??=running;await atomicJSON(path,r);if(running){const response=await fetch(new URL('api/apps/installed',status.directUrl),{signal:AbortSignal.timeout(5000)}),snapshot=await response.json();assert(response.ok&&snapshot.ok&&Array.isArray(snapshot.data?.instances),'MATCHED_HOST_UNAVAILABLE','无法核验当前窗口租约，保留现场。');const windows=snapshot.data.instances.filter(item=>item.kind==='window'&&item.status!=='stopped');assert(!windows.length,'APP_BUSY','仍有应用窗口，请关闭后使用同一回执继续切换。',409,{applications:windows.map(item=>item.appId)});}await stopService(root);}catch(error){await rm(marker,{force:true});throw error;}
  const again=await inspectMatchedSwitch(root,r.candidate,{migrateIds:r.migrateIds});assert(again.beforeCoreEtag===r.beforeCoreEtag,'MATCHED_CORE_CHANGED','排空期间 Core 发生变化，保留现场。');assert(again.candidateEtag===r.candidateEtag,'MATCHED_INTEGRITY','配套包在排空时变化。');assert(again.beforeSettingsEtag===r.beforeSettingsEtag,'APP_DATA_CONFLICT','后台排空时应用设置变化，请重新准备。',409);
  r.beforeEtag=again.beforeEtag;await durableWrite(join(folder,'before-state.json'),await readFile(statePath),{flag:'w'});const next=await json(join(folder,'next-state.json'));next.revision=again.next.revision;await atomicJSON(join(folder,'next-state.json'),next);r.nextEtag=sha(await readFile(join(folder,'next-state.json')));
  await installPackages(root,r.candidate,again);if(again.identity){await prepareApplicationIdentityMigration(root,folder,again.identity,{fault});await save('identity-migrating');}else await save('switching');
 }
 const markerValue=await exists(marker)?await json(marker):null;if(r.phase!=='committed')assert(markerValue?.id===r.id,'MATCHED_RECEIPT_INVALID','部署标记不属于本切换。');
 assert((await serviceStatus(root)).state==='stopped','APP_BUSY','后台仍然运行，不能替换 Core。',409);
 const before=sha(await readFile(statePath));assert([r.beforeEtag,r.nextEtag].includes(before),'APP_DATA_CONFLICT','恢复前安装索引已被其他操作修改。',409);
 if(r.phase==='identity-migrating'){await applyApplicationIdentityMigration(root,folder,{fault});await save('switching');}
 if(r.phase==='switching'){
  if(!await exists(previous)){await replaceFile(core,previous);await syncDirectory(dirname(core));await fault?.('old-core-saved');}
  if(!await exists(core)){await replaceFile(join(folder,'core'),core);await syncDirectory(dirname(core));}
  await save('core-installed');
 }
 if(r.phase==='core-installed'){
  await verifyCore(core,r.coreFiles);const next=await json(join(folder,'next-state.json')),check=await inspectCoreDataCompatibility(root,core,{applicationState:next});assert(check.compatible,'CORE_DATA_INCOMPATIBLE','切换前复核失败，保留部署标记。',409,check);
  for(const [appId,app] of Object.entries(next.installed)){const result=await createApplicationStorage(root).inspectAll({appId,dataStores:app.active.manifest.dataStores});assert(result.canPrepare,'APP_DATA_INCOMPATIBLE','数据在切换中变化，保留现场。',409,result);}
  assert(sha(await readFile(join(folder,'next-state.json')))===r.nextEtag,'MATCHED_INTEGRITY','已准备安装索引被修改。');
  await atomicJSON(statePath,next);assert(sha(await readFile(statePath))===r.nextEtag,'MATCHED_INTEGRITY','安装索引读回不符。');await save('index-installed');
 }
 if(r.phase==='index-installed'){await save('committed');}
 if(r.phase==='committed'){
  await rm(marker,{force:true});await syncDirectory(dirname(marker));await save('complete');
  if(r.wasRunning){await restoreInstalledService(root);r.serviceRestored=true;await atomicJSON(path,r);}
 }
 if(r.phase==='complete'&&(!r.wasRunning||r.serviceRestored)){
  const retention=retainRuntimeArtifacts(root,'switches');r.retention={removed:retention.removed?.length??0,errors:retention.errors,warnings:retention.warnings??[]};await atomicJSON(path,r);
 }
 return r;
}
