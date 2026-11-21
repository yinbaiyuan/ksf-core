import {useHostTheme} from '../components/host-theme';
import {DomainEditor,DesktopMigration,AppearanceMigration,ConfigurationExport,AbilityConfiguration} from './configuration-settings';
import {useInstanceName} from '../instance-preferences';
import {RuntimeSettingsContent} from './runtime-settings';
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from 'react';
import {SettingsCategoryIcon,SettingsBackIcon} from './settings-icons';
import {TextField} from '@ksf/sdk/text-field';
import {EmptyState} from '@ksf/sdk/empty-state';
import {Dialog} from '@ksf/sdk/dialog';
import {Button} from '@ksf/sdk/button';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {View} from '@ksf/sdk/view';
import {AppLayout} from '@ksf/sdk/app-layout';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {Heading,Text} from '@ksf/sdk/typography';
import {WindowContext,useWindowContext} from '@ksf/sdk/window-context';
import {overlays} from '../overlay-coordinator';
import {globalOverlayRoot} from '../overlay-runtime';
import {AppearanceEditor} from './appearance-editor';
import {afterOverlayCommit} from '@ksf/sdk/controllers';
import {reloadParticipants} from '../ui-runtime/reload-participants';
import {createSettingsReloadParticipant} from './settings-reload';
import {AboutContent} from './about-dialog';
import {AISettingsContent} from './ai-settings';
import {CommunicationSettingsContent} from './communication-settings';
import {QuickstartContent} from './quickstart';
import {SettingsContext,SettingsGroup,SettingsLink,useSettingsDetail,useSettingsNavigation,type SettingsDetail,type SettingsDraft} from './settings-controls';
import './settings-window.css';

const categories=[
 {id:'instance',name:'通用',group:'使用与个性化',description:'实例名称与程序参数'},
 {id:'personal',name:'个人与协作',group:'使用与个性化',description:'技术身份与长期协作设定'},
 {id:'appearance',name:'外观',group:'使用与个性化',description:'主题、背景与工作台外观'},
 {id:'desktop',name:'桌面',group:'使用与个性化',description:'Dock、桌面分组与卡片'},
 {id:'ai',name:'AI 服务',group:'连接与扩展',description:'执行端连接、配置与任务记录'},
 {id:'communication',name:'内网通信',group:'连接与扩展',description:'网络、节点配对与接收授权'},
 {id:'applications',name:'能力配置',group:'连接与扩展',description:'能力参数与来源关联'},
 {id:'runtime',name:'运行与后台',group:'系统与维护',description:'登录启动、后台状态与服务管理'},
 {id:'diagnostics',name:'数据与隐私',group:'系统与维护',description:'归档、路由记录、配置导出与诊断'},
 {id:'about',name:'关于 KSF',group:'系统与维护',description:'当前版本与兼容信息'},
 {id:'quickstart',name:'快速上手',group:'帮助',description:'工作空间与常用入口'},
] as const;
export type SettingsTab=typeof categories[number]['id'];
function GeneralSettings(){
 const [advanced,setAdvanced]=useState(false),navigate=useSettingsNavigation();
 useSettingsDetail(advanced?'program-updates':null,'更新检查参数',()=>setAdvanced(false));
 return advanced?<DomainEditor domain="program" only={['updates']} hideTitle/>:<><DomainEditor domain="instance"/><SettingsGroup title="程序参数"><SettingsLink title="更新检查参数" description="显式检查更新时使用的间隔与超时" onClick={()=>navigate(()=>setAdvanced(true))}/></SettingsGroup></>;
}
function PersonalSettings(){
 const [selected,setSelected]=useState<'user'|'bot'|null>(null),navigate=useSettingsNavigation();
 useSettingsDetail(selected,selected==='user'?'用户协作设定':'Agent 协作设定',()=>setSelected(null));
 if(selected)return <DomainEditor domain={'collaboration.'+selected} hideTitle/>;
 return <><DomainEditor domain="identity"/><SettingsGroup title="协作设定" description="保留你与 Agent 的长期协作原文。"><SettingsLink title="用户协作设定" description="身份、称呼与协作偏好" value="USER.md" onClick={()=>navigate(()=>setSelected('user'))}/><SettingsLink title="Agent 协作设定" description="Agent 的定位与工作方式" value="BOT.md" onClick={()=>navigate(()=>setSelected('bot'))}/></SettingsGroup></>;
}
export function SettingsWindow({open,onOpenChange,tab,select,desktop,diagnostics,saved,anchor,navigationGuard,onDocumentation,onMonitor,onProjects}:{open:boolean;onOpenChange:(open:boolean)=>void;tab:SettingsTab;select:(tab:SettingsTab)=>void;desktop:ReactNode;diagnostics:ReactNode;saved:string;anchor:RefObject<HTMLButtonElement|null>;navigationGuard:RefObject<(action:()=>void)=>void>;onDocumentation?:()=>void;onMonitor?:()=>void;onProjects?:()=>void}){
 const theme=useHostTheme(),windowContext=useWindowContext(),root=useRef<HTMLDivElement>(document.body as unknown as HTMLDivElement),panel=useRef<HTMLDivElement>(null),initialFocus=useRef<HTMLElement>(null),[query,setQuery]=useState('');
 const sdkWindow=useMemo(()=>({...windowContext,id:'workbench',root,overlayHost:globalOverlayRoot(),overlays}),[windowContext]);
 const [narrow,setNarrow]=useState(false),[panelNode,setPanelNode]=useState<HTMLDivElement|null>(null);
 const panelRef=useCallback((node:HTMLDivElement|null)=>{panel.current=node;initialFocus.current=node?.querySelector<HTMLElement>('[aria-current="page"]')??node;setPanelNode(node);},[]);
 useLayoutEffect(()=>{if(!open||!panelNode)return;const node=panelNode,measure=()=>{const next=node.clientWidth<720;if(next&&node.querySelector('aside')?.contains(node.ownerDocument.activeElement))setShowCategories(true);setNarrow(next);},observer=new ResizeObserver(measure);measure();observer.observe(node);return()=>observer.disconnect();},[open,panelNode]);
 const id=useId(),scroll=useRef<HTMLDivElement>(null),focusTargets=useRef(new Map<string,string>()),positions=useRef(new Map<string,number>()),drafts=useRef(new Map<string,SettingsDraft>());
 const instanceName=useInstanceName(),[detail,setDetail]=useState<SettingsDetail|null>(null),[pending,setPending]=useState<(()=>void)|null>(null),[saving,setSaving]=useState(false),[showCategories,setShowCategories]=useState(false),[categoryEpoch,setCategoryEpoch]=useState(0),[savingDrafts,setSavingDrafts]=useState(false),[discarding,setDiscarding]=useState(false),[discardError,setDiscardError]=useState('');
 const confirmationPanel=useRef<HTMLDivElement|null>(null),continuation=useRef<(()=>void)|null>(null);
 const confirmationRef=useCallback((node:HTMLDivElement|null)=>{confirmationPanel.current=node;if(!node&&continuation.current){const action=continuation.current;continuation.current=null;queueMicrotask(action);}},[]);
 const finishNavigation=useCallback((action:(()=>void)|null)=>{continuation.current=action;setPending(null);if(!confirmationPanel.current&&action){continuation.current=null;queueMicrotask(action);}},[]);
 const location=tab+':'+(detail?.key??'root'),locationRef=useRef(location),previousLocation=useRef(location);locationRef.current=location;
 const [,refreshDrafts]=useState(0),draftEpoch=useRef(0),openRef=useRef(open);openRef.current=open;
 useEffect(()=>{if(!open)return;return reloadParticipants.register(createSettingsReloadParticipant('system-settings:'+id,()=>{
  const current=[...drafts.current.values()];return {open:openRef.current,location:locationRef.current,epoch:draftEpoch.current,dirty:current.some(entry=>entry.dirty),busy:current.some(entry=>entry.busy),unresolved:current.some(entry=>!!entry.unresolved)};
 }));},[open,id]);
 const savePosition=useCallback(()=>{if(scroll.current&&scroll.current.clientHeight>0){positions.current.set(locationRef.current,scroll.current.scrollTop);const element=document.activeElement?.closest<HTMLElement>('[data-settings-link]');if(element&&scroll.current.contains(element))focusTargets.current.set(locationRef.current,element.dataset.settingsLink!);}},[]);
 const navigate=useCallback((action:()=>void)=>{savePosition();if([...drafts.current.values()].some(value=>value.dirty||value.busy||value.unresolved))setPending(()=>action);else action();},[savePosition]);
 useEffect(()=>{if(pending&&!saving&&!discarding&&!savingDrafts&&![...drafts.current.values()].some(value=>value.dirty||value.busy||value.unresolved)){finishNavigation(pending);}},[pending,saving,discarding,savingDrafts]);
 useLayoutEffect(()=>{navigationGuard.current=navigate;return()=>{navigationGuard.current=action=>action();};},[navigate,navigationGuard]);
 useLayoutEffect(()=>{if(!open||!narrow||pending)return;const node=panel.current,active=node?.ownerDocument.activeElement??null;if(showCategories){if(node?.querySelector('main')?.contains(active))node.querySelector<HTMLElement>('[aria-current="page"]')?.focus({preventScroll:true});}else if(node?.querySelector('aside')?.contains(active))node.querySelector<HTMLElement>('[aria-label="返回设置分类"]')?.focus({preventScroll:true});},[open,narrow,showCategories,location,pending]);
 const draft=useCallback((key:string,value:SettingsDraft|null)=>{draftEpoch.current++;if(value)drafts.current.set(key,value);else drafts.current.delete(key);setSaving([...drafts.current.values()].some(item=>item.busy));refreshDrafts(value=>value+1);},[]);
 const context=useMemo(()=>({navigate,detail:setDetail,draft}),[navigate,draft]);
 useLayoutEffect(()=>{if(open&&scroll.current&&scroll.current.clientHeight>0){scroll.current.scrollTop=positions.current.get(location)??0;if(previousLocation.current.startsWith(tab+':')&&previousLocation.current!==location){if(!detail){const key=focusTargets.current.get(location);[...scroll.current.querySelectorAll<HTMLElement>('[data-settings-link]')].find(element=>element.dataset.settingsLink===key)?.focus({preventScroll:true});}else if(!scroll.current.contains(document.activeElement))document.getElementById(id+'-settings-page')?.querySelector<HTMLButtonElement>('[aria-label="返回上一页"]')?.focus({preventScroll:true});}}previousLocation.current=location;},[open,location,showCategories,tab]);
 useEffect(()=>{if(!open){setDetail(null);setPending(null);setShowCategories(false);setQuery('');drafts.current.clear();}},[open]);
 function choose(next:SettingsTab){if(next===tab&&!detail&&!showCategories)return;navigate(()=>{if(next===tab&&detail)setCategoryEpoch(value=>value+1);setShowCategories(false);select(next);});}
 async function discardChanges(){
  if(discarding||saving||savingDrafts)return;const action=pending;setDiscarding(true);setDiscardError('');
  try{for(const entry of [...drafts.current.values()])if(entry.dirty&&await entry.discard?.()===false){setDiscardError('尚未读回已保存值或仍有未决提交；当前页面已保留。');return;}await afterOverlayCommit();if([...drafts.current.values()].some(entry=>entry.dirty||entry.busy||entry.unresolved)){setDiscardError('仍有未放弃的修改或未决操作，当前页面已保留。');return;}finishNavigation(action);}
  catch(error){setDiscardError(error instanceof Error?error.message:String(error));}
  finally{setDiscarding(false);}
 }
 const close=()=>navigate(()=>onOpenChange(false));
 const unresolved=[...drafts.current.values()].some(entry=>entry.unresolved);
 const canSave=[...drafts.current.values()].filter(entry=>entry.dirty).every(entry=>!!entry.save);
 async function saveChanges(){
  if(saving||discarding||savingDrafts)return;const action=pending;setSavingDrafts(true);setDiscardError('');
  try{for(const entry of [...drafts.current.values()])if(entry.dirty&&(!entry.save||!await entry.save())){setDiscardError('部分修改尚未保存，请核对当前页面及原提交结果。');return;}await afterOverlayCommit();if([...drafts.current.values()].some(entry=>entry.dirty||entry.busy||entry.unresolved)){setDiscardError('仍有新修改或未决操作，当前页面已保留。');return;}finishNavigation(action);}
  catch(error){setDiscardError(error instanceof Error?error.message:String(error));}finally{setSavingDrafts(false);}
 }
 const category=categories.find(item=>item.id===tab)!;
 const matches=categories.filter(item=>(item.name+' '+item.description).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const navigation=<div className="settings-navigation"><div className="settings-instance"><SettingsCategoryIcon category="personal" size={36}/><div><Text strong ellipsis>{instanceName}</Text><Text as="p" size="small" tone="muted">当前 KSF 实例</Text></div></div><TextField type="search" aria-label="查找设置" placeholder="查找设置" clearable value={query} onValueChange={setQuery}/><ScrollArea label="设置分类" className="settings-navigation-scroll">{(query.trim()?['使用与个性化','连接与扩展','系统与维护','帮助']:['使用与个性化','连接与扩展','系统与维护']).map(group=>{const items=matches.filter(item=>item.group===group);return items.length?<section key={group} className="settings-navigation-section"><Text as="p" size="small" tone="muted">{group}</Text><NavigationList label={group} items={items.map(item=>({id:item.id,label:item.name,icon:<SettingsCategoryIcon category={item.id}/>}))} selectedId={tab} onSelect={value=>{if(categories.some(item=>item.id===value))choose(value as SettingsTab);}}/></section>:null;})}{!matches.length&&<EmptyState compact illustration={false} heading="没有匹配的设置" description="试试“外观”“Dock”或“任务”等关键词。"/>}</ScrollArea><div className="settings-navigation-footer">{!query.trim()&&<Button variant="text" aria-current={tab==='quickstart'?'page':undefined} onClick={()=>choose('quickstart')}><SettingsCategoryIcon category="quickstart" size={20}/>快速上手</Button>}</div></div>;

 return <WindowContext.Provider value={sdkWindow}><View theme={theme==='host-theme-dark'?'dark':'light'} style={{display:'contents'}}><SettingsContext.Provider value={context}>
  <Dialog ref={panelRef} open={open} title="系统设置" onClose={()=>{close();return false;}} footer={false} centered width={1040} closeOnOutside={false} initialFocus={initialFocus} className="settings-window" data-settings-theme={theme==='host-theme-dark'?'dark':'light'} data-layout={narrow?'narrow':'wide'} data-navigation={showCategories?'list':'detail'}>
   <View id={id+'-settings-page'} className="settings-frame"><AppLayout className="settings-layout" sidebarWidth={248} sidebarLabel="设置分类" sidebar={navigation}>
    <div className="settings-content"><header className="settings-page-heading">
     {(detail||narrow)&&<Button variant="text" className="settings-page-back" aria-label={detail?'返回上一页':'返回设置分类'} onClick={()=>navigate(detail?detail.back:()=>setShowCategories(true))}><SettingsBackIcon width={20} height={20}/>{narrow&&!detail?'设置分类':null}</Button>}
     <div>{detail&&<Text as="p" size="small" tone="muted" className="settings-breadcrumb">{category.name}</Text>}<Heading level={2}>{detail?.title??category.name}</Heading>{!detail&&<Text as="p" tone="muted">{category.description}</Text>}</div>
    </header><ScrollArea ref={scroll} label={detail?.title??category.name} className="settings-page-scroll" onScroll={savePosition}>
     {open&&<div key={tab+':'+categoryEpoch} className="settings-page-content">{tab==='quickstart'?<QuickstartContent select={choose} onDocumentation={onDocumentation?()=>navigate(onDocumentation):undefined}/>:tab==='personal'?<PersonalSettings/>:tab==='instance'?<GeneralSettings/>:tab==='applications'?<AbilityConfiguration/>:tab==='desktop'?<><DesktopMigration/>{desktop}<Text as="p" size="small" tone="muted" role="status">{saved}</Text></>:tab==='appearance'?<><AppearanceMigration/><AppearanceEditor/></>:tab==='ai'?<AISettingsContent onProjects={onProjects?()=>navigate(onProjects):undefined}/>:tab==='communication'?<CommunicationSettingsContent/>:tab==='runtime'?<RuntimeSettingsContent onMonitor={onMonitor?()=>navigate(onMonitor):undefined}/>:tab==='diagnostics'?<><DomainEditor domain="capture"/><DomainEditor domain="program" only={['routing']}/><ConfigurationExport/><SettingsGroup title="采集与服务诊断"><div className="settings-diagnostics">{diagnostics}</div></SettingsGroup></>:<AboutContent/>}</div>}
    </ScrollArea></div>
   </AppLayout></View>
  </Dialog>
  <Dialog ref={confirmationRef} open={!!pending} title="保留当前修改？" onClose={()=>{if(discarding||savingDrafts)return false;setPending(null);setDiscardError('');}} closeOnOutside={false} centered description={unresolved?'有提交结果仍待核实。请核对原请求，再处理当前修改。':saving?'正在保存，请等待当前操作结束。':'此页面有尚未保存的修改。放弃后将读取最新已保存设置。'} footer={<>
   <Button disabled={discarding||savingDrafts} onClick={()=>{setPending(null);setDiscardError('');}}>继续编辑</Button>
   <Button tone="danger" disabled={saving||discarding||savingDrafts||unresolved} loading={discarding} onClick={()=>void discardChanges()}>放弃修改</Button>
   <Button variant="solid" tone="primary" loading={savingDrafts} disabled={saving||discarding||unresolved||!canSave} onClick={()=>void saveChanges()}>保存后继续</Button>
  </>}>{!canSave&&!unresolved&&<Text as="p">请先在当前设置页保存此修改，再继续。</Text>}{discardError&&<InlineAlert tone="error" heading="当前页面已保留">{discardError}</InlineAlert>}</Dialog>
 </SettingsContext.Provider></View></WindowContext.Provider>;
}
