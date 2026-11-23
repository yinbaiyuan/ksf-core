import {Link} from '@ksf/sdk/link';
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode,type RefObject,type SVGProps} from 'react';
import {PanelLeftClose,PanelLeftOpen,FileText,Folder,FolderOpen,Lightbulb,Trash2,X} from 'lucide-react';
import {Button} from '@ksf/sdk/button';
import {IconButton} from '@ksf/sdk/icon-button';
import {SplitView} from '@ksf/sdk/split-view';
import {TreeView,type TreeNode} from '@ksf/sdk/tree-view';
import {SearchField} from '@ksf/sdk/search-field';
import {TextField} from '@ksf/sdk/text-field';
import {TextArea} from '@ksf/sdk/text-area';
import {Tabs} from '@ksf/sdk/tabs';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {Dialog} from '@ksf/sdk/dialog';
import {ContextMenu} from '@ksf/sdk/context-menu';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {Accordion} from '@ksf/sdk/accordion';
import {Badge} from '@ksf/sdk/badge';
import {Tag} from '@ksf/sdk/tag';
import {WorkspaceFilesDialog} from './workspace-files-view';
import {createFileTransport} from '@ksf/sdk/files';
import {createContextDrafts,createContextFileWorkspace} from './context-files.js';
import {createContextFileActions,fileWithin} from './context-file-actions.js';
import {ContextFileActionDialog} from './context-file-action-dialog';
import {fileReadOnlyNotice} from './file-readonly.js';
import {contextFileNodes,contextFileReview,contextScopes,contextPanels,contextScopeForPath,isManagedSource} from './context-scopes.js';
import {DocumentSurface} from './context-file-editor';
import {Fold,Markdown} from './project-components';
import {HeaderSaveStatus} from './header-save-status';
import type {Reference} from './references-view';

export function FilesView({sdk,project,record,subject,changesReader,navigationControls,reference,register,primary,beforeOpen,initialScroll=0,onView,onInspiration,onReference,onSelectObject}:{sdk:any;project:any;record:any;subject:any;changesReader?:any;navigationControls?:ReactNode;reference?:Reference|null;register:(model:any)=>()=>void;initialScroll?:number;onView?:(view:any)=>void;beforeOpen?:()=>Promise<boolean>;onInspiration?:(owner:any)=>Promise<void>;onReference?:(reference:Reference)=>void;onSelectObject?:(path:string)=>Promise<boolean>;primary?:{label:string;title?:string;path?:string;parentPath?:string;status?:ReactNode;actions?:ReactNode;extra?:ReactNode;header?:ReactNode;items?:{id:string;label:string;icon?:ReactNode}[];selectedId?:string;onSelect?:(id:string)=>Promise<any>;onReturn?:()=>void;content:ReactNode;readerRef:RefObject<HTMLDivElement|null>;onScroll:(event:any)=>void}}){
 const readerPanelId=useId(),container=useRef<HTMLDivElement>(null),[showPrimary,setShowPrimary]=useState(!!primary),[collapsed,setCollapsed]=useState<string[]>([]);
 useLayoutEffect(()=>{if(!container.current)return;let narrow:boolean|undefined;const observer=new ResizeObserver(()=>{const next=(container.current?.clientWidth??1000)<660;if(next!==narrow){narrow=next;setCollapsed(next?['files']:[]);}});observer.observe(container.current);return()=>observer.disconnect();},[]);
 const latest=useRef(record);latest.current=record;const latestPrimary=useRef(primary);latestPrimary.current=primary;const latestBeforeOpen=useRef(beforeOpen);latestBeforeOpen.current=beforeOpen;const latestOnView=useRef(onView);latestOnView.current=onView;const fileReader=useRef<HTMLDivElement>(null),filePositions=useRef(new Map<string,number>()),restoreFile=useRef(initialScroll);
 const [query,setQuery]=useState(''),[expanded,setExpanded]=useState<string[]>([]),[operation,setOperation]=useState<any>(null),[name,setName]=useState(''),[issue,setIssue]=useState(''),[pending,setPending]=useState(false),[fixed,setFixed]=useState<any>(null),[fixedLoading,setFixedLoading]=useState(false),[merge,setMerge]=useState('');
 const [trashOptions,setTrashOptions]=useState<any>(null),trashBlocked=useRef(false),guardTrash=useCallback((blocked:boolean)=>{trashBlocked.current=blocked;},[]);
 const [formatHost,setFormatHost]=useState<HTMLDivElement|null>(null);
 const [selection,setSelection]=useState(subject.path.slice(0,subject.path.lastIndexOf('/'))),[openScopes,setOpenScopes]=useState<string[]>([subject.path]),[menuPath,setMenuPath]=useState('');
 const request=useRef(0),[onlyReference,setOnlyReference]=useState(false),[referenceRetry,setReferenceRetry]=useState(0),drafts=useMemo(()=>createContextDrafts(sdk),[sdk]);
 const reading=useRef({showPrimary,path:selection,digest:''});
 reading.current={showPrimary,path:selection,digest:fixed?.reference.digest??(onlyReference?reference?.digest:undefined)??''};
 function rememberFileReading(){const current=reading.current,reader=fileReader.current;if(current.showPrimary||!reader)return;const preview=reader.querySelector<HTMLElement>('.pg-file-preview-pane');if(preview||!reader.querySelector('.cm-editor'))filePositions.current.set(current.digest+'|'+current.path,preview?.scrollTop??reader.scrollTop);}
 const objectModels=useRef(new Map<string,any>());
 useEffect(()=>()=>{for(const value of objectModels.current.values())value.dispose();objectModels.current.clear();},[]);
 const currentObject=useRef(subject.path);
 useLayoutEffect(()=>{
  if(currentObject.current===subject.path)return;
  currentObject.current=subject.path;request.current++;restoreFile.current=initialScroll;
  setShowPrimary(!!primary);setSelection(subject.path.slice(0,subject.path.lastIndexOf('/')));
  setOpenScopes(ids=>ids.includes(subject.path)?ids:[...ids,subject.path]);setQuery('');setIssue('');setFixed(null);setFixedLoading(false);setOnlyReference(false);setOperation(null);setMerge('');
 },[subject.path]);
 const model=useMemo(()=>{
  const key=subject.metadata.id+'|'+subject.path+'|'+subject.metadata.name;
  const retained=objectModels.current.get(key);
  if(retained){objectModels.current.delete(key);objectModels.current.set(key,retained);return retained;}
  const element=()=>document.createElement('div');
  const list=element(),content=element(),actions=element(),status=element(),reader=element();reader.id='project-files-'+sdk.getSnapshot().id;
  const docLink=(text:string,path:string)=>{const link=document.createElement('a');link.textContent=text;link.href='/?'+new URLSearchParams({app:'markdown',path,mode:'read'});link.target='_blank';link.rel='noopener noreferrer';return link;};
  const result:any=createContextFileWorkspace({sdk,project,changesReader,rootPath:subject.path,objectPath:subject.path,contextRoots:contextScopes(record,subject),list,content,actions,status,reader,icon:()=>element(),iconButton:(label:string,_symbol:string,fn:()=>void)=>{const b=document.createElement('button');b.title=label;b.addEventListener('click',fn);return b;},docLink,drafts,reviewSession:'projects-012-'+sdk.getSnapshot().id,contextMenu:()=>({onContextMenu(){}}),onOpen:(entry:any)=>{rememberFileReading();request.current++;reading.current={showPrimary:false,path:entry.path,digest:''};setShowPrimary(false);setOnlyReference(false);setFixed(null);setFixedLoading(false);setSelection(entry.path);void result.open(entry);latestOnView.current?.({path:entry.path,kind:entry.kind,scroll:filePositions.current.get('|'+entry.path)??0});},onFallback(){},onUnread(){},displayName:(e:any)=>e.name,showInFileNavigation:()=>true,focusState:{openFolders:new Set()},projectWritable:()=>project.scope!=='archived'&&!latest.current.readOnly&&latest.current.valid!==false,readOnlyNotice:(entry:any,file:any)=>fileReadOnlyNotice(latest.current,entry,file,project.scope),headless:true});
  objectModels.current.set(key,result);
  while(objectModels.current.size>6){const first=objectModels.current.keys().next().value!;objectModels.current.get(first).dispose();objectModels.current.delete(first);}
  return result;
 },[sdk,project.scope,project.name,subject.path,subject.metadata.id,subject.metadata.name,drafts,changesReader]);
 const state:any=useSyncExternalStore(model.subscribe,model.getSnapshot);
 const fileTransport=useMemo(()=>createFileTransport(sdk),[sdk]),actionCallbacks=useRef<any>(null);
 const fileActions=useMemo(()=>createContextFileActions({files:fileTransport,before:()=>actionCallbacks.current.before(),changed:(request:any,result:any)=>actionCallbacks.current.changed(request,result)}),[fileTransport,project.name,project.scope]);
 const actionState:any=useSyncExternalStore(fileActions.subscribe,fileActions.getSnapshot);
 useEffect(()=>()=>fileActions.dispose(),[fileActions]);
 actionCallbacks.current={before:async()=>{if(!await readyToLeave())return false;if(project.scope==='archived'||latest.current.readOnly||latest.current.valid===false)throw Error('当前项目只读。');return true;},changed:finishFileOperation};
 function revealPrimary(){rememberFileReading();request.current++;reading.current={...reading.current,showPrimary:true};model.reset();model.select('');setShowPrimary(true);setFixed(null);setFixedLoading(false);setOnlyReference(false);setIssue('');latestPrimary.current?.onReturn?.();latestOnView.current?.(null);}
 useEffect(()=>{setExpanded(ids=>[...new Set([...ids,...model.getSnapshot().scopes.filter((s:any)=>s.objectPath===subject.path).map((s:any)=>s.root)])]);model.start();const off=register({revealPrimary,flush:async()=>{await model.flush();await drafts.settle();return !drafts.hasDrafts()&&!model.getSnapshot().active?.composing&&!fileActions.blocked()&&!trashBlocked.current;},hasDrafts:()=>!!model.getSnapshot().active?.composing||drafts.hasDrafts()||drafts.saving()||model.mutating()||fileActions.blocked()||trashBlocked.current,closeReviews:()=>sdk.call('context-files',{action:'endReview',reviewSession:'projects-012-'+sdk.getSnapshot().id})});return()=>{off();model.pause();};},[model,register,drafts,fileActions]);
 useLayoutEffect(()=>{
  if(!reference?.path)return;
  rememberFileReading();reading.current={showPrimary:false,path:reference.path,digest:reference.digest??''};
  setShowPrimary(false);
  const token=++request.current;setSelection(reference.path);latestOnView.current?.({path:reference.path,kind:reference.kind??'file',...(reference.digest?{digest:reference.digest}:{}),scroll:restoreFile.current??0});setIssue('');setOnlyReference(!!reference.digest||isManagedSource(record,reference.path)||!reference.path.startsWith(record.project.path.slice(0,record.project.path.lastIndexOf('/'))+'/'));
  const root=record.project.path.slice(0,record.project.path.lastIndexOf('/'));
  if(reference.kind==='directory'&&!reference.digest){model.reset();setOnlyReference(false);setFixed(null);setFixedLoading(false);model.select(reference.path);setExpanded(ids=>[...new Set([...ids,reference.path!])]);}
  else if(reference.digest||isManagedSource(record,reference.path)||!reference.path.startsWith(root+'/')){model.reset();setFixed(null);setFixedLoading(true);void sdk.call('file',{...project,...reference}).then((file:any)=>{if(token===request.current)setFixed({file,reference});}).catch((e:any)=>{if(token===request.current)setIssue((reference.digest?'固定证据':'原件')+'无法读取：'+e.message);}).finally(()=>{if(token===request.current)setFixedLoading(false);});}
  else{setFixed(null);setFixedLoading(false);const path=reference.path;void (async()=>{
   // Recovery carries coordinates only. Reuse the service's file descriptor,
   // including binary/external formats, instead of guessing a text editor.
   let entry=model.getSnapshot().entries.find((item:any)=>item.path===path);
   if(!entry){await model.refresh();if(token!==request.current)return;entry=model.getSnapshot().entries.find((item:any)=>item.path===path);}
   if(token!==request.current)return;
   if(!entry)throw Error('引用文件未在当前上下文中找到，请核对原件位置。');
   await model.open(entry);
  })().catch((error:any)=>{if(token===request.current)setIssue(error.message);});}
  return()=>{request.current++;};
 },[reference,model,sdk,project,referenceRetry]);
 const file=state.active;
 useLayoutEffect(()=>{if(showPrimary||!fileReader.current)return;const key=(fixed?.reference.digest??(onlyReference?reference?.digest:undefined)??'')+'|'+selection;const id=requestAnimationFrame(()=>{if(fileReader.current)fileReader.current.scrollTop=filePositions.current.get(key)??restoreFile.current??0;restoreFile.current=0;});return()=>cancelAnimationFrame(id);},[showPrimary,selection,file?.entry.path,fixed]);
 useEffect(()=>{if(file?.disk)setMerge(file.mergeText??file.text);},[file?.disk]);
 const root=record.project.path.slice(0,record.project.path.lastIndexOf('/'));
 const entries=new Map<string,any>(state.entries.map((e:any)=>[e.path,e]));
 const managed=new Set(state.scopes.flatMap((s:any)=>{const doc=record.documents.find((d:any)=>d.path===s.objectPath)??record.project;return [doc.path,doc.metadata.review_ref?.path,...(record.legacy?[]:[s.root+'/灵感闪现.md'])];}));
 const levels=contextPanels(record,subject);
 const nodes=contextFileNodes(state.entries,managed,state.scopes),review=contextFileReview(state.entries,state.scopes,managed);
 const fileLabel=(node:TreeNode)=>{
  const entry=entries.get(node.id),notice=review.notices.get(node.id),count=review.counts.get(node.id)??0;
  const description=entry?.kind==='directory'?(count?count+' 个未审阅文件':''):notice==='modified'?'已修改，待审阅':notice==='deleted'?'已删除，待确认':notice==='new'?'新文件，待审阅':'';
  const directory=entry?.kind==='directory',EntryIcon=directory?(expanded.includes(node.id)||query.trim()?FolderOpen:Folder):FileText;
  return <span className="project-context-file-label" data-context-path={node.id} title={(directory?'文件夹':'文件')+'：'+node.label+(description?' · '+description:'')}><span className="project-context-entry-icon" role="img" aria-label={directory?'文件夹':'文件'} data-kind={directory?'directory':'file'}><EntryIcon size={16} aria-hidden="true"/></span><span className="project-context-file-name">{node.label}</span>
   {entry?.kind==='directory'?(count>0&&!expanded.includes(node.id)&&!query.trim()&&<Badge count={count} tone="info" label={description}/>):notice==='new'?<Badge dot tone="info" label={description}/>:notice&&<Badge count={notice==='modified'?'M':'D'} tone={notice==='modified'?'warning':'danger'} label={description}/>}
  </span>;
 };
 const open=async(path:string)=>{
  const token=++request.current;
  const e=entries.get(path),isFolder=state.scopes.some((s:any)=>s.root===path)||e?.kind==='directory';
  if(!await readyToLeave()||token!==request.current)return;
  rememberFileReading();reading.current={showPrimary:false,path,digest:''};restoreFile.current=filePositions.current.get('|'+path)??0;
  const ownerPath=contextScopeForPath(state.scopes,path)?.objectPath??subject.path;
  setShowPrimary(false);setSelection(path);setOpenScopes(ids=>ids.includes(ownerPath)?ids:[...ids,ownerPath]);setOnlyReference(false);setFixed(null);setFixedLoading(false);setIssue('');
  if(e?.kind==='file'){model.select(path);await model.open(e);}
  else if(isFolder){model.reset();model.select(path);setExpanded(ids=>[...new Set([...ids,path])]);}
  if(token!==request.current)return;
  latestOnView.current?.({path,kind:isFolder?'directory':'file',scroll:restoreFile.current??0});if((container.current?.clientWidth??1000)<660)setCollapsed(['files']);
 };
 async function readyToLeave(){await model.flush();await drafts.settle();if(drafts.hasDrafts()||model.getSnapshot().active?.composing||fileActions.blocked()||trashBlocked.current){setIssue('请先结束输入法组字并核对文件保存、草稿或未决操作。');return false;}return latestBeforeOpen.current?await latestBeforeOpen.current():true;}
 async function finishFileOperation(request:any,result:any){
  const current=reading.current,affected=!current.showPrimary&&fileWithin(current.path,request.source);
  if(request.kind==='move'){
   for(const [key,position]of [...filePositions.current]){const path=key.slice(key.indexOf('|')+1);if(fileWithin(path,request.source)){filePositions.current.set(key.slice(0,key.indexOf('|')+1)+result.path+path.slice(request.source.length),position);filePositions.current.delete(key);}}
   await model.refreshAfterMutation({previousPath:request.source,path:result.path});
   const path=result.path+current.path.slice(request.source.length);
   setExpanded(ids=>[...new Set(ids.map(folder=>fileWithin(folder,request.source)?result.path+folder.slice(request.source.length):folder))]);
   if(affected){if(model.getSnapshot().entries.some((entry:any)=>entry.path===path&&entry.reason!=='deleted')){const folders:string[]=[];for(let parent=result.kind==='directory'?path:path.slice(0,path.lastIndexOf('/'));fileWithin(parent,root);parent=parent.slice(0,parent.lastIndexOf('/')))folders.push(parent);setSelection(path);setExpanded(ids=>[...new Set([...ids,...folders])]);reading.current={showPrimary:false,path,digest:''};latestOnView.current?.({path,kind:result.kind,scroll:filePositions.current.get('|'+path)??0});}else revealPrimary();}
  }else{await model.refreshAfterMutation();if(request.kind==='trash'&&affected)revealPrimary();}
 }

 const selected=selection||state.entry?.path||state.selected;
 const scopeMenu=(level:any,menuSelection=level.root)=>{
  const folder=state.scopes.some((s:any)=>s.root===menuSelection)||entries.get(menuSelection)?.kind==='directory'?menuSelection:menuSelection?.slice(0,menuSelection.lastIndexOf('/'))??level.root;
  const blocked=fileActions.blocked(),canChange=state.canCreate&&entries.get(menuSelection)?.canMove&&!fileReadOnlyNotice(record,entries.get(menuSelection),{},project.scope)&&!blocked;
  return [{id:'new-file',label:'新建文件',disabled:!state.canCreate||blocked,onAction:()=>{setName('');setOperation({kind:'file',folder});}},{id:'new-folder',label:'新建文件夹',disabled:!state.canCreate||blocked,onAction:()=>{setName('');setOperation({kind:'directory',folder});}},{id:'rename',label:'重命名',disabled:!canChange,onAction:()=>void fileActions.begin('rename',menuSelection)},{id:'move',label:'移动到…',disabled:!canChange,onAction:()=>void fileActions.begin('move',menuSelection)},{id:'delete',label:'删除…',tone:'danger' as const,disabled:!canChange,onAction:()=>void fileActions.begin('delete',menuSelection)},{id:'copy-path',label:'复制路径',onAction:()=>void navigator.clipboard.writeText(menuSelection).catch(e=>setIssue(e.message))}];
 };
 function targetMenu(event:any,level:any){const item=(event.target as HTMLElement).closest('[role=treeitem]'),path=item?.querySelector<HTMLElement>('[data-context-path]')?.dataset.contextPath;setMenuPath(path&&entries.has(path)?path:level.root);}
 async function commit(){
  setPending(true);setIssue('');try{
   if(drafts.hasDrafts()){await model.flush();await drafts.settle();if(drafts.hasDrafts())throw Error('请先保存或合并当前草稿。');}
   if(!name.trim()||/[\\/\x00-\x1f]/.test(name)||['.','..'].includes(name.trim()))throw Error('请输入有效名称。');const created=await model.mutate('create',{path:operation.folder+'/'+name.trim(),kind:operation.kind});setSelection(created.path);
   setOperation(null);
  }catch(e:any){setIssue(e.message);}finally{setPending(false);}
 }
 const fileStatus=file&&!fixed&&!fixedLoading?<HeaderSaveStatus status={file.disk||file.saveError||file.error?'error':file.saving?'saving':file.text!==file.base.text?'editing':'saved'} message={file.saveError||file.error||file.recoveryError||file.message||(!file.base.writable?'只读':undefined)} onRetry={()=>void model.flush()}/>:null;
 const fileViewControls=file&&!fixed&&!fixedLoading&&file.base.writable&&!file.disk?<ToggleGroup label="文档视图" size="small" value={file.mode} disabled={!!file.composing||!!file.uploading} onValueChange={value=>model.mode(value)} options={(file.entry.format==='markdown'&&file.text.length<=1024*1024?['live','source','split','preview']:['source','preview']).map(value=>({value,label:({live:'编辑',source:'源码',split:'分栏',preview:'阅读'} as any)[value]}))}/>:null;
 const reviewBlocked=!!file&&(!!file.disk||file.saving||file.reviewing||file.composing||file.uploading||file.deleted);
 const fileReviewControl=file&&!fixed&&!fixedLoading&&file.original!==undefined&&file.original!==file.text?<><span className="project-muted">有未审阅修改</span>{file.mode==='preview'&&<Button size="small" variant="text" disabled={reviewBlocked} onClick={()=>model.mode('source')}>查看差异</Button>}<Button size="small" variant="text" disabled={reviewBlocked} onClick={()=>void model.markReviewed()}>{file.reviewing?'正在确认…':'标记已审阅'}</Button></>:null;
 const editor=file&&!fixed&&!fixedLoading?<>
 {fileReadOnlyNotice(record,file.entry,file.base,project.scope)&&<InlineAlert heading="验收证据 · 只读">保留原验收依据；修订时另存原件并更新证据，再复核结论。</InlineAlert>}
 {file.deleted&&<InlineAlert tone="warning" heading="原件已删除">保留本窗口草稿，先核对原路径。</InlineAlert>}
 {file.reviewWarning&&<InlineAlert tone="warning">{file.reviewWarning}</InlineAlert>}
 {file.disk?<div className="project-merge"><InlineAlert tone="warning" heading="原文已更新">自动保存已暂停，核对三份内容后合并。</InlineAlert>{[['共同基线',file.base.text],['我的草稿',file.text],['最新原文',file.disk.text]].map(([label,text])=><Fold key={label} title={label}><TextArea label={label} value={text} readOnly rows={8}/></Fold>)}<TextArea label="合并结果" value={merge} onValueChange={setMerge} rows={10}/><Button onClick={()=>model.merge(merge)}>采用合并结果</Button><Button onClick={()=>model.merge(file.disk.text)}>采用最新原文</Button></div>:state.props&&<DocumentSurface {...state.props} formatHost={formatHost??undefined} readingScroll={filePositions.current.get('|'+file.entry.path)??initialScroll} onReadingScroll={scroll=>{if(reading.current.showPrimary||file.entry.path!==reading.current.path)return;filePositions.current.set('|'+file.entry.path,scroll);latestOnView.current?.({path:file.entry.path,kind:'file',scroll});}} writable={state.props.writable&&!file.deleted&&!record.readOnly&&project.scope!=='archived'} outlineOpen={!!state.props.outlineOpen}/>}
 </>:fixed?<><InlineAlert heading={fixed.reference.digest?'固定版本 · 只读':'当前原件 · 只读'}>{fixed.reference.digest??fixed.reference.path}</InlineAlert>{fixed.file.preview?<><Link download={fixed.reference.path.split('/').at(-1)} href={'data:'+fixed.file.preview.mimeType+';base64,'+fixed.file.preview.base64}>下载引用原件</Link>{fixed.file.preview.kind==='image'&&<img className="project-file-image" alt="引用原件" src={'data:'+fixed.file.preview.mimeType+';base64,'+fixed.file.preview.base64}/>}</>:<Markdown text={fixed.file.body} path={fixed.reference.path}/>}</>:fixedLoading?<p role="status">正在读取引用版本…</p>:onlyReference?<><p className="project-muted">引用版本暂不可读取，保留缺口；不会自动读取最新文件替代。</p>{!reference?.digest&&reference?.path&&<Button onClick={()=>sdk.openApp('markdown',new URLSearchParams({path:reference.path!,mode:'read'}).toString())}>在原件应用打开当前文件</Button>}</>:state.entry?.reason==='deleted'?<InlineAlert tone="warning" heading="文件已删除"><p>原路径 · {state.entry.path}</p>{drafts.state(project).get(state.entry.path)&&<TextArea label="保留的未保存草稿" value={drafts.state(project).get(state.entry.path).text} readOnly/>}</InlineAlert>:state.entry?.format==='image'?<img className="project-file-image" alt={state.entry.name} onLoad={()=>void model.seen(state.entry)} src={'/api/workspace/media?'+new URLSearchParams({path:state.entry.path})}/>:state.entry?.format==='external'?<p>此格式请从原件入口查看：<Link href={'/?'+new URLSearchParams({app:'markdown',path:state.entry.path,mode:'read'})} target="_blank" rel="noopener noreferrer">{state.entry.name}</Link></p>:<div className="project-directory"><h2>{entries.get(selected)?.name??state.scopes.find((s:any)=>s.root===selected)?.label??'项目文件'}</h2><p className="project-muted">{selected}</p>{state.loading?<p role="status">正在读取文件夹…</p>:state.entries.filter((e:any)=>!managed.has(e.path)&&e.path.slice(0,e.path.lastIndexOf('/'))===selected).map((e:any)=><Button key={e.path} className="project-directory-entry" variant="text" icon={e.kind==='directory'?<Folder size={17}/>:<FileText size={17}/>} onClick={()=>void open(e.path)}>{e.name}</Button>)}{!state.loading&&!state.entries.some((e:any)=>!managed.has(e.path)&&e.path.slice(0,e.path.lastIndexOf('/'))===selected)&&<p className="project-muted">此文件夹暂无其他文件。正式记录从右侧页签查看。</p>}</div>;
 const returnPrimary=async(id?:string)=>{if(!await readyToLeave())return;if(id&&primary?.onSelect&&await primary.onSelect(id)===false)return;revealPrimary();if((container.current?.clientWidth??1000)<660)setCollapsed(['files']);requestAnimationFrame(()=>primary?.readerRef.current?.focus({preventScroll:true}));};
 async function selectLevel(level:any){if(!onSelectObject||!await onSelectObject(level.objectPath))return;setOpenScopes(ids=>ids.includes(level.objectPath)?ids.filter(id=>id!==level.objectPath):[...ids,level.objectPath]);}
 const levelTitle=(level:any)=>{const count=review.counts.get(level.root)??0;return <span className="project-context-level-title" title={level.label}><span className="project-context-level-kind"><Tag className="project-context-kind-tag" tone="neutral">{level.kind}{count>0&&<span className="project-context-kind-count" role="status" aria-label={count+' 个未审阅文件'} title={count+' 个未审阅文件'}>{count>99?'99+':count}</span>}</Tag></span><strong>{level.name}</strong></span>;};
 const levelInspiration=(level:any)=>onInspiration&&!record.legacy?<IconButton size="small" variant="text" icon={Lightbulb} label={'打开'+level.kind+'灵感闪现：'+level.name} title={level.kind+'灵感闪现：'+level.name} onClick={()=>void onInspiration(level.owner)}/>:undefined;
 const levelFiles=(level:any)=><ContextMenu label={level.kind+'文件菜单'} items={scopeMenu(level,contextScopeForPath(state.scopes,menuPath)?.objectPath===level.objectPath?menuPath:level.root)} onContextMenu={event=>targetMenu(event,level)} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')targetMenu(event,level);}}><div className="project-context-level-files"><TreeView label={level.kind+'上下文'} blockRows nodes={nodes(level.root)} filter={query} selectedId={showPrimary?'':selected} expandedIds={expanded} onExpandedChange={setExpanded} renderLabel={fileLabel} onSelect={path=>void open(path)}/>{!state.supported?<p className="project-muted">正在读取上下文…</p>:!nodes(level.root).length&&<p className="project-muted">本层暂无其他上下文文件。</p>}</div></ContextMenu>;
 const operationStatus=actionState.busy?'正在核对文件操作…':actionState.unknown?'文件操作结果待核对':actionState.dialog?'等待确认':actionState.error||actionState.notice||(!state.supported?'正在读取上下文…':'就绪');
 const statusActions=!actionState.dialog&&!!(actionState.error||actionState.notice||actionState.unknown);
 const navigation=<div className="project-context-navigation"><header className="project-navigation-header"><h3>上下文与相关文件</h3>
  <SearchField aria-label="查找上下文文件" value={query} onValueChange={value=>{setQuery(value);if(value.trim())setOpenScopes(levels.map((level:any)=>level.objectPath));}}/></header>
  <ScrollArea label="当前对象及上级上下文" className="project-file-navigation" style={{height:'100%'}}>
   {onSelectObject?<div className="project-context-levels project-context-object-levels" aria-label="分层上下文文件">{levels.map((level:any,index:number)=>{const expanded=openScopes.includes(level.objectPath),panelId=readerPanelId+'-scope-'+index,current=showPrimary&&primary?.path===level.objectPath;return <section key={level.objectPath}>
   <ContextMenu className="project-context-level-heading" label={level.kind+'对象菜单'} items={scopeMenu(level)} tabIndex={-1}><header><IconButton className="project-context-expander" size="small" variant="text" icon={ContextCaret} label={(expanded?'收起':'展开')+level.kind+'上下文：'+level.name} aria-expanded={expanded} aria-controls={panelId} onClick={()=>{setOpenScopes(ids=>ids.includes(level.objectPath)?ids.filter(id=>id!==level.objectPath):[...ids,level.objectPath]);}}/>
    <h3><Button className="project-context-object-select" size="small" variant="text" tone={current?'primary':'neutral'} aria-label={'查看'+level.kind+'详情：'+level.name} aria-current={current?'page':undefined} aria-expanded={expanded} aria-controls={panelId} onClick={()=>void selectLevel(level)}>{levelTitle(level)}</Button></h3>{levelInspiration(level)}</header></ContextMenu>
   <div id={panelId} hidden={!expanded}>{levelFiles(level)}</div>
  </section>;})}</div>:<Accordion className="project-context-levels" aria-label="分层上下文文件" appearance="plain" size="small" value={openScopes} onValueChange={setOpenScopes} items={levels.map((level:any)=>({id:level.objectPath,title:levelTitle(level),extra:levelInspiration(level),content:levelFiles(level)}))}/>}</ScrollArea><footer className="project-context-footer project-context-statusbar project-navigation-statusbar" aria-label="上下文文件状态" data-attention={!!actionState.unknown||!actionState.dialog&&!!actionState.error}>
   <span className="project-context-status-message" role="status" aria-live="polite" aria-atomic="true" title={operationStatus}>{operationStatus}</span>
   {statusActions&&<div className="project-context-status-actions">{actionState.unknown?<Button size="small" variant="text" aria-label="查询原操作结果" disabled={actionState.busy} onClick={()=>void fileActions.reconcile()}>核对</Button>:actionState.deleted&&<Button size="small" variant="text" disabled={fileActions.blocked()} onClick={()=>void fileActions.undo()}>撤销删除</Button>}<IconButton size="small" variant="text" icon={X} label="关闭提示" disabled={fileActions.blocked()} onClick={()=>fileActions.dismiss()}/></div>}
   <Button size="small" variant="text" icon={<Trash2 size={16}/>} aria-label="项目回收站" onClick={async()=>{if(await readyToLeave())setTrashOptions({scope:'workspace',rootPath:root,initialPath:root,title:'项目回收站'});}}>回收站</Button></footer></div>;
 const fileTitle=fixed?.reference.path?.split('/').at(-1)??file?.entry.name??state.entry?.name??entries.get(selected)?.name??'相关文件';
 const fileLocation=fixed?.reference.path??file?.entry.path??selection;
 const fileParent=fileLocation?.includes('/')?fileLocation.slice(0,fileLocation.lastIndexOf('/')+1):'';
 const readerNavigation=<div className="project-reader-navigation">
  {navigationControls}
  <Button size="small" variant="text" aria-label={collapsed.includes('files')?'展开文件导航':'收起文件导航'} aria-expanded={!collapsed.includes('files')} icon={collapsed.includes('files')?<PanelLeftOpen size={16}/>:<PanelLeftClose size={16}/>} onClick={()=>setCollapsed(ids=>ids.includes('files')?[]:['files'])}/>
  {showPrimary&&primary?.items?<Tabs label="当前对象内容" barStyle={{marginBottom:0}} value={primary.selectedId} items={primary.items.map(item=>({...item,panelId:readerPanelId,tabId:readerPanelId+'-tab-'+item.id}))} onValueChange={id=>void returnPrimary(id)}/>:showPrimary&&primary?primary.title?<>
   <div className="project-file-identity"><h2 className="project-file-reading-title" aria-label={primary.title} title={primary.path}>{primary.parentPath&&<span className="project-file-parent-path">{primary.parentPath} / </span>}<span className="project-file-name">{primary.title}</span></h2>
    <div className="project-reader-status">{primary.status}</div>
   </div>
   {primary.actions&&<div className="project-reader-actions">{primary.actions}</div>}
  </>:<span className="project-reader-kind">{primary.label}</span>:<>
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
    {primary&&<div className="project-primary-pane" hidden={!showPrimary}>{primary.header}<ScrollArea ref={primary.readerRef} label="当前对象" className="project-primary-reader" style={{height:'100%'}} tabIndex={-1} onScroll={event=>{if(reading.current.showPrimary)primary.onScroll(event);}}>{primary.content}</ScrollArea></div>}
    {fileChrome}
    <ScrollArea ref={fileReader} label="文件内容" className="project-file-reader" style={{height:'100%'}} hidden={showPrimary} onScroll={event=>{const current=reading.current;if(current.showPrimary)return;const scroll=event.currentTarget.querySelector<HTMLElement>('.pg-file-preview-pane')?.scrollTop??event.currentTarget.scrollTop;filePositions.current.set(current.digest+'|'+current.path,scroll);latestOnView.current?.({path:current.path,kind:entries.get(current.path)?.kind??reference?.kind??'file',...(current.digest?{digest:current.digest}:{}),scroll});}}>
     <div className="project-file-body" data-document={!!file&&!fixed&&!fixedLoading&&!file.disk}>
      {(issue||state.error)&&<InlineAlert tone="error" heading="读取或保存需要处理">{issue||state.error}<Button onClick={()=>{if(onlyReference)setReferenceRetry(n=>n+1);else void model.refresh(true);}}>核对原件</Button></InlineAlert>}
      {editor}
     </div>
    </ScrollArea>
    {showPrimary&&(issue||state.error)&&<InlineAlert tone="error">{issue||state.error}</InlineAlert>}
   </div>
  </div>}
 ]} defaultSizes={primary?[27,73]:[25,75]}/>


 <Dialog open={!!operation} title={'新建'+(operation?.kind==='directory'?'文件夹':'文件')} onClose={()=>{if(pending)return false;setOperation(null);}} onConfirm={async()=>{await commit();return false;}} confirming={pending} confirmLabel="确认"><TextField label="名称" value={name} onValueChange={setName}/>{issue&&<InlineAlert tone="error">{issue}</InlineAlert>}</Dialog>
 {trashOptions&&<WorkspaceFilesDialog sdk={sdk} options={trashOptions} mode="trash" readOnly={!state.canCreate} onGuard={guardTrash} onMutation={()=>fileActions.dismiss()} beforeMutate={async()=>{await model.flush();await drafts.settle();return !drafts.hasDrafts()&&!model.getSnapshot().active?.composing&&!fileActions.blocked();}} onClose={()=>{setTrashOptions(null);void model.refreshAfterMutation().catch((error:any)=>setIssue(error.message));}}/>}
 {actionState.dialog&&<ContextFileActionDialog key={actionState.dialog.kind+'|'+actionState.dialog.source.path} actions={fileActions} state={actionState} files={fileTransport} root={root}/>}
 </div>;
}

function ContextCaret(props:SVGProps<SVGSVGElement>){return <svg viewBox="0 0 16 16" {...props}><path d="M5 3.5 11 8 5 12.5Z" fill="currentColor"/></svg>;}
