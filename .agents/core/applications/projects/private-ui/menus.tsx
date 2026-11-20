import {useId,useLayoutEffect,useMemo,useRef,useState,type ComponentProps,type ReactElement,type ReactNode} from 'react';
import {Slot} from '@radix-ui/react-slot';
import {Check,ChevronRight} from 'lucide-react';
import {OverlayHost} from './interactions';
import {useUI} from './provider';
import {useOverlayPosition,type OverlayAnchor} from './position';
import {menuIds,menuMatch} from './menu-model';
import type {OverlayPlacement} from './position-model';
import type {UIOpenChange} from './overlays';

export interface MenuItem {
 id:string;label:string;icon?:ReactNode;description?:string;disabled?:boolean;disabledReason?:string;busy?:boolean;
 checked?:boolean;children?:readonly MenuItem[];separatorBefore?:boolean;closeOnSelect?:boolean;danger?:boolean;
}
export interface ContextMenuTarget {readonly id:string;readonly revision?:string;readonly label?:string}
export interface MenuActionDetail {source:'pointer'|'keyboard';target?:Readonly<ContextMenuTarget>}
interface MenuSurfaceProps {
 open:boolean;items:readonly MenuItem[];label:string;anchor:OverlayAnchor|null;trigger:HTMLElement|null;placement?:OverlayPlacement;
 allowed:ReadonlySet<string>;onOpenChange:UIOpenChange;onAction:(id:string,detail:MenuActionDetail)=>void;
 target?:Readonly<ContextMenuTarget>;focusLast?:boolean;autoFocus?:boolean;onBack?:()=>void;onTabExit:()=>void;
}
/** Dropdowns and context menus share this single renderer, including nested-menu behavior. */
export function MenuSurface({open,items,label,anchor,trigger,placement='bottom-start',allowed,onOpenChange,onAction,target,focusLast=false,autoFocus=true,onBack,onTabExit}:MenuSurfaceProps){
 const ui=useUI(),id=useId(),panel=useRef<HTMLDivElement>(null),[active,setActive]=useState(''),[child,setChild]=useState<{id:string;anchor:HTMLElement;keyboard:boolean}|null>(null),dispatched=useRef(false),search=useRef({text:'',at:0});
 const position=useOverlayPosition(open,anchor,panel,placement);
 useLayoutEffect(()=>{if(!open){setChild(null);dispatched.current=false;search.current={text:'',at:0};}},[open]);
 const buttons=()=>[...panel.current?.querySelectorAll<HTMLButtonElement>(':scope > .ksf-menu-items > [data-menu-item]')??[]];
 const focus=(index:number)=>{const rows=buttons(),button=rows[(index+rows.length)%rows.length];if(button){setActive(button.dataset.menuItem!);button.focus({preventScroll:true});button.scrollIntoView({block:'nearest',inline:'nearest'});}};
 const unavailable=(item:MenuItem)=>!!(item.disabled||item.busy||!allowed.has(item.id));
 const activate=(item:MenuItem,element:HTMLElement,source:'pointer'|'keyboard')=>{
  if(!ui.environment.active||!ui.environment.enabled||!ui.environment.visible||unavailable(item)||dispatched.current)return;
  if(item.children?.length){setChild({id:item.id,anchor:element,keyboard:source==='keyboard'});return;}
  if(item.closeOnSelect!==false)dispatched.current=true;
  onAction(item.id,{source,target});if(item.closeOnSelect!==false)void onOpenChange(false,{reason:'action'});
 };
 const childItem=child&&items.find(item=>item.id===child.id&&!unavailable(item)&&item.children?.length);
 return <OverlayHost ref={panel} open={open&&!!anchor} kind="menu" trigger={trigger} autoFocus={autoFocus} initialFocus={()=>focusLast?buttons().at(-1)??panel.current:buttons()[0]??panel.current}
  onClose={reason=>onOpenChange(false,{reason})} role="menu" aria-label={label} data-ksf-component="menu" data-side={position.side} style={position.style}
  onKeyDown={event=>{
   if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
   if(event.key==='Tab'){event.stopPropagation();onTabExit();return;}
   if(event.defaultPrevented)return;
   const rows=buttons(),index=rows.indexOf(document.activeElement as HTMLButtonElement),item=items[index],rtl=getComputedStyle(event.currentTarget).direction==='rtl';
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();focus(event.key==='Home'?0:event.key==='End'?rows.length-1:index+(event.key==='ArrowDown'?1:-1));}
   else if(event.key===(rtl?'ArrowLeft':'ArrowRight')&&item?.children?.length){event.preventDefault();event.stopPropagation();activate(item,rows[index],'keyboard');}
   else if(event.key===(rtl?'ArrowRight':'ArrowLeft')&&onBack){event.preventDefault();event.stopPropagation();onBack();}
   else if((event.key==='Enter'||event.key===' ')&&item){event.preventDefault();event.stopPropagation();activate(item,rows[index],'keyboard');}
   else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
    event.preventDefault();event.stopPropagation();const now=performance.now(),next=now-search.current.at<700?search.current.text+event.key:event.key;
    search.current={text:next,at:now};const repeated=[...next].every(letter=>letter===next[0]),match=menuMatch(items.map(item=>item.label),repeated?event.key:next,index);if(match>=0)focus(match);
   }
  }}>
  <div className="ksf-menu-items">{items.length?items.map(item=>{const blocked=unavailable(item),itemId=id+'-'+encodeURIComponent(item.id),expanded=childItem?.id===item.id;
   return <button key={item.id} type="button" id={itemId} data-menu-item={item.id} data-separator={item.separatorBefore||undefined} data-danger={item.danger||undefined} tabIndex={active===item.id?0:-1}
    role={item.checked!==undefined?'menuitemcheckbox':'menuitem'} aria-labelledby={itemId+'-label'} aria-checked={item.checked} aria-disabled={blocked||undefined} aria-busy={item.busy||undefined}
    aria-haspopup={item.children?.length?'menu':undefined} aria-expanded={item.children?.length?expanded:undefined} aria-describedby={item.description||item.disabledReason?itemId+'-description':undefined}
    onFocus={()=>setActive(item.id)} onPointerMove={event=>{if(event.pointerType==='touch'||!ui.environment.active)return;const element=event.currentTarget;setActive(item.id);element.focus({preventScroll:true});if(item.children?.length&&!blocked)setChild(previous=>previous?.id===item.id?previous:{id:item.id,anchor:element,keyboard:false});else setChild(null);}}
    onClick={event=>{event.preventDefault();event.stopPropagation();activate(item,event.currentTarget,event.detail===0?'keyboard':'pointer');}}>
    <span className="ksf-menu-icon" aria-hidden="true">{item.checked!==undefined?(item.checked?<Check/>:null):item.icon}</span><span className="ksf-menu-text"><span id={itemId+'-label'}>{item.label}</span>{(item.description||item.disabledReason)&&<small id={itemId+'-description'}>{blocked&&item.disabledReason?item.disabledReason:item.description}</small>}{!allowed.has(item.id)&&<small>请重新打开菜单后操作</small>}</span>{item.busy?<span className="ksf-busy-indicator" aria-hidden="true"/>:item.children?.length?<ChevronRight className="ksf-menu-chevron" aria-hidden="true"/>:null}
   </button>;
  }):<div className="ksf-menu-empty">暂无可用操作</div>}</div>
  {child&&childItem&&<MenuSurface open items={childItem.children!} label={childItem.label} anchor={child.anchor} trigger={child.anchor} placement={getComputedStyle(child.anchor).direction==='rtl'?'left-start':'right-start'} allowed={allowed} target={target} autoFocus={child.keyboard}
   onOpenChange={(_next,detail)=>{setChild(null);if(detail.reason==='action')return onOpenChange(false,detail);}}
   onAction={onAction} onBack={()=>setChild(null)} onTabExit={onTabExit}/>}
 </OverlayHost>;
}

export interface DropdownMenuProps {
 open:boolean;onOpenChange:UIOpenChange;trigger:ReactElement<ComponentProps<'button'>>;items:readonly MenuItem[];label:string;
 placement?:OverlayPlacement;onAction:(id:string,detail:MenuActionDetail)=>void;
}
export function DropdownMenu({open,onOpenChange,trigger,items,label,placement='bottom-start',onAction}:DropdownMenuProps){
 const ui=useUI(),[anchor,setAnchor]=useState<HTMLElement|null>(null),[last,setLast]=useState(false);
 const intent=useMemo(()=>open?{allowed:menuIds(items),onAction}:null,[open]);menuIds(items);
 const tabExit=()=>{if(ui.environment.active&&anchor?.isConnected)anchor.focus({preventScroll:true});void onOpenChange(false,{reason:'tab'});};
 return <><Slot ref={setAnchor} aria-haspopup="menu" aria-expanded={open}
   onClick={event=>{if(!event.defaultPrevented&&ui.environment.active&&ui.environment.enabled){setLast(false);void onOpenChange(!open,{reason:'trigger'});}}}
   onKeyDown={event=>{if(event.defaultPrevented||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||!ui.environment.active||!ui.environment.enabled)return;if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();setLast(event.key==='ArrowUp');void onOpenChange(true,{reason:'trigger'});}}}>{trigger}</Slot>
  {intent&&<MenuSurface open={open&&!!anchor} items={items} label={label} anchor={anchor} trigger={anchor} placement={placement} allowed={intent.allowed} focusLast={last} onOpenChange={onOpenChange} onAction={intent.onAction} onTabExit={tabExit}/>}
 </>;
}

export interface ContextMenuProps {
 children:ReactElement<ComponentProps<'div'>>;open:boolean;onOpenChange:UIOpenChange;items:readonly MenuItem[];label:string;
 target:ContextMenuTarget;onAction:(id:string,detail:MenuActionDetail)=>void;
}
const editing=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||!!target.closest('input,textarea,select'));
export function ContextMenu({children,open,onOpenChange,items,label,target,onAction}:ContextMenuProps){
 const ui=useUI(),[node,setNode]=useState<HTMLElement|null>(null),[intent,setIntent]=useState<{target:Readonly<ContextMenuTarget>;anchor:OverlayAnchor;allowed:ReadonlySet<string>;onAction:ContextMenuProps['onAction']}|null>(null);
 menuIds(items);if(typeof target.id!=='string'||!target.id.trim())throw Error('ContextMenu需要稳定目标ID。');
 const same=!!intent&&intent.target.id===target.id&&intent.target.revision===target.revision;
 useLayoutEffect(()=>{if(!open)setIntent(null);else if(intent&&!same)void onOpenChange(false,{reason:'target-changed'});},[open,target.id,target.revision]);
 const begin=(anchor:OverlayAnchor)=>{setIntent({target:Object.freeze({...target}),anchor,allowed:menuIds(items),onAction});void onOpenChange(true,{reason:'trigger'});};
 const tabExit=()=>{if(ui.environment.active&&node?.isConnected)node.focus({preventScroll:true});void onOpenChange(false,{reason:'tab'});};
 return <><Slot ref={setNode} onContextMenu={event=>{if(event.defaultPrevented||editing(event.target)||!ui.environment.active||!ui.environment.enabled)return;event.preventDefault();event.stopPropagation();begin({x:event.clientX,y:event.clientY});}}
   onKeyDown={event=>{if(event.defaultPrevented||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||editing(event.target)||!ui.environment.active||!ui.environment.enabled)return;if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();event.stopPropagation();begin(event.currentTarget);}}}>{children}</Slot>
  {intent&&<MenuSurface open={open&&same} items={items} label={label} anchor={intent.anchor} trigger={node} target={intent.target} allowed={intent.allowed} onOpenChange={onOpenChange} onAction={intent.onAction} onTabExit={tabExit}/>}
 </>;
}
