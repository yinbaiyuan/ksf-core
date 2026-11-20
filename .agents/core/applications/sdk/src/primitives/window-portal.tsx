import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useWindowContext} from '../window-context';
import {useSurfaceScope} from '../surface-context';
import {followTheme} from './layer';
/** Nonmodal content belongs to the current window or nearest standalone View. */
export function WindowPortal({children,className=''}:{children:ReactNode;className?:string}){
 const context=useWindowContext(),scope=useSurfaceScope(),source=useRef<HTMLSpanElement>(null),target=useRef<HTMLDivElement>(null),[host,setHost]=useState<HTMLElement|null>(context.overlayHost);
 useLayoutEffect(()=>{if(!context.enabled){setHost(null);return;}if(context.overlayHost){setHost(context.overlayHost);return;}const node=source.current,owner=context.root?.current??node?.closest<HTMLElement>('.ksf-view,.ksf-sdk-surface')??node?.parentElement;if(!node||!owner)return;const doc=node.ownerDocument,view=doc.defaultView;if(!view)return;const local=doc.createElement('div');local.dataset.ksfNonmodalHost='';local.style.cssText='position:fixed;left:0;top:0;overflow:hidden;pointer-events:none;z-index:90';owner.append(local);const measure=()=>{local.style.left='0px';local.style.top='0px';const origin=local.getBoundingClientRect(),rect=owner.getBoundingClientRect();local.style.left=rect.left-origin.left+'px';local.style.top=rect.top-origin.top+'px';local.style.width=rect.width+'px';local.style.height=rect.height+'px';};measure();const observer=new ResizeObserver(measure);observer.observe(owner);doc.addEventListener('scroll',measure,true);view.addEventListener('resize',measure);setHost(local);return()=>{observer.disconnect();doc.removeEventListener('scroll',measure,true);view.removeEventListener('resize',measure);local.remove();};},[context.overlayHost,context.root,context.enabled]);
 useLayoutEffect(()=>{if(source.current&&target.current)return followTheme(source.current,target.current);},[host,context.enabled]);
 return <><span ref={source} hidden/>{context.enabled&&host&&createPortal(<div ref={target} className={`ksf-sdk-surface ${scope} ${className}`} data-overlay-owner={context.id} style={{position:'absolute',inset:0,pointerEvents:'none'}}>{children}</div>,host)}</>;
}
