import {DomainEditor,DesktopMigration,AppearanceMigration,ConfigurationExport,AbilityConfiguration} from './configuration-settings';
import {useInstanceName} from '../instance-preferences';
import {RuntimeSettingsContent} from './runtime-settings';
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent,type ReactNode,type RefObject} from 'react';
import {Activity,ArrowLeft,BookMarked,Check,Info,LayoutGrid,Palette,Sparkles,Network,UserRound,Settings2,Shapes,Database,X} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import {Sheet} from '../components/ui/sheet';
import {KsfLogo} from '../components/ksf-mark';
import {MaterialSettingsContent} from '../components/material-settings-panel';
import {AboutContent} from './about-dialog';
import {AISettingsContent} from './ai-settings';
import {CommunicationSettingsContent} from './communication-settings';
import {QuickstartContent} from './quickstart';
import {SettingsContext,SettingsGroup,SettingsLink,useSettingsDetail,useSettingsNavigation,type SettingsDetail,type SettingsDraft} from './settings-controls';
import './settings-window.css';

const categories=[
 {id:'quickstart',name:'快速上手',icon:BookMarked,color:'green'},
 {id:'personal',name:'个人与协作',icon:UserRound,color:'blue'},
 {id:'instance',name:'实例与程序',icon:Settings2,color:'gray'},
 {id:'desktop',name:'桌面管理',icon:LayoutGrid,color:'blue'},
 {id:'appearance',name:'外观设置',icon:Palette,color:'purple'},
 {id:'ai',name:'AI 任务服务',icon:Sparkles,color:'purple'},
 {id:'communication',name:'内网通信',icon:Network,color:'green'},
 {id:'runtime',name:'运行与后台',icon:Activity,color:'orange'},
 {id:'applications',name:'能力设置',icon:Shapes,color:'blue'},
 {id:'diagnostics',name:'数据与记录',icon:Database,color:'gray'},
 {id:'about',name:'关于 KSF',icon:Info,color:'gray'},
] as const;
export type SettingsTab=typeof categories[number]['id'];
function PersonalSettings(){
 const [selected,setSelected]=useState<'user'|'bot'|null>(null),navigate=useSettingsNavigation();
 useSettingsDetail(selected,selected==='user'?'用户协作设定':'Agent 协作设定',()=>setSelected(null));
 if(selected)return <DomainEditor domain={'collaboration.'+selected} hideTitle/>;
 return <><DomainEditor domain="identity"/><SettingsGroup title="协作设定" description="保留你与 Agent 的长期协作原文。"><SettingsLink title="用户协作设定" description="身份、称呼与协作偏好" value="USER.md" onClick={()=>navigate(()=>setSelected('user'))}/><SettingsLink title="Agent 协作设定" description="Agent 的定位与工作方式" value="BOT.md" onClick={()=>navigate(()=>setSelected('bot'))}/></SettingsGroup></>;
}
export function SettingsWindow({open,onOpenChange,tab,select,desktop,diagnostics,saved,onDocumentation,onMonitor,onProjects}:{open:boolean;onOpenChange:(open:boolean)=>void;tab:SettingsTab;select:(tab:SettingsTab)=>void;desktop:ReactNode;diagnostics:ReactNode;saved:string;anchor:RefObject<HTMLButtonElement|null>;onDocumentation?:()=>void;onMonitor?:()=>void;onProjects?:()=>void}){
 const id=useId(),tabs=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),focusTargets=useRef(new Map<string,string>()),positions=useRef(new Map<string,number>()),drafts=useRef(new Map<string,SettingsDraft>());
 const instanceName=useInstanceName(),[detail,setDetail]=useState<SettingsDetail|null>(null),[pending,setPending]=useState<(()=>void)|null>(null),[saving,setSaving]=useState(false),[narrow,setNarrow]=useState(()=>matchMedia('(max-width:767px)').matches),[showCategories,setShowCategories]=useState(false),[categoryEpoch,setCategoryEpoch]=useState(0);
 const location=tab+':'+(detail?.key??'root'),locationRef=useRef(location),previousLocation=useRef(location);locationRef.current=location;
 const savePosition=useCallback(()=>{if(scroll.current){positions.current.set(locationRef.current,scroll.current.scrollTop);const element=document.activeElement?.closest<HTMLElement>('[data-settings-link]');if(element&&scroll.current.contains(element))focusTargets.current.set(locationRef.current,element.dataset.settingsLink!);}},[]);
 const navigate=useCallback((action:()=>void)=>{savePosition();if([...drafts.current.values()].some(value=>value.dirty||value.busy))setPending(()=>action);else action();},[savePosition]);
 useEffect(()=>{if(pending&&!saving&&![...drafts.current.values()].some(value=>value.dirty||value.busy)){setPending(null);pending();}},[pending,saving]);
 const draft=useCallback((key:string,value:SettingsDraft|null)=>{if(value)drafts.current.set(key,value);else drafts.current.delete(key);setSaving([...drafts.current.values()].some(item=>item.busy));},[]);
 const context=useMemo(()=>({navigate,detail:setDetail,draft}),[navigate,draft]);
 useEffect(()=>{const media=matchMedia('(max-width:767px)'),changed=()=>setNarrow(media.matches);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 useLayoutEffect(()=>{if(open&&scroll.current){scroll.current.scrollTop=positions.current.get(location)??0;if(previousLocation.current.startsWith(tab+':')&&previousLocation.current!==location){if(!detail){const key=focusTargets.current.get(location);[...scroll.current.querySelectorAll<HTMLElement>('[data-settings-link]')].find(element=>element.dataset.settingsLink===key)?.focus({preventScroll:true});}else if(!scroll.current.contains(document.activeElement))document.querySelector<HTMLButtonElement>('.settings-titlebar .settings-back-button')?.focus({preventScroll:true});}}previousLocation.current=location;},[open,location,showCategories,tab]);
 useEffect(()=>{if(!open){setDetail(null);setPending(null);setShowCategories(false);positions.current.clear();focusTargets.current.clear();drafts.current.clear();}},[open]);
 useLayoutEffect(()=>{if(open&&(!narrow||showCategories))tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[open,tab,narrow,showCategories]);
 function choose(next:SettingsTab){if(next===tab&&!detail&&!showCategories)return;navigate(()=>{if(next===tab&&detail)setCategoryEpoch(value=>value+1);setShowCategories(false);select(next);});}
 function key(event:KeyboardEvent<HTMLDivElement>){
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();const index=categories.findIndex(item=>item.id===tab),next=event.key==='Home'?0:event.key==='End'?categories.length-1:(index+(event.key==='ArrowDown'?1:-1)+categories.length)%categories.length;
  choose(categories[next].id);tabs.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
 }
 const close=()=>navigate(()=>onOpenChange(false));
 const back=detail?()=>navigate(detail.back):narrow&&!showCategories?()=>navigate(()=>setShowCategories(true)):undefined;
 const heading=narrow&&showCategories?'系统设置':detail?.title??categories.find(item=>item.id===tab)!.name;
 return <SettingsContext.Provider value={context}><Sheet open={open} onOpenChange={value=>{if(value)onOpenChange(true);else close();}} title="系统设置" description="管理 KSF 协作设定、实例偏好与后台配置。" solid showHeader={false} className="system-settings settings-window">
  <div className={`settings-layout ${narrow?'is-narrow':''} ${showCategories?'shows-categories':''}`}>
   <aside className="settings-navigation" hidden={narrow&&!showCategories}>
    <div className="settings-brand"><KsfLogo/><span className="settings-brand-copy"><strong>{instanceName}</strong><small>系统设置</small></span></div>
    <div ref={tabs} className="settings-tabs" role="tablist" aria-label="系统设置分类" aria-orientation="vertical" onKeyDown={key}>{categories.map((item,index)=><button key={item.id} type="button" role="tab" id={id+'-'+item.id} aria-controls={id+'-panel'} aria-selected={tab===item.id} tabIndex={tab===item.id?0:-1} className={[3,5,8,10].includes(index)?'settings-category-break':''} onClick={()=>choose(item.id)}><span className={'settings-category-icon is-'+item.color}><item.icon size={16}/></span><span>{item.name}</span>{narrow&&<span className="settings-category-current">{tab===item.id&&<Check size={14}/>}</span>}</button>)}</div>
    <button type="button" className="settings-documentation-link" disabled={!onDocumentation} onClick={()=>navigate(()=>onDocumentation?.())}><BookMarked size={14}/>KSF手册</button>
   </aside>
   <div className="settings-content" hidden={narrow&&showCategories}>
    <header className="settings-titlebar">{back&&<button type="button" className="settings-back-button" aria-label={detail?'返回上一页':'返回设置分类'} onClick={back}><ArrowLeft size={18}/></button>}<div><h2>{heading}</h2>{detail&&<p>{categories.find(item=>item.id===tab)?.name}</p>}</div><button type="button" className="settings-close-button" aria-label="关闭系统设置" onClick={close}><X size={18}/></button></header>
    <div ref={scroll} className="settings-page" id={id+'-panel'} role="tabpanel" aria-labelledby={id+'-'+tab} tabIndex={-1}>
     {open&&<div key={tab+':'+categoryEpoch} className="settings-page-content">{tab==='quickstart'?<QuickstartContent select={choose} onDocumentation={onDocumentation}/>:tab==='personal'?<PersonalSettings/>:tab==='instance'?<><DomainEditor domain="instance"/><SettingsGroup title="程序参数" description="显式检查更新时使用的高级参数。"><details className="settings-technical"><summary>更新检查参数</summary><DomainEditor domain="program" only={['updates']} hideTitle/></details></SettingsGroup><ConfigurationExport/></>:tab==='applications'?<AbilityConfiguration/>:tab==='desktop'?<><DesktopMigration/>{desktop}<p className="settings-save-status" role="status">{saved}</p></>:tab==='appearance'?<><AppearanceMigration/><MaterialSettingsContent/></>:tab==='ai'?<AISettingsContent onProjects={onProjects?()=>navigate(onProjects):undefined}/>:tab==='communication'?<CommunicationSettingsContent/>:tab==='runtime'?<RuntimeSettingsContent onMonitor={onMonitor?()=>navigate(onMonitor):undefined}/>:tab==='diagnostics'?<><DomainEditor domain="capture"/><DomainEditor domain="program" only={['routing']}/><SettingsGroup title="采集与服务诊断"><div className="settings-diagnostics">{diagnostics}</div></SettingsGroup></>:<AboutContent/>}</div>}
    </div>
   </div>
   {narrow&&showCategories&&<button className="settings-close-button settings-category-close" aria-label="关闭系统设置" onClick={close}><X size={18}/></button>}
  </div>
 </Sheet><Dialog.Root open={!!pending} onOpenChange={value=>{if(!value)setPending(null);}}><Dialog.Portal><Dialog.Overlay className="settings-confirm-overlay"/><Dialog.Content className="settings-confirm"><Dialog.Title>保留当前修改？</Dialog.Title><Dialog.Description>{saving?'正在保存，请等待当前操作结束。':'此页面有尚未保存的修改。放弃后将读取已保存的设置。'}</Dialog.Description><div><Dialog.Close asChild><button type="button" autoFocus>继续编辑</button></Dialog.Close><button type="button" className="settings-danger" disabled={saving} onClick={()=>{const action=pending;setPending(null);for(const entry of drafts.current.values())entry.discard?.();drafts.current.clear();action?.();}}>放弃修改</button></div></Dialog.Content></Dialog.Portal></Dialog.Root></SettingsContext.Provider>;
}
