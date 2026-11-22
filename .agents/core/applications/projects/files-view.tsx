import {Link} from '@ksf/sdk/link';
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode,type RefObject} from 'react';
import {PanelLeftClose,PanelLeftOpen,FileText,Folder,ArrowLeft,Lightbulb,MoreHorizontal} from 'lucide-react';
import {Button} from '@ksf/sdk/button';
import {SplitView} from '@ksf/sdk/split-view';
import {TreeView,type TreeNode} from '@ksf/sdk/tree-view';
import {SearchField} from '@ksf/sdk/search-field';
import {TextField} from '@ksf/sdk/text-field';
import {TextArea} from '@ksf/sdk/text-area';
import {Tabs} from '@ksf/sdk/tabs';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {Dialog} from '@ksf/sdk/dialog';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {ContextMenu} from '@ksf/sdk/context-menu';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {SaveStatus} from '@ksf/sdk/save-status';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {Accordion} from '@ksf/sdk/accordion';
import {Badge} from '@ksf/sdk/badge';
import {createContextDrafts,createContextFileWorkspace} from './context-files.js';
import {fileReadOnlyNotice} from './file-readonly.js';
import {contextFileNodes,contextFileReview,contextScopes,contextPanels,contextScopeForPath,isManagedSource} from './context-scopes.js';
import {DocumentSurface} from './context-file-editor';
import {Fold,Markdown} from './project-components';
import type {Reference} from './references-view';
import {WorkspaceFilesDialog} from './workspace-files-view';

export function FilesView({sdk,project,record,subject,changesReader,reference,register,primary,beforeOpen,initialScroll=0,onView,onInspiration,onReference}:{sdk:any;project:any;record:any;subject:any;changesReader?:any;reference?:Reference|null;register:(model:any)=>()=>void;initialScroll?:number;onView?:(view:any)=>void;beforeOpen?:()=>Promise<boolean>;onInspiration?:(owner:any)=>Promise<void>;onReference?:(reference:Reference)=>void;primary?:{label:string;title?:string;path?:string;parentPath?:string;status?:ReactNode;actions?:ReactNode;extra?:ReactNode;header?:ReactNode;items?:{id:string;label:string;icon?:ReactNode}[];selectedId?:string;onSelect?:(id:string)=>Promise<any>;onReturn?:()=>void;content:ReactNode;readerRef:RefObject<HTMLDivElement|null>;onScroll:(event:any)=>void}}){
 const readerPanelId=useId(),container=useRef<HTMLDivElement>(null),[showPrimary,setShowPrimary]=useState(!!primary),[collapsed,setCollapsed]=useState<string[]>([]);
 useLayoutEffect(()=>{if(!container.current)return;let narrow:boolean|undefined;const observer=new ResizeObserver(()=>{const next=(container.current?.clientWidth??1000)<660;if(next!==narrow){narrow=next;setCollapsed(next?['files']:[]);}});observer.observe(container.current);return()=>observer.disconnect();},[]);
 const latest=useRef(record);latest.current=record;const latestPrimary=useRef(primary);latestPrimary.current=primary;const latestBeforeOpen=useRef(beforeOpen);latestBeforeOpen.current=beforeOpen;const latestOnView=useRef(onView);latestOnView.current=onView;const fileReader=useRef<HTMLDivElement>(null),filePositions=useRef(new Map<string,number>()),restoreFile=useRef(initialScroll);
 const [query,setQuery]=useState(''),[expanded,setExpanded]=useState<string[]>([]),[operation,setOperation]=useState<any>(null),[name,setName]=useState(''),[issue,setIssue]=useState(''),[pending,setPending]=useState(false),[fixed,setFixed]=useState<any>(null),[fixedLoading,setFixedLoading]=useState(false),[merge,setMerge]=useState('');
 const [formatHost,setFormatHost]=useState<HTMLDivElement|null>(null);
 const [selection,setSelection]=useState(subject.path.slice(0,subject.path.lastIndexOf('/'))),[scopePath,setScopePath]=useState(subject.path),[openScopes,setOpenScopes]=useState<string[]>([subject.path]);
 const [fileOperations,setFileOperations]=useState<any>(null),operationBlocked=useRef(false),guardOperations=useCallback((blocked:boolean)=>{operationBlocked.current=blocked;},[]);
 const request=useRef(0),[onlyReference,setOnlyReference]=useState(false),[referenceRetry,setReferenceRetry]=useState(0),drafts=useMemo(()=>createContextDrafts(sdk),[sdk]);
 const objectModels=useRef(new Map<string,any>());
 useEffect(()=>()=>{for(const value of objectModels.current.values())value.dispose();objectModels.current.clear();},[]);
 const currentObject=useRef(subject.path);
 useLayoutEffect(()=>{
  if(currentObject.current===subject.path)return;
  currentObject.current=subject.path;request.current++;restoreFile.current=initialScroll;
  setShowPrimary(!!primary);setSelection(subject.path.slice(0,subject.path.lastIndexOf('/')));setScopePath(subject.path);setOpenScopes([subject.path]);
  setQuery('');setIssue('');setFixed(null);setFixedLoading(false);setOnlyReference(false);setOperation(null);setFileOperations(null);setMerge('');
 },[subject.path]);
 const model=useMemo(()=>{
  const key=subject.metadata.id+'|'+subject.path+'|'+subject.metadata.name;
  const retained=objectModels.current.get(key);
  if(retained){objectModels.current.delete(key);objectModels.current.set(key,retained);return retained;}
  const element=()=>document.createElement('div');
  const list=element(),content=element(),actions=element(),status=element(),reader=element();reader.id='project-files-'+sdk.getSnapshot().id;
  const docLink=(text:string,path:string)=>{const link=document.createElement('a');link.textContent=text;link.href='/?'+new URLSearchParams({app:'markdown',path,mode:'read'});link.target='_blank';link.rel='noopener noreferrer';return link;};
  const result:any=createContextFileWorkspace({sdk,project,changesReader,rootPath:subject.path,objectPath:subject.path,contextRoots:contextScopes(record,subject),list,content,actions,status,reader,icon:()=>element(),iconButton:(label:string,_symbol:string,fn:()=>void)=>{const b=document.createElement('button');b.title=label;b.addEventListener('click',fn);return b;},docLink,drafts,reviewSession:'projects-012-'+sdk.getSnapshot().id,contextMenu:()=>({onContextMenu(){}}),onOpen:(entry:any)=>{setShowPrimary(false);setOnlyReference(false);setFixed(null);setSelection(entry.path);void result.open(entry);latestOnView.current?.({path:entry.path,kind:entry.kind,scroll:0});},onFallback(){},onUnread(){},displayName:(e:any)=>e.name,showInFileNavigation:()=>true,focusState:{openFolders:new Set()},projectWritable:()=>project.scope!=='archived'&&!latest.current.readOnly&&latest.current.valid!==false,readOnlyNotice:(entry:any,file:any)=>fileReadOnlyNotice(latest.current,entry,file,project.scope),headless:true});
  objectModels.current.set(key,result);
  while(objectModels.current.size>6){const first=objectModels.current.keys().next().value!;objectModels.current.get(first).dispose();objectModels.current.delete(first);}
  return result;
 },[sdk,project.scope,project.name,subject.path,subject.metadata.id,subject.metadata.name,drafts,changesReader]);
 const state:any=useSyncExternalStore(model.subscribe,model.getSnapshot);
 useEffect(()=>{setExpanded(model.getSnapshot().scopes.filter((s:any)=>s.objectPath===subject.path).map((s:any)=>s.root));model.start();const off=register({revealPrimary:()=>{setShowPrimary(true);latestPrimary.current?.onReturn?.();latestOnView.current?.(null);},flush:async()=>{await model.flush();await drafts.settle();return !drafts.hasDrafts()&&!model.getSnapshot().active?.composing&&!operationBlocked.current;},hasDrafts:()=>!!model.getSnapshot().active?.composing||drafts.hasDrafts()||drafts.saving()||model.mutating()||operationBlocked.current,closeReviews:()=>sdk.call('context-files',{action:'endReview',reviewSession:'projects-012-'+sdk.getSnapshot().id})});return()=>{off();model.pause();};},[model,register,drafts]);
 useLayoutEffect(()=>{
  if(!reference?.path)return;
  setShowPrimary(false);
  const token=++request.current;setSelection(reference.path);setScopePath(contextScopeForPath(contextScopes(record,subject),reference.path)?.objectPath??subject.path);latestOnView.current?.({path:reference.path,kind:reference.kind??'file',...(reference.digest?{digest:reference.digest}:{}),scroll:restoreFile.current??0});setIssue('');setOnlyReference(!!reference.digest||isManagedSource(record,reference.path)||!reference.path.startsWith(record.project.path.slice(0,record.project.path.lastIndexOf('/'))+'/'));
  const root=record.project.path.slice(0,record.project.path.lastIndexOf('/'));
  if(reference.kind==='directory'&&!reference.digest){model.reset();setOnlyReference(false);setFixed(null);setFixedLoading(false);model.select(reference.path);setExpanded(ids=>[...new Set([...ids,reference.path!])]);}
  else if(reference.digest||isManagedSource(record,reference.path)||!reference.path.startsWith(root+'/')){model.reset();setFixed(null);setFixedLoading(true);void sdk.call('file',{...project,...reference}).then((file:any)=>{if(token===request.current)setFixed({file,reference});}).catch((e:any)=>{if(token===request.current)setIssue((reference.digest?'固定证据':'原件')+'无法读取：'+e.message);}).finally(()=>{if(token===request.current)setFixedLoading(false);});}
  else{setFixed(null);setFixedLoading(false);const path=reference.path,ext=path.split('.').at(-1)?.toLowerCase();void model.open({...reference,name:reference.name??path.split('/').at(-1),kind:'file',format:ext==='md'?'markdown':['png','jpg','jpeg','webp','gif'].includes(ext??'')?'image':['pdf','zip','ksfapp'].includes(ext??'')?'external':'text'});}
  return()=>{request.current++;};
 },[reference,model,sdk,project,referenceRetry]);
 const file=state.active;
 useLayoutEffect(()=>{if(showPrimary||!fileReader.current)return;const key=(fixed?.reference.digest??(onlyReference?reference?.digest:undefined)??'')+'|'+selection;const id=requestAnimationFrame(()=>{if(fileReader.current)fileReader.current.scrollTop=filePositions.current.get(key)??restoreFile.current??0;restoreFile.current=0;});return()=>cancelAnimationFrame(id);},[showPrimary,selection,file?.entry.path,fixed]);
 useEffect(()=>{if(file?.disk)setMerge(file.mergeText??file.text);},[file?.disk]);
 const root=record.project.path.slice(0,record.project.path.lastIndexOf('/'));
 const entries=new Map<string,any>(state.entries.map((e:any)=>[e.path,e]));
 const managed=new Set(state.scopes.flatMap((s:any)=>{const doc=record.documents.find((d:any)=>d.path===s.objectPath)??record.project;return [doc.path,doc.metadata.review_ref?.path,...(record.legacy?[]:[s.root+'/灵感闪现.md'])];}));
 const levels=contextPanels(record,subject),activeLevel=levels.find((s:any)=>s.objectPath===scopePath)??levels[0];
 const nodes=contextFileNodes(state.entries,managed,state.scopes),review=contextFileReview(state.entries,state.scopes,managed);
 const fileLabel=(node:TreeNode)=>{
  const entry=entries.get(node.id),notice=review.notices.get(node.id),count=review.counts.get(node.id)??0;
  const description=entry?.kind==='directory'?(count?count+' 个未审阅文件':''):notice==='modified'?'已修改，待审阅':notice==='deleted'?'已删除，待确认':notice==='new'?'新文件，待审阅':'';
  return <span className="project-context-file-label" title={node.label+(description?' · '+description:'')}><span className="project-context-file-name">{node.label}</span>
   {entry?.kind==='directory'?(count>0&&!expanded.includes(node.id)&&!query.trim()&&<Badge count={count} tone="info" label={description}/>):notice==='new'?<Badge dot tone="info" label={description}/>:notice&&<Badge count={notice==='modified'?'M':'D'} tone={notice==='modified'?'warning':'danger'} label={description}/>}
  </span>;
 };
 const open=async(path:string)=>{
  const e=entries.get(path),isFolder=state.scopes.some((s:any)=>s.root===path)||e?.kind==='directory';
  if(!await readyToLeave())return;
  const ownerPath=contextScopeForPath(state.scopes,path)?.objectPath??subject.path;
  setShowPrimary(false);setSelection(path);setScopePath(ownerPath);setOpenScopes(ids=>ids.includes(ownerPath)?ids:[...ids,ownerPath]);setOnlyReference(false);setFixed(null);setIssue('');request.current++;
  if(e?.kind==='file'){model.select(path);await model.open(e);}
  else if(isFolder){model.reset();model.select(path);setExpanded(ids=>[...new Set([...ids,path])]);}
  latestOnView.current?.({path,kind:isFolder?'directory':'file',scroll:0});if((container.current?.clientWidth??1000)<660)setCollapsed(['files']);
 };
 async function readyToLeave(){await model.flush();await drafts.settle();if(drafts.hasDrafts()||model.getSnapshot().active?.composing||operationBlocked.current){setIssue('请先结束输入法组字并核对文件保存、草稿或未决操作。');return false;}return latestBeforeOpen.current?await latestBeforeOpen.current():true;}

 const selected=selection||state.entry?.path||state.selected;
 const scopeMenu=(level:any)=>{
  const menuSelection=contextScopeForPath(state.scopes,selected)?.objectPath===level.objectPath?selected:level.root;
  const folder=state.scopes.some((s:any)=>s.root===menuSelection)||entries.get(menuSelection)?.kind==='directory'?menuSelection:menuSelection?.slice(0,menuSelection.lastIndexOf('/'))??level.root;
  return [{id:'scope-source',label:'查看'+level.kind+'说明原件',onAction:async()=>{if(!await readyToLeave())return;if(onReference)onReference({path:level.objectPath});else await sdk.openApp('markdown',new URLSearchParams({path:level.objectPath,mode:'read'}).toString());}},{id:'scope-folder',label:'打开'+level.kind+'本层文件夹',onAction:()=>void open(level.root)},{id:'attachments',label:'附件与文件操作…',onAction:()=>setFileOperations({scope:'workspace',initialPath:folder,rootPath:contextScopeForPath(state.scopes,folder)?.root??level.root})},{id:'new-file',label:'新建文件',disabled:!state.canCreate,onAction:()=>{setName('');setOperation({kind:'file',folder});}},{id:'new-folder',label:'新建文件夹',disabled:!state.canCreate,onAction:()=>{setName('');setOperation({kind:'directory',folder});}},{id:'rename',label:'重命名或移动',disabled:!state.canCreate||!entries.get(menuSelection)?.canMove,onAction:()=>{setName(menuSelection);setOperation({kind:'move',path:menuSelection});}},{id:'copy-path',label:'复制路径',onAction:()=>void navigator.clipboard.writeText(menuSelection).catch(e=>setIssue(e.message))}];
 };
 const menu=scopeMenu(activeLevel);
 async function commit(){
  setPending(true);setIssue('');try{
   if(drafts.hasDrafts()){await model.flush();await drafts.settle();if(drafts.hasDrafts())throw Error('请先保存或合并当前草稿。');}
   if(operation.kind==='move'){const result=await model.moveVersion(operation.path);const moved=await model.mutate('move',{path:operation.path,destination:name.trim(),version:result.version});setSelection(moved.path);}
   else{if(!name.trim()||/[\\/\x00-\x1f]/.test(name)||['.','..'].includes(name.trim()))throw Error('请输入有效名称。');const created=await model.mutate('create',{path:operation.folder+'/'+name.trim(),kind:operation.kind});setSelection(created.path);}
   setOperation(null);
  }catch(e:any){setIssue(e.message);}finally{setPending(false);}
 }
 const fileStatus=file&&!fixed&&!fixedLoading?<SaveStatus status={file.disk||file.saveError||file.error?'error':file.saving?'saving':file.text!==file.base.text?'editing':'saved'} message={file.saveError||file.error||file.recoveryError||file.message||(!file.base.writable?'只读':undefined)} onRetry={()=>void model.flush()}/>:null;
 const fileViewControls=file&&!fixed&&!fixedLoading&&file.base.writable&&!file.disk?<ToggleGroup label="文档视图" size="small" value={file.mode} disabled={!!file.composing||!!file.uploading} onValueChange={value=>model.mode(value)} options={(file.entry.format==='markdown'&&file.text.length<=1024*1024?['live','source','split','preview']:['source','preview']).map(value=>({value,label:({live:'编辑',source:'源码',split:'分栏',preview:'阅读'} as any)[value]}))}/>:null;
 const reviewBlocked=!!file&&(!!file.disk||file.saving||file.reviewing||file.composing||file.uploading||file.deleted);
 const fileReviewControl=file&&!fixed&&!fixedLoading&&file.original!==undefined&&file.original!==file.text?<><span className="project-muted">有未审阅修改</span>{file.mode==='preview'&&<Button size="small" variant="text" disabled={reviewBlocked} onClick={()=>model.mode('source')}>查看差异</Button>}<Button size="small" variant="text" disabled={reviewBlocked} onClick={()=>void model.markReviewed()}>{file.reviewing?'正在确认…':'标记已审阅'}</Button></>:null;
 const editor=file&&!fixed&&!fixedLoading?<>
 {fileReadOnlyNotice(record,file.entry,file.base,project.scope)&&<InlineAlert heading="验收证据 · 只读">保留原验收依据；修订时另存原件并更新证据，再复核结论。</InlineAlert>}
 {file.deleted&&<InlineAlert tone="warning" heading="原件已删除">保留本窗口草稿，先核对原路径。</InlineAlert>}
 {file.reviewWarning&&<InlineAlert tone="warning">{file.reviewWarning}</InlineAlert>}
 {file.disk?<div className="project-merge"><InlineAlert tone="warning" heading="原文已更新">自动保存已暂停，核对三份内容后合并。</InlineAlert>{[['共同基线',file.base.text],['我的草稿',file.text],['最新原文',file.disk.text]].map(([label,text])=><Fold key={label} title={label}><TextArea label={label} value={text} readOnly rows={8}/></Fold>)}<TextArea label="合并结果" value={merge} onValueChange={setMerge} rows={10}/><Button onClick={()=>model.merge(merge)}>采用合并结果</Button><Button onClick={()=>model.merge(file.disk.text)}>采用最新原文</Button></div>:state.props&&<DocumentSurface {...state.props} formatHost={formatHost??undefined} readingScroll={filePositions.current.get('|'+file.entry.path)??initialScroll} onReadingScroll={scroll=>{filePositions.current.set('|'+file.entry.path,scroll);if(file.entry.path===selection)latestOnView.current?.({path:file.entry.path,kind:'file',scroll});}} writable={state.props.writable&&!file.deleted&&!record.readOnly&&project.scope!=='archived'} outlineOpen={!!state.props.outlineOpen}/>}
 </>:fixed?<><InlineAlert heading={fixed.reference.digest?'固定版本 · 只读':'当前原件 · 只读'}>{fixed.reference.digest??fixed.reference.path}</InlineAlert>{fixed.file.preview?<><Link download={fixed.reference.path.split('/').at(-1)} href={'data:'+fixed.file.preview.mimeType+';base64,'+fixed.file.preview.base64}>下载引用原件</Link>{fixed.file.preview.kind==='image'&&<img className="project-file-image" alt="引用原件" src={'data:'+fixed.file.preview.mimeType+';base64,'+fixed.file.preview.base64}/>}</>:<Markdown text={fixed.file.body} path={fixed.reference.path}/>}</>:fixedLoading?<p role="status">正在读取引用版本…</p>:onlyReference?<><p className="project-muted">引用版本暂不可读取，保留缺口；不会自动读取最新文件替代。</p>{!reference?.digest&&reference?.path&&<Button onClick={()=>sdk.openApp('markdown',new URLSearchParams({path:reference.path!,mode:'read'}).toString())}>在原件应用打开当前文件</Button>}</>:state.entry?.reason==='deleted'?<InlineAlert tone="warning" heading="文件已删除"><p>原路径 · {state.entry.path}</p>{drafts.state(project).get(state.entry.path)&&<TextArea label="保留的未保存草稿" value={drafts.state(project).get(state.entry.path).text} readOnly/>}</InlineAlert>:state.entry?.format==='image'?<img className="project-file-image" alt={state.entry.name} onLoad={()=>void model.seen(state.entry)} src={'/api/workspace/media?'+new URLSearchParams({path:state.entry.path})}/>:state.entry?.format==='external'?<p>此格式请从原件入口查看：<Link href={'/?'+new URLSearchParams({app:'markdown',path:state.entry.path,mode:'read'})} target="_blank" rel="noopener noreferrer">{state.entry.name}</Link></p>:<div className="project-directory"><h2>{entries.get(selected)?.name??state.scopes.find((s:any)=>s.root===selected)?.label??'项目文件'}</h2><p className="project-muted">{selected}</p>{state.loading?<p role="status">正在读取文件夹…</p>:state.entries.filter((e:any)=>!managed.has(e.path)&&e.path.slice(0,e.path.lastIndexOf('/'))===selected).map((e:any)=><Button key={e.path} className="project-directory-entry" variant="text" icon={e.kind==='directory'?<Folder size={17}/>:<FileText size={17}/>} onClick={()=>void open(e.path)}>{e.name}</Button>)}{!state.loading&&!state.entries.some((e:any)=>!managed.has(e.path)&&e.path.slice(0,e.path.lastIndexOf('/'))===selected)&&<p className="project-muted">此文件夹暂无其他文件。正式记录从右侧页签查看。</p>}</div>;
 const returnPrimary=async(id?:string)=>{if(!await readyToLeave())return;if(id&&primary?.onSelect&&await primary.onSelect(id)===false)return;setShowPrimary(true);if((container.current?.clientWidth??1000)<660)setCollapsed(['files']);setIssue('');primary?.onReturn?.();latestOnView.current?.(null);requestAnimationFrame(()=>primary?.readerRef.current?.focus({preventScroll:true}));};
 const navigation=<div className="project-context-navigation"><div className="project-files-nav-heading"><h3>上下文与相关文件</h3><DropdownMenu label="文件操作" trigger={<MoreHorizontal size={16}/>} triggerMode="click" items={menu}/></div>
  <SearchField aria-label="查找上下文文件" value={query} onValueChange={value=>{setQuery(value);if(value.trim())setOpenScopes(levels.map((level:any)=>level.objectPath));}}/>
  <ScrollArea label="当前对象及上级上下文" className="project-file-navigation" style={{height:'100%'}}><Accordion className="project-context-levels" aria-label="分层上下文文件" appearance="plain" size="small" value={openScopes} onValueChange={ids=>{const opened=ids.find(id=>!openScopes.includes(id));setOpenScopes(ids);if(opened)setScopePath(opened);}} items={levels.map((level:any)=>({id:level.objectPath,
   title:<span className="project-context-level-title" title={level.label}><span className="project-context-level-kind">{level.kind}{(review.counts.get(level.root)??0)>0&&<Badge count={review.counts.get(level.root)} tone="info" label={(review.counts.get(level.root)??0)+' 个未审阅文件'}/>}</span><strong>{level.name}</strong></span>,
   extra:onInspiration&&!record.legacy?<Button size="small" variant="text" icon={<Lightbulb size={14}/>} aria-label={'打开'+level.kind+'灵感闪现：'+level.name} title={level.kind+'灵感闪现：'+level.name} onClick={()=>void onInspiration(level.owner)}>灵感闪现</Button>:undefined,
   content:<ContextMenu label={level.kind+'文件菜单'} items={scopeMenu(level)}><div className="project-context-level-files"><TreeView label={level.kind+'上下文'} blockRows nodes={nodes(level.root)} filter={query} selectedId={showPrimary?'':selected} expandedIds={expanded} onExpandedChange={setExpanded} renderLabel={fileLabel} onSelect={path=>void open(path)}/>{!state.supported?<p className="project-muted">正在读取上下文…</p>:!nodes(level.root).length&&<p className="project-muted">本层暂无其他上下文文件。</p>}</div></ContextMenu>,
  }))}/></ScrollArea></div>;
 const fileTitle=fixed?.reference.path?.split('/').at(-1)??file?.entry.name??state.entry?.name??entries.get(selected)?.name??'相关文件';
 const fileLocation=fixed?.reference.path??file?.entry.path??selection;
 const fileParent=fileLocation?.includes('/')?fileLocation.slice(0,fileLocation.lastIndexOf('/')+1):'';
 const readerNavigation=<div className="project-reader-navigation">
  <Button size="small" variant="text" aria-label={collapsed.includes('files')?'展开文件导航':'收起文件导航'} aria-expanded={!collapsed.includes('files')} icon={collapsed.includes('files')?<PanelLeftOpen size={16}/>:<PanelLeftClose size={16}/>} onClick={()=>setCollapsed(ids=>ids.includes('files')?[]:['files'])}/>
  {showPrimary&&primary?.items?<Tabs label="当前对象内容" barStyle={{marginBottom:0}} value={primary.selectedId} items={primary.items.map(item=>({...item,panelId:readerPanelId,tabId:readerPanelId+'-tab-'+item.id}))} onValueChange={id=>void returnPrimary(id)}/>:showPrimary&&primary?primary.title?<>
   <div className="project-file-identity"><h2 className="project-file-reading-title" aria-label={primary.title} title={primary.path}>{primary.parentPath&&<span className="project-file-parent-path">{primary.parentPath} / </span>}<span className="project-file-name">{primary.title}</span></h2>
    <div className="project-reader-status">{primary.status}</div>
   </div>
   {primary.actions&&<div className="project-reader-actions">{primary.actions}</div>}
  </>:<span className="project-reader-kind">{primary.label}</span>:<>
   {primary&&<Button variant="text" size="small" icon={<ArrowLeft size={14}/>} aria-label={'返回'+primary.label} title={'返回'+primary.label} onClick={()=>void returnPrimary()}>返回</Button>}
   <div className="project-file-identity"><h3 className="project-file-reading-title" title={fileLocation}>{fileParent&&<span className="project-file-parent-path">{fileParent}</span>}<span className="project-file-name">{fileTitle}</span></h3>
    <div className="project-reader-status">{fileStatus}</div>
   </div>
   {fileViewControls&&<div className="project-file-view-controls">{fileViewControls}</div>}
  </>}
 </div>;
 const fileChrome=<div className="project-file-chrome" hidden={showPrimary}>
  {fileReviewControl&&<div className="project-file-controls">{fileReviewControl}</div>}
  <div ref={setFormatHost} className="project-file-format-slot"/>
 </div>;
 return <div ref={container} className="project-files"><SplitView className="project-context-split" collapseButtons="hidden" collapsed={collapsed} onCollapsedChange={setCollapsed} panels={[
  {id:'files',label:'项目文件',minSize:240,collapsible:true,content:navigation},
  {id:'reader',label:'文件内容',minSize:230,content:<div className="project-context-content">{readerNavigation}
   <div className="project-reader-panel" id={readerPanelId} role={showPrimary&&primary?.items?'tabpanel':'region'} aria-label={!showPrimary?'文件阅读':!primary?.items?'对象详情':undefined} aria-labelledby={showPrimary&&primary?.items?readerPanelId+'-tab-'+primary.selectedId:undefined}>
    {primary&&<div className="project-primary-pane" hidden={!showPrimary}>{primary.header}<ScrollArea ref={primary.readerRef} label="当前对象" className="project-primary-reader" style={{height:'100%'}} tabIndex={-1} onScroll={primary.onScroll}>{primary.content}</ScrollArea></div>}
    {fileChrome}
    <ScrollArea ref={fileReader} label="文件内容" className="project-file-reader" style={{height:'100%'}} hidden={showPrimary} onScroll={event=>{const digest=fixed?.reference.digest??(onlyReference?reference?.digest:undefined),scroll=event.currentTarget.scrollTop;filePositions.current.set((digest??'')+'|'+selection,scroll);latestOnView.current?.({path:selection,kind:entries.get(selection)?.kind??reference?.kind??'file',...(digest?{digest}:{}),scroll});}}>
     <div className="project-file-body" data-document={!!file&&!fixed&&!fixedLoading&&!file.disk}>
      {(issue||state.error)&&<InlineAlert tone="error" heading="读取或保存需要处理">{issue||state.error}<Button onClick={()=>{if(onlyReference)setReferenceRetry(n=>n+1);else void model.refresh(true);}}>核对原件</Button></InlineAlert>}
      {editor}
     </div>
    </ScrollArea>
    {showPrimary&&(issue||state.error)&&<InlineAlert tone="error">{issue||state.error}</InlineAlert>}
   </div>
  </div>}
 ]} defaultSizes={primary?[27,73]:[25,75]}/>


 <Dialog open={!!operation} title={operation?.kind==='move'?'重命名或移动':'新建'+(operation?.kind==='directory'?'文件夹':'文件')} onClose={()=>{if(pending)return false;setOperation(null);}} onConfirm={async()=>{await commit();return false;}} confirming={pending} confirmLabel="确认"><TextField label={operation?.kind==='move'?'目标完整路径':'名称'} value={name} onValueChange={setName}/>{issue&&<InlineAlert tone="error">{issue}</InlineAlert>}</Dialog>
 {fileOperations&&<WorkspaceFilesDialog sdk={sdk} options={fileOperations} mode="manage" readOnly={!state.canCreate} onGuard={guardOperations} beforeMutate={async()=>{await model.flush();await drafts.settle();return !drafts.hasDrafts();}} onClose={()=>{setFileOperations(null);void model.refresh(true);}}/>}
 </div>;
}
