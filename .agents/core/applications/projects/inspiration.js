import {randomId} from '@ksf/sdk/random-id';
import {textBase64,reconcileNote} from './notes-model.js';
import {parseOutline,serializeOutline,changeOutline,visibleOutlineRows,outlineId} from './inspiration-outline.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn,cls='kp-text-button')=>{const n=el('button',cls,text);n.type='button';n.addEventListener('click',fn);return n;};
const newId=()=>'note_'+randomId().replace(/[^A-Za-z0-9]/g,'');
const scopeLabel={project:'项目',milestone:'里程碑',task:'任务'};
const fromBase64=value=>new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));

export function createInspiration({sdk,docLink,onDrawerChange,onSaved}){
  const node=el('section','pg-inspiration');
  const menuEvents=new AbortController();
  function closeMenus(except=null){
    for(const menu of node.querySelectorAll('.pg-outline-menu[open]'))if(menu!==except)menu.open=false;
  }
  node.ownerDocument.addEventListener('pointerdown',event=>{
    for(const menu of node.querySelectorAll('.pg-outline-menu[open]'))if(!menu.contains(event.target))menu.open=false;
  },{capture:true,signal:menuEvents.signal});
  node.addEventListener('wheel',()=>closeMenus(),{capture:true,passive:true,signal:menuEvents.signal});
  window.addEventListener('blur',()=>closeMenus(),{signal:menuEvents.signal});
  let selected=null,storage='',entries=new Map(),entry=null,owner=null,generation=0,alive=true,visible=false,loading=false,loadError='',storageBroken=false,timer,job=null,composing=false;
  let status,errorBox,editor,summary,sourceButton,undoButton,redoButton,retryButton;
  const dirty=n=>!!n&&(n.text!==n.base.text||!!n.pendingRequest||!!n.conflict);
  const writable=n=>selected?.scope!=='archived'&&!n?.base.readOnly&&!storageBroken;
  const ownerLabel=()=>`${scopeLabel[owner?.metadata.kind]??'记录'} · ${owner?.metadata.name??''}`;
  const read=ownerPath=>sdk.call('inspiration.read',{...selected,ownerPath});
  function persist(){
    if(!storage||storageBroken)return;
    try{
      const drafts=[...entries.values()].filter(n=>dirty(n)||n.previousText!==undefined).map(n=>({path:n.path,ownerPath:n.ownerPath,text:n.text,base:n.base,pendingRequest:n.pendingRequest,pendingText:n.pendingText,conflict:n.conflict,previousText:n.previousText}));
      if(drafts.length)sessionStorage.setItem(storage,JSON.stringify({schemaVersion:1,drafts}));else sessionStorage.removeItem(storage);
    }catch{if(entry)entry.issue='窗口草稿暂时无法保留，请复制原文后再关闭。';}
  }
  function hydrate(n){
    n.collapsed??=new Set();n.undo??=[];n.redo??=[];
    try{n.model=parseOutline(n.text);n.raw=false;if(!n.model.rows.length)n.model.rows.push({id:outlineId(),depth:0,text:'',done:false});}
    catch(e){n.model=null;n.raw=true;n.formatIssue=e.message;}
    return n;
  }
  function select(project){
    clearTimeout(timer);persist();onDrawerChange?.(null);visible=false;generation++;selected=project;
    storage=sdk.appId+':inspiration:'+sdk.instanceId+':'+project.scope+':'+project.name;
    entries=new Map();entry=null;owner=null;loadError='';storageBroken=false;
    try{
      const raw=JSON.parse(sessionStorage.getItem(storage)??'{"schemaVersion":1,"drafts":[]}');
      if(raw.schemaVersion!==1||!Array.isArray(raw.drafts))throw Error();
      for(const n of raw.drafts){const ownerPath=n.ownerPath??n.milestonePath;if(typeof n.path!=='string'||typeof ownerPath!=='string'||typeof n.text!=='string'||typeof n.base?.text!=='string'||typeof n.base?.etag!=='string')throw Error();entries.set(n.path,hydrate({...n,ownerPath}));}
    }catch{storageBroken=true;loadError='灵感草稿读取失败，原始窗口存储已保留；当前原文只读。';}
  }
  async function open(d){
    if(visible&&owner?.path===d.path){node.querySelector('textarea')?.focus();return;}
    await flush();persist();owner=d;entry=null;loading=true;const g=++generation;visible=true;draw();
    onDrawerChange?.({node,owner:ownerLabel(),close:()=>void close()});
    try{
      const latest=await read(d.path);if(!alive||g!==generation)return;
      const old=entries.get(latest.path);
      if(old){
        if(old.pendingRequest&&latest.text===(old.pendingText??fromBase64(old.pendingRequest.changes[0].contentBase64))){old.base=latest;old.pendingRequest=null;old.pendingText=null;}
        else{const r=reconcileNote(old.base,old.text,latest);if(r.conflict)old.conflict=latest;else{old.base=r.base;if(old.text!==r.text){old.text=r.text;hydrate(old);}}}
        entry=old;
      }else entry=hydrate({path:latest.path,ownerPath:d.path,text:latest.text,base:latest,pendingRequest:null});
      if(storageBroken)entry.formatIssue=loadError;entries.set(entry.path,entry);
    }catch(e){if(g===generation)loadError=e.message;}
    finally{if(alive&&g===generation){loading=false;persist();draw();if(entry&&dirty(entry)&&!entry.conflict&&!entry.issue)schedule();}}
  }
  async function close(){const g=generation;closeMenus();await flush();if(!alive||g!==generation)return;persist();visible=false;onDrawerChange?.(null);}
  function checkpoint(n,group=''){
    if(!group||n.undoGroup!==group||Date.now()-(n.undoAt??0)>1000){n.undo.push({text:n.text,model:n.model,raw:n.raw});if(n.undo.length>50)n.undo.shift();}
    n.undoGroup=group;n.undoAt=Date.now();n.redo=[];
  }
  function changed(n){
    n.issue='';n.formatIssue='';n.text=n.raw?n.text:serializeOutline(n.model);persist();sync();schedule();
  }
  function schedule(){clearTimeout(timer);if(!composing)timer=setTimeout(()=>void save(entry),800);}
  function focusRow(id,caret){
    const input=[...node.querySelectorAll('[data-outline-row]')].find(row=>row.dataset.outlineRow===id)?.querySelector('textarea');
    if(!input)return;input.focus({preventScroll:true});const position=caret??input.value.length;input.setSelectionRange(position,position);input.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function act(action){
    const n=entry;if(!n?.model||!writable(n))return;
    const result=changeOutline(n.model.rows,action);
    if(result.rows.length===n.model.rows.length&&result.rows.every((row,i)=>{const old=n.model.rows[i];return row.id===old.id&&row.depth===old.depth&&row.text===old.text&&row.done===old.done;}))return;
    checkpoint(n);n.model={...n.model,rows:result.rows};
    if(!n.model.rows.length)n.model.rows=[{id:outlineId(),depth:0,text:'',done:false}];
    if(result.expand)n.collapsed.delete(result.expand);
    changed(n);renderRows();focusRow(result.focus??n.model.rows[0].id,result.caret);
  }
  function history(redo=false){
    const n=entry,from=redo?n?.redo:n?.undo,to=redo?n?.undo:n?.redo;
    if(!from?.length||!writable(n))return;
    to.push({text:n.text,model:n.model,raw:n.raw});Object.assign(n,from.pop());n.undoGroup='';changed(n);renderEditor();node.querySelector('textarea')?.focus();
  }
  function height(input){input.style.height='auto';input.style.height=Math.max(28,input.scrollHeight)+'px';}
  function renderRows(){
    if(!editor||!entry?.model)return;
    const n=entry,scroll=editor.scrollTop,left=editor.scrollLeft,list=el('ol','pg-outline-list');
    list.setAttribute('aria-label','灵感大纲');
    const depth=n.model.rows.reduce((max,row)=>Math.max(max,row.depth),0);list.style.setProperty('--outline-min-width',`${depth*18+300}px`);
    for(const item of visibleOutlineRows(n.model.rows,n.collapsed)){
      const row=el('li','pg-outline-row');row.dataset.outlineRow=item.id;row.dataset.done=String(item.done);row.style.setProperty('--outline-depth',String(item.depth));
      const collapse=button(item.hasChildren?(n.collapsed.has(item.id)?'▸':'▾'):'',()=>{},'pg-outline-toggle');
      // Assign handlers separately so the same row control remains keyboard reachable.
      collapse.className='pg-outline-toggle';collapse.disabled=!item.hasChildren;
      collapse.title=n.collapsed.has(item.id)?'展开子行':'折叠子行';collapse.setAttribute('aria-label',collapse.title);
      if(item.hasChildren)collapse.setAttribute('aria-expanded',String(!n.collapsed.has(item.id)));
      collapse.onclick=()=>{if(n.collapsed.has(item.id))n.collapsed.delete(item.id);else n.collapsed.add(item.id);renderRows();[...editor.querySelectorAll('[data-outline-row]')].find(x=>x.dataset.outlineRow===item.id)?.querySelector('button')?.focus();};
      const check=el('input','pg-outline-check');check.type='checkbox';check.checked=item.done;check.disabled=!writable(n);check.setAttribute('aria-label','完成：'+(item.text||'空白灵感'));
      check.addEventListener('change',()=>{checkpoint(n);n.model={...n.model,rows:n.model.rows.map(r=>r.id===item.id?{...r,done:check.checked}:r)};row.dataset.done=String(check.checked);changed(n);});
      const input=el('textarea','pg-outline-text');input.rows=1;input.value=item.text;input.placeholder='记下一条灵感…';input.readOnly=!writable(n);input.setAttribute('aria-label',`第 ${item.depth+1} 级灵感`);input.setAttribute('aria-describedby','inspiration-shortcuts-'+sdk.instanceId);
      input.addEventListener('input',()=>{checkpoint(n,'text:'+item.id);n.model={...n.model,rows:n.model.rows.map(r=>r.id===item.id?{...r,text:input.value.replace(/[\r\n]+/g,' ')}:r)};check.setAttribute('aria-label','完成：'+(input.value||'空白灵感'));height(input);changed(n);});
      input.addEventListener('keydown',event=>{
        if(event.isComposing||composing||!writable(n))return;
        if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey);return;}
        if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();act({kind:'toggle',id:item.id});return;}
        if(event.key==='Tab'){event.preventDefault();act({kind:event.shiftKey?'outdent':'indent',id:item.id});return;}
        if(event.key==='Enter'){event.preventDefault();act({kind:event.altKey?'child':'split',id:item.id,start:input.selectionStart,end:input.selectionEnd});return;}
        if(event.key==='Backspace'&&!input.value&&n.model.rows.length>1){event.preventDefault();act({kind:'remove',id:item.id});}
      });
      input.addEventListener('paste',event=>{const text=event.clipboardData?.getData('text/plain');if(text&&/[\r\n]/.test(text)&&writable(n)){event.preventDefault();act({kind:'paste',id:item.id,text,start:input.selectionStart,end:input.selectionEnd});}});
      const actions=el('span','pg-outline-row-actions');
      const child=button('+',()=>act({kind:'child',id:item.id}),'pg-outline-child');child.title='添加子行';child.setAttribute('aria-label','添加子行');child.disabled=!writable(n);
      const menu=el('details','pg-outline-menu'),trigger=el('summary','','⋯');trigger.title='行操作';trigger.setAttribute('aria-label','行操作');menu.append(trigger);
      trigger.addEventListener('click',()=>closeMenus(menu));
      menu.addEventListener('focusout',event=>{if(!menu.contains(event.relatedTarget))menu.open=false;});
      const commands=el('div','pg-outline-commands');
      let sibling=n.model.rows.findIndex(r=>r.id===item.id)-1;while(sibling>=0&&n.model.rows[sibling].depth>item.depth)sibling--;
      const indentable=sibling>=0&&n.model.rows[sibling].depth===item.depth;
      for(const [label,kind] of [['添加同级行','sibling'],['添加子行','child'],['缩进一级','indent'],['提升一级','outdent'],['删除本行，保留子行','remove']]){const control=button(label,()=>{menu.open=false;act({kind,id:item.id});});control.disabled=!writable(n)||(kind==='outdent'&&item.depth===0)||(kind==='indent'&&!indentable);commands.append(control);}
      menu.append(commands);menu.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){event.preventDefault();event.stopPropagation();menu.open=false;trigger.focus();}});
      actions.append(child,menu);row.append(collapse,check,input,actions);list.append(row);
    }
    editor.replaceChildren(list);editor.scrollTop=scroll;editor.scrollLeft=left;
    requestAnimationFrame(()=>{if(alive&&editor?.contains(list))list.querySelectorAll('textarea').forEach(height);});
    sync();
  }
  function renderEditor(){
    if(!entry||!editor)return;
    sourceButton.textContent=entry.raw?'文字大纲':'原文';sourceButton.title=entry.raw?'返回文字大纲':'查看或编辑 Markdown 原文';
    if(entry.raw){
      const n=entry,input=el('textarea','pg-outline-source');input.value=n.text;input.readOnly=!writable(n);input.setAttribute('aria-label','灵感 Markdown 原文');input.spellcheck=false;
      input.addEventListener('input',()=>{const eol=n.base.text.includes('\r\n')?'\r\n':'\n';n.text=input.value.replace(/\r?\n/g,eol);n.model=null;changed(n);});editor.replaceChildren(input);
    }else renderRows();
  }
  function toggleSource(){
    if(!entry)return;
    if(entry.raw){try{const model=parseOutline(entry.text);if(!model.rows.length)model.rows.push({id:outlineId(),depth:0,text:'',done:false});entry.model=model;entry.raw=false;entry.formatIssue='';}catch(e){entry.formatIssue=e.message;sync();return;}}
    else entry.raw=true;
    renderEditor();sync();
  }
  function resolveConflict(mine){
    const n=entry,latest=n?.conflict;if(!latest)return;
    n.previousText=mine?latest.text:n.text;
    if(!mine){n.text=latest.text;hydrate(n);}
    n.base=latest;n.pendingRequest=null;n.pendingText=null;n.conflict=null;n.issue='';persist();draw();if(mine)schedule();
  }
  function draw(){
    if(!alive)return;node.replaceChildren();status=errorBox=editor=summary=sourceButton=undoButton=redoButton=retryButton=null;
    const heading=el('header','pg-inspiration-heading'),ownerText=el('span','pg-inspiration-owner',ownerLabel());ownerText.title=ownerLabel();
    status=el('span','pg-outline-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    heading.append(el('strong','','灵感闪现'),ownerText,status);node.append(heading);
    if(!entry){status.textContent=loading?'正在打开…':'打开失败';const message=el('p',loadError?'pm-error':'kp-empty',loadError||(loading?'正在打开灵感…':'灵感暂时无法打开。'));node.append(message);if(!loading)node.append(button('重新打开',()=>{visible=false;void open(owner);}));return;}
    const n=entry,toolbar=el('div','pg-outline-toolbar');
    const add=button('+',()=>{if(n.raw)toggleSource();if(!n.raw)act({kind:'append'});},'pg-outline-add');add.disabled=!writable(n);add.title='新增一行';add.setAttribute('aria-label','新增一行');
    sourceButton=button('原文',toggleSource,'pg-outline-source-toggle');
    undoButton=button('撤销',()=>history(),'pg-outline-undo');redoButton=button('重做',()=>history(true),'pg-outline-redo');undoButton.title='撤销（⌘Z / Ctrl+Z）';redoButton.title='重做（⇧⌘Z / Ctrl+Shift+Z）';
    toolbar.append(undoButton,redoButton,sourceButton,add);node.append(toolbar);
    errorBox=el('div','pg-outline-feedback');errorBox.setAttribute('aria-live','polite');node.append(errorBox);
    if(n.conflict){const box=el('section','pg-note-conflict');box.append(el('h3','','有另一份修改'),el('p','kp-muted','你的大纲保留在下方。核对最新原文后，选择继续编辑哪一份。'),el('pre','',n.conflict.text||'（空白记录）'),button('保留我的大纲',()=>resolveConflict(true)),button('采用最新内容',()=>resolveConflict(false)));node.append(box);}
    editor=el('div','pg-outline-scroll');node.append(editor);
    const footer=el('footer','pg-outline-footer'),hint=el('span','','Enter 换行 · Tab 缩进 · Shift+Tab 提升');hint.id='inspiration-shortcuts-'+sdk.instanceId;
    summary=el('span','pg-outline-summary');
    footer.append(hint,summary);node.append(footer);
    if(n.previousText!==undefined){const recovery=el('details','pg-outline-recovery');recovery.append(el('summary','','保留的另一份文字'),el('pre','',n.previousText));node.append(recovery);}
    renderEditor();sync();requestAnimationFrame(()=>{if(visible&&node.isConnected)node.querySelector('textarea')?.focus({preventScroll:true});});
  }
  function sync(){
    if(!entry||!status)return;const n=entry;
    status.textContent=!writable(n)?'只读':n.conflict?'修改待核对':n.issue?'未保存 · 草稿已保留':job?'自动保存中…':n.pendingRequest?'保存回执待核对':n.text!==n.base.text?'待自动保存':'已保存';
    if(errorBox){errorBox.replaceChildren();const issue=n.issue||(storageBroken?loadError:n.formatIssue);if(issue){errorBox.append(el('span','pm-error',issue));if(n.issue&&!n.conflict){retryButton=button('重试保存',()=>{n.issue='';void save(n);});errorBox.append(retryButton);}}}
    if(summary){const rows=n.model?.rows.filter(row=>row.text.trim())??[];summary.textContent=rows.length?`${rows.filter(row=>row.done).length}/${rows.length} 已完成`:'';}
    if(undoButton)undoButton.disabled=!writable(n)||!n.undo.length||n.raw;if(redoButton)redoButton.disabled=!writable(n)||!n.redo.length||n.raw;
  }
  async function save(n){
    if(!n||!alive||!writable(n)||n.conflict||n.issue||composing||!dirty(n))return;
    if(job){await job;if(dirty(n)&&!n.conflict&&!n.issue)return save(n);return;}
    const project={...selected},g=generation;
    job=(async()=>{
      try{
        if(!n.pendingRequest){
          const sentText=n.text,current=await sdk.call('governance.read',project);
          if(!alive||g!==generation)return;
          n.pendingText=sentText;n.pendingRequest={operationId:newId(),ifMatch:current.etag,changes:[{path:n.path,ifMatch:n.base.etag,contentBase64:textBase64(sentText)}]};persist();
        }
        const sentText=n.pendingText??fromBase64(n.pendingRequest.changes[0].contentBase64);
        const result=await sdk.call('governance.apply',{...project,data:n.pendingRequest});
        const latest=await sdk.call('inspiration.read',{...project,ownerPath:n.ownerPath});if(!alive||g!==generation)return;
        if(latest.text===sentText){n.base=latest;n.pendingRequest=null;n.pendingText=null;n.conflict=null;n.issue='';onSaved?.(result,n.path);}
        else{n.pendingRequest=null;n.pendingText=null;n.conflict=latest;}
      }catch(e){
        if(!alive||g!==generation)return;
        if(['PROJECT_GOVERNANCE_CONFLICT','PROJECT_GOVERNANCE_OPERATION_CONFLICT'].includes(e.code)){
          try{
            const latest=await sdk.call('inspiration.read',{...project,ownerPath:n.ownerPath});
            if(!alive||g!==generation)return;
            const sent=n.pendingText;
            if(latest.text===n.text||latest.text===sent){n.base=latest;n.pendingRequest=null;n.pendingText=null;n.issue='';}
            else if(latest.text===n.base.text&&e.code==='PROJECT_GOVERNANCE_CONFLICT'){n.base=latest;n.pendingRequest=null;n.pendingText=null;n.issue='';}
            else{n.conflict=latest;if(e.code==='PROJECT_GOVERNANCE_CONFLICT'){n.pendingRequest=null;n.pendingText=null;}}
          }catch(readError){n.issue='暂时无法核对原文：'+readError.message;}
        }else{n.issue=e.message;if(['PROJECT_GOVERNANCE_INVALID','PROJECT_GOVERNANCE_INPUT','PROJECT_GOVERNANCE_ARCHIVED','PROJECT_GOVERNANCE_SIZE'].includes(e.code)){n.pendingRequest=null;n.pendingText=null;}}
      }finally{persist();}
    })();
    sync();try{await job;}finally{job=null;if(alive&&g===generation){if(n.conflict&&n===entry&&!composing)draw();else sync();if(dirty(n)&&!n.conflict&&!n.issue&&n===entry)schedule();}}
  }
  async function flush(){
    clearTimeout(timer);if(job)await job;
    for(const n of entries.values())if(dirty(n)&&!n.conflict&&!n.issue)await save(n);
    clearTimeout(timer);return ![...entries.values()].some(dirty);
  }
  node.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);});
  node.addEventListener('compositionend',()=>{composing=false;if(entry?.conflict)draw();else schedule();});
  node.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void flush();}});
  return {node,select,open,flush,loaded:()=>!!entry?.base.exists,isSaving:()=>!!job,
    drafts:()=>[...entries.values()].filter(dirty).map(n=>n.ownerPath),
    discardDrafts(){if(job||[...entries.values()].some(n=>n.pendingRequest))throw Error('灵感保存回执待核对，请先核对原文。');clearTimeout(timer);entries=new Map();entry=null;persist();draw();},
    dispose(){clearTimeout(timer);menuEvents.abort();persist();alive=false;generation++;visible=false;onDrawerChange?.(null);node.remove();}
  };
}
