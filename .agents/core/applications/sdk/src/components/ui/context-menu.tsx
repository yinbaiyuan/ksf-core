import {useSurfaceScope} from '../../surface-context';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useWindowContext } from '../../window-context';
import { menuPosition } from './context-menu-model';
import './context-menu.css';
export interface ContextAction { id:string; label:string; disabled?:boolean; danger?:boolean; separator?:boolean; onAction:()=>void|Promise<unknown> }
type OpenMenu={x:number;y:number;label:string;actions:ContextAction[];owner:HTMLElement};
/** One menu per surface; rows only receive event bindings, not individual menu instances. */
export function useContextMenu() {
  const scope=useSurfaceScope(),context=useWindowContext(), [open,setOpen]=useState<OpenMenu|null>(null), [feedback,setFeedback]=useState(''), root=useRef<HTMLDivElement>(null), identity=useRef({});
  const close=(focus=false)=>{if(focus&&open?.owner.isConnected)open.owner.focus();setOpen(null);};
  useEffect(()=>{if(!context.enabled||!context.active)setOpen(null);},[context.enabled,context.active]);
  useEffect(()=>{const other=(event:Event)=>{if((event as CustomEvent).detail!==identity.current)setOpen(null);};window.addEventListener('ksf:contextmenu',other);return()=>window.removeEventListener('ksf:contextmenu',other);},[]);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),4000);return()=>clearTimeout(timer);},[feedback]);
  useLayoutEffect(()=>{
    if(!open||!root.current)return;
    const area=context.overlayHost?.getBoundingClientRect()??{left:0,top:0,width:window.innerWidth,height:window.innerHeight};
    root.current.style.maxWidth=`${Math.max(0,area.width-16)}px`;root.current.style.maxHeight=`${Math.max(0,area.height-16)}px`;
    const bounds=root.current.getBoundingClientRect(),local=menuPosition(open.x-area.left,open.y-area.top,bounds.width,bounds.height,area.width,area.height),position={left:local.left+area.left,top:local.top+area.top};
    // Modal surfaces may establish a fixed-position containing block (filters / transforms).
    Object.assign(root.current.style,{left:`${position.left-(bounds.left-open.x)}px`,top:`${position.top-(bounds.top-open.y)}px`});
    root.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(null);};
    const dismiss=()=>setOpen(null);
    // Run before Radix's document capture listener, so Escape dismisses only this menu.
    const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'&&root.current?.contains(event.target as Node)){event.preventDefault();event.stopImmediatePropagation();if(open.owner.isConnected)open.owner.focus();setOpen(null);}};
    document.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape,true);window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape,true);window.removeEventListener('resize',dismiss);window.removeEventListener('blur',dismiss);};
  },[open]);
  const bind=(actions:()=>ContextAction[],label:string)=>{
    const show=(element:HTMLElement,x:number,y:number)=>{
      const values=actions();if(!values.length)return;
      const owner=element.matches('button,[tabindex]')?element:element.querySelector<HTMLElement>('button,[tabindex]')??element;
      window.dispatchEvent(new CustomEvent('ksf:contextmenu',{detail:identity.current}));setFeedback('');setOpen({x,y,label,actions:values,owner});
    };
    return {
      onContextMenu:(event:MouseEvent<HTMLElement>)=>{event.preventDefault();event.stopPropagation();show(event.currentTarget,event.clientX,event.clientY);},
      onKeyDown:(event:KeyboardEvent<HTMLElement>)=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();const box=event.currentTarget.getBoundingClientRect();show(event.currentTarget,box.left+12,box.bottom);}},
    };
  };
  const menu=<>{open&&createPortal(<div ref={root} className={`ksf-sdk-surface ${scope} app-context-menu`} role="menu" aria-label={open.label} style={{left:open.x,top:open.y}} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close(true);return;}
    const buttons=[...root.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='ArrowDown'?(index+1)%buttons.length:event.key==='ArrowUp'?(index-1+buttons.length)%buttons.length:event.key==='Home'?0:event.key==='End'?buttons.length-1:-1;
    if(next>=0){event.preventDefault();buttons[next]?.focus();}
  }}>{open.actions.map(action=><button key={action.id} type="button" role="menuitem" disabled={action.disabled} className={`${action.danger?'is-danger':''} ${action.separator?'has-separator':''}`} onClick={()=>{
    close(true);try{Promise.resolve(action.onAction()).catch(error=>setFeedback((error as Error).message));}catch(error){setFeedback((error as Error).message);}
  }}>{action.label}</button>)}</div>,open.owner.closest('[data-overlay-owner]')??context.overlayHost??document.body)}{feedback&&createPortal(<div className={`ksf-sdk-surface ${scope} app-context-feedback`} style={context.overlayHost?{bottom:16,maxWidth:'calc(100% - 24px)'}:undefined} role="status">{feedback}</div>,context.overlayHost??document.body)}</>;
  return {bind,menu};
}
export async function copyText(value:string) {
  const owner=document.activeElement as HTMLElement|null;
  if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(value);return;}catch{/* Fall back for local HTTP or denied clipboard permission. */}}
  const input=document.createElement('textarea');input.value=value;input.readOnly=true;input.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(input);
  try{input.select();if(!document.execCommand('copy'))throw new Error('复制失败，请选中内容后使用系统复制快捷键。');}finally{input.remove();if(owner?.isConnected)owner.focus();}
}
