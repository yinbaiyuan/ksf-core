import {useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {type ApplicationMenuItem} from '../../../../applications/sdk/src/application-menu';
import {closeApplicationWindows} from '../apps/app-services';
import type {AppDefinition} from './registry';
import './application-menu.css';
import {standardApplicationMenu,type WindowMenus} from './application-menu-model';
export {createWindowMenus,type WindowMenus} from './application-menu-model';
type RootMenu={id:string;label:string;items?:ApplicationMenuItem[];disabled?:boolean;action?:ApplicationMenuItem};
export function ApplicationMenubar({definition,menus,windowId}:{definition:AppDefinition;menus:WindowMenus;windowId:string}){
 const state=useSyncExternalStore(menus.subscribe,menus.getSnapshot);
 const [opened,setOpened]=useState<string|null>(null),[path,setPath]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState<Set<string>>(new Set());
 const pending=useRef(new Set<string>()),bar=useRef<HTMLDivElement>(null),buttons=useRef(new Map<string,HTMLButtonElement>()),panels=useRef(new Map<number,HTMLDivElement>()),rows=useRef(new Map<string,HTMLButtonElement>()),focusNext=useRef<number|null>(null);
 const [positions,setPositions]=useState<{left:number;top:number}[]>([]),[capacity,setCapacity]=useState(64);
 const roots=useMemo<RootMenu[]>(()=>{
  const application=standardApplicationMenu(definition.name,!!definition.release?.manifest.cli,state,async()=>{await closeApplicationWindows(definition.id);});
  return [{id:'ksf.application',label:definition.name,items:application},...state.items.filter(item=>item.placement!=='application').map(item=>({id:item.id,label:item.label,disabled:item.disabled,items:item.children,action:item.children?undefined:item}))];
 },[state,definition]);
 const displayed=useMemo(()=>roots.length<=capacity?roots:[...roots.slice(0,Math.max(1,capacity-1)),{id:'ksf.overflow',label:'更多',items:roots.slice(Math.max(1,capacity-1)).map(root=>root.items?{id:root.id,label:root.label,disabled:root.disabled,children:root.items}:{...root.action!})}], [roots,capacity]);
 function dismiss(focus=false){if(focus&&opened)buttons.current.get(opened)?.focus();setOpened(null);setPath([]);}
 function show(id:string,keyboard=false){setError('');setOpened(id);setPath([]);focusNext.current=keyboard?0:null;}
 useEffect(()=>{dismiss();},[windowId,state,definition]);
 useEffect(()=>{if(!error)return;const timer=setTimeout(()=>setError(''),6000);return()=>clearTimeout(timer);},[error]);
 useLayoutEffect(()=>{
  if(!bar.current)return;
  const measure=()=>{const host=bar.current!;const width=host.clientWidth;let used=0,count=0;for(const root of roots){const button=buttons.current.get(root.id);const size=button?.offsetWidth??(root.label.length*13+24);if(used+size+(count<roots.length-1?48:0)>width&&count)break;used+=size;count++;}setCapacity(Math.max(2,count+(count<roots.length?1:0)));};
  measure();const observer=new ResizeObserver(measure);observer.observe(bar.current);return()=>observer.disconnect();
 },[roots]);
 const current=displayed.find(root=>root.id===opened),levels:ApplicationMenuItem[][]=[];
 if(current?.items){levels.push(current.items);for(const id of path){const parent=levels.at(-1)?.find(item=>item.id===id);if(parent?.children)levels.push(parent.children);else break;}}
 useLayoutEffect(()=>{
  if(!opened||!levels.length)return;
  const result:{left:number;top:number}[]=[];
  for(let depth=0;depth<levels.length;depth++){
   const panel=panels.current.get(depth),anchor=depth?rows.current.get(path[depth-1]):buttons.current.get(opened);if(!panel||!anchor)continue;
   const box=anchor.getBoundingClientRect(),bounds=panel.getBoundingClientRect();
   let left=depth?box.right-3:box.left;
   if(left+bounds.width>innerWidth-6)left=depth?box.left-bounds.width+3:innerWidth-bounds.width-6;
   result.push({left:Math.max(6,left),top:Math.max(32,Math.min(depth?box.top-4:box.bottom,innerHeight-bounds.height-6))});
  }
  setPositions(previous=>JSON.stringify(previous)===JSON.stringify(result)?previous:result);
  if(focusNext.current!==null){panels.current.get(focusNext.current)?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();focusNext.current=null;}
 },[opened,path,levels.length]);
 useEffect(()=>{
  if(!opened)return;
  const outside=(event:PointerEvent)=>{if(!bar.current?.contains(event.target as Node)&&![...panels.current.values()].some(panel=>panel.contains(event.target as Node)))dismiss();};
  const close=()=>dismiss();document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);window.addEventListener('blur',close);
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);window.removeEventListener('blur',close);};
 },[opened]);
 async function invoke(item:ApplicationMenuItem){
  if(item.disabled||pending.current.has(item.id))return;dismiss(true);pending.current.add(item.id);setBusy(new Set(pending.current));
  try{await item.onAction?.({id:item.id,...(item.checked!==undefined?{checked:!item.checked}:{})});}catch(issue){setError(definition.name+'：'+(issue as Error).message);}finally{pending.current.delete(item.id);setBusy(new Set(pending.current));}
 }
 function expand(depth:number,item:ApplicationMenuItem,keyboard=false){if(item.disabled||!item.children)return;if(keyboard){const next=panels.current.get(depth+1)?.querySelector<HTMLButtonElement>('button:not(:disabled)');if(next&&path[depth]===item.id)next.focus();else focusNext.current=depth+1;}setPath(previous=>{const next=[...previous.slice(0,depth),item.id];return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});}
 function rotate(direction:number){const enabled=displayed.filter(item=>!item.disabled),index=enabled.findIndex(item=>item.id===opened),next=enabled[(index+direction+enabled.length)%enabled.length];if(next.items){show(next.id,true);}buttons.current.get(next.id)?.focus();}
 function menuKey(event:KeyboardEvent<HTMLDivElement>,depth:number){
  const available=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=available.indexOf(document.activeElement as HTMLButtonElement),item=levels[depth].find(row=>row.id===(document.activeElement as HTMLElement)?.dataset.menuItem);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowDown'?1:-1)+available.length)%available.length;available[next]?.focus();}
  else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss(true);}
  else if(event.key==='Tab'){dismiss(true);}
  else if(event.key==='ArrowRight'){event.preventDefault();if(item?.children)expand(depth,item,true);else rotate(1);}
  else if(event.key==='ArrowLeft'){event.preventDefault();if(depth){const parent=path[depth-1];setPath(path.slice(0,depth-1));rows.current.get(parent)?.focus();}else rotate(-1);}
  else if(event.key.length===1&&!event.metaKey&&!event.ctrlKey){available.find(button=>button.textContent?.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()))?.focus();}
 }
 return <><div ref={bar} className="os-application-menubar" role="menubar" aria-label={definition.name+'菜单栏'}>{displayed.map((root,index)=><button key={root.id} ref={node=>{if(node)buttons.current.set(root.id,node);else buttons.current.delete(root.id);}} type="button" role="menuitem" disabled={root.disabled} className={index===0?'is-application-name':''} aria-haspopup={root.items?'menu':undefined} aria-expanded={root.items?opened===root.id:undefined} tabIndex={index===0?0:-1} onClick={()=>root.items?opened===root.id?dismiss(true):show(root.id,true):root.action&&void invoke(root.action)} onPointerEnter={()=>{if(opened&&root.items&&!root.disabled&&opened!==root.id)show(root.id);}} onKeyDown={event=>{
  if(['ArrowDown','Enter',' '].includes(event.key)&&root.items){event.preventDefault();show(root.id,true);}else if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const enabled=displayed.filter(item=>!item.disabled),at=enabled.findIndex(item=>item.id===root.id),next=enabled[(at+(event.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length];buttons.current.get(next.id)?.focus();if(opened&&next.items)show(next.id,true);}else if(event.key==='Escape')dismiss(true);
 }}>{root.label}</button>)}</div>
 {opened&&createPortal(<>{levels.map((items,depth)=><div key={depth} ref={node=>{if(node)panels.current.set(depth,node);else panels.current.delete(depth);}} className="os-application-dropdown" role="menu" aria-label={depth?levels[depth-1].find(item=>item.id===path[depth-1])?.label:current?.label} style={positions[depth]??{left:0,top:32}} onKeyDown={event=>menuKey(event,depth)}>{items.map(item=><button key={item.id} ref={node=>{if(node)rows.current.set(item.id,node);else rows.current.delete(item.id);}} type="button" data-menu-item={item.id} role={item.checked===undefined?'menuitem':'menuitemcheckbox'} aria-checked={item.checked} aria-haspopup={item.children?'menu':undefined} aria-expanded={item.children?path[depth]===item.id:undefined} disabled={item.disabled||busy.has(item.id)} className={`${item.separator?'has-separator ':''}${item.danger?'is-danger':''}`} onPointerEnter={()=>{if(item.children)expand(depth,item);else setPath(previous=>previous.length>depth?previous.slice(0,depth):previous);}} onClick={()=>item.children?expand(depth,item,true):void invoke(item)}><span className="os-menu-check" aria-hidden="true">{item.checked?'✓':''}</span><span>{item.label}</span><span className="os-menu-submenu" aria-hidden="true">{item.children?'›':''}</span></button>)}</div>)}</>,document.body)}
 {error&&createPortal(<div role="status" className="os-application-menu-error">{error}</div>,document.body)}</>;
}
