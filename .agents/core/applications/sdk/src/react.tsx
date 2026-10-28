import {SurfaceScopeContext} from './surface-context';
import {applicationScope} from './surface-scope.js';
import './surface.css';
import { createRoot } from 'react-dom/client';
import { createContext,useContext,useSyncExternalStore, type ComponentType } from 'react';
import { WindowContext } from './window-context';
import { connectReadingPositions } from './window-session';
import { MaterialContext } from './components/material-provider';
import {bindWorkbenchBridge} from './apps/client';
import { closeGuards } from './apps/app-services';
import type { ApplicationSDK2 } from './application-sdk';
export type { ApplicationSDK2 };
const ApplicationContext=createContext<ApplicationSDK2|null>(null);
export function useApplicationSDK(){const sdk=useContext(ApplicationContext);if(!sdk)throw Error('useApplicationSDK 需要 mountReact。');return sdk;}

/** React is private to the package; host state crosses only the SDK contract. */
export function mountReact(Component:ComponentType<any>,container:HTMLElement,sdk:ApplicationSDK2) {
  const scope=applicationScope(sdk.appId,sdk.version);container.classList.add('ksf-sdk-surface',scope);
  bindWorkbenchBridge(sdk);
  const initial=sdk.getSnapshot();
  // Older v2 hosts have no overlay slot. Keep the same boundary inside this mount.
  const fallback=sdk.kind==='window'&&!initial.overlayHost;
  const content=fallback?document.createElement('div'):container, overlay=fallback?document.createElement('div'):null;
  if(overlay){content.style.cssText='height:100%;min-height:0';overlay.style.cssText='position:absolute;inset:0;z-index:100;pointer-events:none;overflow:hidden;contain:layout style;isolation:isolate';container.style.position='relative';container.append(content,overlay);}
  const root=createRoot(content,{onUncaughtError:error=>sdk.reportError(error)});
  const disconnect=connectReadingPositions(initial.id,sdk.session);
  const unguard=sdk.onBeforeClose(()=>closeGuards.get(initial.id)?.()??true);
  function Surface() {
    const state=useSyncExternalStore(sdk.subscribe,sdk.getSnapshot);
    const context={id:state.id,active:state.active,enabled:state.enabled,root:state.root,toolbarHost:state.toolbarHost,overlayHost:state.overlayHost??overlay,contentHost:state.contentHost??(fallback?content:null),setObject:(value:{title:string;detail?:string}|null)=>sdk.setTitle(value?.title??'',value?.detail),session:sdk.session,overlays:sdk.overlays};
    return <SurfaceScopeContext.Provider value={scope}><ApplicationContext.Provider value={sdk}><MaterialContext.Provider value={{settings:state.material,update:()=>{},saved:'default'}}><WindowContext.Provider value={context}><Component search={new URLSearchParams(state.search)} navigate={sdk.navigate} onDiagnostics={sdk.showDiagnostics} openApp={sdk.openApp} compact={state.compact} visible={state.enabled} open={(search:string,fresh=false)=>sdk.openApp(sdk.appId,search,fresh)}/></WindowContext.Provider></MaterialContext.Provider></ApplicationContext.Provider></SurfaceScopeContext.Provider>;
  }
  root.render(<Surface/>);
  return {dispose(){root.unmount();unguard();disconnect();if(overlay){content.remove();overlay.remove();}}};
}
