import {copyText} from '@ksf/sdk/components/ui/context-menu';
import {contextScopeForPath} from './context-scopes.js';
import {followPointer} from './project-card-motion.js';

const parent = path => path.slice(0,path.lastIndexOf('/'));
const basename = path => path.slice(path.lastIndexOf('/')+1);
const within = (path,folder) => path === folder || path.startsWith(folder+'/');
const fileOrder = new Intl.Collator('zh-CN',{numeric:true});
const SAVE_DELAY_MS = 800;
const el = (tag,cls,text) => {
  const node=document.createElement(tag);
  if(cls) node.className=cls;
  if(text!==undefined) node.textContent=text;
  return node;
};
function button(text,action,cls='pg-card-action') {
  const node=el('button',cls,text);
  node.type='button';
  node.addEventListener('click',action);
  return node;
}
export function contextDraftKey(sdk,project) {
  return [sdk.appId,'context-files',sdk.instanceId,project.scope,project.name].join(':');
}
export function createContextDrafts(sdk) {
  const projects=new Map(),pending=new Map();
  const saveKey=(project,path)=>contextDraftKey(sdk,project)+'\n'+path;
  function state(project) {
    const key=contextDraftKey(sdk,project);
    if(!projects.has(key)){
      let values=[];
      try { values=JSON.parse(sessionStorage.getItem(key)??'[]'); } catch { /* Keep the stored text until a draft is edited. */ }
      const drafts=new Map((Array.isArray(values)?values:[]).filter(item=>typeof item?.text==='string'&&typeof item.base?.version==='string').map(item=>[item.path,item]));
      projects.set(key,drafts);
    }
    return projects.get(key);
  }
  return {
    state,
    retain(project,file) {
      const drafts=state(project);
      if(file.text!==file.base.text) drafts.set(file.path,{path:file.path,base:file.base,text:file.text});
      else drafts.delete(file.path);
      const key=contextDraftKey(sdk,project);
      if(drafts.size) sessionStorage.setItem(key,JSON.stringify([...drafts.values()]));
      else sessionStorage.removeItem(key);
    },
    hasDrafts:()=>pending.size>0||[...projects.values()].some(drafts=>drafts.size),
    saving:()=>pending.size>0,
    wait:(project,path)=>pending.get(saveKey(project,path)),
    settle:()=>Promise.allSettled(pending.values()),
    track(project,path,operation){
      const key=saveKey(project,path);
      pending.set(key,operation);
      const finish=()=>{if(pending.get(key)===operation)pending.delete(key);};
      void operation.then(finish,finish);
      return operation;
    },
    discard(project){
      projects.delete(contextDraftKey(sdk,project));
      sessionStorage.removeItem(contextDraftKey(sdk,project));
    },
  };
}

export function createContextFileWorkspace({
  sdk,project,rootPath,objectPath,contextRoots,rootLabel='项目根目录',list,content,actions,status,reader,icon,iconButton,docLink,drafts,reviewSession,contextMenu,onOpen,onFallback,onUnread,displayName,showInFileNavigation,focusState,projectWritable,navigationAction,
}) {
  const root=parent(rootPath);
  const scopes=(contextRoots??[{objectPath,root,label:rootLabel}]).map(scope=>({...scope}));
  const primaryScope=scopes.find(scope=>scope.objectPath===objectPath)??scopes[0];
  const scopeFor=path=>contextScopeForPath(scopes,path);
  const rootFor=path=>scopeFor(path)?.root??root;
  const tree=el('ul','pg-context-tree');
  const controls=el('div','pg-file-controls');
  const syncState=el('p','pg-card-muted pg-file-sync');
  syncState.setAttribute('role','status');
  const openFolders=focusState.openFolders;
  const collapsedScopes=focusState.collapsedScopes??=new Set();
  const groups=new Map();
  const rows=new Map(), entries=new Map();
  const openedOnSave=new Set();
  let children=new Map(), selected=rootPath, supported=false, disposed=false, working=false, mutating=false;
  let canCreate=false;
  let active=null, mounted, request=0, form=null, moveDialog=null, timer;
  let loadingEditor;
  const scopedCall=(scope,action,data={})=>sdk.call('context-files',{...project,objectPath:scope.objectPath,action,reviewSession,...data});
  const call=(action,data={})=>scopedCall(scopeFor(data.path??selected)??primaryScope,action,data);
  const relative=path=>{const scope=scopeFor(path);return scope?(path===scope.root?scope.label:(scopes.length>1?scope.label+' / ':'')+path.slice(scope.root.length+1)):path;};
  function treeFolder(entry){
    let folder=parent(entry.path);
    if(entry.reason==='deleted'){
      while(folder!==rootFor(entry.path)&&entries.get(folder)?.kind!=='directory')folder=parent(folder);
    }
    return folder;
  }
  const treeName=(entry,folder)=>parent(entry.path)===folder?displayName(entry):entry.path.slice(folder.length+1);
  const work=()=>loadingEditor??=import('./context-file-editor.tsx').catch(error=>{loadingEditor=undefined;throw error;});
  function action(label,symbol,fn) {
    const control=iconButton(label,symbol,fn);
    control.removeAttribute('aria-controls');
    return control;
  }
  const newFile=action('新建文件','newNote',()=>inlineForm('file'));
  const newFolder=action('新建文件夹','folderPlus',()=>inlineForm('directory'));
  if(navigationAction)controls.append(navigationAction);
  controls.append(newFile,newFolder);
  controls.setAttribute('role','toolbar');
  controls.setAttribute('aria-label','文件导航操作');
  const treeWrap=el('div','pg-file-tree-wrap');
  treeWrap.append(controls,syncState,tree);
  const motion=new AbortController();
  const fileMotion=followPointer(list,motion.signal,{
    list:tree,header:controls,headerSelector:'.pg-file-controls',
    controlSelector:'.pg-project-context-row,.pg-file-scope-heading',
    selection:()=>list.querySelector('.pg-project-context-row[data-preview-active]')??list.querySelector('.pg-file-scope-heading[data-selected]')??list.querySelector('.pg-file-scope-heading[data-current]'),
    openMenu:()=>sdk.getSnapshot().root?.current?.querySelector('.app-context-menu[role="menu"]'),
    blocked:()=>!!form||!!moveDialog?.open||mutating,
    onScroll:()=>{},
  });
  const rootMenu=contextMenu(()=>menuActions(root),'当前文件夹操作');
  const openRootMenu=event=>{
    if(event.target.closest('button,input,textarea'))return;
    select(root);
    rootMenu.onContextMenu(event);
  };
  list.addEventListener('contextmenu',openRootMenu);
  function fallback(){
    treeWrap.remove();
    if(navigationAction){newFile.hidden=newFolder.hidden=true;list.prepend(controls);}
    onFallback();dispose();
  }
  function start(){
    if(timer||disposed)return;
    const poll=()=>{if(list.isConnected&&!document.hidden&&sdk.getSnapshot().enabled!==false)void refresh();};
    queueMicrotask(poll);
    timer=setInterval(poll,900);
    document.addEventListener('visibilitychange',poll);
    window.addEventListener('ksf:workspace-change',poll);
    cleanup=()=>{document.removeEventListener('visibilitychange',poll);window.removeEventListener('ksf:workspace-change',poll);};
  }
  let cleanup=()=>{};
  async function refresh(force=false) {
    if(disposed||working||mutating&&!force)return;
    working=true;
    try {
      if(!supported){
        syncState.textContent='正在建立本次审阅基线…';
        if(!list.contains(treeWrap))list.append(treeWrap);
      }
      const results=await Promise.all(scopes.map(async scope=>({scope,result:await scopedCall(scope,'changes',{revision:force?undefined:scope.revision,includeDeleted:true})})));
      if(disposed)return;
      if(results.some(({scope,result})=>result.supported===false||result.root!==scope.root)){fallback();return;}
      if(!supported){
        supported=true;
        list.replaceChildren(treeWrap);
      }
      const writable=results.find(({scope})=>scope===primaryScope).result.writable&&projectWritable();
      const permissionsChanged=writable!==canCreate;
      canCreate=writable;
      newFile.hidden=newFolder.hidden=!canCreate;
      const changed=results.some(({result})=>result.entries);
      for(const {scope,result} of results){
        scope.revision=result.revision;
        if(result.entries)scope.entries=result.entries.filter(entry=>entry.path!==scope.root&&within(entry.path,scope.root));
      }
      if(changed){
        entries.clear();
        children=new Map();
        for(const scope of scopes)for(const entry of scope.entries??[])entries.set(entry.path,entry);
        for(const entry of entries.values()){
          const folder=treeFolder(entry), members=children.get(folder)??[];
          members.push(entry);
          children.set(folder,members);
        }
        for(const [folder,members] of children)if(members.some(entry=>entry.reason==='deleted')){
          members.sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||
            fileOrder.compare(treeName(a,folder),treeName(b,folder))||a.path.localeCompare(b.path));
        }
      }
      if(changed||permissionsChanged)renderTree();
      for(const path of openedOnSave){
        const entry=entries.get(path);
        if(!entry)continue;
        openedOnSave.delete(path);
        if(entry.reason!=='deleted')void seen(entry);
      }
      syncState.textContent='';
      const file=active, latest=file&&entries.get(file.entry.path);
      if(latest){
        const deleted=latest.reason==='deleted';
        if(deleted!==!!file.deleted){
          file.deleted=deleted;
          mounted?.update(editorProps(file));
          syncEditor(file);
        }
        if(latest.stamp&&latest.stamp!==file.base.stamp&&!file.disk)await syncFromDisk(file);
      }
    }catch(error){
      if(disposed)return;
      if(error.code==='APP_SERVICE_UNKNOWN'){fallback();return;}
      if(!supported && !list.contains(treeWrap))list.append(syncState);
      syncState.textContent='自动更新暂时中断 · '+error.message;
    }finally{working=false;}
  }
  function menuActions(path){
    const entry=scopes.some(scope=>scope.root===path)?{path,kind:'directory'}:entries.get(path);
    if(disposed||!entry)return [];
    const items=[];
    function choose(fn){
      return ()=>{
        if(disposed)return;
        const current=scopes.some(scope=>scope.root===path)?entry:entries.get(path);
        if(!current)return;
        select(path);
        return fn(current);
      };
    }
    if(canCreate&&entry.reason!=='deleted'){
      items.push(
        {id:'new-file',label:'新建文件',onAction:choose(()=>inlineForm('file'))},
        {id:'new-folder',label:'新建文件夹',onAction:choose(()=>inlineForm('directory'))},
      );
    }
    if(entry.reason==='deleted')items.push({
      id:'view-deletion',label:'查看删除提醒',onAction:choose(current=>onOpen(current,{remember:false})),
    });
    if(canCreate&&entry.canMove){
      items.push(
        {id:'rename',label:'重命名',separator:items.length>0,onAction:choose(current=>inlineForm('rename',current))},
        {id:'move',label:'移动到…',onAction:choose(showMove)},
      );
    }
    items.push({id:'copy-path',label:'复制路径',separator:items.length>0,onAction:choose(current=>copyText(current.path))});
    return items;
  }
  function rowFor(entry){
    const item=el('li','pg-file-item'), line=el('div','pg-file-line');
    const label=el('span','pg-project-context-label'),badge=el('span','pg-file-unread');
    const open=button('',()=>{
      const current=entries.get(entry.path);
      if(!current)return;
      select(current.path);
      if(current.kind==='directory'){
        if(openFolders.has(current.path))openFolders.delete(current.path);
        else openFolders.add(current.path);
        renderTree();
      }else if(current.reason==='deleted'){
        onOpen(current,{remember:false});
      }else{
        if(active?.entry.path===current.path&&(mounted||active.disk)){
          if(current.unread){
            const viewed=(active.disk??active.base).stamp;
            if(!current.stamp||current.stamp===viewed)void seen(current,viewed);
            else void syncFromDisk(active,{viewed:true});
          }
          return;
        }
        onOpen(current);
      }
    },'pg-project-context-row');
    open.dataset.contextPath=entry.path;
    open.setAttribute('aria-keyshortcuts','Shift+F10');
    open.setAttribute('aria-controls',reader.id);
    open.append(icon(entry.kind==='directory'?'folder':'file'),label,badge);
    const menu=contextMenu(()=>menuActions(entry.path),'操作 · '+entry.name);
    line.addEventListener('contextmenu',event=>{
      select(entry.path);
      menu.onContextMenu(event);
    });
    line.addEventListener('keydown',menu.onKeyDown);
    line.append(open);
    item.append(line);
    const branch=entry.kind==='directory'?el('ul','pg-context-tree pg-file-branch'):null;
    if(branch)item.append(branch);
    const row={item,open,label,badge,branch,kind:entry.kind};
    rows.set(entry.path,row);
    return row;
  }
  function renderTree() {
    const counts=new Map();
    let unreadCount=0;
    for(const entry of entries.values())if(entry.unread&&showInFileNavigation(entry)){
      unreadCount++;
      for(let folder=treeFolder(entry);;folder=parent(folder)){
        counts.set(folder,(counts.get(folder)??0)+1);
        if(folder===rootFor(entry.path))break;
      }
    }
    for(const [path,row] of rows)if(entries.get(path)?.kind!==row.kind||!showInFileNavigation(entries.get(path))){
      row.item.remove();rows.delete(path);
    }
    function branch(folder,host){
      let cursor=host.firstElementChild;
      for(const entry of children.get(folder)??[]){
        if(!showInFileNavigation(entry))continue;
        const row=rows.get(entry.path)??rowFor(entry), expanded=openFolders.has(entry.path);
        const count=entry.kind==='directory'?(counts.get(entry.path)??0):Number(!!entry.unread);
        const label=treeName(entry,folder);
        const updated=!!entry.unread&&entry.reason==='updated';
        const deleted=entry.reason==='deleted';
        const notice=count?(row.branch?count+' 个未读文件':deleted?'已删除':updated?'已更新':'新文件'):'';
        row.label.textContent=label;
        row.open.title=entry.name+(notice?' · '+notice:'');
        const namedPage=displayName(entry)!==entry.name;
        row.open.toggleAttribute('data-managed-page',namedPage);
        row.open.toggleAttribute('data-preview-active',selected===entry.path);
        row.open.toggleAttribute('data-unread',!!count);
        row.open.setAttribute('aria-label',label+(namedPage?' · '+entry.name:'')+(notice?'，'+notice:''));
        row.badge.toggleAttribute('data-updated',updated);
        row.badge.toggleAttribute('data-deleted',deleted);
        row.badge.hidden=!count||!!row.branch&&expanded;
        row.badge.textContent=row.branch&&count?String(count):deleted?'D':updated?'M':'';
        row.badge.setAttribute('aria-hidden','true');
        if(cursor&&cursor===form?.node)cursor=cursor.nextElementSibling;
        if(cursor!==row.item)host.insertBefore(row.item,cursor);
        cursor=row.item.nextElementSibling;
        if(row.branch){
          row.open.setAttribute('aria-expanded',String(expanded));
          row.branch.hidden=!expanded;
          if(expanded)branch(entry.path,row.branch);
        }
      }
      if(form?.folder===folder){
        if(form.before&&rows.has(form.before)){
          const anchor=rows.get(form.before).item.nextSibling;
          if(anchor!==form.node)host.insertBefore(form.node,anchor);
        }
        else if(form.node.parentNode!==host)host.append(form.node);
      }
    }
    if(scopes.length===1)branch(root,tree);
    else for(const scope of scopes){
      let group=groups.get(scope.root);
      if(!group){
        const item=el('li','pg-file-scope'),head=button('',()=>{
          fileMotion.resetBrowsing();
          selected=scope.root;
          if(collapsedScopes.has(scope.root))collapsedScopes.delete(scope.root);else collapsedScopes.add(scope.root);
          renderTree();
        },'pg-file-scope-heading');
        const label=el('span','pg-file-scope-label',scope.label),badge=el('span','pg-file-unread'),body=el('ul','pg-context-tree pg-file-scope-tree');
        const chevron=el('span','pg-file-scope-chevron','›');chevron.setAttribute('aria-hidden','true');
        head.append(chevron,label,badge);head.title=scope.label;head.dataset.contextScope=scope.objectPath;
        head.setAttribute('aria-label',scope.label);
        const menu=contextMenu(()=>menuActions(scope.root),'操作 · '+scope.label);head.addEventListener('contextmenu',menu.onContextMenu);head.addEventListener('keydown',menu.onKeyDown);
        item.append(head,body);tree.append(item);group={item,head,badge,body};groups.set(scope.root,group);
      }
      const expanded=!collapsedScopes.has(scope.root),count=counts.get(scope.root)??0;
      group.head.toggleAttribute('data-selected',selected===scope.root);
      group.head.toggleAttribute('data-current',!!scope.current);
      group.head.setAttribute('aria-expanded',String(expanded));group.body.hidden=!expanded;
      group.head.setAttribute('aria-description',count?count+' 个未读文件':'');
      group.badge.hidden=!count||expanded;group.badge.textContent=String(count);
      if(expanded){group.body.querySelector('.pg-file-scope-empty')?.remove();branch(scope.root,group.body);if(!group.body.children.length)group.body.append(el('li','pg-file-scope-empty','暂无上下文文件'));}
    }
    onUnread(unreadCount);
  }
  function select(path){selected=path;renderTree();}
  function reveal(path){
    const base=rootFor(path);collapsedScopes.delete(base);
    for(let folder=parent(path);folder!==base&&within(folder,base);folder=parent(folder))openFolders.add(folder);
    select(path);
  }
  function revealFolder(path){
    if(path!==rootFor(path)){
      if(entries.get(path)?.kind!=='directory')return;
      openFolders.add(path);
    }
    reveal(path);
    const control=path===rootFor(path)?groups.get(path)?.head??controls.querySelector('button:not([hidden])')??tree.querySelector('button'):rows.get(path)?.open;
    control?.focus();
  }
  function changeTree(action,data,onSuccess) {
    mutating=true;
    return drafts.track(project,'tree:'+data.path,(async()=>{
      try {
        const result=await call(action,data);
        while(working&&!disposed)await new Promise(resolve=>setTimeout(resolve,25));
        if(disposed)return;
        await refresh(true);
        if(!disposed)onSuccess(result);
      }finally{mutating=false;}
    })());
  }
  function currentFolder(){
    const entry=entries.get(selected);
    return entry?.kind==='directory'?selected:entry?treeFolder(entry):rootFor(selected);
  }
  const validName=name=>name&&name!=='.'&&name!=='..'&&!/[\\/\x00-\x1f\x7f]/.test(name);
  function inlineForm(kind,entry){
    fileMotion.resetBrowsing();
    form?.node.remove();
    const folder=entry?parent(entry.path):currentFolder();
    collapsedScopes.delete(rootFor(folder));
    if(folder!==rootFor(folder))openFolders.add(folder);
    const item=el('li','pg-file-inline'),body=el('form'),input=el('input'),error=el('p','pg-card-error');
    const label=kind==='file'?'新建文件':kind==='directory'?'新建文件夹':'重命名';
    input.setAttribute('aria-label',label+'名称');
    input.placeholder=kind==='file'?'文件名.md':'名称';
    input.value=entry?.name??'';
    input.autocomplete='off';
    error.setAttribute('role','alert');
    const confirm=el('button','pg-card-action is-primary','确定');confirm.type='submit';
    const cancel=button('取消',close);
    function close(){
      item.remove();form=null;
      (entry?rows.get(entry.path)?.open:kind==='directory'?newFolder:newFile)?.focus({preventScroll:true});
    }
    body.append(el('small','pg-card-muted',relative(folder)),input,confirm,cancel,error);
    item.append(body);
    form={folder,node:item,before:entry?.path};
    renderTree();
    input.focus();
    if(entry)input.select();
    input.addEventListener('keydown',event=>{if(event.key==='Escape'&&!mutating){event.preventDefault();close();}});
    body.addEventListener('submit',async event=>{
      event.preventDefault();
      if(mutating)return;
      let name=input.value.trim();
      if(!validName(name)){error.textContent='请输入有效名称。';return;}
      if(kind==='file'&&!name.includes('.'))name+='.md';
      const path=folder+'/'+name;
      if(entry&&entry.path===path){close();return;}
      if(entry&&hasDraftUnder(entry.path)){error.textContent='请等自动保存完成，或先处理该位置的草稿。';return;}
      confirm.disabled=cancel.disabled=true;
      input.readOnly=true;
      error.textContent='';
      try{
        if(entry){
          const {version}=await call('moveVersion',{path:entry.path});
          await changeTree('move',{path:entry.path,destination:path,version},result=>{close();afterMove(result);});
        }else{
          await changeTree('create',{path,kind},result=>{
            close();
            if(kind==='directory')openFolders.add(result.path);
            reveal(result.path);
            rows.get(result.path)?.open.focus({preventScroll:true});
            const created=entries.get(result.path)??{path:result.path,name,kind,format:/\.md$|\.markdown$/i.test(name)?'markdown':'text'};
            if(kind==='file')onOpen(created,{edit:true});
          });
        }
      }catch(e){error.textContent=e.message;}
      finally{confirm.disabled=cancel.disabled=false;input.readOnly=false;}
    });
  }
  function hasDraftUnder(path){
    return [...drafts.state(project).keys()].some(file=>within(file,path)) || !!(active?.saving&&within(active.entry.path,path));
  }
  function afterMove(result){
    reveal(result.path);
    if(active?.entry&&within(active.entry.path,result.previousPath)){
      const path=result.path+active.entry.path.slice(result.previousPath.length);
      const entry=entries.get(path);
      if(entry)onOpen(entry,{edit:active.mode!=='preview'});
    }
    rows.get(result.path)?.open.focus({preventScroll:true});
  }
  function showMove(entry){
    fileMotion.resetBrowsing();
    moveDialog?.remove();
    const dialog=el('dialog','pg-file-move');
    moveDialog=dialog;
    const form=el('form'),heading=el('h3','','移动到…');
    const from=el('p','pg-card-muted',relative(entry.path));
    const preview=el('p','pg-card-muted'), error=el('p','pg-card-error');
    error.setAttribute('role','alert');
    const select=el('select');
    select.setAttribute('aria-label','目标文件夹');
    const base=rootFor(entry.path);
    for(const path of [base,...[...entries.values()].filter(e=>e.kind==='directory'&&rootFor(e.path)===base&&!within(e.path,entry.path)).map(e=>e.path)]){
      const option=el('option','',relative(path));option.value=path;select.append(option);
    }
    select.value=parent(entry.path);
    const destination=()=>select.value+'/'+entry.name;
    const confirm=el('button','pg-card-action is-primary','移动');confirm.type='submit';
    const cancel=button('取消',()=>dialog.close());
    function update(){
      confirm.disabled=destination()===entry.path;
      preview.textContent='目标 · '+relative(destination());
    }
    select.addEventListener('change',update);
    update();
    form.append(heading,from,select,preview,el('p','pg-card-muted','移动后请检查 Markdown 正文中的相对链接。'),confirm,cancel,error);
    dialog.append(form);
    list.append(dialog);
    dialog.addEventListener('close',()=>{
      dialog.remove();
      if(moveDialog===dialog)moveDialog=null;
      if(!mutating&&selected===entry.path)rows.get(entry.path)?.open.focus({preventScroll:true});
    });
    dialog.addEventListener('cancel',event=>{if(mutating)event.preventDefault();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(mutating||destination()===entry.path)return;
      if(hasDraftUnder(entry.path)){error.textContent='请等自动保存完成，或先处理该位置的草稿。';return;}
      select.disabled=confirm.disabled=cancel.disabled=true;
      try{
        const {version}=await call('moveVersion',{path:entry.path});
        await changeTree('move',{path:entry.path,destination:destination(),version},result=>{dialog.close();afterMove(result);});
      }catch(e){error.textContent=e.message;}
      finally{select.disabled=cancel.disabled=false;update();}
    });
    dialog.showModal();
  }

  function clearEditor(){mounted?.dispose();mounted=null;}
  function reset({discard=false}={}){
    request++;
    const previous=active, composing=previous?.composing;
    active=null;
    clearEditor();
    if(!previous)return;
    clearTimeout(previous.saveTimer);
    if(!discard&&!composing)void save(previous,{flush:true});
    status.textContent='';
    delete status.dataset.saveState;
  }
  function retain(file) {
    try{drafts.retain(project,file);file.recoveryError='';}
    catch{file.recoveryError='草稿暂时无法写入浏览器存储。请先保存或复制内容。';}
  }
  async function seen(entry,stamp){
    if(active?.entry.path===entry.path&&hasReview(active))return;
    const current=entries.get(entry.path);
    const token=stamp ? current?.stamp===stamp&&current.unread : entry.unread??current?.unread;
    if(!token)return;
    try{
      const result=await call('markRead',{path:entry.path,unread:token});
      if(result.reviewRequired)return;
      if(disposed)return;
      const item=entries.get(entry.path);
      if(item?.unread===token){
        if(item.reason==='deleted'){
          const folder=treeFolder(item);
          entries.delete(item.path);
          children.set(folder,children.get(folder).filter(child=>child.path!==item.path));
        }else item.unread=null;
      }
      renderTree();
      void refresh();
    }catch{ /* The next successful open can retry the receipt. */ }
  }
  function localOpen(path,hash){
    const entry=entries.get(path);
    if(entry?.kind==='file'&&active?.entry.path!==path)onOpen(entry);
    else if(hash&&active?.entry.path===path)content.querySelector('#'+CSS.escape(hash))?.scrollIntoView({block:'start'});
    else if(!entry)docLink('打开原文件',path).click();
  }
  const uploadedImages=new Set();
  const allowedImage=path=>entries.get(path)?.format==='image'||uploadedImages.has(path);
  async function uploadImage(file,image) {
    if(active!==file||!file.base.writable||file.deleted||file.disk)throw Error('请在可编辑的 Markdown 文件中插入图片。');
    if(!/\.(png|jpe?g|gif|webp)$/i.test(image.name)||image.size>20*1024*1024)throw Error('请选择 20 MB 以内的 PNG、JPEG、GIF 或 WebP 图片。');
    file.uploading=(file.uploading??0)+1;
    syncEditor(file);
    try{
      const base64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result).split(',')[1]);
        reader.onerror=()=>reject(Error('无法读取选中的图片。'));
        reader.readAsDataURL(image);
      });
      if(active!==file)throw Error('已离开当前文档，请重新插入图片。');
      const result=await sdk.request('/api/workspace/upload',{path:file.entry.path,name:image.name,base64});
      uploadedImages.add(result.path);
      window.dispatchEvent(new Event('ksf:workspace-change'));
      return encodeURI(result.relativePath);
    }finally{
      file.uploading--;
      scheduleSave(file);
    }
  }
  async function insertImage(file,image,insert){
    try{
      const path=await uploadImage(file,image);
      if(active!==file||file.deleted||file.disk)return;
      const alt=image.name.replace(/[\[\]\r\n]/g,'');
      insert('!['+alt+']('+path+')');
    }catch(error){
      file.error=error.message;
      syncEditor(file);
    }
  }
  function editFile(file,text){
    const wasReview=hasReview(file);
    file.text=text;
    file.message=file.error=file.saveError='';
    retain(file);
    scheduleSave(file);
    if(active===file){
      if(wasReview!==hasReview(file))fileActions(file);
      mounted?.update(editorProps(file));
    }
  }
  const hasReview=file=>typeof file.original==='string'&&file.original!==file.text;
  function editorProps(file,autoFocus=false){
    return {
      path:file.entry.path,text:file.text,mode:file.mode,writable:file.base.writable&&!file.deleted&&!file.disk&&file.mode!=='preview',
      canEdit:file.base.writable,
      isMarkdown:file.entry.format==='markdown',autoFocus,styleNonce:sdk.styleNonce??'',open:localOpen,allowLocal:allowedImage,
      reviewOriginal:file.original,onEdit:text=>editFile(file,text),
      outlineOpen:!!focusState.outlineOpen,outlineId:reader.id+'-outline',
      onOutlineChange:open=>toggleOutline(file,open),
      onSave:()=>void save(file,{flush:true,retry:true}),
      onComposition:value=>{file.composing=value;scheduleSave(file);},
      onUpload:(image,insert)=>void insertImage(file,image,insert),
    };
  }
  function syncEditor(file) {
    if(active!==file)return;
    const dirty=file.text!==file.base.text;
    const message=file.deleted?'文件已删除':file.disk?'待合并 · 自动保存暂停':file.saveError?'自动保存失败':
      file.error||file.recoveryError||file.reviewWarning||(file.saving?'自动保存中…':file.uploading?'正在上传图片…':
        dirty?(file.base.writable?'待自动保存':'草稿未保存 · 只读'):file.message||(file.base.writable?'与原件一致':'只读'));
    if(status.textContent!==message)status.textContent=message;
    status.title=file.saveError&&!file.disk&&!file.deleted?file.saveError+' · 按 ⌘S / Ctrl+S 重试':message;
    status.dataset.saveState=file.deleted||file.disk||file.saveError?'attention':message==='已自动保存'?'saved':'';
    if(file.reviewButton)file.reviewButton.disabled=!hasReview(file)||file.saving||file.reviewing||file.composing||
      !!file.uploading||!!file.disk||!!file.deleted;
  }
  function mergePane(file){
    const section=el('section','pg-file-merge');
    section.append(el('h3','','原文已更新'),el('p','pg-card-muted','核对三份内容后，采用合并结果即可恢复自动保存。'));
    const result=el('textarea');
    result.value=file.mergeText??file.text;result.rows=10;result.setAttribute('aria-label','合并结果');
    result.addEventListener('input',()=>{file.mergeText=result.value;});
    const versions=el('details');
    versions.open=true;
    versions.append(el('summary','','查看三份内容'));
    for(const [label,text] of [['共同基线',file.base.text],['我的草稿',file.text],['最新原文',file.disk.text]]){
      const field=el('label','pm-field',label), area=el('textarea');
      area.value=text;area.rows=5;area.readOnly=true;field.append(area);versions.append(field);
    }
    section.append(versions,result,button('采用合并结果',()=>{
      const merged=result.value.replace(/\r\n?|\n/g,file.text.includes('\r\n')?'\r\n':'\n');
      file.base=file.disk;file.disk=null;file.mergeText=null;editFile(file,merged);void drawFile(file);
    },'pg-card-action is-primary'),button('采用最新原文',()=>{
      file.base=file.disk;file.disk=null;file.mergeText=null;editFile(file,file.base.text);void drawFile(file);
    }));
    return section;
  }
  function labeledAction(label,symbol,action,text=label){
    const control=iconButton(label,symbol,action);
    control.classList.add('pg-file-labeled-action');
    control.append(el('span','',text));
    return control;
  }
  function fileActions(file){
    actions.replaceChildren();
    const markdown=file.entry.format==='markdown';
    const large=file.text.length>1024*1024;
    const available=markdown&&!large
      ? [['live','即时预览','edit'],['source','源码','code'],['split','分栏','split'],['preview','阅读','eye']]
      : [['source','源码','code'],['preview','阅读','eye']];
    if(file.base.writable&&!file.disk&&!hasReview(file)){
      const modes=el('div','pg-file-modes');
      modes.setAttribute('role','group');
      modes.setAttribute('aria-label','文档视图');
      for(const [mode,label,symbol] of available){
        const control=labeledAction(label,symbol,()=>{
          if(mode===file.mode||file.uploading||file.composing)return;
          file.mode=mode;
          for(const item of modes.children)item.setAttribute('aria-pressed',String(item.dataset.mode===mode));
          mounted?.update(editorProps(file));
          syncEditor(file);
        });
        control.dataset.mode=mode;
        control.setAttribute('aria-pressed',String(mode===file.mode));
        modes.append(control);
      }
      actions.append(modes);
    }
    if(markdown&&!file.disk){
      file.outlineButton=labeledAction('大纲','outline',()=>toggleOutline(file,!focusState.outlineOpen));
      file.outlineButton.classList.add('pg-file-outline-toggle');
      file.outlineButton.setAttribute('aria-pressed',String(!!focusState.outlineOpen));
      file.outlineButton.setAttribute('aria-expanded',String(!!focusState.outlineOpen));
      file.outlineButton.setAttribute('aria-controls',reader.id+'-outline');
      actions.append(file.outlineButton);
    }
  }
  function toggleOutline(file,open){
    if(active!==file)return;
    focusState.outlineOpen=open;
    file.outlineButton?.setAttribute('aria-pressed',String(open));
    file.outlineButton?.setAttribute('aria-expanded',String(open));
    mounted?.update(editorProps(file));
    if(!open)file.outlineButton?.focus({preventScroll:true});
  }
  async function drawFile(file,{focus=false}={}){
    const render=++file.render;
    clearEditor();
    if(!file.base.writable)file.mode='preview';
    if(file.text.length>1024*1024&&file.mode!=='preview')file.mode='source';
    fileActions(file);
    const toolbar=el('div','pg-document-edit-toolbar');
    toolbar.setAttribute('role','group');
    toolbar.setAttribute('aria-label','文档编辑工具');
    const formatHost=el('div','pg-document-format-tools');
    toolbar.append(formatHost);
    file.reviewButton=labeledAction('已审阅','check',()=>void markReviewed(file));
    const reviewControls=el('div','pg-document-edit-group pg-document-review-actions');
    reviewControls.append(file.reviewButton);
    if(typeof file.original==='string'&&!file.disk)toolbar.append(reviewControls);
    const host=el('div','pg-file-document');
    content.replaceChildren(toolbar,host);
    syncEditor(file);
    if(file.disk){host.append(mergePane(file));return true;}
    const current=()=>active===file&&render===file.render&&!disposed;
    try{
      const modules=await work();
      if(!current())return false;
      mounted=modules.mountFileEditor(host,editorProps(file,focus),formatHost);
      return true;
    }catch(error){
      if(!current())return false;
      host.replaceChildren(el('p','pg-card-error',error.message),button('重试',async()=>{
        if(await drawFile(file,{focus}))void seen(file.entry,(file.disk??file.base).stamp);
      }));
      return false;
    }
  }
  function applyLatest(file,latest){
    if(typeof latest.reviewOriginal==='string')file.original=latest.reviewOriginal;
    file.reviewWarning=latest.reviewWarning??'';
    if(file.text===latest.text||file.text===file.base.text){
      file.base=latest;file.text=latest.text;file.disk=null;file.saveError='';retain(file);
    }else if(latest.version!==file.base.version)file.disk=latest;
    else{file.base=latest;file.disk=null;file.mergeText=null;}
  }
  async function syncFromDisk(file,{viewed=false}={}){
    if(file.deleted||file.saving||file.reloading||file.uploading||file.composing)return;
    file.reloading=true;
    const before=file.base;
    try{
      const latest=await call('read',{path:file.entry.path});
      if(active!==file||file.composing||file.saving||file.base!==before)return;
      applyLatest(file,latest);
      fileActions(file);
      if(latest.version!==before.version)file.message='已同步外部更新';
      file.error='';
      if(file.disk||before.writable!==file.base.writable||!mounted){
        if(!await drawFile(file))return;
      }else{
        mounted.update(editorProps(file));syncEditor(file);
      }
      if(viewed&&active===file)void seen(file.entry,latest.stamp);
    }catch(error){file.error=error.message;syncEditor(file);}
    finally{file.reloading=false;}
  }
  const canSave=file=>file.base.writable&&!file.deleted&&!file.composing&&!file.uploading&&!file.disk&&file.text!==file.base.text;
  function scheduleSave(file){
    if(active!==file)return;
    clearTimeout(file.saveTimer);
    if(!file.saving&&!file.saveError&&canSave(file))file.saveTimer=setTimeout(()=>void save(file),SAVE_DELAY_MS);
    syncEditor(file);
  }
  function save(file,{flush=false,retry=false}={}){
    clearTimeout(file.saveTimer);
    if(file.saving){
      file.flush||=flush;
      return drafts.wait(project,file.path);
    }
    if(retry)file.saveError='';
    if(!canSave(file)||file.saveError){syncEditor(file);return;}
    file.flush=flush;
    file.saving=true;file.error='';
    syncEditor(file);
    return drafts.track(project,file.entry.path,commit(file));
  }
  async function commit(file){
    let saved=false;
    try{
      do{
        const text=file.text;
        const latest=await call('save',{path:file.path,text,version:file.base.version});
        if(latest.text!==text){
          if(file.text===latest.text)applyLatest(file,latest);
          else file.disk=latest;
          break;
        }
        file.base=latest;
        file.message='已自动保存';
        retain(file);
        saved=true;
      }while(file.flush&&canSave(file));
    }catch(error){
      file.saveError=error.message;
      if(error.code==='WORKSPACE_CONFLICT'){
        try{applyLatest(file,await call('read',{path:file.entry.path}));}
        catch{ /* Preserve the draft if the file was removed or access changed. */ }
      }
    }finally{
      file.saving=false;
      file.flush=false;
      if(active===file){
        if(file.disk)void drawFile(file);
        else{fileActions(file);mounted?.update(editorProps(file));scheduleSave(file);}
      }
      if(saved)window.dispatchEvent(new Event('ksf:workspace-change'));
    }
  }
  async function markReviewed(file){
    if(active!==file||file.reviewing||file.disk||file.deleted||file.composing||file.uploading)return;
    file.reviewing=true;
    const shown=file.text;
    syncEditor(file);
    try{
      await save(file,{flush:true});
      if(active!==file||file.disk||file.saveError||file.text!==shown||file.base.text!==shown)return;
      const value=await call('markReviewed',{path:file.path,version:file.base.version});
      if(active!==file)return;
      file.original=value.reviewOriginal;
      file.message='已审阅';file.error='';
      fileActions(file);
      mounted?.update(editorProps(file));
      void refresh(true);
    }catch(error){
      file.error=error.message;
      if(error.code==='WORKSPACE_CONFLICT')await syncFromDisk(file);
    }finally{file.reviewing=false;syncEditor(file);}
  }
  async function open(entry,{edit=false}={}){
    reset();
    if(entry.reason==='deleted'){
      const heading=el('h3','','文件已删除');
      heading.tabIndex=-1;
      const notice=el('section','pg-file-merge');
      notice.append(heading,el('p','pg-card-muted','原路径 · '+relative(entry.path)));
      const draft=drafts.state(project).get(entry.path);
      if(draft){
        const label=el('label','pm-field','未保存草稿');
        const text=el('textarea');text.value=draft.text;text.readOnly=true;text.rows=8;
        label.append(text);
        notice.append(label);
      }
      content.replaceChildren(notice);
      heading.focus({preventScroll:true});
      void seen(entry);
      return;
    }
    reveal(entry.path);
    const token=request;
    const current=()=>!disposed&&request===token;
    if(entry.format==='image'){
      const image=el('img','pg-file-image');image.alt=entry.name;
      image.addEventListener('load',()=>{if(current())void seen(entry);});
      image.addEventListener('error',()=>{if(current())content.replaceChildren(el('p','pg-card-error','图片无法预览。'),docLink('打开原文件 ↗',entry.path));});
      const params=new URLSearchParams({path:entry.path});
      if(entry.stamp)params.set('version',entry.stamp);
      image.src='/api/workspace/media?'+params;
      content.replaceChildren(image);
      return;
    }
    if(entry.format==='external'){
      const link=docLink('打开原文件 ↗',entry.path);
      link.addEventListener('click',()=>void seen(entry));
      content.replaceChildren(el('p','pg-card-muted','此格式可在原文件入口查看。'),link);
      return;
    }
    try{
      await drafts.wait(project,entry.path);
      if(!current())return;
      const base=await call('read',{path:entry.path});
      if(!current())return;
      const draft=drafts.state(project).get(entry.path);
      const file={entry,base:draft?.base??base,text:draft?.text??base.text,path:entry.path,render:0,
        mode:base.writable?(entry.format==='markdown'?'live':'source'):'preview'};
      active=file;
      applyLatest(file,base);
      if(await drawFile(file,{focus:base.writable&&(edit||entry.format==='markdown')})&&current()){
        scheduleSave(file);
        void seen(entry,base.stamp);
      }
    }catch(error){
      if(current())content.replaceChildren(el('p','pg-card-error',error.message),button('重试',()=>onOpen(entry,{edit})));
    }
  }
  function dispose(){
    disposed=true;motion.abort();reset();clearInterval(timer);cleanup();
    list.removeEventListener('contextmenu',openRootMenu);
    moveDialog?.remove();
  }
  return {start,open,reset,select,seen,revealFolder,dispose,supported:()=>supported,mutating:()=>mutating,
    flush:()=>active&&save(active,{flush:true}),
    isOpen:path=>active?.entry.path===path&&!!mounted,
    observeOpened(path){openedOnSave.add(path);void refresh(true);},
  };
}
