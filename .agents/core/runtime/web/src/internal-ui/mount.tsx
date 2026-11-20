import {createContext,useContext,useSyncExternalStore,type ComponentType,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {rootIdentifierPrefix} from '../../../../applications/sdk/src/root-identifier';
import type {ApplicationSDK} from '../../../../applications/sdk/src/application-sdk';
import {UIProvider} from './provider';
import type {UIConfiguration,UIEnvironment} from './types';

const ApplicationContext=createContext<ApplicationSDK|null>(null);
export const useOptionalApplicationSDK=()=>useContext(ApplicationContext);
export function useApplicationSDK():ApplicationSDK {
  const sdk=useContext(ApplicationContext);if(!sdk)throw Error('useApplicationSDK 需要 应用的 mountReact。');return sdk;
}
export interface UIApplicationProps {sdk:ApplicationSDK}
/** Internal boundary for secondary SDK roots, without a second command/overlay coordinator. */
export function SDKUIProvider({sdk,content,overlay,children,presentation}:{sdk:ApplicationSDK;content?:HTMLElement;overlay?:HTMLElement;children:ReactNode;presentation?:Pick<import('./file-ui-origin').FileUIOrigin,'config'|'style'>}){
 const state=useSyncExternalStore(sdk.subscribe,sdk.getSnapshot,sdk.getSnapshot);
 const environment:UIEnvironment={owner:state.id,active:state.active,enabled:state.enabled,visible:state.enabled,toolbarHost:state.toolbarHost,contentHost:state.contentHost??content??null,overlayHost:state.overlayHost??overlay??null,styleNonce:sdk.styleNonce,overlays:sdk.overlays,commands:sdk.commands,capabilities:{frost:typeof CSS!=='undefined'&&CSS.supports('backdrop-filter','blur(1px)'),glass:false}};
 const config:Partial<UIConfiguration>={theme:state.material.themeMode,motion:state.material.motion?'system':'reduced',...presentation?.config};
 return <ApplicationContext.Provider value={sdk}><UIProvider environment={environment} config={config} style={presentation?.style}>{children}</UIProvider></ApplicationContext.Provider>;
}
/** Private view mount; application state stays in its own React root and SDK. */
export function mountReact(Component:ComponentType<UIApplicationProps>,container:HTMLElement,sdk:ApplicationSDK) {
  const content=document.createElement('div'),overlay=document.createElement('div');
  content.className='ksf-ui-application';overlay.className='ksf-ui-application-overlays';container.classList.add('ksf-ui-application-mount');container.append(content,overlay);
  const root=createRoot(content,{identifierPrefix:rootIdentifierPrefix(sdk.getSnapshot().id,'app'),onUncaughtError:error=>sdk.reportError(error)});
  let disposed=false;
  function Application(){return <SDKUIProvider sdk={sdk} content={content} overlay={overlay}><Component sdk={sdk}/></SDKUIProvider>;}
  root.render(<Application/>);
  return {dispose(){if(disposed)return;disposed=true;root.unmount();content.remove();overlay.remove();container.classList.remove('ksf-ui-application-mount');}};
}
