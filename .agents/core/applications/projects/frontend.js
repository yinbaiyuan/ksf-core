import './projects.css';
import { mountProjectWindow } from './titlebar.tsx';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createConversationPanel } from './conversation.js';
import { createProjectManagement } from './management-router.js';
import {createProjectLifecycle} from './lifecycle.js';

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

function mountContent(container,sdk,updateActions,contextMenu){
  let alive=true,list=[],selected='',view='overview',scope='all',query='',detail=null,chatData=null,chatRecords=[];
  let request=0,listRequest=0,chatRequest=0,error='',listError='',notice='',loading=false,listLoading=true,chatLoading=false;
  let listReady=false,lastDeep=null;
  let projectActions=null;
  let inspirationPanel=null;
  let pinnedProjects=new Set(),pinsReady=false,pinSaving=false,pinRevision=0,pinError='';
  const projectKey=p=>p.scope+':'+p.name;
  const root=el('div','ksf-projects');container.append(root);
  const conversation=createConversationPanel(sdk,markdown);
  function prepareConversation(text){
    const token=request;
    setView('chats');
    void conversation.select(params()).then(()=>{if(alive&&token===request&&view==='chats')conversation.prefill(text);});
  }
  const management=createProjectManagement({
    sdk,docLink,icon,contextMenu,canPreview:textFile,renderMarkdown:markdown,contextLink(entry){
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
      navigation:showObjectNavigation?management.navigation:null,
      projectActions:showObjectNavigation?projectActions:null,
      canReturn:!!selected&&!management.isSaving(),
      busy:listLoading||loading||management.isSaving(),
      showCatalog:()=>showCatalog(true),
      refresh:()=>void reload(),
    });
  }

  const catalog=el('section','kp-catalog');
  const catalogHead=el('header','kp-catalog-heading');
  const catalogTitle=el('h1','','全部项目');
  catalogTitle.tabIndex=-1;
  const count=el('span','kp-catalog-count');
  const catalogLabel=el('div','kp-catalog-label');
  catalogLabel.append(catalogTitle,count);
  const filters=el('div','kp-catalog-filters');
  const searchLabel=el('label','kp-search');searchLabel.append(icon('search'));
  const search=el('input');search.type='search';search.placeholder='搜索项目';search.setAttribute('aria-label','搜索项目');
  searchLabel.append(search);
  const scopeRow=el('div','kp-scope'),projectList=el('nav','kp-project-groups');
  projectList.setAttribute('aria-label','项目列表');
  scopeRow.setAttribute('role','group');
  scopeRow.setAttribute('aria-label','项目范围');
  filters.append(scopeRow,searchLabel);
  catalogHead.append(catalogLabel,filters);
  catalog.append(catalogHead,projectList);

  const message=el('div','kp-message'),content=el('section','kp-content');
  message.setAttribute('role','status');
  content.setAttribute('aria-label','项目内容');
  content.tabIndex=-1;
  main.append(message,lifecycle.node,catalog,content);
  function params(){
    const p=list.find(p=>projectKey(p)===selected);
    return p?{name:p.name,scope:p.scope}:null;
  }
  function showMessage(){const catalogError=selected?'':pinError;message.textContent=error||notice||listError||catalogError;message.classList.toggle('is-error',!!(error||listError||catalogError));message.hidden=!message.textContent;}
  function renderScope(){
    for(const b of scopeRow.children)b.setAttribute('aria-pressed',String(scope===b.dataset.scope));
  }
  for(const [id,title]of [['all','全部'],['current','当前'],['archived','已归档']]){
    const b=btn(title,()=>{scope=id;renderScope();renderList();});
    b.dataset.scope=id;
    scopeRow.append(b);
  }
  function renderList(focusPinKey){
    projectList.replaceChildren();
    const entries=list.filter(p=>(scope==='all'||p.scope===scope)&&[p.title,p.name,p.description].some(value=>value?.toLocaleLowerCase().includes(query)));
    count.textContent=listLoading&&!list.length?'':entries.length+' 个项目';
    const pinned=entries.filter(p=>pinnedProjects.has(projectKey(p)));
    const other=entries.filter(p=>!pinnedProjects.has(projectKey(p)));
    if(pinned.length)appendProjectGroup(pinned,'已固定');
    if(other.length)appendProjectGroup(other,pinned.length?'其他项目':'');
    if(!entries.length)projectList.append(el('p','kp-empty-small',listLoading?'正在读取项目…':listError&&!list.length?'无法读取项目，请在标题栏刷新重试。':query?'没有匹配的项目':scope==='archived'?'还没有归档项目':'没有可读取的项目记录'));
    if(focusPinKey&&!selected){
      const focused=[...projectList.querySelectorAll('.kp-project-pin')].find(button=>button.dataset.projectKey===focusPinKey);
      focused?.focus();
    }
  }
  function appendProjectGroup(projects,label){
    const section=el('section',label==='已固定'?'kp-project-group is-pinned':'kp-project-group');
    if(label){
      section.setAttribute('aria-label',label);
      const heading=el('h2','kp-project-group-heading',label);
      heading.append(el('span','kp-catalog-count',projects.length+' 个'));
      section.append(heading);
    }
    const grid=el('div','kp-project-list');
    for(const p of projects){
      const id=projectKey(p),pinned=pinnedProjects.has(id);
      const card=el('article','kp-project-card');
      const b=btn('',()=>void choose(id,{focus:true}),'kp-project-item');
      const title=el('span','kp-project-title');
      title.append(el('strong','',p.title),badge(p.scope==='archived'?'archived':p.status));
      b.append(title,el('span','kp-project-description',p.description||p.name));
      const pin=btn('',()=>void togglePin(p),'kp-project-pin');
      pin.append(icon('pin'));
      pin.dataset.projectKey=id;
      pin.title=pinned?'取消固定':'固定项目';
      pin.setAttribute('aria-label','固定项目：'+p.title);
      pin.setAttribute('aria-pressed',String(pinned));
      pin.disabled=!pinsReady||listLoading;
      card.append(b,pin);
      grid.append(card);
    }
    section.append(grid);
    projectList.append(section);
  }
  async function togglePin(project){
    if(pinSaving||!pinsReady||listLoading)return;
    const id=projectKey(project);
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
      if(alive){renderList(id);showMessage();}
    }
  }
  search.addEventListener('input',()=>{query=search.value.trim().toLocaleLowerCase();renderList();});

  function resetDetail(){
    request++;chatRequest++;
    detail=null;chatData=null;chatRecords=[];
    chatLoading=false;
    error='';notice='';
  }
  function canLeaveProject(){
    if(management.isSaving()){notice='正在核对当前项目修改，请稍后切换。';showMessage();return false;}
    if(lifecycle.dismiss())return true;
    notice='请先核对当前归档或恢复操作。';showMessage();
    return false;
  }
  function showCatalog(focus=false){
    if(!canLeaveProject())return;
    selected='';view='overview';loading=false;
    scope='all';query='';search.value='';renderScope();renderList();
    resetDetail();
    render();
    if(focus)catalogTitle.focus();
  }
  async function reload(){
    const token=++listRequest;listLoading=true;listError='';syncTitlebar();renderList();showMessage();
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
      listError=result.warnings?.join('；')??'';
      renderList();
      if(await followDeep())return;
      if(params())await choose(selected,{refresh:true});
      else if(selected)showCatalog();
      else render();
    }catch(e){
      if(alive&&token===listRequest){listLoading=false;listError='项目目录读取失败：'+e.message;renderList();showMessage();}
    }finally{if(alive&&token===listRequest){syncTitlebar();showMessage();}}
  }
  async function choose(key,{refresh=false,focus=false,historyTarget}={}){
    const target=list.find(p=>projectKey(p)===key);
    if(!target){notice='指定项目当前不可读取。';showMessage();return false;}
    if((key!==selected||refresh)&&!canLeaveProject())return false;
    if(key===selected&&!refresh)return true;
    if(!refresh)view='overview';
    selected=key;resetDetail();
    const token=request,p={name:target.name,scope:target.scope};
    loading=true;render();content.scrollTop=0;
    if(focus)content.focus({preventScroll:true});
    try{
      const result=await sdk.call('detail',p);
      if(!alive||token!==request)return true;
      await management.select(p,result,{historyTarget});
      if(!alive||token!==request)return true;
      detail=result;
    }catch(e){if(alive&&token===request)error='项目读取失败：'+e.message;}
    finally{
      if(alive&&token===request){
        loading=false;render();
        if(view==='chats'&&detail)void loadChats();
      }
    }
    return true;
  }
  function setView(value){
    view=value;error='';
    render();content.scrollTop=0;content.focus({preventScroll:true});
    if(view==='chats'&&detail&&!chatData)void loadChats();
  }
  function render(){
    conversation.setActive(view==='chats'&&!!detail);
    syncTitlebar();
    catalog.hidden=!!selected;
    content.hidden=!selected;
    showMessage();content.replaceChildren();
    if(!selected)return;
    if(loading){content.append(el('p','kp-empty','正在读取项目记录…'));return;}
    if(!detail){content.append(el('p','kp-empty','项目详情暂不可用，请刷新重试。'));return;}
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
    if(!list.some(p=>projectKey(p)===key)){
      error='指定项目当前不可读取：'+name;showMessage();return false;
    }
    lastDeep=key;
    return choose(key,{focus:true});
  }
  renderScope();renderList();render();
  const unregisterClose=sdk.onBeforeClose(async()=>{
    const saved=await management.flushFileSaves();
    const accepted=saved&&!management.hasDrafts()||window.confirm('此项目窗口还有未保存内容。请取消关闭以继续处理草稿。仍要关闭窗口吗？');
    if(accepted)await management.closeReviews().catch(()=>{});
    return accepted;
  });
  const unsubscribe=sdk.subscribe(()=>{void followDeep();});
  void reload();
  return {dispose(){
    alive=false;request++;listRequest++;chatRequest++;
    unregisterClose?.();unsubscribe?.();management.dispose();lifecycle.dispose();conversation.dispose();
    root.remove();
  }};
}
