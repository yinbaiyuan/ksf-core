import {getSession,request} from '../apps/client';
import {randomId} from '../random-id';
import {windowClose} from '../window-close';
import {parseDocumentWindowSet,type DocumentWindowSet} from '../../../../applications/sdk/src/shared/document-session.js';
import {DocumentReloadCoordinator,type ReloadParticipant,type ReloadPreparation} from './reload-model';
import {reloadParticipants} from './reload-participants';
import {freezeDocumentInput} from './reload-input';

interface DesktopDocument {
  capture:()=>DocumentWindowSet;
  topology:()=>string;
  prepare:ReloadParticipant['prepare'];
}
interface RecoveryRecord {resumeToken:string;value:DocumentWindowSet}
export interface DocumentRecoveryState {
  readonly phase:'checking'|'ready'|'failed';
  readonly supported:boolean;
  readonly record:RecoveryRecord|null;
  readonly resumeToken:string|null;
  readonly error:string|null;
}
const validToken=(value:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
let desktop:DesktopDocument|undefined,storageKey:string|undefined,pending:Promise<void>|undefined;
let recovery:DocumentRecoveryState=Object.freeze({phase:'checking',supported:false,record:null,resumeToken:null,error:null});
let checkpoint:{operationId:string;value:string}|undefined;
const listeners=new Set<()=>void>();
function publish(change:Partial<DocumentRecoveryState>){recovery=Object.freeze({...recovery,...change});for(const listener of listeners)listener();}
function requireDesktop(){if(!desktop)throw Error('窗口管理器尚未准备好，请保留当前页面。');return desktop;}
function requireStorage(){if(!storageKey)throw Error('尚未核对当前实例的恢复入口。');return storageKey;}
function storageAvailable(){const key=requireStorage()+':check';sessionStorage.setItem(key,'1');if(sessionStorage.getItem(key)!=='1')throw Error('浏览器无法保存恢复入口，当前页面已保留。');sessionStorage.removeItem(key);}
function participants():ReloadParticipant[]{
  const host=requireDesktop(),windows=host.capture().windows,registered=reloadParticipants.list(),windowIds=new Set(windows.map(window=>window.id));
  const entries=windows.map(window=>registered.find(entry=>entry.id===window.id)??{
    id:window.id,name:window.object?.title||window.appId,
    prepare:():ReloadPreparation=>({status:'failed',message:'此窗口尚未提供可靠的重载保全，请先完成并关闭它。'}),
  });
  return [{id:'ksf:desktop',name:'工作台设置',prepare:host.prepare},...entries,...registered.filter(entry=>!windowIds.has(entry.id)).sort((a,b)=>a.id.localeCompare(b.id))];
}

/** One fixed document; application sessions retain their own identities and data. */
export const documentReload=new DocumentReloadCoordinator<DocumentWindowSet>({
  participants,
  snapshot:()=>{const host=requireDesktop();return {topology:host.topology(),value:parseDocumentWindowSet(host.capture())};},
  freeze:()=>{
    if(recovery.phase!=='ready'||!recovery.supported||recovery.record)throw Error('恢复入口尚未核对完成，当前页面已保留。');
    if(requireDesktop().capture().windows.some(window=>['checking','closing'].includes(windowClose.get(window.id).phase)))throw Error('窗口正在处理关闭请求，请先完成该操作。');
    storageAvailable();return freezeDocumentInput();
  },
  checkpoint:async(close,value)=>{
    const serialized=JSON.stringify(value);
    if(checkpoint?.value!==serialized)checkpoint={operationId:randomId(),value:serialized};
    const operationId=checkpoint.operationId;
    // A lost acknowledgement keeps this operation ID for an explicit retry of the same window set.
    const receipt=await request<{resumeToken:string}>('/api/ui-runtime/document-session',{action:'write',operationId,value},close.signal);
    if(receipt.resumeToken!==operationId)throw Error('窗口恢复回执身份不符，当前页面已保留。');
    return receipt;
  },
  navigate:receipt=>{sessionStorage.setItem(requireStorage(),receipt.resumeToken);location.reload();},
  cancelNavigation:receipt=>{window.stop();const key=requireStorage();if(sessionStorage.getItem(key)===receipt.resumeToken)sessionStorage.removeItem(key);},
});

export const documentRecovery={
  getSnapshot:()=>recovery,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  attach(value:DesktopDocument){desktop=value;return()=>{if(desktop===value)desktop=undefined;};},
  initialize():Promise<void>{
    if(pending)return pending;
    publish({phase:'checking',error:null});
    pending=(async()=>{
      try{
        const auth=await getSession();storageKey='ksf.ui.resume.v1:'+auth.instanceId;
        const token=sessionStorage.getItem(storageKey),supported=!!auth.capabilities?.includes('ui-document-sessions-v1');
        publish({supported,resumeToken:token&&validToken(token)?token:null});
        if(token){
          if(!validToken(token))throw Error('浏览器中的恢复入口已损坏，原记录未改动。');
          if(!supported)throw Error('此宿主暂不支持窗口恢复；原记录仍保留，请使用兼容宿主核对。');
          const result=await request<{exists:boolean;record:RecoveryRecord|null}>('/api/ui-runtime/document-session?resumeToken='+encodeURIComponent(token));
          if(!result.exists||!result.record||result.record.resumeToken!==token)throw Error('没有找到已确认的窗口恢复记录，请保留入口并核对原实例。');
          publish({phase:'ready',record:{resumeToken:token,value:parseDocumentWindowSet(result.record.value)},error:null});
        }else publish({phase:'ready',record:null,resumeToken:null,error:null});
      }catch(error){publish({phase:'failed',record:null,error:error instanceof Error?error.message:String(error)});}
      finally{pending=undefined;}
    })();return pending;
  },
  /** Called only after the complete window set has committed to the DOM. A failed render retains the handle. */
  restored(token:string){
    if(recovery.record?.resumeToken!==token)return;
    try{if(sessionStorage.getItem(requireStorage())===token)sessionStorage.removeItem(requireStorage());publish({record:null,error:null});}
    catch{publish({phase:'failed',record:null,error:'窗口已恢复，但浏览器无法清理恢复入口。原记录仍保留。'});}
  },
  continueWithoutRestoring(){
    try{sessionStorage.removeItem(requireStorage());publish({phase:'ready',record:null,resumeToken:null,error:null});}
    catch(error){publish({error:error instanceof Error?error.message:String(error)});}
  },
  exportURL:()=>recovery.resumeToken?'/api/ui-runtime/document-session-export?resumeToken='+encodeURIComponent(recovery.resumeToken):null,
};
