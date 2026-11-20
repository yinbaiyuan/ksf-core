import './projects.css';
import { mountProjectWindow } from './titlebar.tsx';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createConversationPanel } from './conversation.js';
import { createProjectManagement } from './management-router.js';
import {createProjectLifecycle} from './lifecycle.js';
import {workspaceProjectKey,workspaceTarget,workspaceProjects,workspaceReadState} from './workspace-model.js';
import {SaveController,createSessionSaveAdapter} from '@ksf/sdk/controllers';
import {createWorkspaceSession} from './workspace-session.js';

const names={backlog:'待梳理',ready:'待开始',review:'待验收',planned:'未开始',draft:'复盘草稿',in_progress:'进行中',blocked:'受阻',paused:'已暂停',completed:'已完成',cancelled:'已取消',unknown:'未标注',active:'进行中',archived:'已归档'};
const icons={folder:'M3 7h6l2-3h9v16H3Z',search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',arrow:'M7 17 17 7M7 7h10v10',file:'M14 2H5v20h14V7ZM14 2v6h5M8 13h8M8 17h8',check:'m5 12 4 4L19 6',chat:'M3 3h18v14H8l-5 4Z',refresh:'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 7M4 12l2 7a8 8 0 0 0 13-3',back:'m14 5-7 7 7 7',link:'m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M14 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'};
icons.previous='M19 12H5m7-7-7 7 7 7';
icons.next='M5 12h14m-7-7 7 7-7 7';
icons.edit='m14 5 5 5M4 20l5-1 12-12-5-5L4 14l-1 6z';
icons.code='m8 6-6 6 6 6m8-12 6 6-6 6m-2-16-4 20';
icons.split='M3 5h18v14H3zM12 5v14';
icons.outline='M4 5h2m3 0h11M4 12h2m3 0h11M4 19h2m3 0h11';
icons.sidebar='M3 5h18v14H3zM9 5v14';
icons.eye='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z';
icons.more='M5 12h.01m6.99 0h.01m6.99 0h.01';
icons.filePlus='M14 2H5v20h14V7ZM14 2v6h5m-7 3v7m-3.5-3.5h7';
icons.folderPlus='M3 7h6l2-3h9v16H3Zm9 3v7m-3.5-3.5h7';
icons.newNote='M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M16 3l5 5M9 15l4-1 9-9-4-4-9 9-1 5Z';
icons.save='M5 3h12l4 4v14H3V3Zm2 0v6h10V3M7 21v-8h10v8';
icons.sparkles='M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8L10 2ZM18 13v7m-3.5-3.5h7';
icons.pin='m15 4 5 5-3.2 1.2-2.6 4.3.5 2-1.4 1.4-7.2-7.2 1.4-1.4 2 .5 4.3-2.6L15 4ZM9 15l-5 5';
icons.warning='M12 3 2 20h20L12 3ZM12 9v5m0 3h.01';
icons.settings='M10 3h4l.6 2.3 1.5.9 2.3-.6 2 3.4-1.7 1.7v1.8l1.7 1.7-2 3.4-2.3-.6-1.5.9-.6 2.3h-4l-.6-2.3-1.5-.9-2.3.6-2-3.4 1.7-1.7v-1.8L3.6 9l2-3.4 2.3.6 1.5-.9L10 3Zm2 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z';
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',icons[name]??icons.file);svg.append(p);return svg;}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function btn(text,fn,cls=''){const n=el('button',cls,text);n.type='button';n.addEventListener('click',fn);return n;}
function badge(state){return el('span',`kp-badge state-${state}`,names[state]??state??'未标注');}
function date(value,full=false){if(!value)return '未记录时间';const d=new Date(value);if(Number.isNaN(d.getTime()))return value;return new Intl.DateTimeFormat('zh-CN',full?{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}:{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function deep(app,params={}){return '/?'+new URLSearchParams({app,...params});}
function link(text,href,cls=''){const a=el('a',cls,text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
function docLink(text,path){return link(text,deep('markdown',{path,mode:'read'}),'kp-source-link');}
const textFile=path=>/\.(?:md|txt|json|ya?ml|js|mjs|ts|tsx|css|html|csv)$/i.test(path??'');
const imageFile=path=>/\.(?:png|jpe?g|gif|webp)$/i.test(path??'');
function resourceURL(ref){if(ref.url){try{const u=new URL(ref.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?ref.url:null;}catch{return null;}}if(/^\.agents\/(runtime-data|user-data)\//i.test(ref.path??''))return null;if(ref.path?.startsWith('知识/'))return deep('com.ksf.knowledge',{path:ref.path});if(ref.path?.startsWith('能力/')||ref.path?.startsWith('.agents/core/abilities/'))return deep('com.ksf.abilities',{path:ref.path});if(textFile(ref.path))return deep('markdown',{path:ref.path,mode:'read'});if(imageFile(ref.path))return '/api/workspace/media?'+new URLSearchParams({path:ref.path});return null;}
function markdown(body,refs=[]){
  const node=el('div','kp-markdown');
  node.innerHTML=DOMPurify.sanitize(marked.parse(body??'',{gfm:true,breaks:false}),{USE_PROFILES:{html:true},FORBID_TAGS:['img','style','input','form','iframe','object','video','audio'],FORBID_ATTR:['style','id','name']});
  for(const a of node.querySelectorAll('a')){const href=a.getAttribute('href')??'',ref=refs.find(r=>r.href===href);const target=/^https?:\/\//i.test(href)?href:ref?resourceURL(ref):null;if(target){a.href=target;a.target='_blank';a.rel='noopener noreferrer';}else{a.removeAttribute('href');a.title='请从项目的资料入口定位原件';}}
  return node;
}

export function mount(container,sdk){
  return mountProjectWindow(container,sdk,mountContent);
}

function mountContent(container,sdk,updateActions,contextMenu,publishWorkspace,publishConversation){
  let alive=true,list=[],selected='',view='overview',scope='all',query='',detail=null,chatData=null,chatRecords=[];
  let request=0,listRequest=0,chatRequest=0,error='',listError='',notice='',loading=false,listLoading=true,chatLoading=false;
  let listReady=false,lastDeep=null,pane='list',splitSize=30,detailError='',detailFailure='error',listFailed=false,listWarning='';
  let domainPortals=[];
  let recoveryReady=false,contextRevision=0,restoreContext=null,positions={listScroll:0,detailScroll:0},focusPin=null,focusSequence=0;
  const recovery=createWorkspaceSession(sdk,{SaveController,createSessionSaveAdapter,onChange:()=>{if(alive)publish();}});
  let projectActions=null;
  let inspirationPanel=null;
  let pinnedProjects=new Set(),pinsReady=false,pinSaving=false,pinRevision=0,pinError='';
  const projectKey=workspaceProjectKey;
  const root=el('div','ksf-projects');container.append(root);
  const conversation=createConversationPanel(sdk,markdown,publishConversation);
  function prepareConversation(text){
    const token=request;
    setView('chats');
    void conversation.select(params()).then(()=>{if(alive&&token===request&&view==='chats')conversation.prefill(text);});
  }
  const management=createProjectManagement({
    sdk,docLink,icon,contextMenu,renderDomainSummary,onLocationChange:()=>checkpoint(),canPreview:textFile,renderMarkdown:markdown,contextLink(entry){
      const url=resourceURL(entry);
      if(url)return link(entry.name,url,'kp-source-link');
      const path=el('code','kp-muted',entry.path);
      path.title='在工作区按路径打开原件';
      return path;
    },
    onNavigate:(p,{historyTarget}={})=>void choose(projectKey(p),{focus:true,historyTarget}),
    onProjectActionsChange(actions){
      projectActions=actions;
      syncTitlebar();
    },
    onInspirationChange(panel){inspirationPanel=panel;if(alive)syncTitlebar();},
    onChange:()=>{
      const p=params(),token=request;
      if(p)void sdk.call('detail',p).then(d=>{if(alive&&token===request){detail=d;render();}})
        .catch(e=>{if(alive&&token===request){notice=e.message;showMessage();}});
    },
    onPrepare:prepareConversation,
    onLifecycle:trigger=>lifecycle.open(params(),list,trigger)
  });
  const draftKeys=targets=>(targets??[]).flatMap(p=>['governance','inspiration','context-files'].map(kind=>sdk.appId+':'+kind+':'+sdk.instanceId+':'+projectKey(p)));
  const lifecycle=createProjectLifecycle({
    sdk,hasDrafts:targets=>management.hasDrafts()||draftKeys(targets).some(k=>sessionStorage.getItem(k)),
    discardDrafts:targets=>{
      const keys=draftKeys(targets);
      for(const k of keys){const saved=JSON.parse(sessionStorage.getItem(k)||'null');if(saved?.pendingRequest||saved?.drafts?.some(d=>d.pendingRequest))throw Error('批次中有保存回执待核对，请先核对相应项目。');}
      management.discardDrafts(targets);
      for(const k of keys)sessionStorage.removeItem(k);
    },
    onChanged:async(result,name)=>{
      const next=result.targets.find(t=>t.name===name);
      if(next)selected=projectKey(next);
      await reload();
    },
    onPrepare:prepareConversation
  });
  const main=el('main','kp-main');
  root.append(main);

  function syncTitlebar(){
    if(notice==='正在核对当前项目修改，请稍后切换。'&&!management.isSaving()){notice='';showMessage();}
    const showObjectNavigation=selected&&view==='overview'&&!loading&&detail?.governance;
    updateActions({
      inspirationPanel,
      conversation:selected&&detail?{active:view==='chats',open:()=>setView('chats')}:null,
      navigation:showObjectNavigation?management.navigation:null,
      projectActions:showObjectNavigation?projectActions:null,
      canReturn:!!selected&&!management.isSaving(),
      busy:listLoading||loading||management.isSaving(),
      showCatalog:()=>showCatalog(true),
      refresh:()=>void reload(),
    });
  }

  const message=el('div','kp-message'),content=el('section','kp-content');
  message.setAttribute('role','status');content.setAttribute('aria-label','项目内容');content.tabIndex=-1;
  main.append(message,lifecycle.node,content);
  main.addEventListener('scroll',()=>checkpoint(),true);
  function checkpoint(){if(recoveryReady)recovery.update({query,scope,selected,pane,splitSize,...positions,...management.getLocation(),...(view==='chats'?{projectView:'chats',...conversation.getLocation()}: {})});}
  async function resumeClosed(){
    const value=recovery.takeRecent();if(!value)return;
    query=value.query;scope=value.scope;pane=value.pane;splitSize=value.splitSize;positions={listScroll:value.listScroll,detailScroll:value.detailScroll};restoreContext=value;contextRevision++;
    if(value.selected){await choose(value.selected,{refresh:true,restoreLocation:value});pane=value.pane;}
    notice='已恢复上次关闭的视图；项目和对象已重新读取。';publish();checkpoint();
  }
  function params(){return workspaceTarget(selected);}
  function showMessage(){message.textContent=error||notice;message.classList.toggle('is-error',!!error);message.hidden=!message.textContent;}
  function renderScope(){}
  function renderList(){publish();}
  function renderDomainSummary(document,facts,{stale=false}={}){
    const host=el('div','kp-domain-summary-slot');host.tabIndex=-1;
    domainPortals.push({key:document.path+':'+domainPortals.length,host,document,facts,stale});
    queueMicrotask(()=>{if(alive)publish();});return host;
  }
  function publish(){
    if(!alive||!publishWorkspace)return;
    const projection=workspaceProjects(list,{query,scope,selected}),projectDocument=detail?.governance?.project??(detail?.metadata?{path:detail.path,metadata:detail.metadata}:null);
    domainPortals=domainPortals.filter(portal=>main.contains(portal.host));
    publishWorkspace({entries:projection.entries,pinned:[...pinnedProjects],selected,selectedTitle:list.find(project=>projectKey(project)===selected)?.title??params()?.name??'',query,scope,pane,splitSize,
      listState:listLoading?(listReady?'refreshing':'loading'):listFailed?'error':'ready',listStale:listReady&&(listLoading||listFailed),listMessage:listError,listWarning:[listWarning,pinError,recovery.getIssue(),...(!selected?[notice,error]:[])].filter(Boolean).join('；'),
      detailState:loading?(detail?'refreshing':'loading'):detailError?detailFailure:detail?'ready':'unavailable',detailStale:!!detail&&(loading||!!detailError),detailMessage:detailError,
      selectionNotice:projection.excluded&&selected&&detail?'当前筛选未显示此项目，详情和选中身份仍保留。':'',legacyNode:main,projectDocument,portals:[...domainPortals],pinDisabled:!pinsReady||listLoading||pinSaving,focusPin,recent:!!recovery.getRecent(),resumeClosed,
      positions,scroll:(kind,position)=>{positions={...positions,[kind]:position};checkpoint();},restoreContext,
      choose:key=>void choose(key,{focus:true}),queryChange:value=>{contextRevision++;query=value;checkpoint();renderList();},scopeChange:value=>{if(['all','current','archived'].includes(value)){contextRevision++;scope=value;checkpoint();renderList();}},paneChange:value=>{contextRevision++;pane=value;checkpoint();publish();},splitChange:size=>{contextRevision++;splitSize=size;checkpoint();publish();},refreshList:()=>void reload(),refreshDetail:()=>void choose(selected,{refresh:true}),pin:key=>{const project=list.find(item=>projectKey(item)===key);if(project)void togglePin(project);}});
  }
  async function togglePin(project){
    if(pinSaving||!pinsReady||listLoading)return;
    const id=projectKey(project);
    const initiator=document.activeElement;
    pinSaving=true;
    pinRevision++;
    try{
      const {pinnedProjects:pins}=await sdk.call('preferences.pin',{
        name:project.name,scope:project.scope,pinned:!pinnedProjects.has(id)
      });
      if(alive){pinnedProjects=new Set(pins);pinError='';}
    }catch(e){
      if(alive)pinError='项目固定设置保存失败：'+e.message;
    }finally{
      pinSaving=false;
      if(alive){if(sdk.getSnapshot().active&&(document.activeElement===initiator||document.activeElement===document.body&&initiator?.getAttribute('aria-label')==='固定项目：'+project.title))focusPin={key:id,sequence:++focusSequence};renderList();showMessage();}
    }
  }

  function resetDetail(){
    request++;chatRequest++;
    detail=null;chatData=null;chatRecords=[];
    chatLoading=false;
    error='';notice='';detailError='';detailFailure='error';
  }
  function canLeaveProject(){
    if(management.isSaving()){notice='正在核对当前项目修改，请稍后切换。';showMessage();return false;}
    if(lifecycle.dismiss())return true;
    notice='请先核对当前归档或恢复操作。';showMessage();
    return false;
  }
  function showCatalog(focus=false){
    pane='list';contextRevision++;checkpoint();publish();
    if(focus)requestAnimationFrame(()=>{const state=sdk.getSnapshot();if(alive&&state.active&&state.enabled)state.root?.current?.querySelector('[data-ksf-component="project-workspace"] input[type="search"]')?.focus({preventScroll:true});});
  }
  async function reload(){
    if(recoveryReady&&!recovery.isReady()){await recovery.load();checkpoint();}
    const token=++listRequest;listLoading=true;listError='';listWarning='';listFailed=false;syncTitlebar();renderList();showMessage();
    const revision=pinRevision;
    try{
      const [projects,preferences]=await Promise.allSettled([
        sdk.call('list'),pinSaving?null:sdk.call('preferences.read')
      ]);
      if(!alive||token!==listRequest)return;
      if(pinRevision===revision&&!pinSaving){
        if(preferences.status==='fulfilled'&&preferences.value){
          pinnedProjects=new Set(preferences.value.pinnedProjects??[]);
          pinsReady=true;pinError='';
        }else if(preferences.status==='rejected'){
          pinsReady=false;pinError='无法读取项目固定设置，请刷新重试。';
        }
      }
      if(projects.status==='rejected')throw projects.reason;
      const result=projects.value;
      listLoading=false;listReady=true;
      list=result.projects.sort((a,b)=>Number(a.scope==='archived')-Number(b.scope==='archived')||a.title.localeCompare(b.title,'zh-CN'));
      listWarning=result.warnings?.join('；')??'';
      renderList();
      if(await followDeep())return;
      if(selected)await choose(selected,{refresh:true,restoreLocation:detail?management.getLocation():restoreContext});
      else render();
    }catch(e){
      if(alive&&token===listRequest){listLoading=false;listFailed=true;listError='项目目录读取失败：'+e.message;renderList();showMessage();}
    }finally{if(alive&&token===listRequest){syncTitlebar();showMessage();}}
  }
  async function choose(key,{refresh=false,focus=false,historyTarget,restoreLocation}={}){
    const target=list.find(p=>projectKey(p)===key)??workspaceTarget(key);
    if(!target){notice='指定项目当前不可读取。';showMessage();return false;}
    if((key!==selected||refresh)&&!canLeaveProject())return false;
    if(key===selected&&!refresh)return true;
    const previous=refresh&&key===selected?detail:null;
    if(!refresh)view='overview';
    if(restoreLocation?.projectView==='chats')view='chats';
    const location=restoreLocation??(refresh?management.getLocation():null);
    selected=key;if(!refresh){pane='detail';positions={...positions,detailScroll:0};}resetDetail();detail=previous;contextRevision++;
    const token=request,p={name:target.name,scope:target.scope};
    loading=true;render();if(!refresh)content.scrollTop=0;
    if(focus)content.focus({preventScroll:true});
    try{
      const result=await sdk.call('detail',p);
      if(!alive||token!==request)return true;
      await management.select(p,result,{historyTarget,restoreLocation:location});
      if(!alive||token!==request)return true;
      detail=result;
    }catch(e){if(alive&&token===request){detailError='项目读取失败：'+e.message;detailFailure=workspaceReadState(e);if(detailFailure!=='error')detail=null;}}
    finally{
      if(alive&&token===request){
        loading=false;render();if(view==='chats'&&location?.aiSessionKey)await conversation.select(params(),{restoreKey:location.aiSessionKey});checkpoint();
        if(view==='chats'&&detail)void loadChats();
      }
    }
    return true;
  }
  function setView(value){
    view=value;if(value==='chats')pane='detail';error='';
    render();checkpoint();content.scrollTop=0;content.focus({preventScroll:true});
    if(view==='chats'&&detail&&!chatData)void loadChats();
  }
  function render(){
    conversation.setActive(view==='chats'&&!!detail);
    syncTitlebar();
    content.hidden=!selected;
    showMessage();
    if(!selected){content.replaceChildren();publish();return;}
    if(loading){publish();return;}
    content.replaceChildren();
    if(!detail){publish();return;}
    if(view!=='overview'){
      const label=detail.governance?'← 返回对象详情':'← 返回项目总览';
      content.append(btn(label,()=>setView('overview'),'kp-text-button kp-back-to-project'));
    }
    if(detail.warnings?.length&&!(view==='overview'&&detail.governance)){
      const warnings=el('details','kp-warning');
      warnings.append(el('summary','',`${detail.warnings.length} 条记录未完整读取`),el('p','',detail.warnings.join('\n')));
      content.append(warnings);
    }
    if(view==='chats')renderChats();
    else content.append(management.render(detail));
    publish();
  }
  async function loadChats(append=false){const token=++chatRequest;chatLoading=true;error='';render();try{const result=await sdk.call('chats',{...params(),offset:append?chatData?.nextOffset??0:0});if(!alive||token!==chatRequest)return;chatData=result;const map=new Map((append?chatRecords:[]).map(r=>[r.taskId,r]));result.records.forEach(r=>map.set(r.taskId,r));chatRecords=[...map.values()];if(result.warnings.length)notice=result.warnings.join('；');}catch(e){if(alive&&token===chatRequest)error='聊天目录读取失败：'+e.message;}finally{if(alive&&token===chatRequest){chatLoading=false;render();}}}
  function renderChats(){void conversation.select(params());content.append(conversation.node);const intro=el('div','kp-view-intro');intro.append(el('h2','','相关聊天'),el('p','','依据历史轮次中明确记录的项目归属；引用项目的聊天不计入。'));content.append(intro);for(const r of chatRecords){const card=el('article','kp-chat-row'),a=link(r.title||'未命名聊天',deep('conversations',{target:selected,task:r.taskId,...(r.turnId?{turn:r.turnId}:{})}));a.append(icon('arrow'));card.append(a,el('p','',r.summary||'该聊天尚未记录项目进展简述。'),el('span','kp-muted',`${r.turnCount} 个相关轮次 · ${date(r.updatedAt,true)}`),btn('在工作台接续',()=>void conversation.attach(r.taskId),'kp-text-button'));content.append(card);}if(chatLoading)content.append(el('p','kp-empty','正在读取聊天归属…'));else if(!chatRecords.length)content.append(el('p','kp-empty',error?'聊天目录暂不可用，可重试读取。':'还没有明确归属于这个项目的聊天。'));if(chatData?.nextOffset!==null&&chatData?.nextOffset!==undefined){const more=btn('加载更多聊天',()=>loadChats(true),'kp-text-button');more.disabled=chatLoading;content.append(more);}const retry=btn('刷新聊天',()=>loadChats(),'kp-text-button');retry.disabled=chatLoading;content.append(retry);}
  async function followDeep(){
    if(!listReady)return false;
    const search=new URLSearchParams(sdk.getSnapshot().search);
    const name=search.get('project');
    const key=name?(search.get('scope')==='archived'?'archived':'current')+':'+name:null;
    if(key===lastDeep)return false;
    if(!key){lastDeep=null;return false;}
    lastDeep=key;
    // A recovered window may already select the deep-link target before its
    // detail has been read. Re-read that target with its saved location instead
    // of treating the initial deep link as an already rendered selection.
    return choose(key,{focus:true,...(key===selected&&!detail?{refresh:true,restoreLocation:restoreContext}:{})});
  }
  renderScope();renderList();render();
  async function prepareClose(request){
    await management.flushFileSaves();
    if(management.isSaving())return {status:'failed',message:'项目仍有保存或待核对回执，窗口已保留。'};
    if(management.hasDrafts()){
      if(request.reason!=='close')return {status:'failed',message:'项目仍有未保存编辑，请先在原编辑页保存或放弃，再重载界面。'};
      if(!window.confirm('此项目窗口还有未保存的手动编辑。确认放弃这些修改并关闭窗口？'))return {status:'cancelled'};
      management.discardDrafts();
      if(management.hasDrafts())return {status:'failed',message:'项目草稿尚未放弃完成，窗口已保留。'};
    }
    if(!await conversation.flush())return {status:'failed',message:'AI 草稿或原请求恢复记录尚未确认保存，窗口已保留。'};
    checkpoint();if(!await recovery.flush({closed:request.reason==='close'}))return {status:'failed',message:'视图恢复记录尚未确认保存，窗口已保留。'};
    if(request.reason==='close')await management.closeReviews().catch(()=>{});
    const generation=recovery.getGeneration(),conversationGeneration=conversation.getGeneration();
    return {status:'ready',validate:()=>alive&&!request.signal?.aborted&&generation===recovery.getGeneration()&&conversationGeneration===conversation.getGeneration()&&!management.isSaving()&&!management.hasDrafts()};
  }
  const unregisterClose=sdk.onCloseRequest?sdk.onCloseRequest(prepareClose):sdk.onBeforeClose(async()=>{const result=await prepareClose({reason:'close'});return result.status==='ready'&&result.validate();});
  const unsubscribe=sdk.subscribe(()=>{void followDeep();});
  void (async()=>{const revision=contextRevision,value=await recovery.load();if(!alive)return;if(value&&revision===contextRevision){query=value.query;scope=value.scope;selected=value.selected;pane=value.pane;splitSize=value.splitSize;positions={listScroll:value.listScroll,detailScroll:value.detailScroll};restoreContext=value;}recoveryReady=true;await reload();})();
  return {dispose(){
    alive=false;request++;listRequest++;chatRequest++;
    unregisterClose?.();unsubscribe?.();recovery.dispose();management.dispose();lifecycle.dispose();conversation.dispose();
    main.remove();root.remove();
  }};
}
