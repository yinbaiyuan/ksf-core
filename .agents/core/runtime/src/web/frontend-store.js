import {randomUUID,createHash} from 'node:crypto';
import {readFile,open,lstat,rename,rm,readdir} from 'node:fs/promises';
import {join,dirname,resolve,relative,isAbsolute} from 'node:path';
import {withExclusiveLock,readFileSnapshot,sameIdentity} from '../shared/files.js';
import {safeDirectory,atomicJSON,readJSON,syncDirectory} from '../shared/durable-json.js';
import {createCoordinator,assert,problem} from '../services/workbench-common.js';
import {assertCompatible} from '../applications/protocol.js';
import {assertFrontendHost} from './frontend-policy.js';
import {verifyWebBuild,verifyFrontendSnapshot} from './assets.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const releaseId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const initial=()=>({schemaVersion:1,revision:0,active:null,pending:null,lastKnownGood:null,releases:{},operations:{}});
const invalid=message=>{throw problem('UI_FRONTEND_STATE_INVALID',message,409);};

/** Host-owned release registry. It never reads or rewrites application business data. */
export function createFrontendStore(root,{coreVersion,sdkCompatibility,withConsumers,qualifySnapshot,now=Date.now,leaseMs=90000}={}) {
  root=resolve(root);
  assert(Number.isSafeInteger(leaseMs)&&leaseMs>=1000,'UI_FRONTEND_POLICY_INVALID','客户端保留期限无效。');
  const home=join(root,'.agents/runtime-data/ui-runtime'),releasesHome=join(home,'releases'),clientsHome=join(home,'clients'),historyHome=join(home,'selection-history');
  const settings=join(root,'.agents/user-data/ui-runtime'),statePath=join(settings,'state.json'),coordinator=createCoordinator(),verifiedResources=new Map();
  const etag=state=>digest(JSON.stringify(state));
  function readRecord(path){
    const valid=stat=>assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=8*1024*1024,'UI_FRONTEND_RECORD_INVALID','前端记录必须是有界普通文件。',409);
    return readFileSnapshot(path,{validateEntry:valid,validateOpen(entry,opened){valid(opened);assert(sameIdentity(entry,opened,['dev','ino']),'UI_FRONTEND_RECORD_CHANGED','记录读取时发生变化。',409);},validateRead(before,after,bytes){assert(sameIdentity(before,after)&&bytes.length===after.size,'UI_FRONTEND_RECORD_CHANGED','记录读取时发生变化。',409);}}).bytes;
  }
  function readCheckpoint(id){const bytes=readRecord(join(historyHome,id+'.json'));assert(digest(bytes)===id,'UI_FRONTEND_HISTORY_INVALID','检查点摘要不符。',409);return validateState(JSON.parse(bytes.toString('utf8')));}
  async function ordinary(path){
    const rel=relative(root,path);assert(rel&&!isAbsolute(rel)&&!rel.split(/[\\/]/).includes('..'),'UI_FRONTEND_PATH_INVALID','前端路径越界。');
    let at=root;for(const part of rel.split(/[\\/]/)){at=join(at,part);try{const stat=await lstat(at);assert(stat.isDirectory()&&!stat.isSymbolicLink(),'UI_FRONTEND_PATH_INVALID','前端存储目录不能是符号链接。',409);}catch(error){if(error.code==='ENOENT')return false;throw error;}}return true;
  }
  function validateState(value){
    assert(value?.schemaVersion===1&&Number.isSafeInteger(value.revision)&&value.revision>=0&&value.releases&&typeof value.releases==='object'&&!Array.isArray(value.releases)&&value.operations&&typeof value.operations==='object'&&!Array.isArray(value.operations),'UI_FRONTEND_STATE_INVALID','前端选择记录损坏，原件已保留。',409);
    for(const [id,record]of Object.entries(value.releases))assert(releaseId(id)&&record&&releaseId(record.buildDigest)&&releaseId(record.sourceDigest)&&record.files&&typeof record.files==='object'&&!Array.isArray(record.files)&&Object.values(record.files).every(releaseId),'UI_FRONTEND_STATE_INVALID','已登记快照身份损坏。',409);
    for(const key of ['active','pending','lastKnownGood'])assert(value[key]===null||releaseId(value[key])&&Object.hasOwn(value.releases,value[key]),'UI_FRONTEND_STATE_INVALID','前端选择指向未登记快照。',409);
    assert(Object.keys(value.operations).length<=512&&Object.entries(value.operations).every(([id,item])=>uuid(id)&&releaseId(item?.fingerprint)&&item.result?.operationId===id&&Number.isSafeInteger(item.result.revision)&&item.result.revision<=value.revision),'UI_FRONTEND_STATE_INVALID','前端操作回执损坏。',409);
    return value;
  }
  async function state(){
    if(await ordinary(settings))try{return validateState(await readJSON(statePath,undefined,{invalid}));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(await ordinary(historyHome))for(const name of await readdir(historyHome))if(/^[a-f0-9]{64}\.json$/.test(name)){let prior;try{prior=readCheckpoint(name.slice(0,-5));}catch{}assert(!prior||prior.revision===0,'UI_FRONTEND_STATE_MISSING','已有选择历史但当前记录丢失，请从已核验检查点恢复。',409);}
    return initial();
  }
  async function checkpoint(value){
    await safeDirectory(root,historyHome);const bytes=Buffer.from(JSON.stringify(value)+'\n'),id=digest(bytes),path=join(historyHome,id+'.json');
    let handle;try{handle=await open(path,'wx',0o600);await handle.writeFile(bytes);await handle.sync();}catch(error){if(error.code!=='EEXIST')throw error;assert(digest(await readFile(path))===id,'UI_FRONTEND_HISTORY_INVALID','选择检查点不能更换内容。',409);}finally{await handle?.close();}
    await syncDirectory(historyHome);
    const entries=[];for(const name of await readdir(historyHome))if(/^[a-f0-9]{64}\.json$/.test(name)){try{entries.push({name,revision:readCheckpoint(name.slice(0,-5)).revision});}catch{}}
    entries.sort((a,b)=>b.revision-a.revision||a.name.localeCompare(b.name));for(const entry of entries.slice(32))if(entry.name!==id+'.json')await rm(join(historyHome,entry.name),{force:true});
    return id;
  }
  async function locked(action){
    await safeDirectory(root,settings);await safeDirectory(root,home);
    return coordinator.run('state',()=>withExclusiveLock(join(settings,'.lock'),{pid:process.pid,nonce:randomUUID()},action,{reclaimStale:true,onLocked(){throw problem('UI_FRONTEND_BUSY','另一处正在维护前端快照，请读回后重试。',409);}}));
  }
  async function snapshot(value,id){
    assert(releaseId(id)&&Object.hasOwn(value.releases,id),'UI_FRONTEND_UNKNOWN','所选前端快照未登记。',404);
    const directory=join(releasesHome,id,'dist');
    assert(await ordinary(directory),'UI_FRONTEND_INTEGRITY','已登记快照文件缺失。',409);
    const assets=verifyFrontendSnapshot(directory,{expectedBuildDigest:value.releases[id].buildDigest});
    assert(assets.uiRuntime?.frontendReleaseId===id,'UI_FRONTEND_INTEGRITY','快照目录与完整发布身份不一致。',409);
    assert(JSON.stringify(assets.snapshotInfo.files)===JSON.stringify(value.releases[id].files),'UI_FRONTEND_INTEGRITY','登记资源清单与不可变快照不一致。',409);
    verifiedResources.set(id,{buildDigest:value.releases[id].buildDigest,assets});
    return assets;
  }
  function host(assets){assertFrontendHost(assets.uiRuntime,{coreVersion});}
  async function consumers(assets,action){
    host(assets);
    assert(typeof withConsumers==='function','UI_CONSUMER_GATE_UNAVAILABLE','宿主尚未接入应用兼容性锁，不能切换前端快照。',409);
    return withConsumers(async releases=>{
      const blocked=[];
      for(const entry of releases){try{assertCompatible(entry.manifest,{coreVersion,sdkCompatibility});}catch(error){blocked.push({appId:entry.manifest.id,code:error.code,message:error.message});}}
      if(blocked.length)throw problem('UI_CONSUMER_INCOMPATIBLE','此快照不能满足当前应用需求，已保留原版本。',409,{blocked});
      return action?.();
    });
  }
  async function execute(kind,input,action){
    assert(uuid(input?.operationId)&&typeof input.ifMatch==='string','UI_FRONTEND_REQUEST_INVALID','快照修改需要原操作身份和版本。');
    const fingerprint=digest(JSON.stringify({kind,...input}));
    return locked(async()=>{
      const value=await state(),old=value.operations[input.operationId];
      if(old){assert(old.fingerprint===fingerprint,'UI_OPERATION_REUSED','同一操作身份不能用于不同请求。',409);return {...old.result,replayed:true,current:{active:value.active,revision:value.revision,etag:etag(value)}};}
      assert(input.ifMatch===etag(value),'UI_FRONTEND_CONFLICT','前端选择已变化，请沿原操作身份读回核对。',409);
      await checkpoint(value);
      return action(value,async result=>{
        value.revision++;
        const receipt={operationId:input.operationId,revision:value.revision,...result};
        value.operations[input.operationId]={fingerprint,result:receipt};
        const ids=Object.keys(value.operations);for(const id of ids.slice(0,Math.max(0,ids.length-512)))delete value.operations[id];
        assert(Buffer.byteLength(JSON.stringify(value))<=8*1024*1024,'UI_FRONTEND_STORAGE_FULL','前端选择记录已满，请先检查和清理无引用快照。',409);
        await atomicJSON(statePath,value);
        let recoveryWarning;try{await checkpoint(value);}catch{recoveryWarning='选择已保存，最新恢复检查点尚未保存；先前检查点保留。';}
        return {...receipt,replayed:false,current:{active:value.active,revision:value.revision,etag:etag(value)},...(recoveryWarning?{recoveryWarning}:{})};
      });
    });
  }
  async function status(){const value=await state();return {...value,etag:etag(value)};}
  async function stage(webDirectory,input){
    webDirectory=resolve(webDirectory);
    return execute('stage',{...input,webDirectory},async(value,commit)=>{
      const assets=verifyWebBuild(webDirectory);host(assets);
      const id=assets.uiRuntime.frontendReleaseId,info=assets.snapshotInfo,existing=value.releases[id];
      assert(!existing||existing.buildDigest===info.buildDigest,'UI_FRONTEND_ID_REUSED','已登记快照不能更换字节或元数据。',409);
      for(const record of Object.values(value.releases))for(const [path,hash]of Object.entries(info.files))if(path.startsWith('assets/')&&record.files[path])assert(record.files[path]===hash,'UI_ASSET_COLLISION','同一资源地址不能提供不同字节；候选未激活。',409);
      await safeDirectory(root,releasesHome);
      const parent=join(releasesHome,id),temporary=join(releasesHome,'.stage-'+randomUUID());
      if(!existing){
        await safeDirectory(root,join(temporary,'dist'));
        try{
          // Only verified files enter the immutable store; no symlinks or extra source/cache files.
          for(const name of Object.keys(info.files)){
            const bytes=name==='THIRD_PARTY_NOTICES.txt'?await readFile(join(webDirectory,'dist',name)):assets.get('/'+name).bytes;
            assert(digest(bytes)===info.files[name],'UI_FRONTEND_INTEGRITY','暂存期间资源发生变化。',409);
            const target=join(temporary,'dist',name);await safeDirectory(root,dirname(target));const handle=await open(target,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
          }
          const build=await readFile(join(webDirectory,'dist/build.json'));assert(digest(build)===info.buildDigest,'UI_FRONTEND_INTEGRITY','暂存期间清单发生变化。',409);const manifestHandle=await open(join(temporary,'dist/build.json'),'wx',0o600);try{await manifestHandle.writeFile(build);await manifestHandle.sync();}finally{await manifestHandle.close();}
          verifyFrontendSnapshot(join(temporary,'dist'),{expectedBuildDigest:info.buildDigest});
          await syncDirectory(join(temporary,'dist/assets'));await syncDirectory(join(temporary,'dist'));await syncDirectory(temporary);
          try{await rename(temporary,parent);}catch(error){
            if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;
            const recovered=verifyFrontendSnapshot(join(parent,'dist'),{expectedBuildDigest:info.buildDigest});assert(recovered.uiRuntime.frontendReleaseId===id,'UI_FRONTEND_INTEGRITY','遗留暂存目标不一致。',409);
          }
          await syncDirectory(releasesHome);
        }finally{await rm(temporary,{recursive:true,force:true});}
      }else await snapshot(value,id);
      value.releases[id]=existing??{buildDigest:info.buildDigest,sourceDigest:info.sourceDigest,files:info.files,stagedAt:new Date(now()).toISOString()};
      value.pending=id;
      return commit({action:'stage',releaseId:id});
    });
  }
  async function preview(id){const value=await state(),assets=await snapshot(value,id);await consumers(assets);return {releaseId:id,runtime:assets.uiRuntime,etag:etag(value),compatible:true};}
  async function activate(id,input){
    return execute('activate',{...input,releaseId:id},async(value,commit)=>{
      const assets=await snapshot(value,id);
      return consumers(assets,async()=>{const previous=value.active;value.active=id;if(value.pending===id)value.pending=null;return commit({action:'activate',releaseId:id,previous});});
    });
  }
  async function markKnownGood(id,input){
    return execute('qualify',{...input,releaseId:id},async(value,commit)=>{
      const assets=await snapshot(value,id);
      assert(typeof qualifySnapshot==='function','UI_QUALIFICATION_REQUIRED','快照须取得独立的完整验收记录，启动成功不等于合格回退版本。',409);
      const qualification=await qualifySnapshot(id,input.qualificationId,{buildDigest:assets.snapshotInfo.buildDigest,sourceDigest:assets.snapshotInfo.sourceDigest});
      assert(qualification&&typeof qualification.id==='string'&&Array.isArray(qualification.evidence)&&qualification.evidence.length>0,'UI_QUALIFICATION_REQUIRED','完整验收记录不充分。',409);
      return consumers(assets,async()=>{value.releases[id].qualification=structuredClone(qualification);value.lastKnownGood=id;return commit({action:'qualify',releaseId:id,qualificationId:qualification.id});});
    });
  }
  async function current(){const value=await state();assert(value.active,'UI_FRONTEND_NOT_READY','尚未选择完整前端快照。',503);const assets=await snapshot(value,value.active);host(assets);return {releaseId:value.active,assets,etag:etag(value)};}
  async function retain(id){
    return locked(async()=>{const value=await state();host(await snapshot(value,id));const clientId=randomUUID();await safeDirectory(root,clientsHome);const lease={clientId,releaseId:id,expiresAt:now()+leaseMs};await atomicJSON(join(clientsHome,clientId+'.json'),lease);return lease;});
  }
  async function heartbeat(clientId){
    assert(uuid(clientId),'UI_CLIENT_INVALID','客户端身份无效。');
    return locked(async()=>{const path=join(clientsHome,clientId+'.json'),lease=await readJSON(path,null,{invalid});assert(lease&&lease.expiresAt>now(),'UI_CLIENT_EXPIRED','客户端快照引用已过期，请安全重载。',410);host(await snapshot(await state(),lease.releaseId));lease.expiresAt=now()+leaseMs;await atomicJSON(path,lease);return lease;});
  }
  async function documentRuntime({clientId,releaseId:id}={}){
    assert(uuid(clientId)&&releaseId(id),'UI_CLIENT_INVALID','文档快照引用无效。');
    return locked(async()=>{const path=join(clientsHome,clientId+'.json'),lease=await readJSON(path,null,{invalid});assert(lease&&lease.expiresAt>now(),'UI_CLIENT_EXPIRED','客户端快照引用已过期，请安全重载。',410);assert(lease.releaseId===id,'UI_CLIENT_INVALID','客户端与文档快照不一致。',409);const assets=await snapshot(await state(),id);host(assets);lease.expiresAt=now()+leaseMs;await atomicJSON(path,lease);return assets.uiRuntime;});
  }
  async function startupReady({clientId,releaseId:id}={}){
    assert(uuid(clientId)&&releaseId(id),'UI_CLIENT_INVALID','启动文档身份无效。');
    return locked(async()=>{
      const path=join(clientsHome,clientId+'.json'),lease=await readJSON(path,null,{invalid});
      assert(lease&&lease.expiresAt>now()&&lease.releaseId===id,'UI_CLIENT_EXPIRED','启动文档引用已过期或不一致。',410);
      assert(!lease.startupFallbackAttempted,'UI_BOOT_FALLBACK_EXHAUSTED','本次启动已经尝试恢复，不能重新进入业务界面。',409);
      lease.bootState='ready';await atomicJSON(path,lease);return {clientId,releaseId:id,bootState:'ready'};
    });
  }
  /** Only an unready document's registered JS/CSS failure can request one qualified whole-snapshot fallback. */
  async function startupFallback(input){
    assert(uuid(input?.clientId)&&releaseId(input.releaseId)&&input.operationId===input.clientId,'UI_BOOT_INVALID','启动恢复必须沿当前文档原身份核对。');
    assert(['asset-error','module-error','csp'].includes(input.reason)&&typeof input.resource==='string'&&/^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(input.resource),'UI_BOOT_INVALID','此错误不属于可归因的前端启动资源。');
    return execute('startup-fallback',input,async(value,commit)=>{
      const path=join(clientsHome,input.clientId+'.json'),lease=await readJSON(path,null,{invalid});
      assert(lease&&lease.expiresAt>now()&&lease.releaseId===input.releaseId,'UI_CLIENT_EXPIRED','启动文档引用已过期或不一致。',410);
      assert(lease.bootState!=='ready'&&!lease.startupFallbackAttempted,'UI_BOOT_FALLBACK_EXHAUSTED','本次文档已进入交互或尝试过启动恢复，不能自动回退。',409);
      assert(value.active===input.releaseId&&value.releases[input.releaseId]?.files[input.resource.slice(1)],'UI_BOOT_INVALID','失败资源不属于当前候选，未改变选择。',409);
      lease.startupFallbackAttempted=true;lease.bootFailure={reason:input.reason,resource:input.resource,at:new Date(now()).toISOString()};await atomicJSON(path,lease);
      const id=value.lastKnownGood,record=id&&value.releases[id];
      assert(id&&id!==input.releaseId&&record?.qualification?.id,'UI_QUALIFICATION_REQUIRED','尚无独立核对的可用LKG，请进入基础恢复。',409);
      const assets=await snapshot(value,id);
      assert(typeof qualifySnapshot==='function','UI_QUALIFICATION_REQUIRED','尚未接入独立验收记录，请进入基础恢复。',409);
      const qualification=await qualifySnapshot(id,record.qualification.id,{buildDigest:assets.snapshotInfo.buildDigest,sourceDigest:assets.snapshotInfo.sourceDigest});
      assert(qualification&&qualification.id===record.qualification.id,'UI_QUALIFICATION_REQUIRED','LKG资格记录无法核对，请进入基础恢复。',409);
      return consumers(assets,async()=>{
        const previous=value.active;value.active=id;value.releases[previous].lastStartupFailure={clientId:input.clientId,...lease.bootFailure};
        return commit({action:'startup-fallback',releaseId:id,previous,bootAttempt:input.clientId,reason:input.reason,resource:input.resource});
      });
    });
  }
  async function release(clientId){assert(uuid(clientId),'UI_CLIENT_INVALID','客户端身份无效。');return locked(()=>rm(join(clientsHome,clientId+'.json'),{force:true}));}
  async function asset(path){
    assert(typeof path==='string'&&/^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg|jpg|woff2?|ttf)$/.test(path),'UI_ASSET_NOT_FOUND','前端资源不存在。',404);
    const value=await state(),ids=Object.keys(value.releases).filter(id=>value.releases[id].files[path.slice(1)]);
    assert(new Set(ids.map(id=>value.releases[id].files[path.slice(1)])).size<=1,'UI_ASSET_COLLISION','同一内容地址出现不同资源，已阻止混装。',409);
    ids.sort((a,b)=>Number(b===value.active)-Number(a===value.active));
    let failure;
    for(const id of ids){
      try{const cached=verifiedResources.get(id),assets=cached?.buildDigest===value.releases[id].buildDigest?cached.assets:await snapshot(value,id),file=assets.get(path);assert(file&&digest(file.bytes)===value.releases[id].files[path.slice(1)],'UI_FRONTEND_INTEGRITY','登记资源与已验证字节不一致。',409);return file;}catch(error){failure=error;}
    }
    if(failure)throw failure;
    throw problem('UI_ASSET_NOT_FOUND','原快照资源已不再保留，请安全重载。',410);
  }
  async function collect(input){
    return execute('collect',input,async(value,commit)=>{
      const protectedIds=new Set([value.active,value.pending,value.lastKnownGood].filter(Boolean)),expiredClients=[];
      for(const name of await readdir(clientsHome).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
        assert(/^[a-f0-9-]{36}\.json$/.test(name),'UI_CLIENT_INVALID','客户端引用目录含未知文件，已停止清理。',409);
        const lease=await readJSON(join(clientsHome,name),null,{invalid});assert(lease&&releaseId(lease.releaseId)&&Number.isFinite(lease.expiresAt),'UI_CLIENT_INVALID','客户端引用损坏，已停止清理。',409);
        if(lease.expiresAt>now())protectedIds.add(lease.releaseId);else expiredClients.push(name);
      }
      const removed=Object.keys(value.releases).filter(id=>!protectedIds.has(id));
      // Publish reachability first. A crash may retain unreferenced bytes, never remove protected bytes.
      for(const id of removed)delete value.releases[id];
      const receipt=await commit({action:'collect',removed,expiredClients:expiredClients.length});
      for(const id of removed){verifiedResources.delete(id);await rm(join(releasesHome,id),{recursive:true,force:true});}
      for(const name of expiredClients)await rm(join(clientsHome,name),{force:true});
      return receipt;
    });
  }
  async function recoveryStates(){
    let selectionDigest=null;
    if(await ordinary(settings))try{selectionDigest=digest(readRecord(statePath));}catch(error){if(error.code!=='ENOENT')throw error;}
    const states=[];
    if(await ordinary(historyHome))for(const name of await readdir(historyHome))if(/^[a-f0-9]{64}\.json$/.test(name)){
      try{const value=readCheckpoint(name.slice(0,-5));if(value.active||value.pending||value.lastKnownGood)states.push({checkpoint:name.slice(0,-5),revision:value.revision,active:value.active,pending:value.pending,lastKnownGood:value.lastKnownGood});}catch{/* A damaged checkpoint never becomes a recovery choice. */}
    }
    return {selectionDigest,states:states.sort((a,b)=>b.revision-a.revision)};
  }
  async function recoverSelection(checkpointId,{operationId,ifMatchRaw}={}){
    assert(releaseId(checkpointId)&&uuid(operationId)&&(ifMatchRaw===null||releaseId(ifMatchRaw)),'UI_FRONTEND_REQUEST_INVALID','恢复需要检查点、原操作身份和损坏选择的摘要。');
    return locked(async()=>{
      const fingerprint=digest(JSON.stringify({action:'recover',checkpointId,ifMatchRaw}));
      let previous;try{previous=await state();}catch{}
      const replay=previous?.operations[operationId];if(replay){assert(replay.fingerprint===fingerprint,'UI_OPERATION_REUSED','同一操作身份不能用于不同恢复请求。',409);return {...replay.result,replayed:true,etag:etag(previous)};}
      const catalog=await recoveryStates();assert(catalog.selectionDigest===ifMatchRaw,'UI_FRONTEND_CONFLICT','选择原件已变化，请重新核对恢复范围。',409);
      assert(!previous?.active,'UI_FRONTEND_RECOVERY_NOT_REQUIRED','选择记录仍有效，请使用正常预演和CAS切换。',409);
      assert(catalog.states.some(item=>item.checkpoint===checkpointId),'UI_FRONTEND_HISTORY_INVALID','恢复检查点未通过核验。',409);
      const restored=readCheckpoint(checkpointId);
      // Keep every registered immutable release seen in valid checkpoints, so existing clients retain their own URLs.
      let revision=restored.revision;
      for(const item of [...catalog.states].reverse()){const value=readCheckpoint(item.checkpoint);revision=Math.max(revision,value.revision);for(const [id,record]of Object.entries(value.releases)){const known=restored.releases[id];assert(!known||known.buildDigest===record.buildDigest,'UI_FRONTEND_HISTORY_INVALID','历史快照身份冲突，已停止恢复。',409);restored.releases[id]??=record;}for(const [id,operation]of Object.entries(value.operations)){const known=restored.operations[id];assert(!known||known.fingerprint===operation.fingerprint,'UI_FRONTEND_HISTORY_INVALID','历史操作身份冲突，已停止恢复。',409);restored.operations[id]=operation;}}
      const knownOperation=restored.operations[operationId];if(knownOperation){assert(knownOperation.fingerprint===fingerprint,'UI_OPERATION_REUSED','同一操作身份不能用于不同恢复请求。',409);return {...knownOperation.result,replayed:true};}
      const assets=await snapshot(restored,restored.active??restored.pending??restored.lastKnownGood);
      return consumers(assets,async()=>{
        if(ifMatchRaw){const original=readRecord(statePath);assert(digest(original)===ifMatchRaw,'UI_FRONTEND_CONFLICT','恢复期间原件已变化。',409);const backup=join(historyHome,'.corrupt-'+ifMatchRaw+'.bin');let handle;try{handle=await open(backup,'wx',0o600);await handle.writeFile(original);await handle.sync();}catch(error){if(error.code!=='EEXIST')throw error;}finally{await handle?.close();}}
        else{try{readRecord(statePath);throw problem('UI_FRONTEND_CONFLICT','恢复期间出现新的选择记录，已停止覆盖。',409);}catch(error){if(error.code!=='ENOENT')throw error;}}
        restored.revision=revision+1;restored.operations[operationId]={fingerprint,result:{action:'recover',operationId,releaseId:restored.active,revision:restored.revision}};
        restored.operations=Object.fromEntries(Object.entries(restored.operations).sort((a,b)=>b[1].result.revision-a[1].result.revision).slice(0,512));validateState(restored);
        await atomicJSON(statePath,restored);let recoveryWarning;try{await checkpoint(restored);}catch{recoveryWarning='选择已恢复，最新恢复检查点尚未保存；先前检查点保留。';}return {operationId,releaseId:restored.active,revision:restored.revision,etag:etag(restored),originalPreserved:!!ifMatchRaw,...(recoveryWarning?{recoveryWarning}:{})};
      });
    });
  }
  async function operation(id){
    assert(uuid(id),'UI_FRONTEND_REQUEST_INVALID','操作身份无效。');
    try{const value=await state();return {operationId:id,receipt:value.operations[id]?.result??null,active:value.active,etag:etag(value),provenance:'current'};}
    catch(error){const catalog=await recoveryStates();for(const entry of catalog.states){const value=readCheckpoint(entry.checkpoint);if(value.operations[id])return {operationId:id,receipt:value.operations[id].result,active:null,provenance:'checkpoint',stateError:error.code};}return {operationId:id,receipt:null,active:null,provenance:'unknown',stateError:error.code};}
  }
  return {status,stage,preview,activate,markKnownGood,current,retain,heartbeat,release,asset,collect,recoveryStates,recoverSelection,operation,documentRuntime,startupReady,startupFallback};
}
