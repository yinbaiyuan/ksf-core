import {getSession,request} from '../apps/client';
import {getUIRuntime} from '../internal-ui/runtime';

type Phase='initializing'|'legacy'|'ready'|'disconnected'|'expired';
export interface FrontendClientState {phase:Phase;documentReleaseId:string|null;activeReleaseId:string|null;activeUsable:boolean;reloadRequired:boolean;message:string}
interface Lease {clientId:string;releaseId:string;expiresAt:number}
let state:FrontendClientState={phase:'initializing',documentReleaseId:null,activeReleaseId:null,activeUsable:false,reloadRequired:false,message:''};
let documentBinding:{clientId:string;releaseId:string}|undefined;
const listeners=new Set<()=>void>();
export const frontendClient={getSnapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}};
function publish(change:Partial<FrontendClientState>){state={...state,...change};listeners.forEach(listener=>listener());window.dispatchEvent(new CustomEvent('ksf:frontend-state-changed',{detail:state}));}
export function assertFrontendClient(){if(state.phase==='expired'||state.phase==='disconnected')throw Object.assign(Error(state.message||'本页资源引用已过期，请保全工作后安全重载。'),{code:state.phase==='expired'?'UI_CLIENT_EXPIRED':'UI_CLIENT_UNVERIFIED'});}
export function getFrontendBinding(){assertFrontendClient();return documentBinding;}

/** One lease per complete workbench document, independent of application/background leases. */
export function startFrontendClient(){
  let lease:Lease|null=null,timer:ReturnType<typeof setInterval>|undefined,disposed=false,running=false,legacy=false;
  const runtime=getUIRuntime();publish({documentReleaseId:runtime.frontendReleaseId});
  const element=document.getElementById('ksf-frontend-client');
  if(element)try{
    const value=JSON.parse(element.textContent??'');
    if(typeof value.clientId!=='string'||!/^[a-f0-9-]{36}$/.test(value.clientId)||value.releaseId!==runtime.frontendReleaseId||!Number.isFinite(value.expiresAt))throw Error('invalid document lease');
    lease=value;documentBinding={clientId:value.clientId,releaseId:value.releaseId};publish({phase:'ready'});
  }catch{publish({phase:'expired',reloadRequired:true,message:'本页快照与客户端引用不一致，请保全工作后安全重载。'});}
  async function tick(){
    if(disposed||running||legacy||state.phase==='expired')return;
    running=true;
    try{
      const status=await request<{enabled:boolean;active:string|null;activeUsable?:boolean}>('/api/ui-runtime/status');
      if(disposed)return;
      if(!status.enabled){legacy=true;clearInterval(timer);publish({phase:'legacy',reloadRequired:false});return;}
      lease=await request<Lease>('/api/ui-runtime/client',lease?{action:'heartbeat',clientId:lease.clientId}:{action:'retain',releaseId:runtime.frontendReleaseId});
      if(!disposed){documentBinding={clientId:lease.clientId,releaseId:lease.releaseId};publish({phase:'ready',activeReleaseId:status.active,activeUsable:!!status.activeUsable,reloadRequired:!!status.activeUsable&&status.active!==runtime.frontendReleaseId,message:''});}
    }catch(error){
      if(disposed)return;
      const code=(error as {code?:string}).code;
      if(['UI_CLIENT_EXPIRED','UI_FRONTEND_UNKNOWN','UI_CORE_INCOMPATIBLE','WEB_NOT_FOUND','WEB_METHOD_NOT_ALLOWED'].includes(code??'')){clearInterval(timer);publish({phase:'expired',reloadRequired:true,message:'本页资源引用已过期或宿主不兼容；请先保全工作，再核对执行状态并安全重载。'});}
      else publish({phase:'disconnected',message:'暂时无法核对本页资源引用，当前窗口保持打开。'});
    }finally{running=false;}
  }
  const resume=()=>{void tick();};
  const pagehide=(event:PageTransitionEvent)=>{
    if(event.persisted)return;
    disposed=true;clearInterval(timer);
    if(lease)void getSession().then(auth=>fetch('/api/ui-runtime/client',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','X-KSF-Token':auth.token},body:JSON.stringify({action:'release',clientId:lease!.clientId})})).catch(()=>{});
  };
  window.addEventListener('online',resume);window.addEventListener('pageshow',resume);window.addEventListener('pagehide',pagehide);
  if(state.phase!=='expired')timer=setInterval(resume,30000);void tick();
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('online',resume);window.removeEventListener('pageshow',resume);window.removeEventListener('pagehide',pagehide);};
}
