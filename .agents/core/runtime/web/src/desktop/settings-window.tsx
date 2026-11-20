import {useHostTheme} from '../components/host-theme';
import {DomainEditor,DesktopMigration,AppearanceMigration,ConfigurationExport,AbilityConfiguration} from './configuration-settings';
import {useInstanceName} from '../instance-preferences';
import {RuntimeSettingsContent} from './runtime-settings';
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from 'react';
import {Activity,BookMarked,Info,LayoutGrid,Palette,Sparkles,Network,UserRound,Settings2,Shapes,Database,X} from 'lucide-react';
import {SettingsPage,UIProvider,Dialog,AlertDialog,Button,InlineAlert} from '../internal-ui/index';
import {LegacyUIBoundary} from '../internal-ui/compat-boundary';
import {AppearanceEditor} from './appearance-editor';
import {afterOverlayCommit} from '../../../../applications/sdk/src/controllers/overlay-dom';
import {reloadParticipants} from '../ui-runtime/reload-participants';
import {createSettingsReloadParticipant} from './settings-reload';
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
export function SettingsWindow({open,onOpenChange,tab,select,desktop,diagnostics,saved,anchor,onDocumentation,onMonitor,onProjects}:{open:boolean;onOpenChange:(open:boolean)=>void;tab:SettingsTab;select:(tab:SettingsTab)=>void;desktop:ReactNode;diagnostics:ReactNode;saved:string;anchor:RefObject<HTMLButtonElement|null>;onDocumentation?:()=>void;onMonitor?:()=>void;onProjects?:()=>void}){
 const theme=useHostTheme();
 const id=useId(),scroll=useRef<HTMLDivElement>(null),focusTargets=useRef(new Map<string,string>()),positions=useRef(new Map<string,number>()),drafts=useRef(new Map<string,SettingsDraft>());
 const instanceName=useInstanceName(),[detail,setDetail]=useState<SettingsDetail|null>(null),[pending,setPending]=useState<(()=>void)|null>(null),[saving,setSaving]=useState(false),[showCategories,setShowCategories]=useState(false),[categoryEpoch,setCategoryEpoch]=useState(0),[savingDrafts,setSavingDrafts]=useState(false),[discarding,setDiscarding]=useState(false),[discardError,setDiscardError]=useState('');
 const location=tab+':'+(detail?.key??'root'),locationRef=useRef(location),previousLocation=useRef(location);locationRef.current=location;
 const [,refreshDrafts]=useState(0),draftEpoch=useRef(0),openRef=useRef(open);openRef.current=open;
 useEffect(()=>{if(!open)return;return reloadParticipants.register(createSettingsReloadParticipant('system-settings:'+id,()=>{
  const current=[...drafts.current.values()];return {open:openRef.current,location:locationRef.current,epoch:draftEpoch.current,dirty:current.some(entry=>entry.dirty),busy:current.some(entry=>entry.busy),unresolved:current.some(entry=>!!entry.unresolved)};
 }));},[open,id]);
 const savePosition=useCallback(()=>{if(scroll.current&&scroll.current.clientHeight>0){positions.current.set(locationRef.current,scroll.current.scrollTop);const element=document.activeElement?.closest<HTMLElement>('[data-settings-link]');if(element&&scroll.current.contains(element))focusTargets.current.set(locationRef.current,element.dataset.settingsLink!);}},[]);
 const navigate=useCallback((action:()=>void)=>{savePosition();if([...drafts.current.values()].some(value=>value.dirty||value.busy||value.unresolved))setPending(()=>action);else action();},[savePosition]);
 useEffect(()=>{if(pending&&!saving&&!discarding&&!savingDrafts&&![...drafts.current.values()].some(value=>value.dirty||value.busy||value.unresolved)){setPending(null);pending();}},[pending,saving,discarding,savingDrafts]);
 const draft=useCallback((key:string,value:SettingsDraft|null)=>{draftEpoch.current++;if(value)drafts.current.set(key,value);else drafts.current.delete(key);setSaving([...drafts.current.values()].some(item=>item.busy));refreshDrafts(value=>value+1);},[]);
 const context=useMemo(()=>({navigate,detail:setDetail,draft}),[navigate,draft]);
 useLayoutEffect(()=>{if(open&&scroll.current&&scroll.current.clientHeight>0){scroll.current.scrollTop=positions.current.get(location)??0;if(previousLocation.current.startsWith(tab+':')&&previousLocation.current!==location){if(!detail){const key=focusTargets.current.get(location);[...scroll.current.querySelectorAll<HTMLElement>('[data-settings-link]')].find(element=>element.dataset.settingsLink===key)?.focus({preventScroll:true});}else if(!scroll.current.contains(document.activeElement))document.getElementById(id+'-settings-page')?.querySelector<HTMLButtonElement>('[aria-label="返回上一页"]')?.focus({preventScroll:true});}}previousLocation.current=location;},[open,location,showCategories,tab]);
 useEffect(()=>{if(!open){setDetail(null);setPending(null);setShowCategories(false);drafts.current.clear();}},[open]);
 function choose(next:SettingsTab){if(next===tab&&!detail&&!showCategories)return;navigate(()=>{if(next===tab&&detail)setCategoryEpoch(value=>value+1);setShowCategories(false);select(next);});}
 async function discardChanges(){
  if(discarding||saving||savingDrafts)return;const action=pending;setDiscarding(true);setDiscardError('');
  try{for(const entry of [...drafts.current.values()])if(entry.dirty&&await entry.discard?.()===false){setDiscardError('尚未读回已保存值或仍有未决提交；当前页面已保留。');return;}await afterOverlayCommit();if([...drafts.current.values()].some(entry=>entry.dirty||entry.busy)){setDiscardError('仍有未放弃的修改或未决操作，当前页面已保留。');return;}setPending(null);action?.();}
  catch(error){setDiscardError(error instanceof Error?error.message:String(error));}
  finally{setDiscarding(false);}
 }
 const close=()=>navigate(()=>onOpenChange(false));
 const unresolved=[...drafts.current.values()].some(entry=>entry.unresolved);
 const canSave=[...drafts.current.values()].filter(entry=>entry.dirty).every(entry=>!!entry.save);
 async function saveChanges(){
  if(saving||discarding||savingDrafts)return;const action=pending;setSavingDrafts(true);setDiscardError('');
  try{for(const entry of [...drafts.current.values()])if(entry.dirty&&(!entry.save||!await entry.save())){setDiscardError('部分修改尚未保存，请核对当前页面及原提交结果。');return;}await afterOverlayCommit();if([...drafts.current.values()].some(entry=>entry.dirty||entry.busy)){setDiscardError('仍有新修改或未决操作，当前页面已保留。');return;}setPending(null);action?.();}
  catch(error){setDiscardError(error instanceof Error?error.message:String(error));}finally{setSavingDrafts(false);}
 }
 return <LegacyUIBoundary><SettingsContext.Provider value={context}><Dialog open={open} onOpenChange={value=>{if(value)onOpenChange(true);else close();}} title="系统设置" description="管理 KSF 协作设定、实例偏好与后台配置。" showHeader={false} trigger={anchor.current} initialFocus={()=>{const page=document.getElementById(id+'-settings-page'),current=page?.querySelector<HTMLElement>('[aria-current="page"]');return current?.getClientRects().length?current:page?.querySelector<HTMLElement>('[aria-label="返回设置分类"]')??null;}} className={`system-settings settings-window host-surface ${theme}`}>
  <UIProvider role="content" style={{height:'100%'}}><SettingsPage id={id+'-settings-page'} title="系统设置" description={detail?categories.find(item=>item.id===tab)?.name:instanceName} sections={categories.map(item=>({id:item.id,label:item.name,icon:<item.icon size={16}/>}))} sectionId={tab} onSectionChange={id=>{if(categories.some(item=>item.id===id))choose(id as SettingsTab);}} detailTitle={detail?.title} onBackIntent={detail?()=>navigate(detail.back):undefined} navigationVisible={showCategories} onNavigationVisibleChange={visible=>navigate(()=>setShowCategories(visible))} contentRef={scroll} onContentScroll={()=>savePosition()} navigationFooter={<Button variant="ghost" disabled={!onDocumentation} onActivate={()=>navigate(()=>onDocumentation?.())} icon={<BookMarked size={14}/>}>KSF手册</Button>} toolbar={<Button variant="ghost" aria-label="关闭系统设置" icon={<X size={18}/>} onActivate={close}/>}>{open&&<div key={tab+':'+categoryEpoch} className="settings-page-content">{tab==='quickstart'?<QuickstartContent select={choose} onDocumentation={onDocumentation}/>:tab==='personal'?<PersonalSettings/>:tab==='instance'?<><DomainEditor domain="instance"/><SettingsGroup title="程序参数" description="显式检查更新时使用的高级参数。"><details className="settings-technical"><summary>更新检查参数</summary><DomainEditor domain="program" only={['updates']} hideTitle/></details></SettingsGroup><ConfigurationExport/></>:tab==='applications'?<AbilityConfiguration/>:tab==='desktop'?<><DesktopMigration/>{desktop}<p className="settings-save-status" role="status">{saved}</p></>:tab==='appearance'?<><AppearanceMigration/><AppearanceEditor/></>:tab==='ai'?<AISettingsContent onProjects={onProjects?()=>navigate(onProjects):undefined}/>:tab==='communication'?<CommunicationSettingsContent/>:tab==='runtime'?<RuntimeSettingsContent onMonitor={onMonitor?()=>navigate(onMonitor):undefined}/>:tab==='diagnostics'?<><DomainEditor domain="capture"/><DomainEditor domain="program" only={['routing']}/><SettingsGroup title="采集与服务诊断"><div className="settings-diagnostics">{diagnostics}</div></SettingsGroup></>:<AboutContent/>}</div>}</SettingsPage></UIProvider>
 </Dialog><AlertDialog open={!!pending} onOpenChange={value=>{if(!value&&!discarding&&!savingDrafts){setPending(null);setDiscardError('');}}} title="保留当前修改？" description={unresolved?'有提交结果仍待核实。请继续编辑并核对原请求，再处理当前修改。':saving?'正在保存，请等待当前操作结束。':'此页面有尚未保存的修改。放弃后将读取最新已保存设置。'} confirmLabel="保存后继续" cancelLabel="继续编辑" danger={false} busy={savingDrafts||discarding} cancelDisabled={discarding||savingDrafts} confirmDisabled={saving||discarding||unresolved||!canSave} confirmDisabledReason={!canSave?'请先在对应设置页保存该修改':undefined} onConfirmIntent={()=>void saveChanges()}>
  {discardError&&<InlineAlert tone="danger" title="当前页面已保留" description={discardError}/>}<Button variant="danger" disabled={saving||discarding||savingDrafts||unresolved} onActivate={()=>void discardChanges()}>放弃修改</Button>
 </AlertDialog></SettingsContext.Provider></LegacyUIBoundary>;
}
