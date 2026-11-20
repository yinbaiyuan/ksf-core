import {useEffect,useRef,useState,type KeyboardEvent,type MouseEvent} from 'react';
import type {ContextAction} from '../../../../applications/sdk/src/components/ui/context-menu';
import {useWindowContext} from '../../../../applications/sdk/src/window-context';
import {LegacyUIBoundary} from './compat-boundary';
import {MenuSurface} from './menus';
import {menuIds} from './menu-model';
import {InlineAlert} from './feedback';
import {afterOverlayCommit} from '../../../../applications/sdk/src/controllers/overlay-commit';
import {useOptionalUI} from './provider';
export {copyText} from '../../../../applications/sdk/src/clipboard';
export type {ContextAction};
type Intent={owner:HTMLElement;x:number;y:number;label:string;actions:ContextAction[]};
/** Old event bindings collect one immutable action snapshot, then use the current MenuSurface. */
export function useContextMenu(){
 const legacy=useWindowContext(),ui=useOptionalUI(),context=legacy.id==='standalone'&&ui?{...legacy,active:ui.environment.active,enabled:ui.environment.enabled}:legacy;
 const [intent,setIntent]=useState<Intent|null>(null),[error,setError]=useState(''),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(!context.active||!context.enabled)setIntent(null);},[context.active,context.enabled]);
 const bind=(actions:()=>ContextAction[],label:string)=>{
  const show=(owner:HTMLElement,x:number,y:number)=>{if(!context.active||!context.enabled)return;const snapshot=actions().map(action=>({...action}));if(snapshot.length){setError('');setIntent({owner,x,y,label,actions:snapshot});}};
  const editing=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  return {onContextMenu:(event:MouseEvent<HTMLElement>)=>{if(event.defaultPrevented||editing(event.target))return;event.preventDefault();event.stopPropagation();show(event.currentTarget,event.clientX,event.clientY);},
   onKeyDown:(event:KeyboardEvent<HTMLElement>)=>{if(event.defaultPrevented||editing(event.target)||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();const box=event.currentTarget.getBoundingClientRect();show(event.currentTarget,box.left+12,box.bottom);}}};
 };
 const items=intent?.actions.map(action=>({id:action.id,label:action.label,disabled:action.disabled,danger:action.danger,separatorBefore:action.separator}))??[];
 const menu=<LegacyUIBoundary>{intent&&<MenuSurface open label={intent.label} items={items} anchor={{x:intent.x,y:intent.y}} trigger={intent.owner} allowed={menuIds(items)} onOpenChange={()=>setIntent(null)} onTabExit={()=>setIntent(null)}
  onAction={id=>{const action=intent.actions.find(item=>item.id===id);setIntent(null);if(!action||action.disabled)return;void afterOverlayCommit().then(()=>action.onAction()).catch(issue=>{if(live.current)setError(issue instanceof Error?issue.message:String(issue));});}}/>}{error&&<InlineAlert title="操作未完成" tone="danger" onDismiss={()=>setError('')}>{error}</InlineAlert>}</LegacyUIBoundary>;
 return {bind,menu};
}
