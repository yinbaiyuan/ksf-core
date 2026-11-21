import {randomId} from '@ksf/sdk/random-id';
import {documentValue,documentForReading,mergeDocuments,evidenceReferences,adoptSavedDocument} from './governance-model.js';
import {stageProgress,projectProgress,dependenciesOf,taskLabel,milestoneCode,projectCardHierarchy} from './hierarchy-model.js';
import {createInspiration} from './inspiration.js';
import {createContextDrafts,createContextFileWorkspace} from './context-files.js';
import {fileReadOnlyNotice,createFileReadOnlyNotice} from './file-readonly.js';
import {contextOwners,contextScopes,contextScopeForPath} from './context-scopes.js';
import {createProjectPlanEditor} from './project-plan.js';
import {followPointer} from './project-card-motion.js';
import {workspaceDomainFacts} from './workspace-model.js';
import {projectParentChange} from './project-plan-model.js';
import {resultSections,taskProgressAction,taskProgressPrompt,milestoneTasks,workTasks,milestoneAcceptancePrompt,milestoneCompletionChanges} from './result-detail-model.js';

const labels={A:'A · 轻量',B:'B · 协作',C:'C · 复杂',D:'D · 战略',finite:'有限交付',ongoing:'持续迭代',definition:'定方案',planning:'拆计划',execution:'管执行',high:'高',normal:'常规',low:'低',project:'项目',milestone:'里程碑',task:'任务',review:'复盘',planned:'未开始',active:'进行中',backlog:'待梳理',ready:'待开始',in_progress:'进行中',blocked:'受阻',paused:'暂停',review:'待验收',completed:'已完成',cancelled:'已取消',candidate:'候选',next:'接下来',now:'当前承诺',delivery:'交付',acceptance:'验收与补证',draft:'草稿',pending:'待核对',passed:'通过',failed:'未通过'};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(text,action,cls='kp-text-button')=>{const n=el('button',cls,text);n.type='button';n.addEventListener('click',action);return n;};
const chip=s=>el('span','pm-chip state-'+s,labels[s]??s);
const id=prefix=>prefix+'_'+randomId().replace(/[^A-Za-z0-9]/g,'');
const parent=p=>p.slice(0,p.lastIndexOf('/'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function navigationSplitter(workspace,board,signal){
  const handle=el('div','pg-card-splitter');
  handle.tabIndex=0;
  handle.setAttribute('role','separator');
  handle.setAttribute('aria-label','调整导航栏宽度');
  handle.setAttribute('aria-orientation','vertical');
  board.id=id('project_navigation');
  handle.setAttribute('aria-controls',board.id);
  let min=0,max=0,preferred=null,drag=null;

  function setWidth(value,remember=true){
    if(value===null)workspace.style.removeProperty('--pg-navigation-width');
    const width=value===null?board.offsetWidth:Math.max(min,Math.min(max,Math.round(value)));
    if(value!==null)workspace.style.setProperty('--pg-navigation-width',width+'px');
    if(remember)preferred=value===null?null:width;
    handle.setAttribute('aria-valuenow',String(width));
  }
  const observer=new ResizeObserver(()=>{
    const width=workspace.clientWidth;
    if(!width)return;
    min=Math.min(184,Math.round(width*.34));
    max=Math.max(min,Math.min(Math.round(width*.64),width-handle.offsetWidth-280));
    handle.setAttribute('aria-valuemin',String(min));
    handle.setAttribute('aria-valuemax',String(max));
    setWidth(preferred,false);
  });
  observer.observe(workspace);
  signal.addEventListener('abort',()=>observer.disconnect(),{once:true});

  function finish(restore=false){
    const {pointerId,original}=drag;
    drag=null;
    delete workspace.dataset.resizing;
    if(restore){
      preferred=original;
      setWidth(original,false);
    }
    if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);
  }
  handle.addEventListener('pointerdown',event=>{
    if(drag||!event.isPrimary||event.button!==0)return;
    handle.setPointerCapture(event.pointerId);
    handle.focus({preventScroll:true});
    drag={pointerId:event.pointerId,x:event.clientX,width:board.offsetWidth,original:preferred};
    workspace.dataset.resizing='';
    event.preventDefault();
  },{signal});
  handle.addEventListener('pointermove',event=>{
    if(drag?.pointerId===event.pointerId)setWidth(drag.width+event.clientX-drag.x);
  },{signal});
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    handle.addEventListener(type,event=>{
      if(drag?.pointerId===event.pointerId)finish(type!=='pointerup');
    },{signal});
  }
  handle.addEventListener('dblclick',()=>setWidth(null),{signal});
  handle.addEventListener('keydown',event=>{
    if(drag){
      if(event.key!=='Escape')return;
      finish(true);
    }else if(event.key==='Home'||event.key==='End'){
      setWidth(event.key==='Home'?min:max);
    }else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      setWidth(board.offsetWidth+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?32:8));
    }else return;
    event.preventDefault();
  },{signal});
  return handle;
}

export function createGovernanceManagement({sdk,docLink,icon,contextMenu,contextLink=null,canPreview=null,renderMarkdown,renderDomainSummary=null,onChange=null,onPrepare,onNavigate=null,onLocationChange=null,onLifecycle=null,onProjectActionsChange=null,onInspirationChange=null,headless=false}){
  const listeners=new Set();let snapshot=null;
  function emit(){snapshot=null;for(const fn of listeners)fn();}
  const node=el('div','pm-workspace pg-workspace');
  let selected=null,key='',record=null,drafts=new Map(),editing=null,error='',notice='',busy=false,alive=true,generation=0,conflict=null,storage='',pendingRequest=null;
  let hierarchyRecord,hierarchy,activePath=null,contextPreview=null,contextRequest=0,pendingReadingLocation=null;
  let projectDurationRequest=null,contextView,projectContextView;
  let manualSaveJob=null;
  let detailSaveTimer,detailSaveJob=null,detailSaveIssue=null,detailsSaved=false,detailComposing=false;
  const fileDrafts=createContextDrafts(sdk),fileTreeStates=new Map(),projectPlanStates=new Map(),readingPositions=new Map();
  let navigationPosition=0;
  const reviewSession=randomId();
  let selectedDoc,selectedBranch;
  const objectHistory=[];
  let historyIndex=-1;
  const workspace=el('div','pg-card-workspace');
  const navigation=el('nav','pg-object-navigation');
  navigation.setAttribute('aria-label','对象导航');
  navigation.tabIndex=-1;
  navigation.hidden=true;
  function historyButton(label,offset,symbol){
    const control=button('',()=>moveThroughHistory(offset),'pg-object-history-button');
    control.append(icon(symbol));
    control.setAttribute('aria-label',label);
    control.title=label;
    return control;
  }
  const historyControls=el('div','pg-object-history');
  const historyBack=historyButton('后退',-1,'previous');
  const historyForward=historyButton('前进',1,'next');
  historyControls.append(historyBack,historyForward);
  const breadcrumbs=el('ol','pg-object-breadcrumbs');
  function projectAction(label,symbol,action){
    const control=button('',action,'pg-object-project-action');
    control.append(icon(symbol),el('span','',label));
    return control;
  }
  const board=el('nav','pg-card-board');
  board.setAttribute('aria-label','项目工作导航');
  const treeHeader=el('header','pg-object-tree-header');
  treeHeader.append(el('h2','','项目 · 里程碑 · 任务'));
  const treeList=el('ol','pg-object-tree-list');
  board.append(treeHeader,treeList);
  board.addEventListener('scroll',()=>{if(board.getClientRects().length&&board.clientHeight)navigationPosition=board.scrollTop;});
  const motion=new AbortController();
  const cardMotion=followPointer(board,motion.signal);
  navigation.append(historyControls,breadcrumbs);
  const detailPane=el('div','pg-card-detail-pane');
  const selectedBody=el('section','pg-card-details');
  selectedBody.setAttribute('aria-label','当前对象详情');
  detailPane.append(selectedBody);
  const objectSplitter=navigationSplitter(workspace,board,motion.signal);
  let narrowObjects=false,showObjects=false;
  const objectToggle=button('浏览项目对象',()=>showObjectNavigation(!showObjects,true),'pg-object-view-toggle');
  function showObjectNavigation(open,focus=false){
    showObjects=open;board.hidden=narrowObjects&&!open;detailPane.hidden=narrowObjects&&open;objectSplitter.hidden=narrowObjects;objectToggle.hidden=!narrowObjects;
    workspace.dataset.objectLayout=narrowObjects?'narrow':'wide';objectToggle.textContent=open?'返回对象详情':'浏览项目对象';objectToggle.setAttribute('aria-expanded',String(narrowObjects&&open));
    if(focus)requestAnimationFrame(()=>{if(!alive||!sdk.getSnapshot().active)return;const target=open?board.querySelector('[aria-current],button'):selectedBody.querySelector('h3');if(target){if(!target.matches('button'))target.tabIndex=-1;target.focus({preventScroll:true});}else objectToggle.focus();});
  }
  const objectObserver=new ResizeObserver(()=>{if(pendingReadingLocation)restoreReadingPosition();const next=workspace.getBoundingClientRect().width<600;if(next===narrowObjects)return;const active=document.activeElement;narrowObjects=next;showObjectNavigation(false);if(active&&workspace.contains(active)&&active.closest('[hidden]'))objectToggle.focus({preventScroll:true});});
  objectObserver.observe(workspace);motion.signal.addEventListener('abort',()=>objectObserver.disconnect(),{once:true});
  board.addEventListener('keydown',event=>{if(narrowObjects&&showObjects&&event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();showObjectNavigation(false);objectToggle.focus();}},{signal:motion.signal});
  workspace.append(objectToggle,board,objectSplitter,detailPane);showObjectNavigation(false);

  const notes=createInspiration({sdk,docLink,headless,onDrawerChange:onInspirationChange,onSaved:(r,path)=>{if(r)record=r;for(const view of contextViews())view.observeOpened(path);onChange?.();if(headless)emit();}});
  const contextViews=()=>[...new Set([contextView,projectContextView].filter(Boolean))];
  const evidenceJobs=new Set();
  const call=(method,extra={})=>sdk.call('governance.'+method,{...selected,...extra});
  const readOnly=()=>selected?.scope==='archived'||record?.valid===false||record?.readOnly||record?.project.metadata.governance_schema!==2||!record?.stateModel||!Array.isArray(record?.contextEntries)||record?.documents.some(d=>d.metadata.kind==='milestone'&&d.metadata.task_stages?.length)&&!record?.taskNumbering?.supported;
  const readOnlyLabel=()=>record?.valid===false?'项目诊断 · 只读':selected?.scope==='archived'?'归档项目 · 只读':'当前格式 · 只读';
  const statesFor=m=>record?.stateModel?.states?.[m.kind]??[m.status];
  function changedDrafts(){return [...drafts.values()].filter(d=>Object.keys(d.evidenceInputs??{}).length||!d.base||!same(documentValue(d.base),d.value));}
  function persist(){if(!storage)return;try{const saved=changedDrafts();if(saved.length||pendingRequest)sessionStorage.setItem(storage,JSON.stringify({drafts:saved,pendingRequest}));else sessionStorage.removeItem(storage);}catch{error='浏览器无法保留草稿，请复制未保存内容后再关闭窗口。';}}
  function modified(){
    notice='';conflict=null;
    if(detailSaveIssue&&['DETAIL_INPUT','PROJECT_GOVERNANCE_INVALID','PROJECT_GOVERNANCE_INPUT','PROJECT_GOVERNANCE_NOT_READY'].includes(detailSaveIssue.code))detailSaveIssue=null;
    persist();syncSavebar();scheduleDetailSave();
  }
  const autoKind=kind=>['project','milestone','task'].includes(kind);
  function automaticDrafts(){
    return changedDrafts().filter(draft=>{
      if(draft.requiresReviewSave)return false;
      if(!autoKind(draft.value.metadata.kind))return false;
      const review=draft.value.metadata.review_ref;
      return !review||record.documents.some(d=>d.path===review.path)||!drafts.has(review.path);
    });
  }
  const detailsChanged=()=>!!record&&automaticDrafts().length>0;
  function scheduleDetailSave(){
    clearTimeout(detailSaveTimer);
    if(!alive||!record||readOnly()||conflict||detailSaveIssue||!detailsChanged()||detailComposing)return;
    detailSaveTimer=setTimeout(()=>{if(!busy)void saveDetails();},800);
  }
  function syncDetailFeedback(){
    for(const target of node.querySelectorAll('[data-detail-save-feedback]')){
      target.replaceChildren();appendRecordFeedback(target);
      if(!detailSaveIssue)continue;
      const message=el('div','pm-error',detailSaveIssue.message);message.setAttribute('role','alert');
      const conflictError=detailSaveIssue.code==='PROJECT_GOVERNANCE_CONFLICT',otherPending=detailSaveIssue.code==='PENDING_OTHER';
      message.append(' ',button(otherPending?'核对保存回执':conflictError?'核对并合并':'重试自动保存',()=>{
        if(otherPending){void save();return;}
        if(conflictError)void compare(true);
        else{detailSaveIssue=null;void flushDetailSave();}
      }));target.append(message);
    }
  }
  async function saveDetails(){
    if(detailSaveJob)return detailSaveJob;
    if(busy||readOnly()||conflict||detailSaveIssue||!detailsChanged())return;
    const g=generation,target={...selected};
    if(pendingRequest?.changes.some(change=>!autoKind((drafts.get(change.path)?.value??record.documents.find(d=>d.path===change.path))?.metadata.kind))){
      detailSaveIssue={code:'PENDING_OTHER',message:'复盘还有保存结果待核对，请先处理该对象的草稿。'};syncSavebar();return;
    }
    detailSaveJob=Promise.resolve().then(async()=>{
      let applying=false;
      try{
        if(!pendingRequest){
          while(evidenceJobs.size)await Promise.all([...evidenceJobs]);
          if(!alive||g!==generation)return;
          const saved=automaticDrafts();if(!saved.length)return;
          if(saved.some(draft=>Object.keys(draft.evidenceInputs??{}).length))throw Error('验收证据输入尚未完成，请核对路径或网页版本。');
          const snapshots=saved.map(draft=>({draft,before:structuredClone(draft.value),value:structuredClone(draft.value)}));
          for(const {draft,before,value}of snapshots){
            if(!draft.verificationChanged||value.metadata.kind!=='task'||!value.metadata.verification)continue;
            const {digest:basis}=await sdk.call('governance.criteria-digest',{...target,criteria:value.metadata.criteria??[]});
            if(!alive||g!==generation)return;
            value.metadata.verification.basis_digest=basis;
            if(same(draft.value.metadata.criteria,before.metadata.criteria)&&same(draft.value.metadata.verification,before.metadata.verification))draft.value.metadata.verification.basis_digest=basis;
          }
          const changes=snapshots.map(({draft,value})=>({path:draft.path,ifMatch:draft.base?.etag??'missing',metadata:value.metadata,body:value.body}));
          const relation=snapshots.filter(({value})=>value.metadata.kind==='project').map(({draft,value})=>projectParentChange({...draft,value})).find(Boolean);
          pendingRequest=structuredClone({operationId:id('detail_auto_save'),ifMatch:record.etag,changes,...(relation?{setParent:relation}:{})});
        }
        persist();
        const submitted=structuredClone(pendingRequest);applying=true;
        const result=await sdk.call('governance.apply',{...target,data:submitted});
        if(!alive||g!==generation)return;
        for(const sent of submitted.changes){
          const draft=drafts.get(sent.path),latest=result.documents.find(doc=>doc.path===sent.path);
          if(!latest)throw Error('保存回执缺少对象原件，请核对最新版本。');
          if(!draft)continue;
          adoptSavedDocument(draft,sent,latest);
          if(latest.metadata.kind==='project')projectContextView?.updateProject(latest);
          else if(contextView?.path===latest.path)contextView.updateProject(latest);
        }
        record=result;pendingRequest=null;detailSaveIssue=null;detailsSaved=true;
        if(submitted.changes.some(change=>change.path===editing)){notice='';error='';}
        persist();
        hierarchyRecord=record;hierarchy=projectCardHierarchy(record);
        selectedBranch=hierarchy.branches.find(b=>b.milestone.path===activePath||b.tasks.some(t=>t.path===activePath));
        selectedDoc=selectedBranch?.tasks.find(t=>t.path===activePath)??selectedBranch?.milestone??hierarchy.project;
        if(!headless&&!board.contains(document.activeElement)){renderObjectNavigationList();renderObjectNavigation();}
        projectPlanStates.get(record.project.path)?.refresh?.();
      }catch(e){
        if(!alive||g!==generation)return;
        detailSaveIssue={code:e.code??(applying?undefined:'DETAIL_INPUT'),message:e.message+(e.recoveryId?'；请先核对恢复操作 '+e.recoveryId:'')};
        if(!e.recoveryId&&['PROJECT_GOVERNANCE_CONFLICT','PROJECT_GOVERNANCE_INVALID','PROJECT_GOVERNANCE_INPUT','PROJECT_GOVERNANCE_NOT_READY','PROJECT_GOVERNANCE_ARCHIVED'].includes(e.code))pendingRequest=null;
        persist();
      }finally{
        if(alive&&g===generation){detailSaveJob=null;syncSavebar();scheduleDetailSave();}
      }
    });
    syncSavebar();return detailSaveJob;
  }
  async function flushDetailSave(){
    clearTimeout(detailSaveTimer);
    if(detailComposing)return false;
    if(detailSaveJob)await detailSaveJob;
    while(alive&&record&&!busy&&!readOnly()&&!conflict&&!detailSaveIssue&&detailsChanged()){
      await saveDetails();clearTimeout(detailSaveTimer);
    }
    return !detailsChanged();
  }
  node.addEventListener('compositionstart',event=>{if(event.target.closest('[data-auto-document]')){detailComposing=true;clearTimeout(detailSaveTimer);}});
  node.addEventListener('compositionend',()=>{if(detailComposing){detailComposing=false;scheduleDetailSave();}});
  node.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'&&event.target.closest('[data-auto-document]')){event.preventDefault();void flushDetailSave();}});
  function restoreReadingPosition(){
    const location=pendingReadingLocation,token=generation;if(!location)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(!alive||token!==generation||pendingReadingLocation!==location||activePath!==location.objectPath)return;
      const reader=selectedBody.querySelector('.pg-project-context-reader')??selectedBody;
      if(!reader.getClientRects().length||!reader.clientHeight)return;
      reader.scrollTop=location.objectScroll??0;readingPositions.set(activePath,reader.scrollTop);board.scrollTop=location.navigationScroll??0;navigationPosition=location.navigationScroll??0;pendingReadingLocation=null;
    }));
  }
  function restoreLocation(location){
    if(!location||!record)return;
    leaveContextEditor();clearPreview();
    if(['plan','progress','materials'].includes(location.projectTab)){let state=projectPlanStates.get(record.project.path);if(!state){state={};projectPlanStates.set(record.project.path,state);}state.tab=location.projectTab;}
    const document=[record.project,...record.documents].find(item=>item.path===location.objectPath);
    if(document){activePath=document.path;draw();}
    else if(location.objectPath){notice='先前查看的对象已不可用，已返回项目总览。';activePath=record.project.path;draw();}
    pendingReadingLocation={...location,objectPath:activePath};restoreReadingPosition();
  }
  async function select(project,detail,{historyTarget,restoreLocation:location}={}){
    const next=project.scope+':'+project.name;
    if(next!==key){await flushDetailSave();await notes.flush();}
    projectDurationRequest=null;
    if(next===key&&record){
      if(detail?.governance&&!busy&&!pendingRequest&&!changedDrafts().length){
        record=detail.governance;
        draw();
      }
      restoreLocation(location);return;
    }
    if(contextView!==projectContextView)contextView?.dispose();
    projectContextView?.dispose();
    projectContextView=null;
    contextView=null;
    fileDrafts.state(project);
    board.scrollTop=0;
    persist();selected=project;key=next;const g=++generation;record=null;drafts=new Map();editing=null;notes.select(project);activePath=null;clearPreview();error='';notice='';busy=false;conflict=null;pendingRequest=null;detailSaveIssue=null;detailsSaved=false;detailComposing=false;storage=sdk.appId+':governance:'+sdk.instanceId+':'+key;draw();
    try{const result=detail?.governance??await call('read');if(!alive||g!==generation)return;record=result;
      try{const raw=JSON.parse(sessionStorage.getItem(storage)??'[]'),saved=Array.isArray(raw)?raw:raw.drafts;pendingRequest=Array.isArray(raw)?null:raw.pendingRequest??null;if(!Array.isArray(saved))throw Error('invalid');for(const d of saved){if(typeof d.path!=='string'||!d.value?.metadata||typeof d.value.body!=='string')throw Error('invalid');drafts.set(d.path,d);}if(drafts.size)notice='已恢复本窗口未保存草稿；保存时将核对最新原件。';}catch{error='窗口草稿损坏，已保留原始存储，请先备份。';}
      const target=objectHistory[historyTarget];
      const restoring=target?.key===key;
      if(restoring){
        historyIndex=historyTarget;
        activePath=target.path;
      }else rememberLocation(record.project.path);
      draw();
      if(restoring&&target.context&&activePath===target.path){
        contextView?.openEntry(target.context,{remember:false});
      }
      restoreLocation(location);
    }catch(e){if(alive&&g===generation){error=e.message;draw();}}
  }
  function section(title,description){const s=el('section','pm-section'),h=el('header','pm-section-heading'),left=el('div');left.append(el('h2','',title));if(description)left.append(el('p','kp-muted',description));h.append(left);s.append(h);return s;}
  function contextTree(entries,fileLink=entry=>contextLink?.(entry)??docLink(entry.name,entry.path),options={}){
    const list=el('ul','pg-context-tree');
    for(const entry of entries){
      const item=el('li');
      if(entry.kind==='file')item.append(fileLink(entry));
      else{
        const folder=el('details'),body=el('div');
        folder.append(options.folderSummary?.(entry)??el('summary','',entry.name),body);
        let loaded=false,loading=false;
        async function load(){
          if(loaded||loading)return;
          loading=true;
          body.replaceChildren(el('p','kp-muted','正在读取目录…'));
          try{
            const {entries}=await (options.loadDirectory?.(entry.path)??call('context-list',{data:{path:entry.path}}));
            const children=entries.map(child=>({...child,owner:child.owner??entry.owner}));
            body.replaceChildren(children.length?contextTree(children,fileLink,options):el('p','kp-muted','目录为空'));
            loaded=true;
          }catch(e){body.replaceChildren(el('p','pm-error',e.message),button('重试',load));}
          finally{loading=false;}
        }
        folder.addEventListener('toggle',()=>{if(folder.open)void load();});
        item.append(folder);
      }
      list.append(item);
    }
    return list;
  }
  function numberedContexts(path){
    const entries=record.contextEntries?.filter(entry=>entry.owner.path===path)??[];
    const panel=document.createDocumentFragment();
    if(entries.length){
      const group=section(labels[entries[0].owner.kind]+'上下文');
      group.append(contextTree(entries));
      panel.append(group);
    }
    return panel;
  }
  function draftFor(d){let value=drafts.get(d.path);const pending=pendingRequest?.changes.some(change=>change.path===d.path);if(!value||!pending&&value.base?.etag!==d.etag&&documentForReading(d,value)===d){value={path:d.path,base:structuredClone(d),value:documentValue(d)};drafts.set(d.path,value);}return value;}
  function open(d){clearPreview();editing=d.path;draftFor(d);draw();}
  async function openNote(d,entry){
    if(busy)return;
    entry??={path:parent(d.path)+'/灵感闪现.md',name:'灵感闪现.md',kind:'file',format:'markdown'};
    const view=contextView;
    await notes.open(d);
    if(notes.loaded()&&view===contextView)void view?.markRead(entry);
  }
  const saveDisabled=()=>busy||!!detailSaveJob||!changedDrafts().length||!!conflict;
  const draftStatus=()=>readOnly()?readOnlyLabel():autoKind(drafts.get(editing)?.value.metadata.kind)?(detailSaveJob?'自动保存中…':detailSaveIssue?'未保存 · 草稿已保留':detailsChanged()?'待自动保存':detailsSaved?'已自动保存':'所有更改已保存'):changedDrafts().length?'本窗口有未保存修改':'原件已读取';
  function syncSavebar(){
    if(headless){emit();return;}
    const b=node.querySelector('[data-save-documents]');if(b)b.disabled=saveDisabled();
    const n=node.querySelector('[data-draft-label]');if(n)n.textContent=draftStatus();
    for(const label of node.querySelectorAll('[data-criterion-label]')){
      const draft=drafts.get(label.closest('[data-auto-document]')?.dataset.autoDocument);
      const criterion=draft?.value.metadata.criteria?.find(item=>item.id===label.dataset.criterionLabel);
      if(criterion)label.textContent=criterion.text;
    }
    syncDetailFeedback();
  }
  function badgesFor(m){const result=[chip(m.status)];if(m.kind!=='review'&&m.blocker&&!['completed','cancelled'].includes(m.status))result.push(el('span','pm-chip state-blocked','受阻'));if(m.kind==='task'&&record.projection?.readiness.some(r=>r.id===m.id&&r.ready))result.push(el('span','pm-ready','可开始'));if(record.stale?.includes(m.id))result.push(el('span','pm-chip state-review','待复核'));return result;}
  async function prepareTask(d){
    const source=generation;
    if(!await flushDetailSave()||!alive||source!==generation)return;
    const latest=record.documents.find(row=>row.path===d.path&&row.metadata.id===d.metadata.id);
    if(!latest)return;
    const prompt=taskProgressPrompt(latest,record,selected.name);
    if(prompt)onPrepare?.(prompt);
  }
  function readingRecord(){
    const documents=record.documents.map(d=>documentForReading(d,drafts.get(d.path)));
    for(const draft of drafts.values())if(!documents.some(d=>d.path===draft.path))documents.push({path:draft.path,...draft.value});
    return {...record,project:documentForReading(record.project,drafts.get(record.project.path)),documents};
  }
  async function prepareMilestone(d){
    const source=generation;
    if(!await flushDetailSave()||!alive||source!==generation)return;
    const latest=record.documents.find(row=>row.path===d.path&&row.metadata.id===d.metadata.id);
    const prompt=latest&&milestoneAcceptancePrompt(latest,record,selected.name);
    if(prompt)onPrepare?.(prompt);
  }
  function workSummary(subject){
    const view=readingRecord(),selection=workTasks(subject,view),section=el('section','pg-result-section pg-current-work');
    section.setAttribute('aria-label','当前任务');section.append(el('h3','','当前任务'));
    function row(task){
      const item=el('div','pg-result-task');item.append(button(taskLabel(task),()=>selectNode(task.path),'pg-card-action'),...badgesFor(task.metadata));
      if(subject.metadata.kind==='project')item.append(el('p','kp-muted','所属里程碑：'+(view.documents.find(d=>d.path===task.metadata.milestone.path)?.metadata.name??task.metadata.milestone.path)));
      const claim=view.executionClaims?.[task.metadata.id];if(claim)item.append(el('p','kp-muted',claim.error?'执行占用需核对：'+claim.error.message:'执行聊天：'+claim.chat_id+'；开始于 '+claim.acquired_at+'。接手前须核对旧运行。'));
      const sections=resultSections(task.body).sections,details=el('details','pg-work-records');details.append(el('summary','','结果与缺口'));
      for(const name of ['当前结果','未决与缺口'])details.append(el('p','kp-muted',name+'：'+(sections[name]||'尚未记录')));item.append(details);
      item.append(el('p','kp-muted','下一步：'+(task.metadata.next_action??'尚未记录')));
      const action=!readOnly()&&taskProgressAction(task,view);
      if(action)item.append(button('准备'+action.label+'对话',()=>prepareTask(task),'pg-card-action'));
      return item;
    }
    const explicit=selection.current.length?selection.current:selection.focused;
    if(!explicit.length)section.append(el('p','kp-muted','尚无明确当前任务。请结合下一项建议选择任务；查看或准备对话不会启动工作。'));
    else{
      if(!selection.current.length)section.append(el('p','kp-muted','以下为明确关注的任务；重点标记不等于执行授权。'));
      if(explicit.length>1)section.append(el('p','kp-muted','存在多项当前工作，请选择本次要接续的任务。'));
      for(const task of explicit)section.append(row(task));
    }
    if(selection.candidates.length){const candidates=el('details','pg-task-candidates');candidates.append(el('summary','','选择下一任务（'+selection.candidates.length+'）'));for(const task of selection.candidates)candidates.append(row(task));section.append(candidates);}
    return section;
  }
  function resultDetail(document,links=[]){
    const draft=drafts.get(document.path),d=documentForReading(document,draft),m=d.metadata;
    const parsed=resultSections(d.body),task=m.kind==='task';
    const article=el('article','pg-result-detail');article.setAttribute('aria-label',task?'任务结果':'里程碑进展');
    const unsaved=!!draft&&changedDrafts().some(item=>item.path===d.path);
    if(renderDomainSummary)article.append(renderDomainSummary(d,workspaceDomainFacts(d,record,{draft:unsaved}),{stale:unsaved||!!record.stale?.includes(m.id)}));
    else{const header=el('header','pg-result-heading'),heading=el('h2','',task?taskLabel(d):m.name);heading.tabIndex=-1;
      const states=el('div','pg-result-badges');states.append(...badgesFor(m));header.append(heading,states);article.append(header);}
    const feedback=el('div','pg-plan-feedback');feedback.dataset.detailSaveFeedback='';article.append(feedback);queueMicrotask(syncDetailFeedback);
    const claim=task&&record.executionClaims?.[m.id];if(claim)article.append(el('p','kp-muted',claim.error?'执行占用需核对：'+claim.error.message:'当前执行聊天：'+claim.chat_id+'；开始于 '+claim.acquired_at+'。其他聊天可查阅，执行前须明确接手并核对旧运行。'));
    const actions=el('div','pg-result-actions');
    if(!readOnly()){
      actions.append(button(task?'编辑任务':'编辑里程碑',()=>{open(document);selectedBody.querySelector('.pg-editor h2')?.focus({preventScroll:true});},'pg-card-action'));
      if(task)actions.append(button('维护验收',()=>{open(document);const box=selectedBody.querySelector('.pm-results-editor');box?.querySelector('select,input,textarea,button')?.focus({preventScroll:true});box?.scrollIntoView({block:'start'});},'pg-card-action'));
      const action=task?taskProgressAction(d,record):null;
      if(action)actions.append(button('准备'+action.label+'对话',()=>prepareTask(d),'pg-card-action'));
      if(!task&&milestoneAcceptancePrompt(d,record,selected.name))actions.append(button('准备阶段验收对话',()=>prepareMilestone(d),'pg-card-action'));
    }
    article.append(actions);
    if(draft&&changedDrafts().some(item=>item.path===d.path))article.append(el('p','pm-notice','包含本窗口未保存的草稿，请先核对保存结果。'));
    function panel(title,text){const section=el('section','pg-result-section');section.append(el('h3','',title),text?renderMarkdown(text,links):el('p','kp-muted','尚未记录'));article.append(section);return section;}
    const goal=panel(task?'目标与完成标准':'阶段目标与完成标准',parsed.sections['目标']);
    const criteria=el('ul','pg-result-criteria');for(const criterion of m.criteria??[]){const result=m.verification?.results?.find(r=>r.criterion_id===criterion.id);if(renderDomainSummary&&!result)continue;const row=el('li','',criterion.text);if(task&&result)row.append(el('span','pg-card-muted',' · 验收记录：'+(labels[result.result]??result.result)+(m.status!=='completed'||record.stale?.includes(m.id)||unsaved?'（待按当前条件核对）':'')));criteria.append(row);}if(criteria.childNodes.length){if(renderDomainSummary)goal.append(el('h4','','逐项验收记录'));goal.append(criteria);}
    panel(task?'当前结果':'当前判断',parsed.sections['当前结果']);
    const gaps=panel('未决与缺口',parsed.sections['未决与缺口']);
    if(m.blocker)gaps.append(el('p','pm-error','受阻：'+m.blocker));
    if(m.resume_condition)gaps.append(el('p','kp-muted','恢复条件：'+m.resume_condition));
    if(task){
      const action=taskProgressAction(d,record);for(const reason of action?.reasons??[])gaps.append(el('p','kp-muted',reason));
      panel('下一步',['completed','cancelled'].includes(m.status)?'本任务已结束。项目下一项建议见所属里程碑。':m.next_action);
      const milestone=record.documents.find(row=>row.path===m.milestone?.path&&row.metadata.id===m.milestone?.id&&row.metadata.kind==='milestone');
      if(milestone&&['completed','cancelled'].includes(m.status))article.append(button('查看所属里程碑与建议',()=>selectNode(milestone.path),'pg-card-action'));
      const refs=section('成果与证据','直接引用现有原件');const seen=new Set();for(const ref of [...(m.result_refs??[]),...evidenceReferences(m)]){const key=(ref.path??ref.url)+'|'+(ref.digest??ref.version??'current');if(seen.has(key))continue;seen.add(key);if(ref.path){const label=ref.role??ref.path.split('/').at(-1);const control=button(label,()=>contextView.openEntry({...ref,kind:'file',name:label}),'kp-source-link');if(ref.digest)control.title='固定证据版本：'+ref.digest;refs.append(control);}else if(ref.url){let url;try{url=new URL(ref.url);}catch{continue;}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;const link=el('a','kp-source-link',ref.role??ref.url);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';if(ref.version)link.title='记录版本：'+ref.version;refs.append(link);}}if(!seen.size)refs.append(el('p','kp-muted','尚未记录'));article.append(refs);
    }else{
      const tasks=milestoneTasks(d,record);
      article.append(workSummary(d));
      const unfinished=tasks.filter(row=>!['completed','cancelled'].includes(row.metadata.status));
      if(unfinished.length){gaps.append(el('p','kp-muted','以下任务尚未结束；完成数量不代表阶段目标达成。'));for(const row of unfinished)gaps.append(button(taskLabel(row),()=>selectNode(row.path),'pg-card-action'));}
      panel('下一项建议',m.next_action);article.append(el('p','kp-muted','建议供选择；准备或查看对话不会自动启动下一任务。每个里程碑由用户明确确认后完成。'));
    }
    if(parsed.original&&parsed.original!=='# '+m.name){const original=el('details','pg-result-original');original.append(el('summary','','原始说明'),renderMarkdown(parsed.original,links));article.append(original);}
    return article;
  }
  function clearPreview(){
    contextRequest++;
    contextPreview=null;
  }
  function isContextEditing(){
    if(!editing||!activePath)return false;
    const owner=activePath===record?.project.path?record.project:record?.documents.find(item=>item.path===activePath);
    return owner&&contextOwners(record,owner).some(doc=>editing===doc.path||reviewDocument(doc)?.path===editing||editing===reviewPath(doc));
  }
  function leaveContextEditor(){
    if(!isContextEditing())return;
    editing=null;
    conflict=null;
    persist();
  }
  function rememberLocation(path,context=null){
    const current=objectHistory[historyIndex];
    if(current?.key===key&&current.path===path&&current.context?.path===context?.path)return;
    objectHistory.splice(historyIndex+1,objectHistory.length,{key,project:selected,path,context});
    if(objectHistory.length>100)objectHistory.shift();
    historyIndex=objectHistory.length-1;
    queueMicrotask(()=>onLocationChange?.());
  }
  function moveThroughHistory(offset){
    const nextIndex=historyIndex+offset;
    const target=objectHistory[nextIndex];
    if(!target)return;
    if(target.key!==key){
      onNavigate?.(target.project,{historyTarget:nextIndex});
      return;
    }
    historyIndex=nextIndex;
    leaveContextEditor();
    clearPreview();
    activePath=target.path;
    queueMicrotask(()=>onLocationChange?.());
    selectedBody.scrollTop=0;
    renderBoard();
    if(target.context&&activePath===target.path)contextView?.openEntry(target.context,{remember:false});
  }
  function selectNode(path,{fromNavigation=false}={}){
    pendingReadingLocation=null;
    const closeNavigation=narrowObjects&&showObjects;
    if(path===activePath&&!contextPreview){if(closeNavigation)showObjectNavigation(false,true);return;}
    rememberLocation(path);
    leaveContextEditor();
    clearPreview();
    activePath=path;
    selectedBody.scrollTop=0;
    renderBoard({focusRow:fromNavigation});
    if(closeNavigation)showObjectNavigation(false,true);
    if(!fromNavigation)selectedBody.querySelector('.pg-project-context-title h3')?.focus({preventScroll:true});
  }
  async function previewContext(entry,{remember=true,edit=false}={}){
    if(remember&&contextPreview?.entry.reason!=='deleted'&&contextPreview?.entry.path===entry.path&&contextPreview?.entry.digest===entry.digest&&(contextPreview.file||contextView?.isOpen(entry.path)))return;
    leaveContextEditor();
    if(remember)rememberLocation(activePath,entry);
    const token=++contextRequest;
    const view=contextView;
    const show=state=>{
      contextPreview=state;
      renderObjectNavigation();
      view.show(state);
    };
    if(view.canOpenFile?.(entry)){show({entry,edit});return;}
    show({entry});
    try{
      const raw=!/\.md$/i.test(entry.path);
      const file=await sdk.call('file',{...selected,path:entry.path,raw,...(entry.digest?{digest:entry.digest}:{})});
      if(alive&&token===contextRequest)show({entry,file,raw});
    }catch(error){
      if(alive&&token===contextRequest)show({entry,error:error.message});
    }
  }
  function sourceEntries(d){
    const entries=new Map();
    for(const entry of record.contextEntries??[]){
      if(entry.owner?.path===d.path)entries.set(entry.path,entry);
    }
    for(const ref of [...(d.metadata.context_refs??[]),...(d.metadata.result_refs??[]),...evidenceReferences(d.metadata)]){
      const key=ref.path??ref.url;
      if(key&&!entries.has(key))entries.set(key,{...ref,kind:'file',name:ref.role??ref.path?.split('/').at(-1)??ref.url});
    }
    const ownContext=entry=>entry.path?.startsWith(parent(d.path)+'/');
    return [...entries.values()].sort((a,b)=>Number(!!ownContext(b))-Number(!!ownContext(a)));
  }
  function contextReader(d){
    const kind=d.metadata.kind;
    const name=labels[kind]+'上下文';
    const panel=el('section','pg-project-context');
    panel.setAttribute('aria-label',name);
    const heading=el('header','pg-project-context-heading');
    const editorActions=el('div','pg-project-context-actions');
    editorActions.setAttribute('role','group');
    editorActions.setAttribute('aria-label','当前页面操作');

    const projectTarget={...selected};
    const projectRoot=parent(record.project.path)+'/';
    const owners=contextOwners(record,d),contextRoots=contextScopes(record,d);
    const ownerFor=path=>owners.find(owner=>owner.path===contextScopeForPath(contextRoots,path)?.objectPath)??d;
    const rootEntry={kind:'file',path:d.path,name:d.path.split('/').at(-1)};
    const split=el('div','pg-project-context-split');
    const list=el('nav','pg-project-context-list');
    list.id=id('context_list');
    list.setAttribute('aria-label','上下文文件列表');
    const reader=el('article','pg-project-context-reader');
    reader.addEventListener('scroll',()=>{if(reader.getClientRects().length&&reader.clientHeight)readingPositions.set(d.path,reader.scrollTop);});
    reader.id=id('context_reader');
    reader.setAttribute('aria-label','上下文文件内容');
    reader.tabIndex=0;
    const fileTitle=el('nav','pg-project-context-title');
    fileTitle.setAttribute('aria-label','文档路径');
    const fileTrail=el('ol','pg-context-breadcrumbs');
    const title=el('h3');
    title.tabIndex=-1;
    title.setAttribute('aria-current','page');
    const leaf=el('li','pg-context-current');
    leaf.append(title);
    fileTitle.append(fileTrail);
    const status=el('span','pg-card-muted pg-file-editor-state');
    status.setAttribute('role','status');
    const content=el('div','pg-project-context-content');
    heading.append(fileTitle,status,editorActions);
    reader.append(content);
    split.append(list,reader);
    panel.append(heading,split);

    function updateSelection(path){
      for(const control of list.querySelectorAll('[data-context-path]')){
        const active=control.dataset.contextPath===path;
        control.toggleAttribute('data-preview-active',active);
        if(control.hasAttribute('aria-pressed'))control.setAttribute('aria-pressed',String(active));
      }
    }
    let visiblePath=d.path,current,fileWorkspace;
    let primary={entry:rootEntry,file:{path:d.path,body:d.body}};
    const rootLabel=kind==='project'?'项目方案':labels[kind]+'详情';
    const showInFileNavigation=entry=>typeof entry.path!=='string'||!owners.some(owner=>{
      const latest=record.documents.find(doc=>doc.path===owner.path)??owner;
      return entry.path===owner.path||entry.path===parent(owner.path)+'/灵感闪现.md'
        ||entry.path===reviewPath(owner)||entry.path===reviewDocument(latest)?.path;
    });
    const displayName=entry=>{const owner=ownerFor(entry.path),kind=owner.metadata.kind;
      return entry.path===owner.path?(kind==='project'?'项目方案':labels[kind]+'详情')
        :entry.path===parent(owner.path)+'/灵感闪现.md'?'灵感闪现'
        :entry.path===(reviewDocument(owner)?.path??reviewPath(owner))?labels[kind]+'复盘':entry.name;
    };
    if(!fileTreeStates.has(d.path))fileTreeStates.set(d.path,{openFolders:new Set()});
    const fileState=fileTreeStates.get(d.path);
    const navToggle=editorAction('文件导航','sidebar',()=>{
      fileState.expanded=navToggle.getAttribute('aria-expanded')!=='true';
      updateNavigation();
    });
    navToggle.classList.add('pg-file-collapse');
    navToggle.setAttribute('aria-controls',list.id);
    const unread=el('span','pg-file-toggle-count');
    unread.hidden=true;
    unread.setAttribute('aria-hidden','true');
    navToggle.append(unread);
    heading.prepend(navToggle);
    let compact=false;
    const sizeObserver=new ResizeObserver(([entry])=>{
      compact=entry.contentRect.width<=530;
      updateNavigation();
    });
    sizeObserver.observe(panel);
    function updateNavigation(){
      const expanded=fileState.expanded??!compact;
      list.toggleAttribute('data-file-collapsed',!expanded);
      const label=(expanded?'收起':'展开')+'文件导航'+(unread.hidden?'':'，'+unread.textContent+' 个未读');
      navToggle.title=label;
      navToggle.setAttribute('aria-label',label);
      navToggle.setAttribute('aria-expanded',String(expanded));
    }
    function updateUnread(count){
      unread.textContent=String(count);
      unread.hidden=!count;
      updateNavigation();
    }
    updateNavigation();
    panel.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||!compact||!list.contains(event.target))return;
      fileState.expanded=false;
      updateNavigation();
      navToggle.focus();
    });
    function openFolder(path){
      fileState.expanded=true;
      updateNavigation();
      if(fileWorkspace?.supported()){
        fileWorkspace.revealFolder(path);
        return;
      }
      const folder=list.querySelector('[data-context-folder="'+CSS.escape(path)+'"]');
      if(folder)folder.parentElement.open=true;
      (folder??list.querySelector('button,summary,a')??navToggle).focus();
    }
    function renderFileTrail(entry){
      const scope=contextScopeForPath(contextRoots,entry.path),inside=!!scope;
      const home=scope?scope.root+'/':projectRoot;
      const segments=entry.path.startsWith(home)?entry.path.slice(home.length).split('/').slice(0,-1):[];
      const crumbs=[];
      function add(label,path){
        const item=el('li');
        const control=path?button(label,()=>openFolder(path),'pg-context-crumb'):el('span','pg-context-crumb',label);
        control.title=label;
        item.append(control);
        crumbs.push(item);
      }
      add(inside?(contextRoots.length>1?labels[ownerFor(entry.path).metadata.kind]+'文件':'文件'):entry.path.startsWith(projectRoot)?'项目内引用':'引用原件',scope?.root??null);
      let path=home.slice(0,-1);
      for(const segment of segments){
        path+='/'+segment;
        add(segment,inside&&entry.reason!=='deleted'?path:null);
      }
      title.textContent=displayName(entry);
      title.title=entry.name;
      fileTrail.replaceChildren(...crumbs,leaf);
    }
    function selectFile(entry){
      visiblePath=entry.path;
      updateSelection(visiblePath);
      renderFileTrail(entry);
      status.textContent='';
      status.removeAttribute('title');
      delete status.dataset.draftLabel;
      delete status.dataset.saveState;
      fileWorkspace?.select(entry.path);
    }
    function show(state=primary){
      if(current===state)return;
      current=state;
      const {entry,file,raw,error,edit}=state;
      editorActions.replaceChildren();
      selectFile(entry);
      if(!file||entry.path!==d.path)reader.scrollTop=0;
      if(canOpenFile(entry)){
        content.replaceChildren(el('p','pg-card-muted','正在读取原文…'));
        void fileWorkspace.open(entry,{edit});
        return;
      }
      fileWorkspace?.reset();
      if(file){
        if(file.preview){
          const source='data:'+file.preview.mimeType+';base64,'+file.preview.base64;
          const download=el('a','kp-source-link','下载固定版本原件');download.href=source;download.download=entry.path.split('/').at(-1);
          if(file.preview.kind==='image'){const image=el('img','pg-file-image');image.alt=entry.name??'验收证据';image.src=source;content.replaceChildren(image,download);}
          else content.replaceChildren(el('p','pg-card-muted','此格式可下载所引用的固定版本。'),download);
          content.prepend(createFileReadOnlyNotice(fileReadOnlyNotice(record,entry,file,selected?.scope)));
          status.textContent='验收证据 · 只读';status.title=entry.digest;return;
        }
        const managed=record.valid!==false?record.documents.find(doc=>doc.path===entry.path&&['task','milestone'].includes(doc.metadata.kind)):null;
        const body=managed&&!raw?resultDetail(managed,file.links):raw?el('pre','pg-project-context-text',file.body):renderMarkdown(file.body,file.links);
        content.replaceChildren(body);
        const notice=fileReadOnlyNotice(record,entry,file,selected?.scope);
        if(notice){
          content.prepend(createFileReadOnlyNotice(notice));
          status.textContent=notice.title;status.title=entry.digest??notice.reason;
        }
        if(entry.path===rootEntry.path&&record.valid===false)appendRecordDiagnostics(content);
      }else if(error){
        content.replaceChildren(el('p','pg-card-error',error),button('重试读取',()=>void previewContext(entry),'pg-card-action'));
      }else content.replaceChildren(el('p','pg-card-muted','正在读取原文…'));
    }
    function editorAction(label,symbol,action){
      const control=button('',action,'pg-project-context-action');
      control.append(icon(symbol));
      control.title=label;
      control.setAttribute('aria-label',label);
      control.setAttribute('aria-controls',reader.id);
      return control;
    }
    function canOpenFile(entry){
      return !entry.digest&&fileWorkspace?.supported()&&!owners.some(owner=>owner.path===entry.path)&&!!entry.format;
    }
    function returnToPreview(entry){
      leaveContextEditor();
      reader.scrollTop=0;
      if(entry.path===rootEntry.path){
        show();
        title.focus({preventScroll:true});
      }else void previewContext(entry,{remember:false});
    }
    function managedEntry(path){
      return {kind:'file',format:'markdown',path,name:path.split('/').at(-1)};
    }
    function showEditor(){
      fileWorkspace?.reset();
      current=null;
      const document=editing===d.path?d:record.documents.find(item=>item.path===editing);
      const draft=document?draftFor(document):drafts.get(editing);
      if(!draft){editing=null;show();return;}
      const entry=editing===d.path?rootEntry:managedEntry(editing);
      selectFile(entry);
      if(autoKind(draft.value.metadata.kind)){status.dataset.draftLabel='';status.textContent=draftStatus();}
      if(autoKind(draft.value.metadata.kind)){
        status.setAttribute('role','status');
        editorActions.replaceChildren();content.replaceChildren();
        if(conflict){appendRecordFeedback(content);appendConflictControls(content);}
        else content.append(editor(draft,{inReader:true}));
        return;
      }
      const preview=editorAction('返回预览','previous',()=>returnToPreview(entry));
      const loadLatest=editorAction('加载最新版本','refresh',()=>void compare(true));
      loadLatest.disabled=busy;
      editorActions.replaceChildren(preview);
      if(!readOnly()){
        const saveChanges=editorAction(busy?'保存中…':'保存修改','save',save);
        saveChanges.classList.add('is-save');
        saveChanges.dataset.saveDocuments='';
        saveChanges.disabled=saveDisabled();
        editorActions.append(saveChanges);
      }
      editorActions.append(loadLatest);
      content.replaceChildren();
      if(conflict){
        appendRecordControls(content,{inReader:true});
        appendConflictControls(content);
      }else{
        content.append(editor(draft,{inReader:true}));
      }
    }
    const rowLabel=entry=>el('span','pg-project-context-label',displayName(entry));
    const loadProjectDirectory=path=>sdk.call('project-context-list',{...projectTarget,path});
    const loadNumberedDirectory=path=>sdk.call('governance.context-list',{...projectTarget,data:{path}});
    const options={
      async loadDirectory(path){
        const result=await (kind==='project'?loadProjectDirectory(path):loadNumberedDirectory(path));
        return {...result,entries:result.entries.filter(showInFileNavigation)};
      },
      folderSummary(entry){
        const summary=el('summary','pg-project-context-row');
        summary.dataset.contextFolder=entry.path;
        summary.append(icon('folder'),rowLabel(entry));
        return summary;
      }
    };
    function openEntry(entry,options={}){
      if(compact&&list.contains(document.activeElement)){
        fileState.expanded=false;
        updateNavigation();
        title.focus({preventScroll:true});
      }
      if(entry.digest){void previewContext(entry,options);return;}
      if(entry.reason==='deleted'){void previewContext(entry,{remember:false});return;}
      const owner=ownerFor(entry.path);
      if(entry.path===owner.path&&['task','milestone'].includes(owner.metadata.kind)){
        void (async()=>{
          const source=generation;
          if(!await flushDetailSave()||!alive||source!==generation)return;
          editing=null;persist();clearPreview();
          if(options.remember!==false)rememberLocation(d.path,owner.path===d.path?null:entry);
          current=undefined;
          show(owner.path===d.path?primary:{entry,file:{body:owner.body}});
          content.querySelector('h2')?.focus({preventScroll:true});
        })();
        return;
      }
      if(entry.path===owner.path&&record.valid!==false){
        if(!isContextEditing()||editing!==owner.path){
          leaveContextEditor();
          if(options.remember!==false)rememberLocation(d.path,owner.path===d.path?null:entry);
          clearPreview();
          editing=owner.path;draftFor(owner);
          renderObjectNavigation();
          showEditor();
          reader.scrollTop=0;
        }
        content.querySelector('h2')?.focus({preventScroll:true});
        void fileWorkspace?.seen(entry);
        return;
      }
      const review=reviewDocument(owner);
      if(record.valid!==false&&entry.path===review?.path){
        leaveContextEditor();
        if(options.remember!==false)rememberLocation(d.path,entry);
        open(review);
        content.querySelector('h2')?.focus({preventScroll:true});
        void fileWorkspace?.seen(entry);
      }else if(record.valid!==false&&entry.path===parent(owner.path)+'/灵感闪现.md')void openNote(owner,entry,options);
      else void previewContext(entry,options);
    }
    function fileRow(entry){
      if(!entry.path?.startsWith(projectRoot)||!canPreview?.(entry.path)){
        const link=contextLink?.(entry)??docLink(entry.name,entry.path);
        link.classList.add('pg-project-context-external');
        return link;
      }
      const opensEditor=entry.path===d.path&&record.valid!==false;
      const control=button('',()=>{
        if(opensEditor||entry.path!==d.path){openEntry(entry);return;}
        if(contextPreview){
          rememberLocation(d.path);
          clearPreview();
          renderObjectNavigation();
          reader.scrollTop=0;
          show();
        }
      },'pg-project-context-row');
      control.dataset.contextPath=entry.path;
      control.toggleAttribute('data-preview-active',entry.path===visiblePath);
      control.setAttribute('aria-controls',reader.id);
      if(opensEditor){
        control.dataset.projectEdit='';
        control.title=(readOnly()?'查看':'编辑')+rootLabel;
        control.setAttribute('aria-description',control.title);
      }else{
        control.setAttribute('aria-pressed',String(entry.path===visiblePath));
      }
      control.setAttribute('aria-label',displayName(entry)+(entry.path===rootEntry.path?' · '+entry.name:''));
      control.append(icon('file'),rowLabel(entry));
      return control;
    }
    const entries=kind==='project'?[]:sourceEntries(d).filter(showInFileNavigation);
    const tree=contextTree(entries,fileRow,options);
    list.append(tree);
    async function loadProjectEntries(){
      if(kind!=='project')return;
      const status=el('p','pg-project-context-empty','正在读取项目目录…');
      status.setAttribute('role','status');
      list.append(status);
      try{
        const {entries}=await loadProjectDirectory();
        if(alive){
          const extra=contextTree(entries.filter(showInFileNavigation),fileRow,options);
          tree.append(...extra.children);
          status.remove();
        }
      }catch(e){
        if(alive)status.replaceChildren(el('span','pg-card-error',e.message),' ',button('重试读取',()=>{status.remove();void loadProjectEntries();},'pg-card-action'));
      }
    }
    function loadPrimaryLinks(){
      if(!d.body?.includes(']('))return;
      const source=d;
      void sdk.call('file',{...projectTarget,path:d.path}).then(file=>{
        if(!alive||d!==source)return;
        const viewingPrimary=current===primary;
        primary={entry:rootEntry,file};
        const state=projectPlanStates.get(d.path);
        if(state){state.bodyLinks=file.links??[];state.refresh?.();}
        if(alive&&viewingPrimary&&panel.isConnected)show();
      }).catch(()=>{ /* The checked object body is already visible and can be opened at its source. */ });
    }
    loadPrimaryLinks();
    const primaryAction=editorAction(rootLabel,'file',()=>{if(!busy)openEntry(rootEntry);});
    primaryAction.classList.add('pg-file-plan-action');
    primaryAction.append(el('span','',rootLabel));
    primaryAction.disabled=busy;
    fileWorkspace=createContextFileWorkspace({
      sdk,project:projectTarget,rootPath:d.path,objectPath:d.path,contextRoots,rootLabel:labels[kind]+'根目录',list,content,actions:editorActions,status,reader,icon,iconButton:editorAction,
      docLink,drafts:fileDrafts,reviewSession,contextMenu,onOpen:openEntry,onFallback:loadProjectEntries,displayName,showInFileNavigation,
      onUnread:updateUnread,focusState:fileState,projectWritable:()=>!readOnly(),navigationAction:primaryAction,
      readOnlyNotice:(entry,file)=>fileReadOnlyNotice(record,entry,file,selected?.scope),
    });
    function updateProject(next){
      primaryAction.disabled=busy;
      if(next===d)return;
      d=next;
      const wasPrimary=current===primary;
      primary={entry:rootEntry,file:{path:d.path,body:d.body}};
      loadPrimaryLinks();
      if(wasPrimary)show();
    }
    return {panel,path:d.path,record,show,openEntry,openFolder,showEditor,canOpenFile,updateProject,primaryLinks:()=>primary.file.links??[],
      openPrimary:()=>openEntry(rootEntry),
      isOpen:path=>fileWorkspace?.isOpen(path),
      start:()=>fileWorkspace?.start(),dispose(){fileWorkspace?.dispose();sizeObserver.disconnect();},markRead:entry=>fileWorkspace?.seen(entry),
      mutating:()=>fileWorkspace?.mutating(),observeOpened:path=>fileWorkspace?.observeOpened(path),
      flushFileSave:()=>fileWorkspace?.flush(),resetFile:()=>{fileWorkspace?.reset({discard:true});current=undefined;},
    };
  }
  function appendContext(d){
    const previous=contextView;
    if(d.metadata.kind==='project'){
      projectContextView??=contextReader(d);
      contextView=projectContextView;
    }else if(contextView?.record!==record||contextView.path!==d.path)contextView=contextReader(d);
    if(previous&&previous!==contextView&&previous!==projectContextView)previous.dispose();
    if(d.metadata.kind==='project')contextView.updateProject(d);
    if(contextView.panel.parentNode!==selectedBody)selectedBody.replaceChildren(contextView.panel);
    contextView.start();
    if(d.metadata.kind==='project'&&record.valid!==false&&!contextPreview&&!isContextEditing()){
      editing=d.path;draftFor(d);
    }
    if(isContextEditing())contextView.showEditor();
    else contextView.show(contextPreview??undefined);
  }
  function projectMetrics(branches,stale){
    const metrics=el('div','pg-dashboard-metrics');
    const {total,completed:completedMilestones,fraction}=projectProgress(branches,stale);
    let progressDetail=total?'按 '+total+' 个里程碑等权计算':'暂无有效里程碑';
    if(total&&total<branches.length)progressDetail+=' · 不含已取消的里程碑';
    progressDetail+=' · 任务完成参考，不代表目标达成或已通过项目验收';
    const progress=projectMetricCard('progress','任务完成参考',dashboardRing(fraction),progressDetail);
    const milestones=projectMetricCard('milestones','里程碑数量',dashboardCount(branches.length),'已完成 '+completedMilestones+' 项');
    let totalTasks=0,completedTasks=0;
    for(const {milestone,tasks} of branches){
      const progress=stageProgress(milestone,tasks,stale);
      totalTasks+=progress.total;
      completedTasks+=progress.completed;
    }
    const tasks=projectMetricCard('tasks','任务数量',dashboardCount(totalTasks),'已完成 '+completedTasks+' 项');
    const durationValue=el('strong','pg-dashboard-value','—');
    const durationCard=projectMetricCard('duration','累计对话耗时',durationValue);
    metrics.append(progress,milestones,tasks,durationCard);
    void loadProjectDuration({card:durationCard,value:durationValue});
    return metrics;
  }

  function dashboardCount(count){
    const badge=el('span','pg-dashboard-count-badge');
    badge.append(el('strong','pg-dashboard-value',count+' 项'));
    return badge;
  }

  function dashboardRing(fraction){
    const ring=el('span','pg-dashboard-ring');
    ring.style.setProperty('--pct',(fraction??0)*100+'%');
    ring.append(el('strong','pg-dashboard-value',fraction===null?'—':Math.round(fraction*100)+'%'));
    return ring;
  }

  function projectMetricCard(kind,title,visual,detail){
    const card=el('section','pg-project-panel pg-dashboard-tile');
    card.dataset.metric=kind;
    const body=el('div','pg-dashboard-visual');
    body.append(visual);
    card.append(el('h3','',title),body);
    if(detail)setMetricDetail(card,detail);
    return card;
  }

  function setMetricDetail(card,detail){
    card.title=detail;
    card.firstElementChild.setAttribute('aria-description',detail);
  }

  function showProjectDuration({value,card},activity){
    const duration=activity.duration;
    if(!duration){
      setMetricDetail(card,'当前 Core 暂不支持计时');
      return;
    }
    const {totalMs,measuredTurns,unmeasuredTurns}=duration;
    const seconds=Math.floor(totalMs/1000);
    const parts=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60];
    if(measuredTurns){
      value.textContent=parts.map(part=>String(part).padStart(2,'0')).join(':');
      const spokenTime=parts[0]+' 小时 '+parts[1]+' 分 '+parts[2]+' 秒';
      value.setAttribute('aria-label',spokenTime);
      value.title=spokenTime;
    }
    const details=[measuredTurns?'全部历史 · '+measuredTurns+' 轮':'暂无可计时轮次'];
    if(unmeasuredTurns)details.push(unmeasuredTurns+' 轮未计时');
    if(activity.partial)details.push('部分归档不可读');
    setMetricDetail(card,details.join(' · '));
  }

  async function loadProjectDuration(time){
    setMetricDetail(time.card,'正在读取归档…');
    const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    try{
      projectDurationRequest??=sdk.call('activity',{...selected,timeZone});
      const activity=await projectDurationRequest;
      if(time.card.isConnected)showProjectDuration(time,activity);
    }catch{
      if(!time.card.isConnected)return;
      setMetricDetail(time.card,'暂时无法读取耗时');
      const retry=button('重试',()=>{
        projectDurationRequest=null;
        retry.replaceWith(time.value);
        void loadProjectDuration(time);
      },'pg-card-action');
      time.value.replaceWith(retry);
    }
  }
  function renderObjectNavigation(){
    const focused=document.activeElement;
    historyBack.disabled=historyIndex<1;
    historyForward.disabled=historyIndex>=objectHistory.length-1;
    if((focused===historyBack||focused===historyForward)&&focused.disabled)navigation.focus({preventScroll:true});
    const project=hierarchy.project;
    const trail=[{path:project.path,label:project.metadata.name}];
    if(selectedBranch){
      const milestone=selectedBranch.milestone;
      trail.push({path:milestone.path,label:[milestoneCode(milestone),milestone.metadata.name].filter(Boolean).join(' · ')});
    }
    if(selectedDoc.metadata.kind==='task')trail.push({path:selectedDoc.path,label:taskLabel(selectedDoc)});
    breadcrumbs.replaceChildren(...trail.map(({path,label},index)=>{
      const item=el('li','pg-object-crumb');
      const current=index===trail.length-1;
      const link=current?el('span','pg-object-crumb-label',label):button(label,()=>selectNode(path),'pg-object-crumb-label');
      link.title=label;
      if(current)link.setAttribute('aria-current','location');
      item.append(link);
      return item;
    }));
  }
  function renderCardDetails(){
    const d=selectedDoc;
    renderObjectNavigation();
    selectedBody.dataset.kind=d.metadata.kind;
    appendContext(d);
  }
  function isFocusedCard(doc,milestone){
    const refs=doc.metadata.kind==='milestone'?hierarchy.project.metadata.focus_milestones:milestone?.metadata.focus_tasks;
    return refs?.some(ref=>ref.path===doc.path);
  }
  function appendProjectSettings(card){
    const trigger=el('button','pg-project-settings');
    trigger.type='button';
    trigger.title='项目设置';
    trigger.setAttribute('aria-label',trigger.title);
    trigger.setAttribute('aria-expanded','false');
    trigger.append(icon('settings'));

    const menu=el('div','pg-project-card-menu');
    menu.id=id('project_settings');
    menu.setAttribute('popover','auto');
    trigger.setAttribute('popovertarget',menu.id);
    trigger.setAttribute('aria-controls',menu.id);
    const archived=selected.scope==='archived';
    const transition=projectAction(archived?'恢复到当前':'归档项目',archived?'refresh':'warning',()=>{
      menu.hidePopover();
      onLifecycle(trigger);
    });
    transition.classList.toggle('is-danger',!archived);
    transition.disabled=busy||!record.lifecycle?.supported;
    transition.title=record.lifecycle?.supported?'先预览影响，再确认操作':'需要 schema2 项目及配套 Core 的归档恢复接口。';
    menu.append(transition);
    menu.addEventListener('beforetoggle',event=>{
      const opening=event.newState==='open';
      trigger.setAttribute('aria-expanded',String(opening));
      if(!opening)return;
      const bounds=trigger.getBoundingClientRect();
      menu.style.setProperty('--pg-menu-right',bounds.right+'px');
      const above=window.innerHeight-bounds.bottom<54;
      menu.classList.toggle('is-above',above);
      menu.style.setProperty('--pg-menu-edge',(above?bounds.top:bounds.bottom)+'px');
    });
    card.append(trigger,menu);
  }
  function objectCard(d,milestone){
    const {kind,name,status,task_code:taskCode}=d.metadata;
    const code=kind==='milestone'?milestoneCode(d):taskCode;
    const focused=isFocusedCard(d,milestone);
    const current=d.path===activePath;
    const card=el('div','pg-object-card');
    card.dataset.kind=kind;
    card.toggleAttribute('data-selected',current);
    card.toggleAttribute('data-branch',d===selectedBranch?.milestone);
    const row=button('',()=>selectNode(d.path,{fromNavigation:true}),'pg-card-select');
    if(current)row.setAttribute('aria-current','location');
    const heading=el('span','pg-card-heading');
    if(kind==='project'){
      heading.append(el('span','pg-card-code pg-card-full-label','当前项目'),
        el('span','pg-card-code pg-card-compact-label','当前'));
    }else if(code)heading.append(el('span','pg-card-code',code));
    else heading.append(el('span','pg-card-code pg-card-compact-label',labels[kind]));
    const titleRow=el('span','pg-card-title-row');
    const badges=el('span','pg-card-title-badges');
    badges.append(...(record.valid===false?[chip(status)]:badgesFor(d.metadata)));
    if(focused)badges.append(el('span','pg-card-current','重点'));
    titleRow.append(el('strong','pg-card-name',name),badges);
    heading.append(titleRow);
    row.append(heading);
    row.title=[kind==='project'?'当前项目':code,name,labels[status]??status,focused?'重点':null].filter(Boolean).join(' · ');
    row.setAttribute('aria-label',row.title);
    card.append(row);
    if(kind==='project'&&record.valid!==false)appendProjectSettings(card);
    return card;
  }
  function renderObjectNavigationList(focusRow=false){
    const {project,branches}=hierarchy;
    const scroll=board.scrollTop;
    const projectItem=el('li','pg-object-tree-item');
    projectItem.append(objectCard(project));
    const milestones=el('ol','pg-object-tree-children');
    for(const {milestone,tasks} of branches){
      const item=el('li','pg-object-tree-item');
      item.append(objectCard(milestone));
      if(milestone.path===selectedBranch?.milestone.path){
        const taskList=el('ol','pg-object-tree-children');
        for(const task of tasks){
          const taskItem=el('li','pg-object-tree-item');
          taskItem.append(objectCard(task,milestone));
          taskList.append(taskItem);
        }
        if(!tasks.length)taskList.append(el('li','pg-card-empty','此里程碑暂无任务'));
        item.append(taskList);
      }
      milestones.append(item);
    }
    if(!branches.length)milestones.append(el('li','pg-card-empty','暂无里程碑'));
    projectItem.append(milestones);
    treeList.replaceChildren(projectItem);
    board.scrollTop=scroll;
    const current=treeList.querySelector('[aria-current]');
    if(!current)return;
    if(focusRow)current.focus({preventScroll:true});
    const bounds=board.getBoundingClientRect();
    const top=bounds.top+treeHeader.offsetHeight;
    const item=current.getBoundingClientRect();
    if(item.top<top)board.scrollTop+=item.top-top;
    else if(item.bottom>bounds.bottom)board.scrollTop+=item.bottom-bounds.bottom;
  }
  function renderBoard({focusRow=false}={}){
    cardMotion.stopReturns();
    const {project,branches}=hierarchy;
    selectedBranch=branches.find(b=>b.milestone.path===activePath||b.tasks.some(task=>task.path===activePath));
    selectedDoc=selectedBranch?.tasks.find(task=>task.path===activePath)??selectedBranch?.milestone??project;
    if(!selectedBranch)activePath=project.path;
    renderObjectNavigationList(focusRow);
    renderCardDetails();
    const subject=selectedDoc,kind=subject.metadata.kind;
    const primary=kind==='task'?subject:workTasks(subject,readingRecord()).primary;
    const progress=primary&&!readOnly()?taskProgressAction(primary,record):null;
    onProjectActionsChange?.(record.valid!==false?{
      planLabel:null,
      planDisabled:busy,
      plan:()=>contextView.openPrimary(),
      reviewLabel:kind==='project'?'复盘项目':kind==='milestone'?'里程碑复盘':null,
      reviewDisabled:busy||(readOnly()&&!reviewDocument(subject)),
      inspirationDisabled:busy,
      review(){
        openObjectReview(subject);
        node.querySelector('.pg-editor h2')?.focus();
      },
      prepare:progress?()=>prepareTask(primary):null,
      prepareLabel:progress?.label??null,
      focus:primary?()=>selectNode(primary.path):null,
      inspiration:()=>openNote(subject),
    }:null);
  }
  function overview(){
    if(hierarchyRecord!==record){
      hierarchyRecord=record;
      hierarchy=projectCardHierarchy(record);
    }
    node.classList.add('is-card-board');
    node.append(workspace);
    renderBoard();
  }
  function reviewDocument({metadata:m}){
    const ref=m.review_ref;
    return ref&&record.documents.find(item=>item.metadata.kind==='review'&&item.path===ref.path
      &&item.metadata.id===ref.id&&item.metadata.subject?.id===m.id);
  }
  function reviewPath(subject){
    return ['project','milestone'].includes(subject.metadata.kind)
      ?parent(subject.path)+'/'+(subject.metadata.kind==='project'?'项目复盘.md':'复盘.md'):null;
  }
  function openObjectReview(subject){
    const m=subject.metadata;
    const path=reviewPath(subject);
    if(!path)return;
    const existing=reviewDocument(subject);
    if(existing){leaveContextEditor();open(existing);return;}
    if(readOnly()||m.review_ref)return;
    if(!drafts.has(path)){
      const rid=id('review');
      const name=labels[m.kind]+'复盘';
      const metadata={governance_schema:m.governance_schema,kind:'review',id:rid,name,status:'draft',owner:null,updated:new Date().toISOString(),next_action:'回看目标并逐项核对证据',subject:{id:m.id,path:subject.path},outcome:'pending',basis_digest:null,criterion_results:[]};
      drafts.set(path,{path,base:null,value:{metadata,body:'# '+name+'\n\n## 实际结果与差异\n\n## 原因与经验\n\n## 改进行动与遗留\n'},verificationChanged:true});
      draftFor(subject).value.metadata.review_ref={id:rid,path};
      modified();
    }
    leaveContextEditor();
    clearPreview();
    editing=path;
    draw();
  }
  function field(form,label,value,set,{textarea=false,options,disabled=false}={}){const wrap=el('label','pm-field is-wide'),caption=el('span','',label);wrap.append(caption);const input=el(options?'select':textarea?'textarea':'input');if(options)for(const v of options){const o=el('option','',labels[v]??v);o.value=v;input.append(o);}input.value=value??'';input.disabled=readOnly()||busy||disabled;if(textarea)input.rows=4;input.addEventListener('input',()=>{set(input.value);modified();});wrap.append(input);form.append(wrap);return input;}
  function resultsEditor(form,draft,subject){
    const m=draft.value.metadata,task=m.kind==='task';let verification=task?m.verification:m;
    const results=verification?.[task?'results':'criterion_results']??[];
    const box=el('fieldset','pm-criteria-editor pm-results-editor');box.append(el('legend','','逐项验收'));
    for(const c of subject.metadata.criteria??[]){let r=results.find(x=>x.criterion_id===c.id);const current=r??{criterion_id:c.id,result:'pending',evidence:[],reviewer:'',reviewed_at:''};
      const update=()=>{if(!r){r=current;results.push(r);}if(task){m.verification??={basis_digest:null,results};m.verification.results=results;}else m.criterion_results=results;draft.verificationChanged=true;};
      const row=el('div','pm-criterion-editor'),label=el('strong','',c.text);label.dataset.criterionLabel=c.id;row.append(label);field(row,'结果',current.result,v=>{update();current.result=v;current.reviewed_at=new Date().toISOString();},{options:['pending','passed','failed']});field(row,'复核者',current.reviewer,v=>{update();current.reviewer=v;});
      const evidenceText=(current.evidence??[]).map(e=>e.path??e.url+' | '+e.version).join('\n');
      const input=field(row,'证据原件路径（每行一个；网页写“URL | 版本或时间”）',draft.evidenceInputs?.[c.id]??evidenceText,()=>{}, {textarea:true});
      let revision=0;
      function readEvidence(){
        const text=input.value,g=generation,version=++revision;
        draft.evidenceInputs??=Object.create(null);draft.evidenceInputs[c.id]=text;
        update();modified();
        const job=(async()=>{
          await new Promise(resolve=>setTimeout(resolve,250));
          if(!alive||g!==generation||version!==revision||draft.evidenceInputs?.[c.id]!==text)return;
          const evidence=[];
          for(const line of text.split('\n').map(x=>x.trim()).filter(Boolean)){
            if(/^https?:\/\//.test(line)){
              const [url,...version]=line.split('|');if(!version.join('|').trim())throw Error('网页证据须注明版本或时间。');
              evidence.push({url:url.trim(),version:version.join('|').trim()});
            }else{
              try{evidence.push(await call('evidence',{path:line}));}
              catch{throw Error('无法读取证据原件：'+line+'。请核对路径，输入已保留。');}
            }
          }
          if(alive&&g===generation&&version===revision&&draft.evidenceInputs?.[c.id]===text){
            update();current.evidence=evidence;delete draft.evidenceInputs[c.id];modified();
          }
        })().catch(e=>{
          if(alive&&g===generation&&version===revision&&draft.evidenceInputs?.[c.id]===text){
            if(autoKind(m.kind)){detailSaveIssue={code:'DETAIL_INPUT',message:e.message};persist();syncSavebar();}
            else{error=e.message;persist();draw();}
          }
          throw e;
        }).finally(()=>evidenceJobs.delete(job));
        evidenceJobs.add(job);void job.catch(()=>{});
      }
      input.addEventListener('input',readEvidence);
      if(Object.hasOwn(draft.evidenceInputs??{},c.id)&&!error&&!detailSaveIssue)queueMicrotask(readEvidence);
      box.append(row);
    }
    if(!(subject.metadata.criteria??[]).length)box.append(el('p','pm-reason','先在对象原件明确完成条件。'));form.append(box);
  }
  function breadcrumb(form,m){const trail=el('nav','pg-breadcrumbs');trail.setAttribute('aria-label','节点位置');const subject=record.documents.find(d=>d.path===m.subject?.path),refs=m.kind==='review'?(subject?.metadata.kind==='milestone'?[subject.metadata.project,m.subject]:[m.subject]):[m.kind==='project'?null:m.project,m.kind==='task'?m.milestone:null];for(const ref of refs.filter(Boolean)){const d=record.documents.find(x=>x.path===ref.path);if(d)trail.append(button(d.metadata.name,()=>open(d)));}trail.append(el('span','',m.name));form.append(trail);}
  function locationEditor(form,m){
    if(['task','milestone'].includes(m.kind)){
      const goals=el('fieldset','pm-criteria-editor');goals.append(el('legend','','承接的项目目标'));for(const g of record.project.metadata.goals??[]){const label=el('label','pg-checkbox'),input=el('input');input.type='checkbox';input.checked=m.goal_ids?.includes(g.id);input.disabled=readOnly()||busy;input.addEventListener('change',()=>{m.goal_ids=input.checked?[...(m.goal_ids??[]),g.id]:(m.goal_ids??[]).filter(x=>x!==g.id);modified();});label.append(input,el('span','',g.title));goals.append(label);}form.append(goals);
      const deps=el('fieldset','pm-criteria-editor');deps.append(el('legend','','前置依赖'));for(const dep of dependenciesOf({metadata:m},record)){const line=el('div','pg-dependency');line.append(el('span','',dep.doc?.metadata.name??dep.ref.id));if(dep.doc)line.append(chip(dep.doc.metadata.status));if(dep.inherited)line.append(el('small','kp-muted','来自所属里程碑'));else if(!readOnly())line.append(button('移除',()=>{m.depends_on=m.depends_on.filter(x=>x.id!==dep.ref.id);modified();draw();}));deps.append(line);}
      if(!readOnly()){const label=el('label','pm-field'),select=el('select');label.append(el('span','','添加前置依赖'));select.setAttribute('aria-label','添加前置依赖');const empty=el('option','','选择任务或里程碑…');empty.value='';select.append(empty);for(const d of record.documents.filter(x=>['task','milestone'].includes(x.metadata.kind)&&x.metadata.id!==m.id&&x.metadata.id!==m.milestone?.id&&!m.tasks?.some(t=>t.id===x.metadata.id)&&!m.depends_on?.some(r=>r.id===x.metadata.id))){const option=el('option','',(d.metadata.kind==='milestone'?'里程碑':'任务')+' · '+d.metadata.name);option.value=d.path;select.append(option);}select.addEventListener('change',()=>{const d=record.documents.find(x=>x.path===select.value);if(d){m.depends_on??=[];m.depends_on.push({id:d.metadata.id,path:d.path});modified();draw();}});label.append(select);deps.append(label);}form.append(deps);
    }
  }
  function projectEditor(draft,{inReader}){
    const form=el('div','pg-editor pg-project-plan-editor'),token=generation,target={...selected};
    form.dataset.autoDocument=draft.path;
    if(!inReader)form.append(button('返回详情',()=>{editing=null;persist();draw();}));
    if(renderDomainSummary){const summary=el('details','kp-project-domain-disclosure');summary.append(el('summary','','项目摘要'),renderDomainSummary(documentForReading(record.project,draft),workspaceDomainFacts(record.project,record,{draft:detailsChanged()})));form.append(summary);}
    form.append(workSummary(documentForReading(record.project,draft)));
    const metrics=el('section','pg-project-dashboard');
    metrics.setAttribute('aria-label','项目概览');
    metrics.append(projectMetrics(hierarchy.branches,record.stale??[]));
    form.append(metrics);
    const feedback=el('div','pg-plan-feedback');feedback.dataset.detailSaveFeedback='';appendRecordFeedback(feedback);form.append(feedback);
    let state=projectPlanStates.get(draft.path);
    if(!state){state={tab:'plan'};projectPlanStates.set(draft.path,state);}
    state.filesLoaded=false;
    state.bodyLinks=contextView?.primaryLinks()??state.bodyLinks??[];
    const current=()=>alive&&generation===token&&drafts.get(draft.path)===draft;
    const openProject=ref=>{
      const doc=record.documents.find(item=>item.path===ref.path&&item.metadata.id===ref.id);
      const path=doc?.path??ref.path;
      if(path)onNavigate?.({name:parent(path).split('/').at(-1),scope:path.startsWith('档案/项目/')?'archived':'current'});
    };
    form.append(createProjectPlanEditor({
      draft,record,getRecord:()=>record,state,labels,field,writable:!readOnly(),busy,modified,id,renderMarkdown:text=>renderMarkdown(text,state.bodyLinks),docLink,onViewChange:()=>queueMicrotask(()=>onLocationChange?.()),
      onObject:path=>selectNode(path),onProject:openProject,
      onFile(entry){
        const owner=record.documents.filter(doc=>(doc.path===record.project.path||['milestone','task'].includes(doc.metadata.kind)&&doc.metadata.project?.id===record.project.metadata.id&&doc.metadata.project?.path===record.project.path)&&entry.path?.startsWith(parent(doc.path)+'/')).sort((a,b)=>b.path.length-a.path.length)[0];
        if(!entry.path?.startsWith(parent(record.project.path)+'/')){
          if(entry.digest)contextView.openEntry(entry);
          else docLink(entry.name??entry.role??'打开原件',entry.path).click();return;
        }
        if(!owner){docLink(entry.name??entry.role??'打开原件',entry.path).click();return;}
        if(owner.metadata.kind==='project'&&owner.path!==record.project.path){openProject({id:owner.metadata.id,path:owner.path});return;}
        if(owner.path!==activePath)selectNode(owner.path);
        if(entry.kind==='directory'){contextView.openFolder(entry.path);return;}
        const format=/\.(?:md|markdown)$/i.test(entry.path??'')?'markdown':/\.(?:png|jpe?g|webp|gif)$/i.test(entry.path??'')?'image':/\.(?:txt|json|ya?ml|[cm]?js|tsx?|css|html|csv|toml|ini)$/i.test(entry.path??'')?'text':'external';
        contextView.openEntry({...entry,format});
      },
      getFiles:async()=>{const result=await sdk.call('project-context-list',target);return result.entries;},
      getProjects:async()=>{const {projects}=await sdk.call('list');return projects.map(project=>({...project,path:project.path??(project.scope==='archived'?'档案/项目/':'项目/')+project.name+'/project.md'}));},
      resolveParent:async choice=>{
        const latest=await sdk.call('governance.read',{name:choice.name,scope:choice.scope});
        if(!latest.valid||latest.readOnly||latest.project?.metadata.governance_schema!==2)throw Error('上级项目需要是可编辑的新格式项目。');
        return latest.project;
      },
      track(operation){evidenceJobs.add(operation);void operation.then(()=>evidenceJobs.delete(operation),()=>evidenceJobs.delete(operation));},isCurrent:current,
    }));
    queueMicrotask(syncDetailFeedback);return form;
  }

  const confirmationSignature=()=>JSON.stringify({etag:record.etag,drafts:changedDrafts().map(d=>({path:d.path,value:d.value,evidenceInputs:d.evidenceInputs,verificationChanged:d.verificationChanged}))});
  async function confirmationRequest(subjectPath,reviewPath){
    if(pendingRequest)throw Error('请先核对上次保存回执，再确认阶段。');
    while(evidenceJobs.size)await Promise.all([...evidenceJobs]);
    if(changedDrafts().some(d=>Object.keys(d.evidenceInputs??{}).length))throw Error('验收证据输入尚未完成。');
    const signature=confirmationSignature(),view=structuredClone(readingRecord()),changes=new Map();
    for(const draft of changedDrafts()){
      const value=structuredClone(draft.value),m=value.metadata;
      if(draft.verificationChanged){
        const subject=m.kind==='task'?m:view.documents.find(d=>d.path===m.subject?.path)?.metadata;
        const {digest}=await call('criteria-digest',{criteria:subject?.criteria??[]});
        if(m.kind==='task'&&m.verification)m.verification.basis_digest=digest;
        else if(m.kind==='review')m.basis_digest=digest;
      }
      changes.set(draft.path,{path:draft.path,ifMatch:draft.base?.etag??'missing',...value});
      const doc=view.documents.find(d=>d.path===draft.path);if(doc)Object.assign(doc,value);
    }
    view.project=view.documents.find(d=>d.path===view.project.path)??view.project;
    const subject=view.documents.find(d=>d.path===subjectPath),review=view.documents.find(d=>d.path===reviewPath);
    if(!subject||!review)throw Error('阶段或复盘原件尚未取得。');
    const {digest:basis}=await call('criteria-digest',{criteria:subject.metadata.criteria??[]});
    const scoped=await call('check',{data:{operationId:id('milestone_scope'),ifMatch:view.etag,changes:[...changes.values()]}});
    const scope=scoped.confirmationScopes?.[subject.metadata.id];
    if(!scope)throw Error('当前Core未提供阶段确认范围，请更新配套Core。');
    for(const change of milestoneCompletionChanges(subject,review,view,{basis,at:new Date().toISOString()}))changes.set(change.path,{...changes.get(change.path),...change});
    const relation=changedDrafts().map(draft=>projectParentChange({...draft,value:changes.get(draft.path)??draft.value})).find(Boolean);
    const data={operationId:id('milestone_confirm'),ifMatch:view.etag,confirmMilestone:{subject:{id:subject.metadata.id,path:subject.path},scope_digest:scope,source:{kind:'workbench'}},changes:[...changes.values()],...(relation?{setParent:relation}:{})};
    const checked=await call('check',{data});
    if(!checked.valid)throw Error(checked.errors?.map(e=>e.message).join('；')||'阶段条件和证据尚未通过检查。');
    if(signature!==confirmationSignature())throw Error('原件或草稿已变化，请重新核对阶段确认范围。');
    return {data,signature};
  }
  function appendMilestoneConfirmation(form,reviewDraft,subject){
    const group=el('section','pg-result-section pg-stage-confirmation'),feedback=el('p','kp-muted');
    group.setAttribute('aria-label','用户阶段确认');
    group.append(el('h3','','用户阶段确认'),el('p','kp-muted','逐项通过是预检结果。请核对本阶段成果、证据和遗留，明确确认后再完成里程碑；这不会启动下一阶段。'));
    let version=0,timer,confirming=false;
    const current=()=>alive&&form.isConnected&&editing===reviewDraft.path;
    const control=button('确认本里程碑通过并完成',async()=>{
      if(control.disabled||confirming)return;
      confirming=true;control.disabled=true;const token=++version,source=generation;
      let before;
      try{
        if(!await flushDetailSave())throw Error('请先处理未保存内容或并发修改。');
        const {data}=await confirmationRequest(subject.path,reviewDraft.path);
        if(!current()||source!==generation||token!==version)return;
        before=new Map();
        for(const change of data.changes){
          const doc=record.documents.find(d=>d.path===change.path),draft=drafts.get(change.path)??(doc&&draftFor(doc));
          if(!draft)throw Error('确认范围包含未取得的草稿。');
          before.set(change.path,structuredClone(draft.value));
          draft.value={metadata:structuredClone(change.metadata??draft.value.metadata),body:change.body??draft.value.body};
          if(change.path===subject.path)draft.requiresReviewSave=true;
          draft.verificationChanged=false;
        }
        pendingRequest=structuredClone(data);persist();await save();
        if(!pendingRequest&&record.documents.find(d=>d.path===subject.path)?.metadata.status!=='completed'){
          // A known rejection has not saved the confirmation. Keep the user's edits,
          // but require a fresh explicit confirmation after resolving the problem.
          for(const path of [subject.path,reviewDraft.path]){
            const draft=drafts.get(path),prior=before.get(path);if(!draft||!prior)continue;
            for(const key of ['status','outcome','next_action'])if(key in prior.metadata)draft.value.metadata[key]=prior.metadata[key];
            if(path===reviewDraft.path)draft.value.body=prior.body;
            draft.requiresReviewSave=false;
          }
          persist();draw();
        }
      }catch(e){if(current()){feedback.textContent=e.message;control.disabled=true;}}
      finally{confirming=false;}
    },'pm-primary');
    control.disabled=true;group.append(control,feedback);form.append(group);
    async function refresh(token){
      if(!current()||token!==version||confirming)return;
      feedback.textContent='正在核对阶段标准、固定证据与下级任务…';
      try{await confirmationRequest(subject.path,reviewDraft.path);if(current()&&token===version){control.disabled=readOnly()||busy;feedback.textContent='检查通过，等待你明确确认。';}}
      catch(e){if(current()&&token===version){control.disabled=true;feedback.textContent=e.message;}}
    }
    const schedule=()=>{const token=++version;control.disabled=true;clearTimeout(timer);timer=setTimeout(()=>void refresh(token),150);};
    form.addEventListener('input',schedule);form.addEventListener('change',schedule);queueMicrotask(schedule);
  }

  function editor(draft,{inReader=false}={}){
    if(draft.value.metadata.kind==='project')return projectEditor(draft,{inReader});
    const m=draft.value.metadata,form=el('div','pg-editor');
    if(!inReader)form.append(button('返回详情',()=>{
      editing=null;persist();draw();
      if(m.kind==='project')selectedBody.querySelector('[data-project-edit]')?.focus({preventScroll:true});
    }));
    const heading=el('h2','',m.kind==='task'?taskLabel({metadata:m}):m.name);heading.tabIndex=-1;form.append(heading);
    if(inReader&&['task','milestone'].includes(m.kind))form.append(button('返回结果阅读',async()=>{
      const source=generation;
      if(!await flushDetailSave()||!alive||source!==generation)return;
      editing=null;persist();draw();selectedBody.querySelector('h2')?.focus({preventScroll:true});
    },'pg-card-action'));

    if(inReader&&autoKind(m.kind)){
      form.dataset.autoDocument=draft.path;
      const feedback=el('div','pg-plan-feedback');feedback.dataset.detailSaveFeedback='';form.append(feedback);queueMicrotask(syncDetailFeedback);
    }else if(inReader)appendRecordControls(form,{inReader:true});
    else{
      breadcrumb(form,m);
      const owner=record.documents.find(d=>d.path===editing&&d.metadata.kind!=='review');
      if(owner)form.append(button('打开灵感闪现',()=>openNote(owner),'pg-note-link'));
    }
    field(form,'名称',m.name,v=>m.name=v);field(form,'状态',m.status,v=>m.status=v,{options:statesFor(m).filter(s=>m.kind!=='milestone'||s!=='completed'||m.status==='completed')});field(form,'负责人',m.owner,v=>m.owner=v||null);field(form,'下一步',m.next_action,v=>m.next_action=v.trim()?v:null,{textarea:true});field(form,m.kind==='project'?'项目方案':'当前进展与说明',draft.value.body,v=>draft.value.body=v,{textarea:true});locationEditor(form,m);
    if(m.kind!=='review'){if(m.governance_schema===2){field(form,'状态原因',m.status_reason,v=>m.status_reason=v||null,{textarea:true});field(form,'暂停前环节',m.resume_status??'planned',v=>m.resume_status=v,{options:['planned','active','review']});if(m.kind==='task')field(form,'任务用途',m.work_type,v=>m.work_type=v,{options:['delivery','acceptance']});}field(form,'阻塞原因',m.blocker,v=>m.blocker=v||null,{textarea:true});field(form,'恢复条件',m.resume_condition,v=>m.resume_condition=v||null,{textarea:true});
      const criteria=el('fieldset','pm-criteria-editor');criteria.append(el('legend','','完成条件'));for(const c of m.criteria??[]){const row=el('div','pm-criterion-editor');field(row,'条件',c.text,v=>c.text=v);if(!readOnly())row.append(button('移除条件',()=>{m.criteria=m.criteria.filter(x=>x!==c);modified();draw();}));criteria.append(row);}if(!readOnly())criteria.append(button('增加条件',()=>{m.criteria??=[];m.criteria.push({id:id('criterion'),text:''});modified();draw();}));form.append(criteria);
    }
    if(m.kind==='milestone'){
      form.append(el('p','kp-muted','阶段通过须用户明确确认，请从里程碑复盘核对证据并完成阶段确认。'));
      const stages=el('fieldset','pm-criteria-editor');stages.append(el('legend','','任务推进阶段（A准备，B—Y自定义，Z验收复盘）'));
      for(const stage of m.task_stages??[]){const item=el('div','pm-plan-card');const assigned=record.documents.some(d=>d.metadata.kind==='task'&&d.metadata.milestone?.id===m.id&&d.metadata.task_code?.[0]===stage.code);const letter=field(item,'阶段字母',stage.code,v=>stage.code=v.trim().toUpperCase(),{disabled:assigned});letter.maxLength=1;field(item,'阶段名称',stage.name,v=>stage.name=v);field(item,'解决什么问题',stage.purpose,v=>stage.purpose=v,{textarea:true});field(item,'进入下一阶段的判断',stage.exit_criteria,v=>stage.exit_criteria=v,{textarea:true});if(!readOnly()&&!assigned)item.append(button('移除空阶段',()=>{m.task_stages=m.task_stages.filter(x=>x!==stage);modified();draw();}));stages.append(item);}
      if(!readOnly())stages.append(button('增加推进阶段',()=>{const used=new Set((m.task_stages??[]).map(x=>x.code));const code='BCDEFGHIJKLMNOPQRSTUVWXYAZ'.split('').find(x=>!used.has(x));if(!code)return;m.task_stages??=[];m.task_stages.push({code,name:'',purpose:'',exit_criteria:''});modified();draw();}));
      stages.append(el('p','kp-muted','只定义实际需要的阶段。已有任务改号由Agent调用公共renumber预览并同步旧入口；阶段没有独立状态。'));form.append(stages);
    }
    if(m.kind==='task'){if(m.task_code)field(form,'任务编号',m.task_code,()=>{},{disabled:true});field(form,'优先级',m.priority,v=>m.priority=v,{options:['high','normal','low']});field(form,'承诺',m.commitment,v=>m.commitment=v,{options:['candidate','next','now']});resultsEditor(form,draft,{metadata:m});}
    if(m.kind==='review'){
      const subject=record.documents.find(d=>d.path===m.subject?.path&&d.metadata.id===m.subject?.id),milestone=subject?.metadata.kind==='milestone';
      field(form,'本层验收结论',m.outcome,v=>m.outcome=v,{options:['pending','passed','failed','cancelled'].filter(value=>!milestone||value!=='passed'||m.outcome==='passed')});
      if(subject)resultsEditor(form,draft,{...subject,metadata:drafts.get(subject.path)?.value.metadata??subject.metadata});
      if(milestone&&!readOnly()&&['active','review'].includes(subject.metadata.status))appendMilestoneConfirmation(form,draft,subject);
    }
    form.append(numberedContexts(draft.path));
    const contexts=section('引用与证据','只打开当前需要的原件');const seenContexts=new Set();for(const r of [...(m.context_refs??[]),...(m.result_refs??[]),...evidenceReferences(m)]){const key=r.path??r.url;if(seenContexts.has(key))continue;seenContexts.add(key);if(r.path)contexts.append(docLink(r.role??r.path.split('/').at(-1),r.path));else{const a=el('a','kp-source-link',r.role??r.url);a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';contexts.append(a);}}form.append(contexts);
    const advanced=el('details','pg-advanced');advanced.append(el('summary','','高级：原件元数据'));const raw=field(advanced,'元数据 JSON',JSON.stringify(m,null,2),()=>{},{textarea:true});raw.addEventListener('change',()=>{try{const value=JSON.parse(raw.value);if(!value||Array.isArray(value)||typeof value!=='object'||!statesFor(value).length||value.kind!=='review'&&!Array.isArray(value.criteria)||value.kind==='project'&&!Array.isArray(value.goals))throw Error('请保留对象类型及其列表字段');draft.value.metadata=value;modified();draw();}catch(e){error='元数据未应用：'+e.message;}});form.append(advanced);return form;
  }
  function save(){if(detailComposing)return Promise.resolve(false);if(manualSaveJob)return manualSaveJob;manualSaveJob=performSave().finally(()=>{manualSaveJob=null;});return manualSaveJob;}
  async function performSave(){
      if(detailSaveJob)await detailSaveJob;
      clearTimeout(detailSaveTimer);
      if(busy||readOnly()||!drafts.size||conflict)return;busy=true;error='';const g=generation;draw();
    try{await Promise.all([...evidenceJobs]);if(!alive||g!==generation)return;if([...drafts.values()].some(d=>Object.keys(d.evidenceInputs??{}).length))throw Error('验收证据输入尚未完成，请核对路径或网页版本。');
      for(const d of drafts.values())if(d.verificationChanged){const m=d.value.metadata,subject=m.kind==='task'?m:(drafts.get(m.subject?.path)?.value.metadata??record.documents.find(x=>x.path===m.subject?.path)?.metadata);const {digest:basis}=await call('criteria-digest',{criteria:subject?.criteria??[]});if(!alive||g!==generation)return;if(m.kind==='task')m.verification.basis_digest=basis;else m.basis_digest=basis;}
      const saved=[...drafts.values()].filter(d=>!d.base||!same(documentValue(d.base),d.value));if(!saved.length){drafts.clear();persist();notice='没有内容变化。';return;}
      const changes=saved.map(d=>({path:d.path,ifMatch:d.base?.etag??'missing',metadata:d.value.metadata,body:d.value.body}));
      const parentChange=saved.map(projectParentChange).find(Boolean);
      pendingRequest??=structuredClone({operationId:id('save'),ifMatch:record.etag,changes,...(parentChange?{setParent:parentChange}:{})});persist();const submitted=structuredClone(pendingRequest),result=await call('apply',{data:submitted});if(!alive||g!==generation)return;record=result;for(const c of submitted.changes){const d=drafts.get(c.path);if(d&&same(d.value,{metadata:c.metadata,body:c.body}))drafts.delete(c.path);else if(d){d.base=result.documents.find(x=>x.path===c.path)??null;if(d.base)d.value.metadata.updated=d.base.metadata.updated;}}pendingRequest=null;detailSaveIssue=null;if(isContextEditing())contextView?.observeOpened(editing);else editing=null;notice='已保存到项目原件。';persist();onChange?.();
    }catch(e){if(alive&&g===generation){error=e.message;if(!e.recoveryId&&['PROJECT_GOVERNANCE_CONFLICT','PROJECT_GOVERNANCE_INVALID','PROJECT_GOVERNANCE_INPUT','PROJECT_GOVERNANCE_NOT_READY','PROJECT_GOVERNANCE_ARCHIVED'].includes(e.code))pendingRequest=null;if(e.recoveryId)error+='；请先核对恢复操作 '+e.recoveryId;if(e.code==='PROJECT_GOVERNANCE_CONFLICT')notice=isContextEditing()?'草稿已保留，请加载最新版本并合并。':'草稿已保留，请核对最新版本并合并。';persist();}}
    finally{if(alive&&g===generation){busy=false;draw();scheduleDetailSave();}}
  }
  async function compare(inReader){
    const g=generation,base=record;
    const isCurrent=()=>alive&&g===generation&&(!inReader||(!busy&&record===base&&isContextEditing()));
    try{const latest=await call('read');if(!isCurrent())return;conflict={latest,choices:{}};reconcile();}
    catch(e){if(isCurrent()){error=e.message;draw();}}
  }
  function reconcile(){const result=mergeDocuments([...drafts.values()],conflict.latest.documents,conflict.choices);if(!result.conflicts.length){record=conflict.latest;pendingRequest=null;drafts=new Map(result.drafts.map(d=>[d.path,d]));conflict=null;detailSaveIssue=null;error='';notice=isContextEditing()&&!changedDrafts().length?'已加载最新版本。':'已合并最新原件，请核对后保存。';persist();scheduleDetailSave();}else conflict.items=result.conflicts;draw();}
  function appendRecordControls(target,{inReader=false}={}){
    const draftLabel=el('span',inReader?'pg-card-muted':'',draftStatus());
    draftLabel.dataset.draftLabel='';
    if(inReader)target.append(draftLabel);
    else{
      const bar=el('div','pm-savebar'),actions=el('div','pm-actions');
      actions.append(button('核对最新版本',()=>void compare(false)));
      if(!readOnly()){
        const control=button(busy?'保存中…':'保存修改',save,'pm-primary');
        control.dataset.saveDocuments='';
        control.disabled=saveDisabled();
        actions.append(control);
      }
      bar.append(draftLabel,actions);
      target.append(bar);
    }
    const pending=changedDrafts();if(pending.length){const shelf=el('div','pg-draft-shelf');shelf.append(el('span','kp-muted','未保存：'));for(const d of pending)shelf.append(button(d.value.metadata.name,()=>{editing=d.path;draw();}));target.append(shelf);}for(const path of notes.drafts()){const owner=record.documents.find(d=>d.path===path);if(owner)target.append(button('继续灵感草稿 · '+owner.metadata.name,()=>openNote(owner),'pg-note-link'));}
    appendRecordFeedback(target);
  }
  function appendRecordFeedback(target){
    if(notice)target.append(el('p','pm-notice',notice));if(error){const e=el('div','pm-error',error);e.setAttribute('role','alert');target.append(e);}
    appendRecordDiagnostics(target);
  }
  function appendConflictControls(target){
    const s=section('合并重叠修改','逐项选择，保留其他独立修改');
    s.querySelector('h2').tabIndex=-1;
    for(const c of conflict.items??[]){const n=el('article','pm-plan-card');n.append(el('p','',c.document+' · '+c.path.join('.')),el('pre','',JSON.stringify({我的修改:c.mine,最新内容:c.theirs},null,2)),button('保留我的修改',()=>{conflict.choices[c.key]='mine';reconcile();}),button('采用最新内容',()=>{conflict.choices[c.key]='theirs';reconcile();}));s.append(n);}
    target.append(s);
  }
  function appendRecordDiagnostics(target){
    const diagnostics=[...(record.errors??[]),...(record.warnings??[])];
    if(diagnostics.length||record.valid===false){
      const issues=el('details','pg-diagnostics');
      issues.append(el('summary','','项目原件诊断 · '+diagnostics.length+' 项'));
      if(record.valid===false)issues.append(el('p','pm-reason','星图只读展示身份与归属均能核对的原件。'));
      for(const x of diagnostics)issues.append(el('p','pm-reason',(x.path?x.path+'：':'')+x.message));
      target.append(issues);
    }
    if(record.documents.some(d=>d.metadata.task_stages?.length)&&!record.taskNumbering?.supported)target.append(el('p','pm-notice','当前Core尚未提供字母任务阶段接口，请更新配套Core后编辑；原件和草稿保留。'));
    if(!Array.isArray(record.contextEntries))target.append(el('p','pm-notice','当前 Core 缺少三层上下文接口，请使用配套 Core 后编辑。'));
    if(record.project.metadata.governance_schema===1)target.append(el('p','pm-notice','旧治理格式只读保留；通过Agent预演迁移到统一六状态后再编辑。'));
  }
  function draw(){
    if(!alive)return;
    if(headless){emit();return;}
    cardMotion.resetBrowsing();
    node.classList.remove('is-card-board');
    node.replaceChildren();
    const showOverview=Boolean(record&&(isContextEditing()||(!conflict&&(!editing||record.valid===false))));
    navigation.hidden=!showOverview;
    if(!showOverview)onProjectActionsChange?.(null);
    if(!record){node.append(el('p',error?'pm-error':'kp-empty',error||'正在读取项目原件…'));return;}
    if(showOverview){overview();return;}
    appendRecordControls(node);
    if(conflict){appendConflictControls(node);return;}
    if(record.valid===false){
      const sectionNode=section('项目原件需要修复','当前读取不完整，不能将未显示内容当作空项目。请按诊断修复原件后重新核对。');
      sectionNode.append(docLink('打开项目原文',record.path));node.append(sectionNode);
      return;
    }
    if(editing){
      const draft=drafts.get(editing);
      if(draft)node.append(editor(draft));
      else editing=null;
    }
  }
  return {navigation,select,render(){draw();return node;},prefill:onPrepare,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    getSnapshot(){return snapshot??=({record:record?readingRecord():null,readOnly:!record||readOnly(),busy:busy||!!detailSaveJob,dirty:changedDrafts().length>0,pending:!!pendingRequest,error:detailSaveIssue?.message||error,notice,conflict,editing,notes});},
    edit(path,change,{verification=false}={}){if(readOnly())return;const doc=[record.project,...record.documents].find(d=>d.path===path)||drafts.get(path)?.value;if(!doc)return;const draft=drafts.get(path)||draftFor(doc);change(draft.value);if(verification)draft.verificationChanged=true;modified();emit();},
    composition(active){detailComposing=active;if(active)clearTimeout(detailSaveTimer);else scheduleDetailSave();},
    save:async()=>{if(detailComposing)return false;if(detailsChanged())await flushDetailSave();if(changedDrafts().length&&!detailSaveIssue)await save();emit();},
    flush:flushDetailSave,compare:()=>compare(false),resolve(key,value){if(!conflict)return;conflict.choices[key]=value;reconcile();},
    retry(){detailSaveIssue=null;return pendingRequest?save():flushDetailSave();},
    review(subject){openObjectReview(subject);emit();return editing;},
    async confirmMilestone(subjectPath,reviewPath){
      if(!await flushDetailSave())throw Error('请先处理未保存内容或冲突。');
      const {data}=await confirmationRequest(subjectPath,reviewPath);
      for(const change of data.changes){let draft=drafts.get(change.path);if(!draft){const doc=record.documents.find(d=>d.path===change.path);if(!doc)throw Error('确认原件缺失。');draft=draftFor(doc);}draft.value={metadata:change.metadata,body:change.body};draft.requiresReviewSave=true;}
      pendingRequest=structuredClone(data);persist();await save();if(pendingRequest||error)throw Error(error||'阶段确认回执待核对。');emit();
    },
    draft(path){return drafts.get(path);},
    evidenceInput(path,criterionId,text){
      const doc=record.documents.find(d=>d.path===path)||drafts.get(path)?.value;if(!doc||readOnly())return;
      const draft=drafts.get(path)||draftFor(doc);draft.evidenceInputs??=Object.create(null);draft.evidenceInputs[criterionId]=text;persist();emit();
    },
    cancelEvidenceInput(path,criterionId){const draft=drafts.get(path);if(!draft?.evidenceInputs)return;delete draft.evidenceInputs[criterionId];detailSaveIssue=null;persist();emit();scheduleDetailSave();},
    async evidence(path,criterionId,text){
      const doc=record.documents.find(d=>d.path===path)||drafts.get(path)?.value;if(!doc||readOnly())return;
      const draft=drafts.get(path)||draftFor(doc),m=draft.value.metadata;
      draft.evidenceInputs??=Object.create(null);draft.evidenceInputs[criterionId]=text;persist();emit();
      const g=generation;const job=(async()=>{const evidence=[];
        for(const line of text.split('\n').map(x=>x.trim()).filter(Boolean)){
          if(/^https?:\/\//.test(line)){const [url,...parts]=line.split('|');const version=parts.join('|').trim();if(!version)throw Error('网页证据须注明版本或时间。');const u=new URL(url.trim());if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('证据地址无效。');evidence.push({url:u.href,version});}
          else evidence.push(await call('evidence',{path:line}));
        }
        if(!alive||g!==generation||draft.evidenceInputs[criterionId]!==text)return;
        const rows=m.kind==='task'?(m.verification??={basis_digest:null,results:[]}).results:(m.criterion_results??=[]);
        let row=rows.find(r=>r.criterion_id===criterionId);if(!row){row={criterion_id:criterionId,result:'pending',reviewer:'',reviewed_at:'',evidence:[]};rows.push(row);}row.evidence=evidence;
        delete draft.evidenceInputs[criterionId];draft.verificationChanged=true;detailSaveIssue=null;modified();
      })().catch(e=>{if(alive&&g===generation){detailSaveIssue={code:'DETAIL_INPUT',message:'无法固定证据：'+(e.code==='ENOENT'?'指定原件不存在，请核对输入路径。':e.message)};persist();emit();}}).finally(()=>{evidenceJobs.delete(job);emit();});evidenceJobs.add(job);return job;
    },
    getLocation:()=>{const reader=selectedBody.querySelector('.pg-project-context-reader')??selectedBody;if(reader.getClientRects().length&&reader.clientHeight)readingPositions.set(activePath,reader.scrollTop);if(board.getClientRects().length&&board.clientHeight)navigationPosition=board.scrollTop;return {objectPath:activePath,objectScroll:pendingReadingLocation?.objectPath===activePath?pendingReadingLocation.objectScroll:readingPositions.get(activePath)??0,navigationScroll:pendingReadingLocation?.navigationScroll??navigationPosition,...(record&&projectPlanStates.get(record.project.path)?.tab?{projectTab:projectPlanStates.get(record.project.path).tab}:{})};},
    isSaving:()=>busy||!!detailSaveJob||!!pendingRequest||evidenceJobs.size>0||notes.isSaving(),
    async flushFileSaves(){await flushDetailSave();await notes.flush();await Promise.all(contextViews().map(view=>view.flushFileSave()));await fileDrafts.settle();await Promise.allSettled([...evidenceJobs]);return !fileDrafts.hasDrafts()&&!detailsChanged()&&!notes.drafts().length;},
    closeReviews:()=>sdk.call('context-files',{action:'endReview',reviewSession}),
    hasDrafts:()=>busy||!!detailSaveJob||!!pendingRequest||evidenceJobs.size>0||changedDrafts().length>0||notes.drafts().length>0||fileDrafts.hasDrafts()||contextViews().some(view=>view.mutating()),discardDrafts(targets){if(busy||detailSaveJob||pendingRequest||evidenceJobs.size||fileDrafts.saving()||contextViews().some(view=>view.mutating()))throw Error('保存回执待核对，请先核对原文。');clearTimeout(detailSaveTimer);detailSaveIssue=null;notes.discardDrafts();for(const project of targets??(selected?[selected]:[]))fileDrafts.discard(project);for(const view of contextViews())view.resetFile();drafts=new Map();editing=null;conflict=null;persist();draw();},dispose(){clearTimeout(detailSaveTimer);persist();if(contextView!==projectContextView)contextView?.dispose();projectContextView?.dispose();notes.dispose();motion.abort();clearPreview();alive=false;generation++;node.remove();}};
}
