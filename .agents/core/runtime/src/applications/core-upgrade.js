import {readFileSync,existsSync,mkdirSync,readdirSync,mkdtempSync,renameSync,rmSync,openSync,closeSync,writeFileSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assert} from '../services/workbench-common.js';
import {writeAtomic,readRegular,checkedPath} from '../distribution/files.js';
import {createApplicationStorage} from '../services/application-storage.js';
import {DEFAULT_APPLICATION_SOURCE,migrateApplicationOrigins} from './default-source.js';
import {DEFAULT_APPLICATIONS,OFFICIAL_APPLICATIONS,SDK_COMPATIBILITY,validateSDKCompatibility,assertCompatible,validateManifest,decodePackage,checksum,compareVersions,sameManifest,validPath} from './protocol.js';

export const applicationStatePath='.agents/user-data/applications/state.json';
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export function lockApplicationState(root){
  const path=checkedPath(root,'.agents/user-data/applications/.lock');mkdirSync(dirname(path),{recursive:true,mode:0o700});
  for(let attempt=0;attempt<2;attempt++)try{
    const fd=openSync(path,'wx',0o600),nonce=randomUUID();writeFileSync(fd,JSON.stringify({pid:process.pid,nonce}));
    return ()=>{closeSync(fd);if(existsSync(path)&&json(path).nonce===nonce)rmSync(path);};
  }catch(error){
    if(error.code!=='EEXIST')throw error;
    const original=readFileSync(path),owner=JSON.parse(original);let dead=false;
    if(Number.isSafeInteger(owner.pid)&&owner.pid>0)try{process.kill(owner.pid,0);}catch(e){dead=e.code==='ESRCH';}
    assert(attempt===0&&dead,'APP_BUSY','另一个应用管理操作仍在进行，或锁的归属无法证明。',409);
    assert(readFileSync(path).equals(original),'APP_BUSY','应用锁已变化。',409);rmSync(path);
  }
}
export function readApplicationState(root){
  const raw=readRegular(root,applicationStatePath,true);
  const state=raw?JSON.parse(raw):{schemaVersion:1,revision:0,sources:[DEFAULT_APPLICATION_SOURCE],installed:{}};
  assert(state.schemaVersion===1&&Number.isSafeInteger(state.revision)&&state.revision>=0&&Array.isArray(state.sources)&&state.installed&&typeof state.installed==='object'&&!Array.isArray(state.installed),'APP_STATE_INVALID','应用安装索引损坏，已保留原件。');
  return {raw,state:migrateApplicationOrigins(state)};
}
export function targetSDK(targetCore){
  return validateSDKCompatibility(json(join(targetCore,'data-compatibility.json')).sdkCompatibility??{version:'1.0.0',minCompatibleVersion:'1.0.0'});
}
function releasePath(root,release){
  validateManifest(release.manifest);
  assert(/^[a-f0-9]{64}$/.test(release.digest),'APP_PACKAGE_INTEGRITY','应用摘要无效。');
  return checkedPath(root,`.agents/user-data/applications/packages/${release.manifest.id}/${release.digest}`);
}
export function verifyInstalledRelease(root,release){
  const base=releasePath(root,release),info=json(join(base,'release.json'));
  assert(info.release.digest===release.digest&&sameManifest(info.release.manifest,release.manifest),'APP_PACKAGE_INTEGRITY','已安装应用声明与原包不一致。');
  for(const [path,file] of Object.entries(info.files)){
    assert(validPath(path),'APP_PACKAGE_INTEGRITY','应用文件路径无效。');
    const data=readRegular(root,`${relative(root,base)}/${path}`);
    assert(checksum(data)===file.sha256,'APP_PACKAGE_INTEGRITY',`应用文件摘要不一致：${path}`);
  }
}
function immutableHistory(root,manifest,digest){
  const parent=checkedPath(root,`.agents/user-data/applications/packages/${manifest.id}`);
  if(!existsSync(parent))return;
  for(const name of readdirSync(parent).filter(n=>/^[a-f0-9]{64}$/.test(n))){
    const old=json(join(parent,name,'release.json')).release,m=old.manifest;
    assert(m.version!==manifest.version||m.target!==manifest.target||m.nodeAbi!==manifest.nodeAbi||old.digest===digest,'APP_VERSION_REUSED','本机历史包存在同版本不同内容。');
  }
}
export function stageApplicationPackages(root,plan){
  for(const item of plan.packages){
    const {release,archive}=item,decoded=decodePackage(archive);immutableHistory(root,release.manifest,release.digest);
    const target=releasePath(root,release);
    if(existsSync(target)){verifyInstalledRelease(root,release);continue;}
    // Unreferenced immutable files are safe to retain after interruption. The
    // installation pointer is published only by the owning transaction.
    const parent=checkedPath(root,'.agents/user-data/applications/staging');mkdirSync(parent,{recursive:true,mode:0o700});
    const staging=mkdtempSync(join(parent,'core-'));
    try{
      for(const [path,file] of decoded.files)writeAtomic(join(staging,path),file.data,file.mode);
      writeAtomic(join(staging,'release.json'),bytes({release,files:Object.fromEntries([...decoded.files].map(([path,file])=>[path,{sha256:file.sha256,mode:file.mode}]))}),0o600);
      mkdirSync(dirname(target),{recursive:true,mode:0o700});
      try{renameSync(staging,target);}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;}
    }finally{rmSync(staging,{recursive:true,force:true});}
    verifyInstalledRelease(root,release);
  }
}
export async function planCoreApplications(root,targetCore,{rollbackRecord,environment={}}={}){
  const {raw,state}=readApplicationState(root),next=structuredClone(state),version=json(join(targetCore,'build.json')).version,sdkCompatibility=targetSDK(targetCore);
  const storage=createApplicationStorage(root),entries=[],packages=[],changes={},blocked=[];
  function block(id,error){entries.push({appId:id,action:'block',from:state.installed[id]?.active?.manifest.version??null,to:null,reason:error.message});blocked.push({appId:id,error});}
  const check=release=>assertCompatible(release.manifest,{coreVersion:version,sdkCompatibility,...environment});
  async function data(release,rollback=false){const result=await storage.inspectAll({appId:release.manifest.id,dataStores:release.manifest.dataStores,releaseDigest:release.digest});assert(rollback?result.compatible:result.canPrepare,'APP_DATA_INCOMPATIBLE','当前业务数据无法用于目标应用版本。',409,result);}
  function publish(id,record,action,reason){
    const old=state.installed[id]??null;
    entries.push({appId:id,action,from:old?.active?.manifest.version??null,to:record?.active?.manifest.version??null,reason});
    if(!sameManifest(old,record)){
      changes[id]={before:old,after:record};
      if(record)next.installed[id]=record;else delete next.installed[id];
    }
  }
  if(rollbackRecord){
    for(const [id,change] of Object.entries(rollbackRecord.changes)){
      const current=state.installed[id]??null;
      const untouched=sameManifest(current?.active,change.after?.active)&&sameManifest(current?.pending??null,change.after?.pending??null);
      if(!untouched){publish(id,current,'keep','升级后应用已有独立变更，保留并检查目标Core兼容性。');continue;}
      const restored=change.before?{...change.before,...current,active:change.before.active,previous:change.before.previous??null,pending:change.before.pending??null}:null;
      if(restored){for(const release of [restored.active,restored.pending].filter(Boolean)){check(release);verifyInstalledRelease(root,release);await data(release,true);}}
      publish(id,restored,'rollback','恢复本次Core切换持有的版本指针，保留用户设置和业务数据。');
      if(!restored&&!(rollbackRecord.defaultsBefore??[]).includes(id))next.defaults=(next.defaults??[]).filter(value=>value!==id);
    }
  }else{
    const store=join(targetCore,'applications/store'),index=json(join(store,'index.json'));
    assert(index.protocol==='ksf-app-registry-v1'&&Array.isArray(index.apps),'APP_SOURCE_INVALID','随包应用索引无效。');
    for(const id of OFFICIAL_APPLICATIONS){
      const old=state.installed[id];
      try{
      if(!old&&(!DEFAULT_APPLICATIONS.includes(id)||state.defaults?.includes(id))){entries.push({appId:id,action:'skip',from:null,to:null,reason:'保留未安装或卸载意图。'});continue;}
      if(id==='com.ksf.cooperation-center'&&Object.keys(state.installed).some(key=>['com.yinbaiyuan.lan-messenger','yinbaiyuan.lan-messenger'].includes(key))){entries.push({appId:id,action:'skip',from:null,to:null,reason:'旧合作身份需显式迁移。'});continue;}
      const candidates=index.apps.filter(e=>e.manifest.id===id).filter(e=>{try{check({manifest:e.manifest});return true;}catch{return false;}}).sort((a,b)=>compareVersions(b.manifest.version,a.manifest.version)||Number(!!b.manifest.target)-Number(!!a.manifest.target)||Number(!!b.manifest.nodeAbi)-Number(!!a.manifest.nodeAbi));
      const baseline=candidates[0];
      if(!baseline){if(old){check(old.active);if(old.pending)check(old.pending);}entries.push({appId:id,action:'skip',from:old?.active.manifest.version??null,to:old?.active.manifest.version??null,reason:'目标Core没有此应用的适用随包版本。'});continue;}
      assert(/^[A-Za-z0-9_.-]+\.ksfapp$/.test(baseline.package?.url),'APP_SOURCE_INVALID','随包应用包路径无效。');
      const archive=readFileSync(join(store,baseline.package.url));
      assert(archive.length===baseline.package.size&&checksum(archive)===baseline.package.sha256,'APP_PACKAGE_INTEGRITY','随包应用包摘要不一致。');
      const decoded=decodePackage(archive);assert(sameManifest(decoded.manifest,baseline.manifest),'APP_PACKAGE_INTEGRITY','随包清单与应用包不一致。');
      immutableHistory(root,baseline.manifest,baseline.package.sha256);
      if(old&&old.active.source.id!=='ksf-apps'){publish(id,old,'keep','保留原安装来源。');continue;}
      const installed=[old?.active,old?.pending].filter(Boolean).filter(release=>{try{check(release);return true;}catch{return false;}}).sort((a,b)=>compareVersions(b.manifest.version,a.manifest.version));
      let selected=installed[0];
      if(!selected||compareVersions(baseline.manifest.version,selected.manifest.version)>0){selected={manifest:baseline.manifest,digest:baseline.package.sha256,source:{id:DEFAULT_APPLICATION_SOURCE.id,name:DEFAULT_APPLICATION_SOURCE.name,url:DEFAULT_APPLICATION_SOURCE.url},installedAt:new Date().toISOString()};packages.push({release:selected,archive});}
      else if(compareVersions(baseline.manifest.version,selected.manifest.version)===0&&baseline.manifest.target===selected.manifest.target&&baseline.manifest.nodeAbi===selected.manifest.nodeAbi)assert(selected.digest===baseline.package.sha256,'APP_VERSION_REUSED','已安装包与随包同版本摘要冲突。');
      assert(!old||compareVersions(selected.manifest.version,old.active.manifest.version)>=0,'APP_CORE_INCOMPATIBLE','目标Core要求应用降级，请先显式处理应用兼容性。',409);
      check(selected);await data(selected);
      const changed=!old||old.active.digest!==selected.digest;
      if(!packages.some(p=>p.release.digest===selected.digest))verifyInstalledRelease(root,selected);
      const record=old?{...old,active:selected,previous:changed?old.active:old.previous??null,pending:null}:{installationId:randomUUID(),enabled:true,active:selected,previous:null,pending:null};
      publish(id,record,changed?(old?'update':'install'):'keep',changed?'采用目标Core兼容的最新已安装或随包版本。':'保留较新或相同的兼容版本。');
      if(!next.defaults?.includes(id)&&DEFAULT_APPLICATIONS.includes(id))next.defaults=[...(next.defaults??[]),id];
      }catch(error){block(id,error);}
    }
  }
  // Independently installed business applications also constrain Core changes.
  for(const [id,app] of Object.entries(next.installed)){
    if(blocked.some(item=>item.appId===id))continue;
    try{for(const release of [app.active,app.pending].filter(Boolean)){check(release);if(!packages.some(item=>item.release.digest===release.digest))verifyInstalledRelease(root,release);await data(release,!!rollbackRecord);}}catch(error){block(id,error);}
  }
  if(blocked.length){const error=blocked[0].error;error.data={...error.data,applications:entries,blocked:blocked.map(({appId,error})=>({appId,code:error.code??'APP_CORE_INCOMPATIBLE',message:error.message}))};throw error;}
  const changed=Object.keys(changes).length>0;
  if(changed)next.revision=state.revision+1;
  return {before:raw,after:changed?bytes(next):raw,state:next,entries,packages,changed,record:{schemaVersion:1,changes,defaultsBefore:state.defaults??[]}};
}
export function assertApplicationBaseline(root,plan){const now=readRegular(root,applicationStatePath,true);assert(now===null?plan.before===null:plan.before!==null&&now.equals(plan.before),'APP_STATE_CHANGED','应用安装索引在预览后发生变化，已保留当前内容。',409);}
export function writeApplicationPlan(root,plan){assertApplicationBaseline(root,plan);if(plan.changed)writeAtomic(checkedPath(root,applicationStatePath),plan.after,0o600);}

/** One-time bridge for old Core updaters. No network and no application code. */
export async function reconcileCoreApplications(root,targetCore){
  if(!existsSync(join(targetCore,'build.json'))||!existsSync(join(targetCore,'applications/store/index.json')))return;
  const build=json(join(targetCore,'build.json'));
  if(compareVersions(build.version,'0.5.3')<0)return;
  const home=checkedPath(root,'.agents/runtime-data/applications'),marker=join(home,'core-baseline.json'),journal=join(home,'core-reconcile.json');
  const backupsPath=checkedPath(root,'.agents/runtime-data/system/backups'),receiptPath=join(targetCore,'release.json');
  const receiptMatches=!existsSync(receiptPath)||json(receiptPath).version===build.version;
  const epochs=receiptMatches&&existsSync(backupsPath)?readdirSync(backupsPath).sort().reverse().filter(name=>/^[A-Za-z0-9._-]+$/.test(name)&&existsSync(join(backupsPath,name,'committed'))&&existsSync(join(backupsPath,name,'meta.json'))&&json(join(backupsPath,name,'meta.json')).to===build.version):[];
  const epoch=receiptMatches?(epochs[0]??'initial'):'candidate:'+checksum(readFileSync(receiptPath));
  const fingerprint=checksum(bytes({epoch,version:build.version,sdk:targetSDK(targetCore),store:checksum(readFileSync(join(targetCore,'applications/store/index.json')))}));
  if(existsSync(marker)&&json(marker).fingerprint===fingerprint&&!existsSync(journal))return;
  const unlock=lockApplicationState(root);
  try{
  mkdirSync(home,{recursive:true,mode:0o700});
  let operation;
  if(existsSync(journal)){
    operation=json(journal);assert(operation.fingerprint===fingerprint,'APP_CORE_RECONCILE_CONFLICT','另一个Core版本的应用对账尚未完成。');
    const live=readRegular(root,applicationStatePath,true),old=operation.before===null?null:Buffer.from(operation.before,'base64'),next=operation.after===null?null:Buffer.from(operation.after,'base64');
    assert(live===null?(old===null||next===null):(old&&live.equals(old)||next&&live.equals(next)),'APP_STATE_CHANGED','应用对账期间安装索引发生外部变化，保留现场。');
    if(next!==null&&(!live||!live.equals(next)))writeAtomic(checkedPath(root,applicationStatePath),next,0o600);
  }else{
    const plan=await planCoreApplications(root,targetCore);stageApplicationPackages(root,plan);assertApplicationBaseline(root,plan);
    operation={schemaVersion:1,fingerprint,before:plan.before?.toString('base64')??null,after:plan.after?.toString('base64')??null,record:plan.record,entries:plan.entries};
    writeAtomic(journal,bytes(operation),0o600);writeApplicationPlan(root,plan);
  }
  // Link the bridge's pointer changes to the real preceding Core transaction.
  const backups=checkedPath(root,'.agents/runtime-data/system/backups');
  if(receiptMatches&&existsSync(backups))for(const name of readdirSync(backups).sort().reverse()){
    if(!/^[A-Za-z0-9._-]+$/.test(name))continue;
    const folder=join(backups,name),meta=join(folder,'meta.json');
    if(existsSync(meta)&&existsSync(join(folder,'committed'))&&json(meta).to===build.version&&existsSync(join(folder,'old-core'))){
      const record=join(folder,'applications.json');
      if(!existsSync(record)&&Object.keys(operation.record.changes).length)writeAtomic(record,bytes(operation.record),0o600);
      break;
    }
  }
  writeAtomic(marker,bytes({schemaVersion:1,fingerprint,entries:operation.entries}),0o600);rmSync(journal);
  }finally{unlock();}
}
