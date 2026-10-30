import {useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {Check,Plus} from 'lucide-react';
import {ApplicationIcon} from '../apps/application-icon';
import type {applicationShortcuts} from './registry';

type LauncherApplication=ReturnType<typeof applicationShortcuts>[number];

export function ApplicationLauncher({open,onOpenChange,anchor,applications,openApp,manage,addedApplications,addApplication}:{open:boolean;onOpenChange:(value:boolean)=>void;anchor:RefObject<HTMLButtonElement|null>;applications:LauncherApplication[];openApp:(id:string)=>void;manage:(id:string)=>void;addedApplications:ReadonlySet<string>;addApplication:(id:string)=>void}){
 const panel=useRef<HTMLDivElement>(null),menu=useRef<HTMLDivElement>(null),menuTrigger=useRef<HTMLButtonElement|null>(null),close=useRef(onOpenChange);
 close.current=onOpenChange;
 const [position,setPosition]=useState<CSSProperties|null>(null);
 const [context,setContext]=useState<{appId:string;x:number;y:number}|null>(null);
 const contextApp=applications.find(app=>app.id===context?.appId);
 useLayoutEffect(()=>{
  if(!open){setContext(null);return;}
  const trigger=anchor.current;
  const update=()=>{
   const bounds=trigger?.getBoundingClientRect();if(!bounds)return;
   const width=Math.min(520,innerWidth-16),center=bounds.left+bounds.width/2,left=Math.max(8,Math.min(center-width/2,innerWidth-width-8));
   setPosition({left,width,bottom:innerHeight-bounds.top+12,maxHeight:Math.min(480,Math.max(0,bounds.top-20)),'--launcher-arrow-left':`${center-left}px`} as CSSProperties);
  };
  update();
  const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true}));
  const inside=(target:Node)=>panel.current?.contains(target)||menu.current?.contains(target)||trigger?.contains(target);
  const outside=(event:PointerEvent)=>{if(!inside(event.target as Node))close.current(false);};
  const focusOutside=(event:FocusEvent)=>{if(!inside(event.target as Node))close.current(false);};
  const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current(false);trigger?.focus({preventScroll:true});}};
  const blur=()=>close.current(false),observer=new ResizeObserver(update),dock=trigger?.closest('nav');if(dock)observer.observe(dock);
  document.addEventListener('pointerdown',outside);document.addEventListener('focusin',focusOutside);document.addEventListener('keydown',escape);
  window.addEventListener('resize',update);window.addEventListener('blur',blur);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',focusOutside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',update);window.removeEventListener('blur',blur);};
 },[open,anchor]);
 const dismissMenu=(restore=false)=>{if(!context)return;setContext(null);if(restore&&menuTrigger.current?.isConnected)menuTrigger.current.focus({preventScroll:true});};
 useLayoutEffect(()=>{
  if(!context)return;
  menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!menuTrigger.current?.contains(event.target as Node))setContext(null);};
  const resize=()=>{setContext(null);menuTrigger.current?.focus({preventScroll:true});};
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};
 },[context]);
 const showMenu=(app:LauncherApplication,trigger:HTMLButtonElement,x?:number,y?:number)=>{
  const bounds=trigger.getBoundingClientRect();menuTrigger.current=trigger;
  setContext({appId:app.id,x:x??bounds.left+bounds.width/2,y:y??bounds.top+bounds.height/2});
 };
 const menuKey=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismissMenu(true);return;}
  if(event.key==='Tab'){dismissMenu(true);return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement);
  items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus({preventScroll:true});
 };
 const select=(app:LauncherApplication)=>{
  onOpenChange(false);anchor.current?.focus({preventScroll:true});
  if(app.enabled&&app.hasWindow)openApp(app.id);
  else manage(app.id);
 };
 const key=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')],index=items.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;
  event.preventDefault();const columns=items.filter(item=>item.offsetTop===items[0].offsetTop).length;
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:index+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key]??0);
  items[Math.max(0,Math.min(items.length-1,next))]?.focus();
 };
 if(!open||!position)return null;
 return createPortal(<><div ref={panel} id="ksf-application-launcher" className="application-launcher" style={position} role="dialog" aria-label="所有应用" onKeyDown={key}>
  <div className="launcher-applications" aria-label="已安装的应用" onScroll={()=>dismissMenu(true)}>{applications.map(app=>{
   const status=!app.enabled?'已停用 · 前往管理':!app.hasWindow?'无窗口 · 前往管理':'';
   return <button type="button" key={app.id} className="launcher-application" data-launcher-app={app.id} title={`${app.name}${status?' · '+status:''}`} aria-label={`${status?'管理':'打开'}${app.name}${status?'，'+status:''}`} aria-haspopup="menu" aria-expanded={context?.appId===app.id} aria-controls={context?.appId===app.id?'ksf-launcher-context-menu':undefined} onClick={()=>select(app)} onContextMenu={event=>{event.preventDefault();event.stopPropagation();showMenu(app,event.currentTarget,event.clientX,event.clientY);}} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();showMenu(app,event.currentTarget);}}}>
    <ApplicationIcon appId={app.id} manifest={app.release?.manifest} variant="desktop"/><span className="launcher-application-name">{app.name}</span>
   </button>;
  })}</div>
 </div>{context&&contextApp&&<div ref={menu} id="ksf-launcher-context-menu" className="dock-context-menu launcher-context-menu" role="menu" aria-label={`${contextApp.name}应用操作`} style={{left:Math.max(8,Math.min(context.x,innerWidth-Math.min(232,innerWidth-16)-8)),top:Math.max(8,Math.min(context.y,innerHeight-126))}} onKeyDown={menuKey} onContextMenu={event=>event.preventDefault()}>
  <h3>{contextApp.name}</h3>
  <button role="menuitem" onClick={()=>select(contextApp)}>{contextApp.enabled&&contextApp.hasWindow?'打开应用':'管理应用'}</button>
  {contextApp.hasWindow&&<button role="menuitem" disabled={addedApplications.has(contextApp.id)} onClick={()=>{onOpenChange(false);anchor.current?.focus({preventScroll:true});addApplication(contextApp.id);}}>{addedApplications.has(contextApp.id)?<><Check size={15}/>已添加到桌面</>:<><Plus size={15}/>添加到桌面</>}</button>}
 </div>}</>,document.body);
}
