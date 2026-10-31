import {applicationScope} from '../../../../applications/sdk/src/surface-scope.js';
import {waitForSurfaceCleanup} from './surface-lifecycle';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { request, getSession } from './client';
import { useWindowContext } from '../window-context';
import { windowSessions, readingPositions } from '../window-session';
import { useMaterial } from '../components/material-provider';
import { overlays } from '../overlay-coordinator';
import { closeGuards, applicationPageId } from './app-services';
import {validateCardConfiguration} from '../../../../applications/sdk/src/configuration';
import { flushDocuments, registerResourcePreparation } from '../../../../applications/sdk/src/resources';
import {replacementRelease,type ApplicationSnapshot,type AppRelease,type ApplicationEntry } from './application-model';
import type { ApplicationSDK, SurfaceSnapshot } from './application-sdk';
import type { AppProps } from '../desktop/registry';
import './external-application.css';
interface ApplicationModule { mount(container:HTMLElement,sdk:ApplicationSDK):void|{dispose?():void|Promise<void>}|Promise<void|{dispose?():void|Promise<void>}> }
const leases=new Set<string>();
window.addEventListener('pagehide',event=>{if((event as PageTransitionEvent).persisted||!leases.size)return;const ids=[...leases];void getSession().then(auth=>fetch('/api/apps/release-many',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','X-KSF-Token':auth.token},body:JSON.stringify({ids})})).catch(()=>{});});
let leaseTimer:ReturnType<typeof setInterval>|undefined;
function lease(id:string){leases.add(id);leaseTimer??=setInterval(()=>{if(leases.size)void request('/api/apps/heartbeat',{ids:[...leases]}).catch(()=>{});},20000);return()=>{leases.delete(id);if(!leases.size){clearInterval(leaseTimer);leaseTimer=undefined;}};}
const cleanups=new Map<string,Promise<unknown>>();
const modules=new Map<string,Promise<ApplicationModule>>();
function loadModule(url:string){let module=modules.get(url);if(!module){module=import(/* @vite-ignore */url).catch(error=>{modules.delete(url);throw error;});modules.set(url,module);}return module;}
const styles=new Map<string,{users:number;link:HTMLLinkElement;ready:Promise<void>}>();
function retainStyle(url:string){
  let style=styles.get(url);
  if(!style){const link=document.createElement('link');link.rel='stylesheet';link.href=url;
    const ready=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('应用样式加载超时。')),15000);link.onload=()=>{clearTimeout(timer);resolve();};link.onerror=()=>{clearTimeout(timer);reject(Error('应用样式无法加载。'));};});
    style={users:0,link,ready};styles.set(url,style);document.head.append(link);
  }
  style.users++;const value=style;return {ready:value.ready,release:()=>{if(!--value.users){value.link.remove();styles.delete(url);}}};
}
interface CardSurface {entry:ApplicationEntry;cardId:string;instanceId:string;compact:boolean;visible:boolean;width:number;height:number;config:unknown;onConfigChange:(value:unknown)=>void}
type Props=Partial<AppProps>&{release:AppRelease;card?:CardSurface};
export function ExternalApplication({release,card,search,navigate,onDiagnostics,openApp,onReleaseChanged}:Props){
  const root=useRef<HTMLDivElement>(null),context=useWindowContext(),{settings:material}=useMaterial();
  const [failure,setFailure]=useState<string|null>(null),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true);
  const identity=card?.instanceId??context.id,kind=card?'card':'window';
  const surface=useMemo<SurfaceSnapshot>(()=>({id:identity,active:card?card.visible:context.active,enabled:card?card.visible:context.enabled,root:card?root:context.root,toolbarHost:card?null:context.toolbarHost,contentHost:card?null:context.contentHost,overlayHost:card?null:context.overlayHost,search:search?.toString()??'',compact:card?.compact,width:card?.width,height:card?.height,config:card?.config,material}),[identity,context.active,context.enabled,context.root,context.toolbarHost,context.contentHost,context.overlayHost,search?.toString(),card?.visible,card?.compact,card?.width,card?.height,card?.config,material]);
  const store=useRef({snapshot:surface,listeners:new Set<()=>void>()});
  useLayoutEffect(()=>{store.current.snapshot=surface;store.current.listeners.forEach(listener=>listener());},[surface]);
  const current=useRef({context,navigate,onDiagnostics,openApp,onReleaseChanged,card});current.current={context,navigate,onDiagnostics,openApp,onReleaseChanged,card};
  const entry=card?.entry??(release.manifest.window);
  useEffect(()=>{
    let disposed=false,failed=false,disposal=Promise.resolve(),instanceId:string|undefined,unlease:(()=>void)|undefined,mounted:void|{dispose?():void|Promise<void>};
    const settingsCleanups=new Set<()=>void>();
    const clearSettings=()=>{settingsCleanups.forEach(cleanup=>cleanup());settingsCleanups.clear();};
    const guards=new Set<()=>boolean|Promise<boolean>>(),controller=new AbortController(),retained:ReturnType<typeof retainStyle>[]=[];
    const container=document.createElement('div');container.className='external-application-mount '+applicationScope(release.manifest.id,release.manifest.version);root.current!.append(container);
    const guard=async()=>{for(const callback of guards)if(!await callback())return false;return true;};
    if(kind==='window')closeGuards.set(identity,guard);
    const assetBase=`/app-assets/${release.manifest.id}/${release.digest}/`;
    const releaseInstance=()=>{unlease?.();unlease=undefined;if(instanceId){void request('/api/apps/release',{instanceId}).catch(()=>{});instanceId=undefined;}};
    const fail=(error:unknown)=>{if(disposed||failed)return;failed=true;clearSettings();controller.abort();setFailure(error instanceof Error?error.message:'应用运行失败。');setLoading(false);const active=mounted;mounted=undefined;disposal=Promise.resolve().then(()=>active?.dispose?.()).catch(()=>{}).finally(releaseInstance);};
    const stopped=(event:Event)=>{const issue=(event as CustomEvent<{id:string;error:string}>).detail;if(issue.id===instanceId)fail(Error(issue.error));};window.addEventListener('ksf:app-instance-failed',stopped);
    setFailure(null);setLoading(true);
    async function start(){try{await waitForSurfaceCleanup(cleanups.get(identity));if(disposed)return;
      if(!entry)throw Error('此应用没有主窗口。');if(card)validateCardConfiguration(card.config);const auth=await getSession();
      const instance=await request<{id:string}>('/api/apps/launch',{appId:release.manifest.id,digest:release.digest,surface:{kind,cardId:card?.cardId,pageId:applicationPageId,surfaceId:identity}});instanceId=instance.id;
      if(disposed){releaseInstance();return;}unlease=lease(instance.id);
      for(const path of entry.styles??[])retained.push(retainStyle(assetBase+path));await Promise.all(retained.map(value=>value.ready));
      if(disposed)return;const module=await loadModule(assetBase+entry.entry);if(typeof module.mount!=='function')throw Error('应用前端必须导出 mount(container, sdk)。');if(disposed)return;
      const base:Pick<ApplicationSDK,'sdkVersion'|'appId'|'version'|'instanceId'|'styleNonce'|'call'|'setTitle'|'onBeforeClose'|'onSettings'|'menu'>={sdkVersion:1,appId:release.manifest.id,version:release.manifest.version,instanceId:instance.id,styleNonce:auth.nonce,
        call:async(method,params)=>{try{return await request('/api/apps/call',{instanceId:instance.id,method,params},controller.signal);}catch(error){if(!disposed&&(error as {code?:string}).code==='APP_PROCESS_EXITED'){fail(error);}throw error;}},
        setTitle:(title,detail)=>{if(!disposed&&kind==='window')current.current.context.setObject?.({title,detail});},
        menu:{register:items=>{if(disposed||failed||kind!=='window')throw Error('应用菜单仅支持存活的应用窗口。');const registration=current.current.context.registerMenu?.(items);if(!registration)throw Error('宿主不支持应用菜单。');const cleanup=()=>{registration.dispose();settingsCleanups.delete(cleanup);};settingsCleanups.add(cleanup);return {update:values=>{if(!disposed&&!failed)registration.update(values);},dispose:cleanup};}},
        onSettings:handler=>{if(disposed||failed||kind!=='window')return()=>{};const unregister=current.current.context.registerSettings?.(handler)??(()=>{});const cleanup=()=>{unregister();settingsCleanups.delete(cleanup);};settingsCleanups.add(cleanup);return cleanup;},
        onBeforeClose:callback=>{guards.add(callback);return()=>{guards.delete(callback);};}};
      let sdk:ApplicationSDK;
      {
        const session={get:(key:string)=>windowSessions.get(identity)?.get(key),set:(key:string,value:unknown)=>{let values=windowSessions.get(identity);if(!values){values=new Map();windowSessions.set(identity,values);}values.set(key,value);},getPosition:(key:string)=>readingPositions.get(key),setPosition:(key:string,value:number)=>{readingPositions.set(key,value);}};
        const surfaceSDK:ApplicationSDK={...base,sdkVersion:1,kind,surfaceId:identity,cardId:card?.cardId,getSnapshot:()=>store.current.snapshot,subscribe:(listener:()=>void)=>{store.current.listeners.add(listener);return()=>{store.current.listeners.delete(listener);};},
          session,overlays,getSession,request:(url,input,signal)=>{const target=new URL(url,location.origin);if(target.origin!==location.origin||!target.pathname.startsWith('/api/'))throw Error('公共请求只支持当前工作台 API。');return request(target.pathname+target.search,input,signal);},reportError:fail,navigate:(changes,replace)=>current.current.navigate?.(changes,replace),openApp:(app,query,fresh)=>current.current.openApp?.(app,query,fresh),showDiagnostics:()=>current.current.onDiagnostics?.(),
          configuration:{get:()=>store.current.snapshot.config,set:value=>{if(!disposed){validateCardConfiguration(value);current.current.card?.onConfigChange(JSON.parse(JSON.stringify(value)));}}},resources:{prepare:flushDocuments,register:registerResourcePreparation}};sdk=surfaceSDK;
      }
      mounted=await module.mount(container,sdk);if(disposed||failed){await mounted?.dispose?.();mounted=undefined;releaseInstance();}else setLoading(false);
    }catch(error){
      if(!disposed&&!instanceId&&kind==='window'&&(error as {code?:string}).code==='APP_RELEASE_CHANGED'&&current.current.onReleaseChanged){
        try{const snapshot=await request<ApplicationSnapshot>('/api/apps/installed'),next=replacementRelease(snapshot,release.manifest.id,release.digest,kind);if(next&&!disposed){await current.current.onReleaseChanged(next.digest);return;}}catch(recoveryError){error=recoveryError;}
      }
      releaseInstance();fail(error);}}

    const startup=start();return()=>{disposed=true;clearSettings();controller.abort();window.removeEventListener('ksf:app-instance-failed',stopped);if(closeGuards.get(identity)===guard)closeGuards.delete(identity);const cleanup=Promise.resolve(startup).then(()=>disposal).then(()=>mounted?.dispose?.()).catch(()=>{}).finally(()=>{releaseInstance();retained.forEach(value=>value.release());container.remove();if(cleanups.get(identity)===cleanup)cleanups.delete(identity);});cleanups.set(identity,cleanup);};
  },[release,identity,retry,entry,kind]);
  return <div className={card?'external-card':'external-application'}>{loading&&<div className="app-loading">正在启动{card?card.cardId:release.manifest.name}…</div>}{failure&&<div className="app-platform-error" role="alert"><p>{failure}</p><button onClick={()=>setRetry(value=>value+1)}>重新启动{card?'卡片':'应用'}</button></div>}<div ref={root} className="external-application-content" hidden={!!failure}/></div>;
}
