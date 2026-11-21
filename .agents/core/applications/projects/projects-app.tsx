import {Link} from '@ksf/sdk/link';
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {useApplicationSDK} from '@ksf/sdk/react';
import {View} from '@ksf/sdk/view';
import {AppLayout} from '@ksf/sdk/app-layout';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {Card} from '@ksf/sdk/card';
import {catalogProjects,mergeRecentProjects,projectVisitLabel} from './project-catalog-model.js';
import {Tabs} from '@ksf/sdk/tabs';
import {Button} from '@ksf/sdk/button';
import {SearchField} from '@ksf/sdk/search-field';
import {Select} from '@ksf/sdk/select';
import {TextArea} from '@ksf/sdk/text-area';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import {Dialog} from '@ksf/sdk/dialog';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {EmptyState} from '@ksf/sdk/empty-state';
import {SaveStatus} from '@ksf/sdk/save-status';
import {Form} from '@ksf/sdk/form';
import {WindowToolbar} from '@ksf/sdk/window-toolbar';
import {SaveController,createSessionSaveAdapter} from '@ksf/sdk/controllers';
import {Pin,List,RefreshCw,Archive,MessageSquare,ArrowLeft} from 'lucide-react';
import {createWorkspaceSession} from './workspace-session.js';
import {workspaceProjectKey,workspaceProjects,workspaceTarget,workspaceContext} from './workspace-model.js';
import {createConversationPanel} from './conversation.js';
import {createProjectLifecycle} from './lifecycle.js';
import {createProjectManagement as createLegacyManagement} from './management.js';
import {mergeProjectPlans} from './plan-merge.js';
import {ProjectView} from './project-view';
import {ConversationView} from './conversation-view';
import {WorkspaceFilesDialog} from './workspace-files-view';
import {FilesView} from './files-view';
import {ReferenceLink} from './references-view';
import {Drawer} from '@ksf/sdk/drawer';
import {Block,Fold,Fields,Markdown,Status} from './project-components';

export function ProjectsApp(){
 const sdk:any=useApplicationSDK();
 const [detailNavigationHost,setDetailNavigationHost]=useState<HTMLDivElement|null>(null);
 const [picker,setPicker]=useState<any>(null),pickerResolve=useRef<((value:any)=>void)|null>(null);
 const pickFile=useCallback((options:any)=>new Promise(resolve=>{pickerResolve.current?.(null);pickerResolve.current=resolve;setPicker(options);}),[]);
 const finishPick=(value:any)=>{pickerResolve.current?.(value);pickerResolve.current=null;setPicker(null);};
 useEffect(()=>()=>{pickerResolve.current?.(null);},[]);
 const [projects,setProjects]=useState<any[]>([]),[pins,setPins]=useState<string[]>([]),[pinBusy,setPinBusy]=useState(false),[error,setError]=useState(''),[warning,setWarning]=useState(''),[busy,setBusy]=useState(false),[detail,setDetail]=useState<any>(null),[location,setLocation]=useState<any>(workspaceContext()),[view,setView]=useState('overview'),[recoveryIssue,setRecoveryIssue]=useState(''),[loaded,setLoaded]=useState(false),[recent,setRecent]=useState(false),[closePrompt,setClosePrompt]=useState<((value:boolean)=>void)|null>(null);
 const [detailStale,setDetailStale]=useState(false),[visits,setVisits]=useState<Record<string,string>>({}),[visitIssue,setVisitIssue]=useState<any>(null);
 const visitJobs=useRef(new Set<Promise<void>>());
 const rememberVisit=useCallback((project:any,visitedAt=new Date().toISOString())=>{let job:Promise<void>;job=sdk.call('preferences.visit',{...project,visitedAt}).then((value:any)=>{if(alive.current){setVisits(previous=>mergeRecentProjects(previous,value.recentProjects));setVisitIssue((issue:any)=>issue?.visitedAt===visitedAt?null:issue);}}).catch((error:any)=>{if(alive.current)setVisitIssue({project,visitedAt,message:error.message});}).finally(()=>visitJobs.current.delete(job));visitJobs.current.add(job);return job;},[sdk]);
 const root=useRef<HTMLDivElement>(null),pinRevision=useRef(0),[pinsReady,setPinsReady]=useState(false),[loadingDetail,setLoadingDetail]=useState(false);
 const models=useRef(new Set<any>()),alive=useRef(true),request=useRef(0),listRequest=useRef(0),latest=useRef<any>({}),listRef=useRef<HTMLDivElement>(null),pinRefs=useRef(new Map<string,HTMLButtonElement>());
 const recovery=useMemo(()=>createWorkspaceSession(sdk,{SaveController,createSessionSaveAdapter,onChange:()=>{if(alive.current)setRecoveryIssue(recovery.getIssue());}}),[sdk]);
 const conversation=useMemo(()=>{let value:any;const panel=createConversationPanel(sdk,()=>document.createElement('div'),(p:any)=>{value=p;},{pickFile});return {...panel,model:value.model};},[sdk,pickFile]);
 const register=useCallback((model:any)=>{models.current.add(model);return()=>{models.current.delete(model);};},[]);
 const updateLocation=useCallback((patch:any)=>setLocation((previous:any)=>({...previous,...patch})),[]);
 const prepare=useCallback(async(text:string)=>{const p=workspaceTarget(latest.current.location.selected);if(!p)return false;try{await conversation.select(p);conversation.prefill(text);setView('chats');return true;}catch(e:any){setError(e.message);return false;}},[conversation]);
 async function flushModels(){for(const model of models.current){if(model.flush)await model.flush();}return ![...models.current].some(m=>m.hasDrafts?.()||m.isSaving?.());}
 const lifecycle=useMemo(()=>createProjectLifecycle({sdk,headless:true,hasDrafts:()=>[...models.current].some(m=>m.hasDrafts?.()),discardDrafts:()=>{for(const m of models.current)m.discardDrafts?.();},onPrepare:prepare,onChanged:async(result:any,name:string)=>{const next=result.targets.find((t:any)=>t.name===name);await reload(false);if(next){const token=++request.current;setLocation((v:any)=>({...v,selected:workspaceProjectKey(next),pane:'detail',objectPath:null,objectScroll:0}));setDetail(null);try{const value=await sdk.call('detail',{name:next.name,scope:next.scope});if(alive.current&&token===request.current){setDetail(value);await conversation.select({name:next.name,scope:next.scope});}}catch(e:any){setError(e.message);}}}}),[sdk,prepare]);
 const life:any=useSyncExternalStore(lifecycle.subscribe,lifecycle.getSnapshot);
 const choose=useCallback(async(key:string,restore?:any,recordVisit=true)=>{
  if(latest.current.location.selected===key&&latest.current.detail){if(recordVisit&&latest.current.location.pane==='list')void rememberVisit(workspaceTarget(key));updateLocation({pane:restore?.pane??'detail'});return;}
  if(!lifecycle.dismiss()){setError('归档或恢复回执尚待核对，请先处理原操作。');return;}
  if(!await flushModels()){setError('当前项目仍有草稿或回执待核对，请在原窗口保存或合并后切换。');return;}
  const project=workspaceTarget(key);if(!project)return;
  const token=++request.current;setLoadingDetail(true);setDetailStale(false);setError('');setDetail(null);setLocation((v:any)=>({...v,...(restore??{}),selected:key,pane:restore?.pane??'detail',...(restore?{}:{objectPath:null,objectScroll:0,projectTab:undefined})}));setView(restore?.projectView==='chats'?'chats':'overview');
  try{const result=await sdk.call('detail',project);if(!alive.current||token!==request.current)return;setDetail(result);if(recordVisit)void rememberVisit(project);await conversation.select(project,restore?.aiSessionKey?{restoreKey:restore.aiSessionKey}:undefined);}catch(e:any){if(alive.current&&token===request.current)setError('项目读取失败：'+e.message);}finally{if(alive.current&&token===request.current)setLoadingDetail(false);}
 },[sdk,lifecycle,conversation,rememberVisit]);
 async function reload(refreshDetail=true){
  if(refreshDetail&&latest.current.location?.selected&&(!lifecycle.dismiss()||!await flushModels())){setError('请先核对保存、草稿或未决回执，再刷新项目。');return;}
  const token=++listRequest.current,pinVersion=pinRevision.current;setBusy(true);setError('');
  const results=await Promise.allSettled([sdk.call('list'),sdk.call('preferences.read')]);if(!alive.current||token!==listRequest.current)return;
  if(results[0].status==='fulfilled'){setProjects(results[0].value.projects);setWarning((results[0].value.warnings??[]).join('；'));}else setError('项目目录读取失败：'+results[0].reason.message);
  if(pinVersion===pinRevision.current){if(results[1].status==='fulfilled'){const preferences=results[1].value;setPins(preferences.pinnedProjects??[]);setVisits(previous=>mergeRecentProjects(previous,preferences.recentProjects));setPinsReady(true);}else{setPinsReady(false);setWarning('项目固定设置尚不可读。');}}
  setBusy(false);
  const target=workspaceTarget(latest.current.location?.selected);if(refreshDetail&&target){const current=++request.current;setLoadingDetail(true);try{const value=await sdk.call('detail',target);if(alive.current&&current===request.current){setDetailStale(false);setDetail(value);for(const m of models.current)await m.refresh?.();}}catch(e:any){if(alive.current&&current===request.current){setDetailStale(true);setError('项目原件暂不可读取，暂按只读展示上次内容：'+e.message);}}finally{if(alive.current&&current===request.current)setLoadingDetail(false);}}
 }
 latest.current={location,detail,view,choose};
 useEffect(()=>{alive.current=true;void(async()=>{const saved=await recovery.load();if(!alive.current)return;setLoaded(true);setRecent(!!recovery.getRecent());const search=new URLSearchParams(sdk.getSnapshot().search),name=search.get('project');const key=name?(search.get('scope')==='archived'?'archived:':'current:')+name:saved?.selected;
   if(saved){setLocation(saved);requestAnimationFrame(()=>{if(listRef.current)listRef.current.scrollTop=saved.listScroll;});}
   await reload(false);if(key)await choose(key,saved?.selected===key?saved:undefined,!!name&&saved?.selected!==key);
  })();
  const off=sdk.subscribe(()=>{const search=new URLSearchParams(sdk.getSnapshot().search),name=search.get('project');if(name)void latest.current.choose((search.get('scope')==='archived'?'archived:':'current:')+name);});
  return()=>{alive.current=false;request.current++;listRequest.current++;off();recovery.dispose();lifecycle.dispose();conversation.dispose();};
 },[sdk]);
 useEffect(()=>{conversation.setActive(view==='chats'&&!!detail);},[conversation,view,detail]);
 useEffect(()=>{if(loaded)recovery.update({...location,projectView:view==='chats'?'chats':undefined,...(view==='chats'?{projectView:'chats',...conversation.getLocation()}: {})});},[recovery,loaded,location,view]);
 useEffect(()=>{
  const prepareClose=async(req:any)=>{
   await Promise.allSettled([...visitJobs.current]);await flushModels();if([...models.current].some(m=>m.isSaving?.()))return {status:'failed',message:'项目仍有保存回执待核对，窗口已保留。'};
   if([...models.current].some(m=>m.hasDrafts?.())){
    if(req.reason!=='close')return {status:'failed',message:'仍有未保存草稿，请先保存或合并后更新界面。'};
    const discard=await new Promise<boolean>(resolve=>setClosePrompt(()=>resolve));setClosePrompt(null);if(!discard)return {status:'cancelled'};
    for(const model of models.current)model.discardDrafts?.();if([...models.current].some(m=>m.hasDrafts?.()))return {status:'failed',message:'草稿尚未处理完成，窗口已保留。'};
   }
   if(!lifecycle.dismiss())return {status:'failed',message:'归档或恢复回执待核对，窗口已保留。'};
   if(!await conversation.flush())return {status:'failed',message:'会话草稿或原请求恢复记录尚未确认保存。'};
   recovery.update({...latest.current.location,projectView:latest.current.view==='chats'?'chats':undefined,...(latest.current.view==='chats'?{projectView:'chats',...conversation.getLocation()}: {})});
   if(!await recovery.flush({closed:req.reason==='close'}))return {status:'failed',message:'视图恢复入口未确认保存。'};
   const generation=recovery.getGeneration(),chatGeneration=conversation.getGeneration();return {status:'ready',validate:()=>alive.current&&!req.signal?.aborted&&generation===recovery.getGeneration()&&chatGeneration===conversation.getGeneration()&&![...models.current].some(m=>m.hasDrafts?.()||m.isSaving?.())};
  };
  return sdk.onCloseRequest?sdk.onCloseRequest(prepareClose):sdk.onBeforeClose(async()=>{const r=await prepareClose({reason:'close'});return r.status==='ready'&&r.validate?.();});
 },[sdk,recovery,conversation,lifecycle]);
 async function pin(project:any){if(pinBusy||!pinsReady)return;pinRevision.current++;setPinBusy(true);try{const key=workspaceProjectKey(project),value=await sdk.call('preferences.pin',{name:project.name,scope:project.scope,pinned:!pins.includes(key)});setPins(value.pinnedProjects);requestAnimationFrame(()=>pinRefs.current.get(key)?.focus({preventScroll:true}));}catch(e:any){setError(e.message);}finally{setPinBusy(false);}}
 const target=useMemo(()=>workspaceTarget(location.selected),[location.selected]);
 const entries=workspaceProjects(projects,location).entries,groups=catalogProjects(entries,pins,visits);
 const projectCard=(p:any)=>{const key=workspaceProjectKey(p),at=visits[key];return <Card key={key} hoverable size="small" className="project-catalog-card" onClick={()=>void choose(key)} title={<Button variant="text" className="project-catalog-open" title={p.title||p.name} onClick={event=>{event.stopPropagation();void choose(key);}}>{p.title||p.name}</Button>} extra={<span className="project-catalog-pin-region" onClick={event=>event.stopPropagation()}><Button className="project-catalog-pin" ref={node=>{if(node)pinRefs.current.set(key,node);else pinRefs.current.delete(key);}} variant="text" size="small" icon={<Pin size={16}/>} aria-label={(pins.includes(key)?'取消固定项目：':'固定项目：')+(p.title||p.name)} aria-pressed={pins.includes(key)} disabled={pinBusy||!pinsReady} onClick={event=>{event.stopPropagation();void pin(p);}}/></span>} footer={at?<time dateTime={at} title={new Date(at).toLocaleString('zh-CN')}>{projectVisitLabel(at)}</time>:undefined}><Status value={p.scope==='archived'?'archived':p.status}/><p className="project-catalog-description" title={p.description||undefined}>{p.description||'尚未填写项目说明'}</p></Card>;};
 const showCatalog=async()=>{if(!lifecycle.dismiss()||!await flushModels()){setError('请先核对当前保存、草稿或未决回执，再返回项目列表。');return;}updateLocation({pane:'list'});requestAnimationFrame(()=>root.current?.querySelector<HTMLInputElement>('input[type=search]')?.focus({preventScroll:true}));};
 const catalog=<View className="project-catalog"><div className="project-catalog-header"><div><h1>全部项目</h1><p className="project-muted">{entries.length} 个项目</p></div><div className="project-catalog-controls"><div className="project-catalog-scope"><Select label="项目范围" value={location.scope} onValueChange={scope=>updateLocation({scope})} options={[{value:'all',label:'全部'},{value:'current',label:'当前'},{value:'archived',label:'已归档'}]}/></div><div className="project-catalog-search"><SearchField label="搜索项目" value={location.query} onValueChange={query=>updateLocation({query})}/></div>{recent&&<Button onClick={()=>{const saved=recovery.takeRecent();setRecent(false);if(saved){setLocation(saved);if(saved.selected)void choose(saved.selected,saved,false);}}}>恢复上次关闭的视图</Button>}</div></div><AppLayout className="project-catalog-body">
  <ScrollArea label="项目目录" style={{height:'100%'}} ref={listRef} onScroll={event=>updateLocation({listScroll:event.currentTarget.scrollTop})}><section role="region" aria-label="项目列表">{groups.pinned.length>0&&<section className="project-catalog-group" aria-label="已固定项目"><header><h2>已固定项目</h2><span className="project-muted">{groups.pinned.length} 个</span></header><div className="project-catalog-grid">{groups.pinned.map(projectCard)}</div></section>}{groups.others.length>0&&<section className="project-catalog-group" aria-label="项目列表分组"><header><h2>项目列表</h2><span className="project-muted">{groups.others.length} 个 · 最近访问优先</span></header><div className="project-catalog-grid">{groups.others.map(projectCard)}</div></section>}{!entries.length&&<EmptyState heading={busy?'正在读取项目':'暂无匹配项目'}/>}</section></ScrollArea>
 </AppLayout></View>;
 const content=detail&&target?<div className="project-content"><div hidden={view==='chats'} className="project-business">{detail.governance?<ProjectView key={location.selected} sdk={sdk} project={target} detail={detail} prepare={prepare} register={register} stale={detailStale} navigationHost={detailNavigationHost} onProject={(path:string)=>void choose((path.startsWith('档案/项目/')?'archived:':'current:')+path.split('/').at(-2))} location={location} onLocation={updateLocation}/>:<LegacyView key={location.selected} sdk={sdk} project={target} detail={detail} prepare={prepare} register={register} stale={detailStale}/>}</div><div hidden={view!=='chats'} className="project-chat-pane"><ConversationView model={conversation.model} readOnly={target.scope==='archived'||detail.status==='cancelled'||detail.governance?.project.metadata.status==='cancelled'}/></div></div>:<EmptyState heading={loadingDetail?'正在读取项目':'选择一个项目'} description={error||'查看方案、当前推进和资料与成果。'}/>;
 return <View ref={root} className="ksf-projects project-application"><WindowToolbar label="项目窗口操作" object={location.pane==='detail'&&detail?{title:detail.title??detail.name??target?.name??'项目'}:undefined} navigation={<><div ref={setDetailNavigationHost} className="project-title-navigation-slot" hidden={location.pane!=='detail'||view==='chats'||!detail?.governance||detail.governance.valid===false}/>{location.pane==='detail'&&(view==='chats'||!detail?.governance||detail.governance.valid===false)&&<span className="project-title-fallback" title={detail?.title??target?.name}>{detail?.title??target?.name}{view==='chats'?' · 项目对话':''}</span>}</>} actions={[{id:'catalog',label:'全部项目',icon:List,priority:10,disabled:location.pane==='list',onAction:()=>void showCatalog()},{id:'refresh',label:'刷新',icon:RefreshCw,priority:5,busy,onAction:()=>void reload(location.pane==='detail')},...(target&&location.pane==='detail'?[{id:'chat',label:view==='chats'?'返回项目内容':'项目对话',icon:MessageSquare,pressed:view==='chats',onAction:()=>setView(view==='chats'?'overview':'chats')},{id:'lifecycle',label:target.scope==='archived'?'恢复项目':'归档项目',icon:Archive,onAction:()=>lifecycle.open(target,projects,null)}]:[])]}/>
  {visitIssue&&<InlineAlert tone="warning" heading="最近访问时间尚未确认保存" actions={<Button onClick={()=>void rememberVisit(visitIssue.project,visitIssue.visitedAt)}>重试记录访问</Button>}>{visitIssue.message}</InlineAlert>}
  {(error||warning||recoveryIssue)&&<InlineAlert tone={error?'error':'warning'} heading={error?'项目需要处理':'项目提示'} actions={<Button onClick={()=>void reload()}>重新核对</Button>}>{error||warning||recoveryIssue}</InlineAlert>}
  <div className="project-page" hidden={location.pane!=='list'}>{catalog}</div>
  <div className="project-page" hidden={location.pane!=='detail'}>{content}</div>
  <LifecycleView model={lifecycle} state={life}/>
  {picker&&<WorkspaceFilesDialog sdk={sdk} options={picker} onClose={finishPick}/>}
  <Dialog open={!!closePrompt} title="保留或放弃未保存草稿" onClose={()=>{closePrompt?.(false);setClosePrompt(null);}} footer={<><Button onClick={()=>{closePrompt?.(false);setClosePrompt(null);}}>保留窗口和草稿</Button><Button tone="danger" onClick={()=>{closePrompt?.(true);setClosePrompt(null);}}>放弃可放弃的草稿并关闭</Button></>}>保存未通过的内容已保留在当前窗口。回执未知或正在保存的操作须先对账。</Dialog>
 </View>;
}

function LifecycleView({model,state}:{model:any;state:any}){return <Dialog open={state.open} title={state.operation==='archive'?'归档项目':'恢复项目'} onClose={()=>model.close()} footer={<><Button disabled={state.busy||!!state.pending} onClick={()=>model.close()}>返回项目</Button><Button loading={state.busy} disabled={!!state.pending} onClick={()=>void model.inspect()}>预览影响</Button>{(state.preview?.allowed||state.pending)&&<Button tone={state.operation==='archive'?'danger':'primary'} loading={state.busy} onClick={()=>void model.commit()}>{state.pending?'核对原操作':state.operation==='archive'?'确认归档':'确认恢复'}</Button>}</>}>
 <p>保持原业务状态与历史记录。先预览本次范围和影响，再确认操作。</p><TextField label="原因" value={state.reason} disabled={state.busy||!!state.pending} onValueChange={v=>model.setReason(v)}/><TextField label="操作者" value={state.actor} disabled={state.busy||!!state.pending} onValueChange={v=>model.setActor(v)}/>{state.projects.filter((p:any)=>p.scope===state.selected?.scope).map((p:any)=><Checkbox key={p.name} label={p.title||p.name} checked={state.chosen.has(p.name)} disabled={state.busy||!!state.pending||p.name===state.selected?.name} onCheckedChange={()=>model.toggle(p.name)}/>)}{state.error&&<InlineAlert tone="error">{state.error}</InlineAlert>}{state.preview&&<Block title={state.preview.allowed?'请核对范围':'需要先处理'}>{[...(state.preview.blockers??[]),...(state.preview.warnings??[])].map((x:any,i:number)=><p key={i}>{x.message}</p>)}{state.preview.targets?.map((t:any)=><p key={t.name}>{t.name} → {t.to}</p>)}</Block>}
 </Dialog>;}

function LegacyView({sdk,project,detail,prepare,register,stale=false}:{sdk:any;project:any;detail:any;prepare:(text:string)=>Promise<boolean>;register:(m:any)=>()=>void;stale?:boolean}){
 const [edit,setEdit]=useState(false),[tab,setTab]=useState('plan'),[filesOpen,setFilesOpen]=useState(false),[fileReference,setFileReference]=useState<any>(null),[followUp,setFollowUp]=useState<any>(null),[feedback,setFeedback]=useState(''),[preparing,setPreparing]=useState(false);
 const fileGuard=useRef<any>(null),registerFiles=useCallback((guard:any)=>{fileGuard.current=guard;const off=register(guard);return()=>{if(fileGuard.current===guard)fileGuard.current=null;off();};},[register]);
 const model=useMemo(()=>createLegacyManagement({sdk,headless:true,onPrepare:prepare,docLink:()=>document.createElement('a')}),[sdk]);
 const state:any=useSyncExternalStore(model.subscribe,model.getSnapshot);
 useEffect(()=>{void model.select(project);const off=register({hasDrafts:model.hasDrafts,discardDrafts:model.discardDrafts,flush:async()=>{if(model.getSnapshot().dirty)await model.save();return !model.hasDrafts();},isSaving:()=>model.getSnapshot().busy,refresh:model.reload});return()=>{off();model.dispose();};},[model,register]);
 if(!state.record)return <InlineAlert heading={state.error?'旧格式项目需要核对':'正在读取旧格式项目'} actions={state.error?<Button onClick={()=>void model.reload()}>重试读取</Button>:undefined}>{state.error}</InlineAlert>;
 const fileProject={path:detail.path,metadata:{...detail.metadata,kind:'project',name:detail.title??detail.name}},fileRecord={legacy:true,project:fileProject,documents:[],readOnly:state.readOnly||stale,valid:true};
 const merge=state.dialog?.kind==='compare'?mergeProjectPlans(state.record.plan,state.plan,state.dialog.latest.plan,state.dialog.choices):null;
 return <ScrollArea className="project-page-reader" label="旧格式项目"><header className="project-heading"><h2>{detail.name??project.name}</h2><SaveStatus status={state.error?'error':state.busy?'saving':state.dirty?'editing':'saved'} message={state.notice}/></header><p className="project-muted">沿旧格式和保存机制接续；读取不会迁移项目。</p>{state.error&&<InlineAlert tone="error" actions={<Button onClick={()=>void model.compare()}>核对并合并</Button>}>{state.error}</InlineAlert>}<Button disabled={state.readOnly||stale} onClick={()=>setEdit(v=>!v)}>{edit?'返回阅读':'编辑项目安排'}</Button><Button onClick={()=>{setFileReference({path:detail.path});setFilesOpen(true);}}>查看原文与文件</Button>{edit?<Form onCommit={()=>model.save()}><Fields value={state.plan} disabled={state.readOnly||stale} onChange={next=>model.edit((plan:any)=>Object.assign(plan,next))}/><Button type="submit" loading={state.busy}>保存项目安排</Button></Form>:<Tabs label="旧项目内容" value={tab} onValueChange={setTab} items={[{id:'plan',label:'方案',content:<><Markdown text={state.plan.purpose||detail.description}/><Fields value={{scope:state.plan.scope,goals:state.plan.goals,risks:state.plan.risks,decisions:state.plan.decisions}} disabled onChange={()=>{}}/></>},{id:'progress',label:'推进',content:<><Markdown text={state.plan.summary}/>{state.plan.items.map((item:any)=><Block key={item.id} title={item.title}><Status value={item.state}/><p>{item.nextAction||item.description}</p><Fold title="完成条件与原记录"><Fields value={item} disabled onChange={()=>{}}/></Fold>{!state.readOnly&&!stale&&detail.status!=='cancelled'&&!['completed','cancelled'].includes(item.state)&&<Button onClick={()=>prepare('请接续旧格式项目「'+project.name+'」事项 '+item.id+'：'+item.title+'。先读取 '+state.record.path+'，核对现有计划、授权、依赖和容量。同一结果继续原事项；扩大为多个独立结果先重新安排，按需交付并保护固定依据。下一步：'+item.nextAction)}>准备接续对话</Button>}{!state.readOnly&&!stale&&detail.status!=='cancelled'&&item.state==='completed'&&<Button onClick={()=>{setFollowUp(item);setFeedback('');}}>准备后续工作对话</Button>}</Block>)}{!!detail.tasks?.length&&<Fold title="旧检查点与原记录">{detail.tasks.map((task:any)=><Block key={task.path} title={task.name}><Status value={task.state}/>{task.next?.map((s:any,i:number)=><Markdown key={i} text={s.body} path={task.path}/>)}<Button onClick={()=>{setFileReference({path:task.path});setFilesOpen(true);}}>查看检查点原文</Button>{!state.readOnly&&!stale&&detail.status!=='cancelled'&&task.state==='completed'&&<Button onClick={()=>{setFollowUp({id:task.taskId??task.path,title:task.name,acceptance:[],links:[task.path],source:{path:task.path}});setFeedback('');}}>准备后续工作对话</Button>}</Block>)}</Fold>}</>},{id:'materials',label:'资料与成果',content:<><p>沿原资料与结果入口阅读，不推断正式版本或验收结论。</p><Fold title="原始说明"><Markdown text={detail.body??''}/></Fold>{state.plan.items.flatMap((item:any)=>(item.links??[]).map((path:string)=><p key={item.id+path}><ReferenceLink reference={/^https?:\/\//.test(path)?{url:path}:{path}} onOpen={r=>{setFileReference(r);setFilesOpen(true);}} label={path}/></p>))}</>} ]}/>}
 {merge&&<Dialog open title="核对并合并旧格式项目" onClose={()=>model.dismissDialog()} footer={<Button disabled={!!merge.conflicts.length} onClick={()=>model.applyMerge()}>应用合并草稿</Button>}>{merge.conflicts.map((c:any)=><Block key={c.key} title={c.path.join('.')}><TextArea label="我的修改" value={JSON.stringify(c.mine)??''} readOnly/><TextArea label="最新修改" value={JSON.stringify(c.theirs)??''} readOnly/><Button onClick={()=>model.resolve(c.key,'mine')}>保留我的修改</Button><Button onClick={()=>model.resolve(c.key,'theirs')}>采用最新修改</Button></Block>)}</Dialog>}
 <Drawer open={filesOpen} title="项目资料与原件" size="90%" onClose={async()=>{if(fileGuard.current&&(!await fileGuard.current.flush()||fileGuard.current.hasDrafts()))return false;setFilesOpen(false);}} keepMounted><FilesView sdk={sdk} project={project} record={fileRecord} subject={fileProject} reference={fileReference} register={registerFiles}/></Drawer>
 <Dialog open={!!followUp} title="准备后续工作对话" onClose={()=>{if(preparing)return false;setFollowUp(null);}} footer={<><Button disabled={preparing} onClick={()=>setFollowUp(null)}>取消</Button><Button disabled={!feedback.trim()||preparing} loading={preparing} onClick={async()=>{setPreparing(true);try{const ok=await prepare(['请讨论项目「'+project.name+'」已完成事项的后续工作。','原事项身份：'+followUp.id+'；'+followUp.title,'原计划：'+state.record.path,'原条件与结果引用：'+JSON.stringify({acceptance:followUp.acceptance,links:followUp.links,source:followUp.source}),'用户反馈或新要求：'+feedback.trim(),'先读取正式项目管理及管执行、拆计划能力原件，再核对原结果和授权。同一结果的连续修订复用原稳定任务；已完成事项不自动重开。扩大为独立结果先安排，按需交付并保护固定版本。这里只准备讨论草稿，不发送、不创建或重开任务。'].join('\n\n'));if(ok)setFollowUp(null);}finally{setPreparing(false);}}}>填入项目对话草稿</Button></>}><TextArea label="反馈或新要求" value={feedback} onValueChange={setFeedback}/></Dialog>
 </ScrollArea>;
}
