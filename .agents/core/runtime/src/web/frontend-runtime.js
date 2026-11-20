import {randomUUID} from 'node:crypto';
import {compareVersions,validVersion} from '../applications/protocol.js';
import {createFrontendStore} from './frontend-store.js';
import {createDocumentSessionStore} from './document-sessions.js';
import {createFrontendQualifications} from './frontend-qualifications.js';
import {assert,problem} from '../services/workbench-common.js';

/** Coordinates packaged candidates and the host-owned immutable store. No document is hot-swapped. */
export function createFrontendRuntime(root,{coreVersion,sdkCompatibility,webDirectory,bundledAssets,applications}={}){
  assert(validVersion(coreVersion),'UI_HOST_CONTRACT_INVALID','前端选择需要实际Core版本。');
  const enabled=compareVersions(coreVersion,'0.6.0')>=0;
  const qualifications=createFrontendQualifications(root);
  const store=createFrontendStore(root,{coreVersion,sdkCompatibility,withConsumers:action=>applications().withFrontendConsumers(action),qualifySnapshot:(id,qualificationId,facts)=>qualifications.read(qualificationId,id,facts)});
  let preparing,prepared=false,diagnostic=null,documents;
  const request=async()=>({operationId:randomUUID(),ifMatch:(await store.status()).etag});
  async function prepare(){
    if(!enabled)return;
    if(preparing)return preparing;
    if(prepared)return;
    preparing=(async()=>{
      const before=await store.status();
      let packaged;try{packaged=bundledAssets();}catch(error){diagnostic={code:error.code??'WEB_BUILD_INVALID',message:error.message};}
      if(packaged?.uiRuntime){
        const id=packaged.uiRuntime.frontendReleaseId;
        try{
          const unseen=!before.releases[id];
          if(unseen)await store.stage(webDirectory,await request());
          if((unseen||!before.active)&&(await store.status()).active!==id)await store.activate(id,await request());
        }catch(error){diagnostic={code:error.code??'UI_CANDIDATE_REJECTED',message:error.message,...(error.data?{data:error.data}:{})};}
      }
      await store.current();prepared=true;
    })().finally(()=>{preparing=null;});
    return preparing;
  }
  async function selected(){
    if(!enabled){const assets=bundledAssets();assert(assets,'WEB_FRONTEND_UNAVAILABLE','随包界面资源不可用。',503);return {releaseId:assets.uiRuntime?.frontendReleaseId??null,assets};}
    await prepare();return store.current();
  }
  // Compatibility checks may hold the application registry lock: they must never initiate a switch.
  async function uiRuntime(){return enabled?(await store.current()).assets.uiRuntime:bundledAssets()?.uiRuntime;}
  async function status(){
    if(!enabled)return {enabled:false,coreVersion,minimumCoreVersion:'0.6.0',active:null,pending:null,lastKnownGood:null,releases:[],diagnostic};
    try{const value=await store.status();let activeUsable=false;if(value.active)try{await store.current();activeUsable=true;}catch(error){diagnostic={code:error.code??'WEB_BUILD_INVALID',message:error.message};}return {enabled:true,coreVersion,active:value.active,activeUsable,pending:value.pending,lastKnownGood:value.lastKnownGood,etag:value.etag,releases:Object.entries(value.releases).map(([releaseId,entry])=>({releaseId,stagedAt:entry.stagedAt,qualified:!!entry.qualification})),diagnostic};}
    catch(error){return {enabled:true,coreVersion,active:null,pending:null,lastKnownGood:null,releases:[],diagnostic:{code:error.code??'UI_FRONTEND_STATE_INVALID',message:error.message},recovery:await store.recoveryStates()};}
  }
  async function activate(id,input){assert(enabled,'UI_CORE_INCOMPATIBLE','此Core尚未启用共享快照。',409);const result=await store.activate(id,input);prepared=true;diagnostic=null;return result;}
  async function stageBundled(input){assert(enabled,'UI_CORE_INCOMPATIBLE','此Core尚未启用共享快照。',409);const packaged=bundledAssets();assert(packaged,'WEB_FRONTEND_UNAVAILABLE','随包界面资源不可用。',503);return store.stage(webDirectory,input);}
  async function qualify(id,input){assert(enabled,'UI_CORE_INCOMPATIBLE','此Core尚未启用共享快照。',409);return store.markKnownGood(id,input);}
  async function asset(path){
    if(!enabled)return (await selected()).assets.get(path);
    try{return await store.asset(path);}catch(error){if(error.code==='UI_ASSET_NOT_FOUND')return undefined;throw error;}
  }
  async function client(input){
    assert(enabled,'UI_CORE_INCOMPATIBLE','此Core尚未启用共享快照。',409);
    if(input.action==='retain')return store.retain(input.releaseId);
    if(input.action==='heartbeat')return store.heartbeat(input.clientId);
    if(input.action==='release'){await store.release(input.clientId);return {released:true};}
    throw problem('UI_CLIENT_INVALID','未知的客户端引用动作。');
  }
  async function recover(input){assert(enabled,'UI_CORE_INCOMPATIBLE','此Core尚未启用共享快照。',409);const result=await store.recoverSelection(input.checkpoint,input);prepared=true;diagnostic=null;return result;}
  async function documentSession(input={}){assert(enabled,'UI_CORE_INCOMPATIBLE','此Core尚未启用窗口恢复记录。',409);documents??=createDocumentSessionStore(root);if(input.action==='read')return documents.read(input.resumeToken);if(input.action==='write')return documents.write(input);if(input.action==='export')return documents.export(input.resumeToken);throw problem('UI_DOCUMENT_REQUEST_INVALID','未知的窗口恢复记录动作。');}
  async function boot(input={}){
    assert(enabled,'UI_CORE_INCOMPATIBLE','此Core尚未启用共享启动恢复。',409);
    if(input.action==='ready')return store.startupReady(input);
    assert(input.action==='failed','UI_BOOT_INVALID','未知的文档启动动作。');
    try{const result=await store.startupFallback(input);prepared=true;diagnostic={code:'UI_STARTUP_ROLLED_BACK',message:'候选前端启动失败，本次已选择合格的完整回退快照。',failedReleaseId:input.releaseId,bootAttempt:input.clientId};return result;}
    catch(error){diagnostic={code:error.code??'UI_BOOT_FAILED',message:error.message,failedReleaseId:input.releaseId,bootAttempt:input.clientId};throw error;}
  }
  return {enabled,selected,uiRuntime,status,activate,stageBundled,qualify,asset,client,recover,documentSession,boot,preview:id=>store.preview(id),recoveryStates:()=>store.recoveryStates(),operation:id=>store.operation(id),documentRuntime:binding=>store.documentRuntime(binding)};
}
