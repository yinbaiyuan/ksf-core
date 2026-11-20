import {relateLayer} from './layer-relations';
import {useEffect,useLayoutEffect,useRef,useState,type HTMLAttributes,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {useWindowContext} from '../window-context';
import {useSurfaceScope} from '../surface-context';
import {themeColorNames,themeColorProperties} from '../theme';
import {focusableElements} from '../overlay-boundary';
import {useFinitePresence} from './finite-presence';
import {positionFloating,floatingLayoutBox,type FloatingPlacement} from './position-model';
import {trackLayerScroll} from './layer-scroll';
import './layer.css';
export type {FloatingPlacement} from './position-model';
export function followTheme(source:HTMLElement,target:HTMLElement){
  const view=source.ownerDocument.defaultView;if(!view)return()=>{};
  const copy=()=>{const style=view.getComputedStyle(source);for(const name of themeColorNames){const key=themeColorProperties[name];target.style.setProperty(key,style.getPropertyValue(key));}target.style.colorScheme=style.colorScheme;target.style.direction=style.direction;target.dir=style.direction;};copy();
  const observer=new MutationObserver(copy);for(let node:HTMLElement|null=source;node;node=node.parentElement)observer.observe(node,{attributes:true,attributeFilter:['data-ksf-theme','style','class','dir']});
  const media=view.matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',copy);
  return()=>{observer.disconnect();media.removeEventListener('change',copy);};
}
export interface AnchoredLayerProps extends HTMLAttributes<HTMLDivElement>{anchor:RefObject<HTMLElement|null>;open:boolean;onClose:()=>void;placement?:FloatingPlacement;matchWidth?:boolean;gap?:number;autoFocus?:boolean;returnFocus?:boolean;triggerRef?:RefObject<HTMLElement|null>;positionVersion?:string|number;motion?:'popover'|'tooltip'}
export function AnchoredLayer({anchor,open,onClose,placement='bottom-start',matchWidth=false,gap=6,autoFocus=false,returnFocus=true,triggerRef,positionVersion,motion,role='dialog',className='',children,...props}:AnchoredLayerProps){
  const context=useWindowContext(),scope=useSurfaceScope(),panel=useRef<HTMLDivElement>(null),motionSource=useRef<HTMLSpanElement>(null),[host,setHost]=useState<HTMLElement|null>(null),latest=useRef(onClose),latestState=useRef({open,context,returnFocus});latest.current=onClose;latestState.current={open,context,returnFocus};
  const presence=useFinitePresence(open&&context.active&&context.enabled,{enabled:!!motion,enterDuration:motion==='tooltip'?100:200},motion?motionSource:anchor,context.active&&context.enabled),present=presence.present;
  useLayoutEffect(()=>{if(present){const node=anchor.current;setHost(context.overlayHost??context.contentHost??context.root?.current??node?.closest<HTMLElement>('.ksf-sdk-surface')??node?.parentElement??null);}else setHost(null);},[present,anchor,context.overlayHost,context.contentHost,context.root]);
  useEffect(()=>{if(open&&(!context.active||!context.enabled))latest.current();},[open,context.active,context.enabled]);
  useLayoutEffect(()=>{
    const element=panel.current,node=anchor.current;if(!present||!host||!element||!node||!context.active||!context.enabled)return;
    const doc=node.ownerDocument,view=doc.defaultView;if(!view)return;
    const triggerNode=triggerRef?.current??node,trigger=focusableElements(triggerNode)[0]??triggerNode;
    const close=(focus=false)=>{latest.current();if(focus&&context.active&&context.enabled&&returnFocus&&trigger.isConnected)trigger.focus({preventScroll:true});};
    const registration=context.overlays?.isManaged?.()?context.overlays.register?.({kind:role==='tooltip'?'tooltip':'popover',modal:false,parent:context.overlays?.parentOf?.(triggerNode),element:()=>panel.current,trigger,autoFocus,restoreFocus:false,policy:{outside:role!=='tooltip',deactivate:true},onClose:reason=>close(reason==='escape')}):undefined;
    const relation=!registration?relateLayer(element,triggerNode,context.root?.current??context.id??host):undefined;
    if(!registration&&autoFocus)(focusableElements(element)[0]??element).focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{const target=event.target as Node|null;if(target&&!relation?.contains(target))close();};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing&&context.active&&context.enabled&&relation?.receivesEscape(event.target as Node)){event.preventDefault();event.stopPropagation();close(true);}};
    if(!registration){doc.addEventListener('pointerdown',outside);(context.root?.current??host).addEventListener('keydown',key);}
    const authored={maxWidth:element.style.maxWidth,maxHeight:element.style.maxHeight,width:element.style.width};
    const scrollState=trackLayerScroll(node,element,()=>measureAndRemember(),()=>close(),triggerRef?triggerNode:undefined,target=>Boolean(target?.contains?.(node)));
    const measure=()=>{if(!node.isConnected||!node.getClientRects().length){close();return;}const area=host.getBoundingClientRect(),rect=node.getBoundingClientRect();element.style.maxWidth=authored.maxWidth;element.style.maxHeight=authored.maxHeight;const computed=view.getComputedStyle(element),cssWidth=computed.maxWidth.endsWith('px')?parseFloat(computed.maxWidth):Infinity,cssHeight=computed.maxHeight.endsWith('px')?parseFloat(computed.maxHeight):Infinity,widthLimit=Math.max(0,Math.min(area.width-16,cssWidth)),heightLimit=Math.max(0,Math.min(area.height-16,cssHeight));element.style.maxWidth=`${widthLimit}px`;element.style.maxHeight=`${heightLimit}px`;element.style.setProperty('--ksf-floating-max-height',`${heightLimit}px`);if(matchWidth)element.style.width=`${Math.max(0,Math.min(rect.width,widthLimit))}px`;element.style.left='0px';element.style.top='0px';const visual=element.getBoundingClientRect(),style=view.getComputedStyle(element),matrix=new view.DOMMatrix(style.transform==='none'?undefined:style.transform),[ox=0,oy=0]=style.transformOrigin.split(' ').map(parseFloat),origin=floatingLayoutBox(visual,element.offsetWidth,element.offsetHeight,matrix,{x:ox,y:oy}),placed=positionFloating(rect,origin,area,placement,gap);element.style.left=`${placed.left-origin.left}px`;element.style.top=`${placed.top-origin.top}px`;element.dataset.floatingSide=placed.side;element.style.setProperty('--ksf-floating-anchor-width',`${rect.width}px`);element.style.setProperty('--ksf-floating-anchor-inline',`${rect.left-placed.left}px`);element.style.setProperty('--ksf-floating-arrow-x',`${Math.max(12,Math.min(origin.width-12,rect.left+rect.width/2-placed.left))}px`);element.style.setProperty('--ksf-floating-arrow-y',`${Math.max(12,Math.min(origin.height-12,rect.top+rect.height/2-placed.top))}px`);};
    const measureAndRemember=()=>{measure();scrollState.measured(node.getBoundingClientRect());};
    const theme=followTheme(node,element);measureAndRemember();const observer=new ResizeObserver(measureAndRemember);observer.observe(node);observer.observe(host);observer.observe(element);
    const scroll=scrollState.handle;doc.addEventListener('scroll',scroll,true);view.addEventListener('resize',measureAndRemember);
    return()=>{const heldFocus=element.contains(doc.activeElement)||doc.activeElement===doc.body;registration?.dispose();relation?.dispose();theme();observer.disconnect();element.style.maxWidth=authored.maxWidth;element.style.maxHeight=authored.maxHeight;if(matchWidth)element.style.width=authored.width;doc.removeEventListener('pointerdown',outside);(context.root?.current??host).removeEventListener('keydown',key);doc.removeEventListener('scroll',scroll,true);view.removeEventListener('resize',measureAndRemember);const current=latestState.current;if(!current.open&&current.returnFocus&&heldFocus&&current.context.active&&current.context.enabled&&trigger.isConnected&&!trigger.closest('[inert]'))trigger.focus({preventScroll:true});};
  },[present,presence.cycle,host,anchor,placement,matchWidth,gap,autoFocus,returnFocus,triggerRef,positionVersion,role,context.overlays,context.root,context.active,context.enabled]);
  const marker=motion?<span ref={motionSource} hidden aria-hidden="true"/>:null;
  if(!present||!host||!context.active||!context.enabled)return marker;
  const portal=createPortal(<div {...props} onClick={event=>{props.onClick?.(event);event.stopPropagation();}} ref={panel} inert={props.inert||!open||undefined} aria-hidden={!open?true:props['aria-hidden']} data-layer-motion={motion} data-motion-phase={presence.phase} role={role} tabIndex={-1} className={`ksf-sdk-surface ${scope} ksf-floating-panel ${className}`.trim()} data-overlay-owner={context.id} style={{position:'fixed',left:0,top:0,...props.style}}>{children}</div>,host);
  return motion?<>{marker}{portal}</>:portal;
}
