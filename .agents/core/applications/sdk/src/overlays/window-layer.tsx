import {forwardRef,useLayoutEffect,useMemo,useRef,useState,type HTMLAttributes,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {WindowContext,useWindowContext} from '../window-context';
import {useSurfaceScope} from '../surface-context';
import {suspendWindowContent,focusableElements} from '../overlay-boundary';
import {afterOverlayCommit} from '../controllers/overlay-dom';
import type {OverlayCloseReason} from '../controllers/overlay-stack';
import {followTheme} from '../primitives/layer';
import {useElementRef,cx} from '../primitives/state';
import {useFinitePresence} from '../primitives/finite-presence';
import {useDialogOrigin} from '../primitives/dialog-origin';
import './overlays.css';
export type LayerCloseReason=OverlayCloseReason|'close'|'cancel'|'confirm';
export interface WindowLayerProps extends HTMLAttributes<HTMLDivElement>{open:boolean;onClose:(reason:LayerCloseReason)=>void|boolean|Promise<void|boolean>;modal?:boolean;closeOnOutside?:boolean;closeOnEscape?:boolean;initialFocus?:RefObject<HTMLElement|null>;keepMounted?:boolean;presentation?:'dialog'|'drawer';side?:'start'|'end'|'top'|'bottom';centered?:boolean;interactionElement?:RefObject<HTMLElement|null>;motion?:'dialog'|'drawer'|'image'}
/** A portal within the current window. The host continues owning window controls and other windows. */
export const WindowLayer=forwardRef<HTMLDivElement,WindowLayerProps>(function WindowLayer({open,onClose,modal=true,closeOnOutside=true,closeOnEscape=true,initialFocus,keepMounted=false,presentation='dialog',side='end',centered=true,interactionElement,motion,className='',children,onKeyDown,...props},ref){
 const context=useWindowContext(),scope=useSurfaceScope(),source=useRef<HTMLSpanElement>(null),layer=useRef<HTMLDivElement>(null),backdrop=useRef<HTMLDivElement>(null),[panel,assign]=useElementRef(ref),[host,setHost]=useState<HTMLElement|null>(null),boundary=useRef<HTMLElement|null>(null),managed=useRef(false),latest=useRef({open,onClose,context});latest.current={open,onClose,context};
 const priorOpen=useRef(open),exitHadFocus=useRef(false);
 if(priorOpen.current&&!open)exitHadFocus.current=!!panel.current?.contains(panel.current.ownerDocument.activeElement);if(open)exitHadFocus.current=false;priorOpen.current=open;
 const presence=useFinitePresence(open&&context.enabled,{enabled:!!motion,enterDuration:300,exitDuration:300},source,context.active&&context.enabled),present=presence.present;
 // A kept panel is still display:none until presence commits the opening frame.
 // Measure its unscaled layout only after that frame exposes the actual box.
 const dialogOrigin=useDialogOrigin(motion==='dialog',open&&context.enabled&&present,source,panel,host,context);
 const hostVisible=context.enabled&&(present||keepMounted);
 const opener=useMemo(()=>{const node=source.current,doc=node?.ownerDocument;if(!present||!doc)return null;const active=doc.activeElement;return active instanceof HTMLElement&&(context.root?.current??node?.closest('.ksf-sdk-surface')??node?.parentElement)?.contains(active)?active:null;},[present,context.id,host]);
 useLayoutEffect(()=>{
  if(!hostVisible){setHost(null);return;}
  const node=source.current;if(!node)return;
  boundary.current=context.root?.current??node.closest<HTMLElement>('.ksf-sdk-surface')??node.parentElement;
  if(context.overlayHost&&context.overlayHost!==boundary.current){setHost(context.overlayHost);return;}
  const owner=boundary.current;if(!owner)return;const doc=node.ownerDocument,view=doc.defaultView;if(!view)return;
  const local=doc.createElement('div');local.dataset.ksfModalHost='';local.style.cssText='position:fixed;left:0;top:0;pointer-events:none;overflow:hidden;z-index:1000';owner.append(local);
  const measure=()=>{local.style.left='0px';local.style.top='0px';const origin=local.getBoundingClientRect(),rect=owner.getBoundingClientRect();local.style.left=rect.left-origin.left+'px';local.style.top=rect.top-origin.top+'px';local.style.width=rect.width+'px';local.style.height=rect.height+'px';};measure();const observer=new ResizeObserver(measure);observer.observe(owner);view.addEventListener('resize',measure);doc.addEventListener('scroll',measure,true);setHost(local);
  return()=>{observer.disconnect();view.removeEventListener('resize',measure);doc.removeEventListener('scroll',measure,true);local.remove();};
 },[hostVisible,context.id,context.overlayHost,context.root,context.enabled]);
 useLayoutEffect(()=>{
  if(!present||!host||!context.enabled||!panel.current||!source.current)return;
  const element=panel.current,owner=boundary.current,doc=source.current.ownerDocument;const restoreTheme=layer.current?followTheme(source.current,layer.current):()=>{};
  const registration=context.overlays?.isManaged?.()?context.overlays.register?.({kind:presentation==='drawer'?'sheet':'dialog',modal,autoFocus:true,parent:context.overlays?.parentOf?.(source.current),element:()=>interactionElement?.current??panel.current,backdrop:()=>backdrop.current,trigger:opener,initialFocus:()=>initialFocus?.current??(element.contains(doc.activeElement)?doc.activeElement as HTMLElement:element),policy:{outside:modal&&closeOnOutside,escape:closeOnEscape,deactivate:false},onClose:async reason=>{if(!latest.current.open)return false;const allowed=await latest.current.onClose(reason);if(allowed===false)return false;await afterOverlayCommit();return !latest.current.open;}}):undefined;
  managed.current=!!registration;
  // The managed interaction card can be inside a full-window positioning panel.
  // Keep that ancestor in the card's stacking level so its sibling scrim cannot cover it.
  const interaction=interactionElement?.current,previousZ=element.style.zIndex;
  const syncStack=()=>{if(interaction&&interaction!==element)element.style.zIndex=interaction.style.zIndex||previousZ;};
  const stackObserver=registration&&interaction&&interaction!==element?new MutationObserver(syncStack):null;
  syncStack();if(stackObserver&&interaction)stackObserver.observe(interaction,{attributes:true,attributeFilter:['style']});
  const unlock=new Map<HTMLElement,()=>void>();let inertObserver:MutationObserver|undefined;
  if(!registration&&modal&&owner){const lock=()=>{for(const child of owner.children)if(child instanceof HTMLElement&&child!==host&&!child.hasAttribute('data-ksf-modal-host')&&!unlock.has(child))unlock.set(child,suspendWindowContent(child));};lock();inertObserver=new MutationObserver(lock);inertObserver.observe(owner,{childList:true});}
  if(!registration&&context.active&&context.enabled)(initialFocus?.current??(element.contains(doc.activeElement)?doc.activeElement as HTMLElement:element)).focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{if(latest.current.open&&event.key==='Escape'&&closeOnEscape&&!event.defaultPrevented&&!event.isComposing&&event.keyCode!==229&&latest.current.context.active&&latest.current.context.enabled){event.preventDefault();event.stopPropagation();void latest.current.onClose('escape');}};
  if(!registration)owner?.addEventListener('keydown',key);
  return()=>{const hadFocus=element.contains(doc.activeElement)||doc.activeElement===doc.body;owner?.removeEventListener('keydown',key);inertObserver?.disconnect();unlock.forEach(release=>release());restoreTheme();stackObserver?.disconnect();element.style.zIndex=previousZ;registration?.dispose();managed.current=false;if(!registration&&hadFocus&&latest.current.context.active&&latest.current.context.enabled&&opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});};
 },[present,presence.cycle,host,context.id,context.overlays,context.root,context.enabled,modal,closeOnOutside,closeOnEscape,presentation,initialFocus,opener,interactionElement]);
 // Keep the panel itself focusable through the exit; freeze only its children.
 // The same registration continues trapping Tab and locking its owned content until presence ends.
 useLayoutEffect(()=>{
  const node=panel.current;if(!motion||open||!present||!node)return;
  if(context.active&&context.enabled&&(node.contains(node.ownerDocument.activeElement)||exitHadFocus.current&&node.ownerDocument.activeElement===node.ownerDocument.body))node.focus({preventScroll:true});
  const unlock=[...node.children].filter((child):child is HTMLElement=>child instanceof HTMLElement).map(suspendWindowContent);
  return()=>unlock.forEach(release=>release());
 },[motion,open,present,context.active,context.enabled]);
 const childContext=useMemo(()=>({...context,active:context.active&&open,enabled:context.enabled&&open}),[context,open]);
 return <><span ref={source} hidden aria-hidden="true"/>{host&&(present||keepMounted)&&createPortal(<div ref={layer} hidden={!present} data-layer-motion={motion} data-motion-phase={presence.phase} className={cx('ksf-sdk-surface',scope,'ksf-window-layer')} data-presentation={presentation} data-side={side} data-centered={centered||undefined} data-overlay-owner={context.id}>
  {modal&&<div ref={backdrop} className="ksf-window-scrim" data-overlay-owner={context.id} aria-hidden="true" onPointerDown={event=>{if(!managed.current&&event.target===event.currentTarget&&latest.current.open&&closeOnOutside&&latest.current.context.active&&latest.current.context.enabled)void latest.current.onClose('outside');}}/>}
  <div {...props} style={motion==='dialog'?{...props.style,transformOrigin:props.style?.transformOrigin??dialogOrigin}:props.style} onClick={event=>{props.onClick?.(event);event.stopPropagation();}} ref={assign} tabIndex={props.tabIndex??-1} role={props.role??'dialog'} data-overlay-owner={context.id} className={cx('ksf-window-panel',className)} onKeyDown={event=>{onKeyDown?.(event);if(managed.current||event.defaultPrevented||event.key!=='Tab'||!modal)return;const elements=focusableElements(event.currentTarget),first=elements[0],last=elements.at(-1);if(!first){event.preventDefault();event.currentTarget.focus();}else if(event.shiftKey&&(event.currentTarget.ownerDocument.activeElement===first||event.currentTarget.ownerDocument.activeElement===event.currentTarget)){event.preventDefault();last!.focus();}else if(!event.shiftKey&&(event.currentTarget.ownerDocument.activeElement===last||event.currentTarget.ownerDocument.activeElement===event.currentTarget)){event.preventDefault();first.focus();}}}><WindowContext.Provider value={childContext}>{children}</WindowContext.Provider></div>
 </div>,host)}</>;
});
