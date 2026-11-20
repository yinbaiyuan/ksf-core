import {createContext,useContext,useId,useLayoutEffect,useMemo,useRef,useState,type HTMLAttributes,type ReactNode,type Ref} from 'react';
import {createPortal} from 'react-dom';
import {useUI,uiRootAttributes,uiRootStyle} from './provider';
import {afterOverlayCommit} from '@ksf/sdk/controllers';
import type {OverlayCloseReason,OverlayKind,OverlayPolicy} from '@ksf/sdk/controllers';
import type {ScopedCommandDefinition} from '@ksf/sdk/controllers';
import {useComposedRef} from './refs';
import {useSurfaceScope} from '@ksf/sdk/react';

const LayerContext=createContext<symbol|null>(null);
export interface OverlayHostProps extends Omit<HTMLAttributes<HTMLDivElement>,'onClose'> {
 open:boolean;kind:OverlayKind;modal?:boolean;policy?:Partial<OverlayPolicy>;
 trigger?:HTMLElement|null;initialFocus?:()=>HTMLElement|null;
 autoFocus?:boolean;restoreFocus?:boolean;ref?:Ref<HTMLDivElement>;
 onClose:(reason:OverlayCloseReason)=>void|boolean|Promise<void|boolean>;
 children:ReactNode;
}
/** An owner-scoped portal; dismissal, focus and event consumption belong to the host. */
export function OverlayHost({open,kind,modal,policy,trigger,initialFocus,autoFocus,restoreFocus,ref,onClose,children,className='',...attributes}:OverlayHostProps){
 const scope=useSurfaceScope(),ui=useUI(),panel=useRef<HTMLDivElement>(null),backdrop=useRef<HTMLDivElement>(null),[token,setToken]=useState<symbol|null>(null),current=useRef({open,onClose,initialFocus});current.current={open,onClose,initialFocus};
 const isModal=modal??['dialog','alert-dialog','sheet'].includes(kind),coordinator=ui.environment.overlays;
 const panelRef=useComposedRef(panel,ref);
 const opener=useMemo(()=>trigger!==undefined?trigger:open&&typeof document!=='undefined'&&document.activeElement instanceof HTMLElement?document.activeElement:null,[open,trigger]);
 useLayoutEffect(()=>{
  if(!open)return;
  if(!coordinator?.isManaged?.()||!coordinator.register)throw Error('OverlayHost 需要宿主提供的弹层能力。');
  const entry=coordinator.register({kind,modal:isModal,policy,autoFocus,restoreFocus,element:()=>panel.current,backdrop:isModal?()=>backdrop.current:undefined,trigger:opener,initialFocus:()=>current.current.initialFocus?.()??null,onClose:async reason=>{const result=await current.current.onClose(reason);if(result===false)return false;await afterOverlayCommit();return !current.current.open;}});
  setToken(entry.token);return()=>entry.dispose();
 },[open,coordinator,kind,isModal,autoFocus,restoreFocus,policy?.escape,policy?.outside,policy?.deactivate]);
 if(!open)return null;
 const host=ui.environment.overlayHost;if(!host)throw Error('OverlayHost 需要当前 owner 的弹层容器。');
 return createPortal(<div {...uiRootAttributes(ui)} style={uiRootStyle(ui)} className={scope+' ksf-ui-root ksf-ui-overlay-root'}>{isModal&&<div ref={backdrop} className="ksf-ui-overlay-backdrop" aria-hidden="true"/>}<div {...attributes} ref={panelRef} tabIndex={attributes.tabIndex??-1} className={`ksf-ui-overlay-panel ${className}`.trim()}><LayerContext.Provider value={token}>{children}</LayerContext.Provider></div></div>,host);
}
export interface ShortcutScopeProps extends HTMLAttributes<HTMLDivElement>{id:string;commands:readonly Omit<ScopedCommandDefinition,'scope'>[]}
/** Commands remain registered only while this scope is mounted; labels come from real registrations. */
export function ShortcutScope({id,commands,children,...attributes}:ShortcutScopeProps){
 const {environment}=useUI(),layer=useContext(LayerContext),unique=useId(),scope=id+':'+unique,registry=environment.commands,handles=useRef(new Map<string,ReturnType<NonNullable<typeof registry>['register']>>());
 if(!id.trim())throw Error('ShortcutScope 需要非空 id。');
 useLayoutEffect(()=>()=>{for(const handle of handles.current.values())handle.dispose();handles.current.clear();},[registry,scope,layer]);
 useLayoutEffect(()=>{
  if(!registry)throw Error('ShortcutScope 需要宿主提供的命令能力。');
  const ids=new Set(commands.map(command=>command.id));if(ids.size!==commands.length)throw Error('ShortcutScope 的命令ID不能重复。');
  for(const [id,handle] of handles.current)if(!ids.has(id)){handle.dispose();handles.current.delete(id);}
  for(const command of commands){const definition={...command,enabled:environment.enabled&&command.enabled!==false,scope:layer?{kind:'overlay' as const,layer,id:scope}:{kind:'local' as const,id:scope}},handle=handles.current.get(command.id);if(handle)handle.update(definition);else handles.current.set(command.id,registry.register(definition));}
 },[commands,registry,scope,layer,environment.enabled]);
 return <div {...attributes} data-shortcut-scope={scope}>{children}</div>;
}
