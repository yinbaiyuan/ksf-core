import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {mountReact,useApplicationSDK} from '@ksf/sdk/react';
import type {ApplicationSDK} from '@ksf/sdk';
import {afterOverlayCommit} from '@ksf/sdk/controllers';
import './style.css';
export function useProbe(){
 const sdk=useApplicationSDK(),[open,setOpen]=useState(false),[draft,setDraft]=useState('原始草稿'),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useLayoutEffect(()=>{if(!open)return;const registration=sdk.overlays.register?.({kind:'dialog',modal:true,element:()=>panel.current,trigger:trigger.current,policy:{outside:false},onClose:async()=>{setOpen(false);await afterOverlayCommit();}});return()=>registration?.dispose();},[open]);
 return {sdk,open,setOpen,draft,setDraft,panel,trigger};
}
export function mountProbe(App:()=>React.ReactNode,container:HTMLElement,sdk:ApplicationSDK){
 const overlay=document.createElement('div');overlay.className=container.className+' probe-overlay';overlay.dataset.probeOwner=sdk.appId;
 (sdk.getSnapshot().overlayHost??container).append(overlay);
 const mounted=mountReact(()=> <App/>,container,sdk);
 return {dispose(){mounted.dispose();overlay.remove();}};
}
export function Overlay({appId,children}:{appId:string;children:React.ReactNode}){
 const host=document.querySelector<HTMLElement>(`[data-probe-owner="${appId}"]`);return host?createPortal(children,host):null;
}
