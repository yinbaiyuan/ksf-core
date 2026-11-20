import {useId,useLayoutEffect,useRef,useState,type CSSProperties,type HTMLAttributes,type ReactNode,type KeyboardEvent} from 'react';
import {Button,Link} from './controls';
import {UIProvider,useUI} from './provider';
import {valueChange,type UIValueChangeDetail} from './events';
import {stableIds,splitRange,constrainSplit} from './composition-model';

export interface PageLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'>{title?:ReactNode;description?:ReactNode;navigation?:ReactNode;toolbar?:ReactNode;aside?:ReactNode;footer?:ReactNode;bodyLabel?:string}
/** A page owns content layout; window chrome and window lifecycle stay in the host. */
export function PageLayout({title,description,navigation,toolbar,aside,footer,bodyLabel='页面内容',children,className='',...props}:PageLayoutProps){
 useUI();const id=useId();return <div {...props} data-ksf-component="page-layout" data-navigation={navigation!=null||undefined} data-aside={aside!=null||undefined} className={className}>
  {(title!=null||description!=null||toolbar!=null)&&<header className="ksf-page-heading"><div>{title!=null&&<h1 id={id}>{title}</h1>}{description!=null&&<p>{description}</p>}</div>{toolbar&&<div className="ksf-page-toolbar">{toolbar}</div>}</header>}
  <div className="ksf-page-regions">{navigation!=null&&<aside className="ksf-page-navigation">{navigation}</aside>}<div className="ksf-page-body" role="region" aria-label={bodyLabel}>{children}</div>{aside!=null&&<aside className="ksf-page-aside">{aside}</aside>}</div>{footer!=null&&<footer className="ksf-page-footer">{footer}</footer>}
 </div>;
}
export interface NavigationItem {id:string;label:string;href?:string;icon?:ReactNode;description?:string;disabled?:boolean;disabledReason?:string;children?:readonly NavigationItem[]}
export interface NavigationListProps extends Omit<HTMLAttributes<HTMLElement>,'onSelect'>{label:string;items:readonly NavigationItem[];selectedId?:string|null;expandedIds?:readonly string[];onSelect?:(id:string,detail:UIValueChangeDetail)=>void;onExpand?:(ids:readonly string[],detail:UIValueChangeDetail)=>void}
function navigationIds(items:readonly NavigationItem[],seen=new Set<string>(),depth=0){
 if(depth>8)throw Error('导航层级超过8层。');for(const item of items){if(!item.id?.trim()||seen.has(item.id))throw Error('导航需要全树唯一的稳定ID。');seen.add(item.id);if(item.children)navigationIds(item.children,seen,depth+1);}return seen;
}
export function NavigationList({label,items,selectedId,expandedIds=[],onSelect,onExpand,className='',...props}:NavigationListProps){
 const ui=useUI(),prefix=useId(),expanded=new Set(expandedIds);navigationIds(items);
 const active=ui.environment.active&&ui.environment.enabled;
 const render=(nodes:readonly NavigationItem[])=> <ul>{nodes.map(item=>{const group=!!item.children?.length,open=expanded.has(item.id),content=<>{item.icon&&<span className="ksf-control-icon" aria-hidden="true">{item.icon}</span>}<span className="ksf-navigation-text"><span>{item.label}</span>{item.description&&<small>{item.description}</small>}</span></>;
  return <li key={item.id} data-current={item.id===selectedId||undefined} data-disabled={item.disabled||undefined}><div className="ksf-navigation-row">
   {item.href?<Link href={item.href} disabled={item.disabled||!active} disabledReason={item.disabledReason} aria-current={item.id===selectedId?'page':undefined} onNavigate={()=>onSelect?.(item.id,valueChange('selection'))}>{content}</Link>:<Button variant="ghost" disabled={item.disabled||!active||(group?!onExpand:!onSelect)} disabledReason={item.disabledReason} aria-current={item.id===selectedId?'page':undefined} aria-expanded={group?open:undefined} onActivate={()=>{if(group)onExpand?.(open?expandedIds.filter(id=>id!==item.id):[...expandedIds,item.id],valueChange('selection'));else onSelect?.(item.id,valueChange('selection'));}}>{content}</Button>}
   {group&&<Button variant="ghost" icon={<span aria-hidden="true">{open?'⌄':'›'}</span>} aria-label={(open?'收起':'展开')+item.label} aria-expanded={open} aria-controls={prefix+'-'+encodeURIComponent(item.id)} disabled={!active||item.disabled||!onExpand} onActivate={()=>onExpand?.(open?expandedIds.filter(id=>id!==item.id):[...expandedIds,item.id],valueChange('selection'))}/>}
  </div>{group&&<div id={prefix+'-'+encodeURIComponent(item.id)} hidden={!open}>{render(item.children!)}</div>}</li>;
 })}</ul>;
 return <nav {...props} data-ksf-component="navigation-list" aria-label={label} className={className}>{render(items)}</nav>;
}

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>,'title'>{title?:ReactNode;description?:ReactNode;actions?:ReactNode;variant?:'plain'|'grouped'|'summary';material?:'solid'|'frost'|'glass';tone?:'neutral'|'info'|'success'|'warning'|'danger'}
export function Surface({title,description,actions,variant='grouped',material='solid',tone='neutral',children,className='',...props}:SurfaceProps){
 const id=useId();return <UIProvider role={variant==='summary'?'summary':'content'} config={{material:variant==='summary'?material:'solid'}} className="ksf-surface-context"><section {...props} data-ksf-component="surface" data-variant={variant} data-tone={tone} className={className} aria-labelledby={title!=null?id:props['aria-labelledby']}>
  {(title!=null||description!=null||actions!=null)&&<header className="ksf-surface-heading"><div>{title!=null&&<h2 id={id}>{title}</h2>}{description!=null&&<p>{description}</p>}</div>{actions&&<div className="ksf-surface-actions">{actions}</div>}</header>}<div className="ksf-surface-content">{children}</div>
 </section></UIProvider>;
}

export interface TabItem {id:string;label:string;content:ReactNode;disabled?:boolean;disabledReason?:string}
export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>,'onChange'>{label:string;items:readonly TabItem[];value:string|null;onValueChange:(id:string,detail:UIValueChangeDetail)=>void;variant?:'underline'|'segmented';orientation?:'horizontal'|'vertical';activation?:'manual'|'automatic';keepMounted?:boolean}
/** Manual activation is the default so navigation alone never starts a lazy request. */
export function Tabs({label,items,value,onValueChange,variant='underline',orientation='horizontal',activation='manual',keepMounted=false,className='',...props}:TabsProps){
 const ui=useUI(),prefix=useId(),list=useRef<HTMLDivElement>(null),[focused,setFocused]=useState<string|null>(null);stableIds(items,item=>item.id);
 const available=items.filter(item=>!item.disabled),selected=items.find(item=>item.id===value),tabStop=available.some(x=>x.id===focused)?focused:available.some(x=>x.id===value)?value:available[0]?.id;
 const activate=(id:string)=>{if(ui.environment.active&&ui.environment.enabled&&available.some(item=>item.id===id))onValueChange(id,valueChange('selection','keyboard'));};
 const move=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(event.defaultPrevented||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||!ui.environment.active||!ui.environment.enabled)return;
  const buttons=[...list.current?.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)')??[]],index=buttons.indexOf(document.activeElement as HTMLButtonElement),rtl=getComputedStyle(event.currentTarget).direction==='rtl';
  const previous=orientation==='vertical'?'ArrowUp':rtl?'ArrowRight':'ArrowLeft',next=orientation==='vertical'?'ArrowDown':rtl?'ArrowLeft':'ArrowRight';
  if(![previous,next,'Home','End'].includes(event.key)||!buttons.length)return;event.preventDefault();const at=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key===next?1:-1)+buttons.length)%buttons.length;
  const node=buttons[at];node.focus();setFocused(node.dataset.tabId!);if(activation==='automatic')activate(node.dataset.tabId!);
 };
 return <div {...props} data-ksf-component="tabs" data-variant={variant} data-orientation={orientation} className={className}><div ref={list} role="tablist" aria-label={label} aria-orientation={orientation} className="ksf-tab-list" onKeyDown={move}>{items.map(item=><button key={item.id} type="button" role="tab" id={prefix+'-tab-'+encodeURIComponent(item.id)} data-tab-id={item.id} aria-controls={prefix+'-panel-'+encodeURIComponent(item.id)} aria-selected={item.id===value} disabled={item.disabled||!ui.environment.enabled} title={item.disabledReason} tabIndex={item.id===tabStop?0:-1} onFocus={()=>setFocused(item.id)} onClick={()=>{if(ui.environment.active&&ui.environment.enabled&&!item.disabled)onValueChange(item.id,valueChange('selection'));}}>{item.label}</button>)}</div>
  {items.map(item=>keepMounted||item===selected?<div key={item.id} role="tabpanel" id={prefix+'-panel-'+encodeURIComponent(item.id)} aria-labelledby={prefix+'-tab-'+encodeURIComponent(item.id)} hidden={item!==selected} tabIndex={0} className="ksf-tab-panel">{item.content}</div>:null)}
 </div>;
}

export interface SplitPaneProps extends Omit<HTMLAttributes<HTMLDivElement>,'onChange'>{first:ReactNode;second:ReactNode;size:number;onSizeChange:(size:number,detail:UIValueChangeDetail)=>void;onSizeCommit?:(size:number,detail:UIValueChangeDetail)=>void;orientation?:'horizontal'|'vertical';label:string;min?:number;max?:number;minFirstSize?:number;minSecondSize?:number;disabled?:boolean;collapsed?:'first'|'second'|null;onCollapsedChange?:(pane:'first'|'second'|null)=>void}
export function SplitPane({first,second,size,onSizeChange,onSizeCommit,orientation='horizontal',label,min=10,max=90,minFirstSize=120,minSecondSize=120,disabled=false,collapsed=null,onCollapsedChange,className='',style,...props}:SplitPaneProps){
 const ui=useUI(),root=useRef<HTMLDivElement>(null),[available,setAvailable]=useState(0),drag=useRef<{id:number;start:number;value:number}|null>(null),range=splitRange(available,minFirstSize,minSecondSize,min,max),value=constrainSplit(size,range),usable=!disabled&&ui.environment.active&&ui.environment.enabled;
 useLayoutEffect(()=>{const node=root.current;if(!node)return;let frame=0;const measure=()=>{frame=0;setAvailable(Math.max(0,(orientation==='horizontal'?node.clientWidth:node.clientHeight)-8));};measure();const ro=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(measure)});ro.observe(node);return()=>{ro.disconnect();if(frame)cancelAnimationFrame(frame);};},[orientation]);
 const change=(next:number,source:'pointer'|'keyboard')=>{const n=constrainSplit(next,range);onSizeChange(n,valueChange('input',source));return n;};
 const end=(cancelled=false)=>{const current=drag.current;if(!current)return;drag.current=null;if(cancelled)onSizeChange(current.start,valueChange('input','pointer'));else onSizeCommit?.(current.value,valueChange('commit','pointer'));};
 useLayoutEffect(()=>{if(!usable)end(true);},[usable]);
 return <div {...props} ref={root} data-ksf-component="split-pane" data-orientation={orientation} data-constrained={!range.fits||undefined} data-collapsed={collapsed??undefined} className={className} style={{...style,'--ksf-split-first':available*value/100+'px'} as CSSProperties}>
  <div className="ksf-split-first" hidden={collapsed==='first'}>{first}</div><div role="separator" aria-label={label} aria-orientation={orientation==='horizontal'?'vertical':'horizontal'} aria-valuemin={range.fits?Math.ceil(range.min):0} aria-valuemax={range.fits?Math.floor(range.max):100} aria-valuenow={Math.round(value)} aria-valuetext={Math.round(value)+'%'} tabIndex={usable&&range.fits&&!collapsed?0:-1} aria-disabled={!usable||!range.fits||undefined} className="ksf-split-handle"
   onPointerDown={event=>{if(!usable||!range.fits||collapsed||event.button!==0)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,start:value,value};}}
   onPointerMove={event=>{if(!drag.current||drag.current.id!==event.pointerId||!usable)return;const node=root.current!,r=node.getBoundingClientRect(),rtl=orientation==='horizontal'&&getComputedStyle(node).direction==='rtl',span=orientation==='horizontal'?r.width:r.height,localSpan=orientation==='horizontal'?node.clientWidth:node.clientHeight,point=orientation==='horizontal'?(rtl?r.right-event.clientX:event.clientX-r.left):event.clientY-r.top;drag.current.value=change((point*localSpan/span-4)/Math.max(1,available)*100,'pointer');}}
   onPointerUp={event=>{if(drag.current?.id===event.pointerId){end();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}} onPointerCancel={()=>end(true)} onLostPointerCapture={()=>end(true)}
   onDoubleClick={()=>{if(usable&&onCollapsedChange)onCollapsedChange(collapsed?null:'second');}}
   onKeyDown={event=>{if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||!usable||!range.fits)return;if(event.key==='Escape'&&drag.current){event.preventDefault();end(true);return;}if(event.key==='Enter'&&onCollapsedChange){event.preventDefault();onCollapsedChange(collapsed?null:'second');return;}const rtl=orientation==='horizontal'&&getComputedStyle(event.currentTarget).direction==='rtl',previous=orientation==='horizontal'?(rtl?'ArrowRight':'ArrowLeft'):'ArrowUp',next=orientation==='horizontal'?(rtl?'ArrowLeft':'ArrowRight'):'ArrowDown';if(![previous,next,'Home','End'].includes(event.key))return;event.preventDefault();const n=change(event.key==='Home'?range.min:event.key==='End'?range.max:value+(event.key===next?1:-1)*(event.shiftKey?10:2),'keyboard');onSizeCommit?.(n,valueChange('commit','keyboard'));}}/>
  <div className="ksf-split-second" hidden={collapsed==='second'}>{second}</div>{collapsed&&onCollapsedChange&&<Button variant="ghost" className="ksf-split-restore" onActivate={()=>onCollapsedChange(null)}>展开{collapsed==='first'?'主':'辅助'}区域</Button>}
 </div>;
}
