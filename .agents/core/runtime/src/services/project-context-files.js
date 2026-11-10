import {watch} from 'node:fs';
import {lstat, readdir} from 'node:fs/promises';
import {posix, join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {load, withProjectLock} from '../projects/storage.js';
import {readGovernance} from '../projects/governance/store.js';
import {contextCode, documentKind} from '../projects/governance/layout.js';
import {parseFrontmatter} from '../metadata/frontmatter.js';
import {filePolicy, workspaceFileSkip} from '../shared/file-policy.js';
import {assert, createCoordinator, digest, problem} from './workbench-common.js';
import {workspaceFileStamp} from './workspace-files.js';

const reserved = new Set(['project.md','milestone.md','task.md','项目复盘.md','复盘.md','灵感闪现.md','项目管理.json']);
const app = {appId:'com.ksf.projects'};
const MAX_DELETION_NOTICES = 1000;
const MAX_REVIEW_FILE = 8 * 1024 * 1024;
const MAX_REVIEW_BYTES = 32 * 1024 * 1024;
const within = (path, folder) => path === folder || path.startsWith(folder + '/');
const pathKey = path => path.normalize('NFC').toLowerCase();
const textFile = path => /\.(?:md|markdown|txt|json|ya?ml|[cm]?js|tsx?|css|html|csv|toml|ini)$/i.test(path);
const picture = path => /\.(?:png|jpe?g|webp|gif)$/i.test(path);
const hidden = name => name.startsWith('.') || workspaceFileSkip.has(name);
function managedText(text,path) {
  if (!/^\uFEFF?---\r?\n/.test(text)) return false;
  try {
    const {values}=parseFrontmatter(Buffer.from(text),path);
    return Object.hasOwn(values,'governance_schema') || Object.hasOwn(values,'checkpoint_schema');
  } catch {
    return /^\s*['"]?(?:governance_schema|checkpoint_schema)['"]?\s*:/m.test(text);
  }
}
const order = new Intl.Collator('zh-CN',{numeric:true});
const parent = posix.dirname;

function referencePaths(graph) {
  const paths = new Map();
  function visit(value, pinned = false) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.path === 'string') {
      const key=pathKey(value.path);
      paths.set(key, paths.get(key) || pinned || typeof value.digest === 'string');
    }
    for (const [key, child] of Object.entries(value)) visit(child, pinned || key === 'evidence');
  }
  for (const doc of [...graph.docs.values(), ...graph.legacy.values()]) visit(doc.metadata);
  return paths;
}

function reconcile(previous, entries, {seenPath, saved, move, visible, onMove}) {
  const old = new Map((previous?.entries ?? []).map(item => [item.path,item]));
  const gone = new Map(), counts = new Map(), moved = new Set();
  const nextPaths = new Set(entries.map(item => item.path));
  for (const item of old.values()) {
    if (!item.identity || nextPaths.has(item.path)) continue;
    gone.set(item.identity, gone.has(item.identity) ? null : item);
  }
  for (const item of entries) if (item.identity) counts.set(item.identity, (counts.get(item.identity) ?? 0) + 1);
  const live=entries.map(item => {
    if (item.kind === 'directory') return item;
    const movedPath = move && within(item.path,move.path) ? move.previousPath + item.path.slice(move.path.length) : null;
    const prior = old.get(item.path) ?? old.get(movedPath) ?? (counts.get(item.identity) === 1 ? gone.get(item.identity) : null);
    if(prior && prior.path!==item.path){moved.add(prior.path);onMove?.(prior.path,item.path);}
    let unread=prior?.unread??null, reason=unread?(prior.reason??'new'):null;
    if (item.path===seenPath || saved?.path===item.path && saved.stamp===item.stamp) {
      unread=reason=null;
    } else if (prior?.stamp && prior.stamp!==item.stamp) {
      unread=randomUUID();
      reason=reason??'updated';
    } else if (!prior && previous) {
      unread=randomUUID();
      reason='new';
    }
    return {...item,unread,reason};
  });
  const missing=path=>!nextPaths.has(path)&&!moved.has(path)&&visible(path);
  const deleted=(previous?.deleted??[]).filter(item=>missing(item.path));
  for(const item of old.values())if(item.kind==='file'&&missing(item.path)){
    deleted.push({path:item.path,kind:'file',unread:randomUUID(),reason:'deleted'});
  }
  return {schemaVersion:1,entries:live,deleted:deleted.slice(-MAX_DELETION_NOTICES)};
}

export function createProjectContextFiles(files, storage) {
  const {root} = files;
  const queue = createCoordinator(), watches = new Map(), reviews = new Map();
  let closed = false;
  function target({name,scope,objectPath}) {
    assert(['current','archived'].includes(scope), 'PROJECT_CONTEXT_PATH', '请选择项目范围。');
    const {parsed} = load(root,name,{scope});
    const projectBase = (scope === 'current' ? '项目/' : '档案/项目/') + name;
    const projectPath=projectBase+'/project.md';
    let owner={path:projectPath,metadata:parsed.values}, valid=true;
    if(objectPath!==undefined){
      assert(typeof objectPath==='string'&&within(objectPath,projectBase), 'PROJECT_CONTEXT_PATH', '请选择当前项目的对象原件。');
      const state=readGovernance(root,name,scope);
      owner=objectPath===projectPath?state.project:state.documents.find(doc=>doc.path===objectPath);
      const indexed=(doc,kind,container,refs)=>doc?.metadata.kind===kind&&documentKind(doc.path)===kind&&
        doc.metadata.project?.id===parsed.values.id&&doc.metadata.project?.path===projectPath&&
        Array.isArray(refs)&&refs.some(ref=>ref?.id===doc.metadata.id&&ref.path===doc.path)&&parent(parent(doc.path))===parent(container.path);
      const milestone=owner?.metadata.kind==='task'?state.documents.find(doc=>doc.path===owner.metadata.milestone?.path):owner;
      const milestoneValid=indexed(milestone,'milestone',{path:projectPath},parsed.values.milestones);
      const taskValid=milestoneValid&&owner?.metadata.milestone?.id===milestone.metadata.id&&
        indexed(owner,'task',milestone,milestone.metadata.tasks);
      assert(owner&&(owner.path===projectPath&&(owner.metadata.kind==='project'||state.format==='legacy')||milestoneValid&&owner===milestone||taskValid),
        'PROJECT_CONTEXT_PATH', '对象未在当前项目中有效登记。');
      valid=state.valid;
    }
    const base=parent(owner.path),kind=owner.path===projectPath?'project':owner.metadata.kind;
    const childObjects=new Set(kind==='project'?['里程碑']:kind==='milestone'?['任务']:[]);
    const refs=kind==='project'?owner.metadata.milestones:kind==='milestone'?owner.metadata.tasks:[];
    for(const ref of Array.isArray(refs)?refs:[]){
      if(typeof ref?.path==='string'&&within(ref.path,base))childObjects.add(pathKey(ref.path.slice(base.length+1).split('/')[0]));
    }
    return {base,projectBase,kind,objectPath:owner.path,childObjects,scope,name,writable:scope==='current'&&parsed.values.governance_schema===2&&valid};
  }
  function scopePath(project,path) {
    assert(typeof path === 'string' && within(path,project.base), 'PROJECT_CONTEXT_PATH', '请选择当前项目内的路径。');
    const parts = path === project.base ? [] : path.slice(project.base.length+1).split('/');
    assert(parts.every(p => p && !hidden(p)) && !project.childObjects.has(pathKey(parts[0]??'')) &&
      filePolicy(path) !== 'blocked', 'PROJECT_CONTEXT_PATH', '此路径不属于项目文件工作区。');
    return path;
  }
  async function isChildObject(project,folder) {
    const name=posix.basename(folder);
    const marker=project.kind==='project'&&/^M\d+-/i.test(name)?'milestone.md'
      :project.kind==='milestone'&&/^(?:T\d+|[A-Z][1-9]\d{0,8})-/i.test(name)?'task.md':null;
    if(!marker)return false;
    try { return (await lstat(join(root,folder,marker))).isFile(); }
    catch (error) { if (['ENOENT','ENOTDIR'].includes(error.code)) return false; throw error; }
  }
  async function checked(project,path,options) {
    scopePath(project,path);
    const first = path.slice(project.base.length+1).split('/')[0];
    assert(!first || !await isChildObject(project,project.base+'/'+first), 'PROJECT_CONTEXT_PATH', '请从对应对象入口访问此目录。');
    const item = await files.locate(path,options);
    assert(item.path === path, 'PROJECT_CONTEXT_PATH', '请使用规范的项目路径。');
    return item;
  }
  async function walk(project) {
    const entries = [], excluded=new Set(project.childObjects);
    async function visit(folder) {
      const {target} = await checked(project,folder);
      const children = await readdir(target,{withFileTypes:true});
      children.sort((a,b) => Number(b.isDirectory())-Number(a.isDirectory()) || order.compare(a.name,b.name) || a.name.localeCompare(b.name));
      for (const child of children) {
        const path = folder+'/'+child.name;
        if (hidden(child.name) || filePolicy(path) === 'blocked' || !child.isFile() && !child.isDirectory()) continue;
        if(folder===project.base && child.isDirectory() && (excluded.has(pathKey(child.name)) || await isChildObject(project,path))){
          excluded.add(pathKey(child.name));
          continue;
        }
        assert(entries.length < 15000 && path.length <= 4096, 'PROJECT_CONTEXT_LIMIT', '目录过大，自动更新已暂停。');
        if (child.isDirectory()) {
          entries.push({path,kind:'directory'});
          await visit(path);
        } else {
          const stat = await lstat(join(root,path));
          if (!stat.isFile() || stat.isSymbolicLink()) continue;
          entries.push({path,kind:'file',stamp:workspaceFileStamp(stat),
            identity:stat.ino && stat.birthtimeMs ? digest(JSON.stringify([stat.dev,stat.ino,stat.birthtimeMs])).slice(0,24) : null});
        }
      }
    }
    await visit(project.base);
    return {entries,visible:path=>!excluded.has(pathKey(path.slice(project.base.length+1).split('/')[0]))};
  }
  function watchProject(project) {
    const now = Date.now();
    for (const [key,item] of watches) if (now-item.touched > 30000) stop(key);
    let item = watches.get(project.base);
    if (!item) {
      item = {touched:now, scanned:0, dirtyAt:0, last:null, watcher:null};
      watches.set(project.base,item);
      try {
        item.watcher = watch(join(root,project.base),{recursive:true,persistent:false},() => { item.dirtyAt=Date.now(); });
        item.watcher.on('error',() => { item.watcher?.close(); item.watcher=null; });
      } catch { /* Periodic reconciliation also covers platforms without recursive watch. */ }
    }
    item.touched=now;
    clearTimeout(item.timer);
    item.timer=setTimeout(() => stop(project.base),31000);
    item.timer.unref?.();
    return item;
  }
  function stop(key) {
    const item=watches.get(key);
    clearTimeout(item?.timer);
    item?.watcher?.close();
    watches.delete(key);
  }
  const storageName = project => 'context-files-'+digest(project.base).slice(0,32)+'.json';
  async function readState(project) {
    const record=await storage.read(app,storageName(project));
    if (!record.exists) return {etag:record.etag,state:null};
    const state=JSON.parse(record.text);
    assert(state.schemaVersion===1 && Array.isArray(state.entries) && (state.deleted===undefined || Array.isArray(state.deleted)), 'PROJECT_CONTEXT_STATE', '文件阅读状态无法读取。');
    return {etag:record.etag,state};
  }
  async function updateState(project,update) {
    for (let attempt=0;attempt<4;attempt++) {
      const {etag,state}=await readState(project);
      const next=update(state);
      if (JSON.stringify(next)===JSON.stringify(state)) return next;
      try {
        await storage.write(app,storageName(project),JSON.stringify(next),{ifMatch:etag});
        return next;
      } catch (error) {
        if (error.code!=='APP_DATA_CONFLICT' || attempt===3) throw error;
      }
    }
  }
  async function scan(project,{force=false,...options}={}) {
    const item=watchProject(project), now=Date.now();
    const due=now-item.scanned >= (item.watcher ? 5000 : 1000);
    if (!force && item.last && !due && (item.dirtyAt<=item.scanned || now-item.dirtyAt<130 && now-item.scanned<1000)) return item.last;
    const {entries,visible}=await walk(project);
    item.last=await updateState(project,state=>reconcile(state,entries,{...options,visible}));
    item.scanned=now;
    item.visible=visible;
    return item.last;
  }
  function reviewSession(id){
    assert(typeof id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(id),'PROJECT_CONTEXT_REVIEW','审阅会话标识无效。');
    let session=reviews.get(id);
    if(!session){session={projects:new Map(),bytes:0};reviews.set(id,session);}
    return session;
  }
  function setBaseline(session,review,path,value){
    const old=review.baselines.get(path);
    const size=value?Buffer.byteLength(value.text):0;
    const available=session.bytes-(old?.size??0)+size<=MAX_REVIEW_BYTES && size<=MAX_REVIEW_FILE;
    session.bytes-=old?.size??0;
    if(value&&available){
      review.baselines.set(path,{text:value.text,version:value.version,size});
      session.bytes+=size;
    }else review.baselines.delete(path);
    return available;
  }
  async function reviewProject(project,id,live,move){
    const session=reviewSession(id);
    let review=session.projects.get(project.base);
    if(!review){
      review={baselines:new Map(),state:reconcile(null,live.entries,{visible:()=>true})};
      const baselineEntries=new Map(review.state.entries.map(entry=>[entry.path,entry]));
      for(const entry of live.entries){
        if(entry.kind!=='file'||!textFile(entry.path)||reserved.has(posix.basename(entry.path).toLowerCase()))continue;
        try{
          const item=await checked(project,entry.path);
          if(item.stat.size>MAX_REVIEW_FILE||session.bytes+item.stat.size>MAX_REVIEW_BYTES)continue;
          const file=await files.read(entry.path);
          if(setBaseline(session,review,entry.path,file)){
            baselineEntries.get(entry.path).stamp=file.stamp;
          }
        }catch{ /* An unreadable file establishes its baseline on a later successful open. */ }
      }
      session.projects.set(project.base,review);
    }
    review.state=reconcile(review.state,live.entries,{
      move,visible:watchProject(project).visible??(()=>true),
      onMove(from,to){
        const baseline=review.baselines.get(from);
        if(baseline){review.baselines.delete(from);review.baselines.set(to,baseline);}
      },
    });
    return {session,review};
  }
  async function reviewedValue(project,id,value){
    const {session,review}=await reviewProject(project,id,await scan(project));
    let baseline=review.baselines.get(value.path);
    if(!baseline){
      const isNew=review.state.entries.some(entry=>entry.path===value.path&&entry.reason==='new');
      const initial=isNew?{text:'',version:'missing'}:value;
      if(setBaseline(session,review,value.path,initial))baseline=review.baselines.get(value.path);
    }
    return {...value,reviewOriginal:baseline?.text,
      reviewWarning:baseline?'':'本次审阅的内容较多，此文件仅提示变化，直接显示当前正文。'};
  }
  function publicEntries(project,entries) {
    return entries.map(({path,kind,unread,reason,stamp})=>{
      const name=posix.basename(path);
      const protectedName=reserved.has(name.toLowerCase()) || parent(path)===project.base && !!contextCode(project.kind,name);
      return {path,name,kind,stamp,unread:unread??null,reason:reason??null,canMove:reason!=='deleted'&&project.writable&&!protectedName&&filePolicy(path)==='editable',
        format:kind==='directory'?null:/\.(?:md|markdown)$/i.test(path)?'markdown':textFile(path)?'text':picture(path)?'image':'external'};
    });
  }
  async function writablePath(project,path,{missing=false}={}) {
    assert(project.writable && path!==project.base && filePolicy(path)==='editable' && !reserved.has(posix.basename(path).toLowerCase()), 'PROJECT_CONTEXT_READONLY', '此文件须使用专用入口，或所在项目为只读。',403);
    return checked(project,path,{missing});
  }
  async function guardMove(project,path,refs,item) {
    assert(![...refs.keys()].some(ref=>within(ref,pathKey(path))), 'PROJECT_CONTEXT_REFERENCED', '此路径或其下的文件已有结构化引用。',409);
    assert(parent(path)!==project.base || !contextCode(project.kind,posix.basename(path)), 'PROJECT_CONTEXT_REFERENCED', '编号上下文需要保留原路径。',409);
    async function inspect(current) {
      const entry = await checked(project,current);
      assert(filePolicy(current)==='editable' && !reserved.has(posix.basename(current).toLowerCase()), 'PROJECT_CONTEXT_READONLY', '目录中包含受管或只读文件。',403);
      if (entry.stat.isDirectory()) {
        for (const name of await readdir(entry.target)) await inspect(current+'/'+name);
      } else if (/\.(?:md|markdown)$/i.test(current)) {
        const value=await files.read(current);
        assert(!managedText(value.text,current),'PROJECT_CONTEXT_READONLY','目录中包含治理或检查点原件。',403);
      }
    }
    if (item.stat.isDirectory() || /\.(?:md|markdown)$/i.test(path)) await inspect(path);
  }
  async function refreshAfter(project,options) {
    try { await scan(project,{force:true,...options}); }
    catch { const item=watches.get(project.base); if(item) item.scanned=0; }
  }
  async function call(input) {
    assert(!closed,'PROJECT_CONTEXT_CLOSED','项目文件服务已关闭。',503);
    for(const [id,session] of reviews)if(session.ownerPid){
      try{process.kill(session.ownerPid,0);}
      catch(error){if(error.code==='ESRCH')reviews.delete(id);}
    }
    if(input.action==='endReview'){
      if(typeof input.reviewSession==='string')reviews.delete(input.reviewSession);
      return {};
    }
    if(input.reviewSession&&Number.isSafeInteger(input.reviewOwnerPid)&&input.reviewOwnerPid>0){
      reviewSession(input.reviewSession).ownerPid=input.reviewOwnerPid;
    }
    const {action,path,version,text,destination,kind,unread}=input;
    const project=target(input);
    return queue.run(project.projectBase,async()=>{
      if (action==='changes') {
        const live=await scan(project);
        const state=input.reviewSession?(await reviewProject(project,input.reviewSession,live)).review.state:live;
        const entries=input.includeDeleted===true?[...state.entries,...state.deleted]:state.entries;
        const revision=digest(JSON.stringify(entries.map(({path,kind,stamp,unread})=>[path,kind,stamp,unread])));
        return {root:project.base,objectPath:project.objectPath,writable:project.writable,revision,...(revision===input.revision?{}:{entries:publicEntries(project,entries)})};
      }
      if (action==='markRead') {
        scopePath(project,path);
        assert(typeof unread==='string','PROJECT_CONTEXT_INPUT','缺少未读标识。');
        const item=watchProject(project);
        const matches=entry=>entry.path===path&&entry.unread===unread;
        if(input.reviewSession){
          const {session,review}=await reviewProject(project,input.reviewSession,await scan(project));
          const entry=review.state.entries.find(matches);
          if(entry&&textFile(path)&&review.baselines.has(path)){
            const file=await files.read((await checked(project,path)).path);
            if(file.text!==review.baselines.get(path).text)return {reviewRequired:true};
            entry.stamp=file.stamp;
          }
          const removed=review.state.deleted.some(matches);
          review.state={...review.state,
            entries:review.state.entries.map(entry=>matches(entry)?{...entry,unread:null,reason:null}:entry),
            deleted:review.state.deleted.filter(entry=>!matches(entry)),
          };
          if(removed)setBaseline(session,review,path,null);
          return {};
        }
        item.last=await updateState(project,state=>state&&({...state,
          entries:state.entries.map(entry=>matches(entry)?{...entry,unread:null,reason:null}:entry),
          deleted:(state.deleted??[]).filter(entry=>!matches(entry)),
        }));
        return {};
      }
      if(action==='markReviewed'){
        assert(input.reviewSession,'PROJECT_CONTEXT_REVIEW','缺少审阅会话。');
        const {session,review}=await reviewProject(project,input.reviewSession,await scan(project,{force:true}));
        const value=await files.read((await checked(project,path)).path);
        assert(value.version===version,'WORKSPACE_CONFLICT','原文又有新改动，请核对后再标记已审阅。',409);
        setBaseline(session,review,path,value);
        review.state={...review.state,entries:review.state.entries.map(entry=>entry.path===path?
          {...entry,stamp:value.stamp,unread:null,reason:null}:entry)};
        return {...value,reviewOriginal:value.text};
      }
      if (action==='read' || action==='moveVersion') {
        const item=await checked(project,path);
        if (action==='moveVersion') return {version:await files.moveVersion(path)};
        assert(item.stat.isFile() && textFile(path),'PROJECT_CONTEXT_FORMAT','此格式请通过原文件入口打开。',415);
        const value=await files.read(path);
        const {graph,valid}=readGovernance(root,project.name,project.scope);
        const protectedPath=reserved.has(posix.basename(path).toLowerCase()) || referencePaths(graph).get(pathKey(path)) || managedText(value.text,path);
        const result={...value,writable:project.writable && valid && value.writable && !protectedPath};
        return input.reviewSession?reviewedValue(project,input.reviewSession,result):result;
      }
      assert(['save','create','move'].includes(action),'PROJECT_CONTEXT_INPUT','未知项目文件操作。');
      if (action!=='save') await scan(project);
      const result=await withProjectLock(root,async()=>{
        const latest=target(input);
        const governance=readGovernance(root,latest.name,latest.scope);
        assert(governance.valid,'PROJECT_CONTEXT_READONLY','请先修复项目治理原件。',403);
        const item=await writablePath(latest,path,{missing:action==='create'});
        const refs=referencePaths(governance.graph);
        if (action==='save') {
          const existing=await files.read(path);
          assert(textFile(path)&&!refs.get(pathKey(path))&&!managedText(existing.text,path)&&typeof text==='string'&&!text.includes('\0')&&!managedText(text,path),
            'PROJECT_CONTEXT_READONLY','此文件是受管原件或验收证据，请使用专用入口。',403);
          return files.save({path,text,version});
        }
        if (action==='create') {
          assert(kind==='directory' || kind==='file'&&textFile(path),'PROJECT_CONTEXT_FORMAT','请选择支持的文本格式。',415);
          return files.create({path,kind});
        }
        await writablePath(latest,destination,{missing:true});
        assert(parent(destination)!==latest.base || !contextCode(latest.kind,posix.basename(destination)), 'PROJECT_CONTEXT_REFERENCED', '请通过治理入口调整编号上下文。',409);
        await guardMove(latest,path,refs,item);
        return files.moveEntry({path,destination,version});
      });
      if (action==='create') await refreshAfter(project,{seenPath:kind==='file'?result.path:undefined});
      if (action==='move') await refreshAfter(project,{move:result});
      if (action==='save' && result.version===digest(text)) await refreshAfter(project,{saved:result});
      if(action==='move'&&input.reviewSession)await reviewProject(project,input.reviewSession,await scan(project),result);
      return result;
    });
  }
  return {call, close(){closed=true;reviews.clear();for(const key of watches.keys())stop(key);}};
}
