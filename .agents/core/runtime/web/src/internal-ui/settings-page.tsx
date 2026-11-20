import {useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactNode,type Ref,type KeyboardEvent} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Button} from './controls';
import {NavigationList,PageLayout,type NavigationItem} from './layouts';
import {ContentState,type ContentLoadState} from './collections';
import {useUI} from './provider';
import {useComposedRef} from './refs';
export interface SettingsSection extends Omit<NavigationItem,'href'|'children'> {}
export interface SettingsPageProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'|'onChange'> {
 title?:ReactNode;description?:ReactNode;sections:readonly SettingsSection[];sectionId:string|null;
 onSectionChange:(id:string)=>void;detailTitle?:ReactNode;onBackIntent?:()=>void;
 navigationVisible?:boolean;onNavigationVisibleChange?:(visible:boolean)=>void;
 navigationFooter?:ReactNode;toolbar?:ReactNode;footer?:ReactNode;
 layout?:'auto'|'wide'|'narrow';onLayoutChange?:(layout:'wide'|'narrow')=>void;
 loadState?:ContentLoadState;stale?:boolean;message?:ReactNode;onRetryIntent?:()=>void;
 contentRef?:Ref<HTMLDivElement>;onContentScroll?:HTMLAttributes<HTMLDivElement>['onScroll'];
}
/** Controlled page composition. Navigation never saves/discards a draft or chooses the first section. */
export function SettingsPage({title='设置',description,sections,sectionId,onSectionChange,detailTitle,onBackIntent,navigationVisible,onNavigationVisibleChange,navigationFooter,toolbar,footer,layout='auto',onLayoutChange,loadState='ready',stale=false,message,onRetryIntent,contentRef,onContentScroll,children,className='',...props}:SettingsPageProps){
 const ui=useUI(),root=useRef<HTMLDivElement>(null),navigation=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),lastFocused=useRef<HTMLElement|null>(null),pendingContentFocus=useRef(false),priorNavigation=useRef(false),[measuredNarrow,setMeasuredNarrow]=useState(false),layoutCallback=useRef(onLayoutChange);layoutCallback.current=onLayoutChange;
 const bindScroll=useComposedRef(scroll,contentRef);
 useLayoutEffect(()=>{if(layout!=='auto'||!root.current)return;const element=root.current,measure=()=>setMeasuredNarrow(element.getBoundingClientRect().width<880);measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[layout]);
 const narrow=layout==='narrow'||layout==='auto'&&measuredNarrow,showNavigation=narrow&&(navigationVisible??sectionId===null),section=sections.find(item=>item.id===sectionId),missing=sectionId!==null&&!section,state=loadState==='ready'&&missing?'unavailable':loadState;
 useLayoutEffect(()=>{layoutCallback.current?.(narrow?'narrow':'wide');},[narrow]);
 useLayoutEffect(()=>{if(ui.environment.active&&ui.environment.enabled){if(showNavigation&&!priorNavigation.current)navigation.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({preventScroll:true});if(narrow&&!showNavigation&&pendingContentFocus.current){pendingContentFocus.current=false;scroll.current?.focus({preventScroll:true});}}priorNavigation.current=showNavigation;},[narrow,showNavigation,sectionId,ui.environment.active,ui.environment.enabled]);
 // A modal may focus the wide navigation before the first width measurement.
 // When that region is hidden, move focus only if the browser dropped it; never take it from another layer.
 useLayoutEffect(()=>{if(!ui.environment.active||!ui.environment.enabled||!ui.environment.visible)return;const frame=requestAnimationFrame(()=>{
  const page=root.current,last=lastFocused.current,active=document.activeElement;if(!page||page.closest('[inert]')||!last)return;
  if(active!==document.body&&!(active===last&&(!last.isConnected||!!last.closest('[hidden]')||!last.getClientRects().length)))return;
  if(narrow&&!showNavigation&&navigation.current?.contains(last))page.querySelector<HTMLButtonElement>('[aria-label="返回设置分类"],[aria-label="返回上一页"]')?.focus({preventScroll:true});
  else if(!narrow&&last.getAttribute('aria-label')==='返回设置分类')navigation.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({preventScroll:true});
 });return()=>cancelAnimationFrame(frame);},[narrow,showNavigation,sectionId,ui.environment.active,ui.environment.enabled,ui.environment.visible]);
 function navigateKeys(event:KeyboardEvent<HTMLDivElement>){
  if(!ui.environment.active||!ui.environment.enabled||event.defaultPrevented||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||event.altKey||event.ctrlKey||event.metaKey||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const buttons=[...navigation.current!.querySelectorAll<HTMLButtonElement>('nav button:not(:disabled)')],index=buttons.indexOf(event.target as HTMLButtonElement);if(index<0)return;
  event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
 }
 return <div {...props} ref={root} onFocusCapture={event=>{lastFocused.current=event.target as HTMLElement;props.onFocusCapture?.(event);}} data-ksf-component="settings-page" data-layout={narrow?'narrow':'wide'} data-navigation-visible={showNavigation||undefined} className={`ksf-settings-page ${className}`.trim()}>
  <aside className="ksf-settings-navigation" hidden={narrow&&!showNavigation}><h2>{title}</h2><div ref={navigation} onKeyDown={navigateKeys}><NavigationList label="设置分类" items={sections} selectedId={sectionId} onSelect={id=>{if(narrow)pendingContentFocus.current=true;onSectionChange(id);}}/></div>{navigationFooter&&<div className="ksf-settings-navigation-footer">{navigationFooter}</div>}</aside>
  <div className="ksf-settings-content" hidden={showNavigation}><PageLayout title={<span className="ksf-settings-heading">{onBackIntent?<Button variant="ghost" icon={<ArrowLeft/>} aria-label="返回上一页" onActivate={onBackIntent}/>:narrow?<Button variant="ghost" icon={<ArrowLeft/>} aria-label="返回设置分类" disabled={!onNavigationVisibleChange} onActivate={()=>onNavigationVisibleChange?.(true)}/>:null}<span>{detailTitle??section?.label??title}</span></span>} description={description} toolbar={toolbar} footer={footer}>
   <div ref={bindScroll} className="ksf-settings-scroll" tabIndex={-1} onScroll={onContentScroll}><ContentState state={state} stale={stale} description={message??(missing?'所选设置分类暂不可用，请核对后选择。':undefined)} onRetry={onRetryIntent}>{children}</ContentState></div>
  </PageLayout></div>
 </div>;
}
