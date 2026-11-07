import {openSync,readSync,closeSync,fsyncSync,writeFileSync,readdirSync,lstatSync,mkdirSync,renameSync,unlinkSync,rmdirSync,readlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {readSnapshot,publishFile} from '../../metadata/files.js';
import {withProjectLock,assertNoPending,stat,validateName} from '../storage.js';
import {hash,digest,fail,safePath} from './model.js';
import {projectRelative,documentKind,resourceOwner} from './layout.js';
import {readGovernance,prepareChanges,maxGovernanceFiles,governanceJournal as journal} from './store.js';

const withinProject=(path,allowed)=>allowed.includes(projectRelative(path)?.project);

// Historical material is opaque data: inventory links without following them,
// and retain dependency trees instead of trying to parse them as project docs.
function fileHash(path){
  const fd=openSync(path,'r'),h=createHash('sha256'),buffer=Buffer.allocUnsafe(256*1024);
  try{let n;while((n=readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));return h.digest('hex');}finally{closeSync(fd);}
}
export function materialInventory(folder,{hashFiles=true}={}){
  const entries=[];
  function visit(relative){
    const path=join(folder,relative),s=lstatSync(path),common={path:relative.split('\\').join('/'),mode:s.mode&0o7777};
    if(s.isSymbolicLink())entries.push({...common,type:'link',target:readlinkSync(path)});
    else if(s.isDirectory()){
      if(relative)entries.push({...common,type:'directory'});
      for(const name of readdirSync(path).sort())visit(relative?relative+'/'+name:name);
    }else if(s.isFile())entries.push({...common,type:'file',size:s.size,...(hashFiles?{sha256:fileHash(path)}:{}),stamp:{dev:s.dev,ino:s.ino,mtime:s.mtimeMs,ctime:s.ctimeMs}});
    else fail('PROJECT_REORGANIZE_RESOURCE','不支持的历史资源类型。',{target:path});
  }
  visit('');return entries;
}
const contentEntry=({stamp,...entry})=>entry;
const sameContent=(a,b)=>digest(a.map(contentEntry))===digest(b.map(contentEntry));
function ensureDirectory(root,path){safePath(root,path+'/guard',{missing:true,resource:true});mkdirSync(join(root,path),{recursive:true});}
function createFile(root,path,bytes,mode=0o600){
  ensureDirectory(root,dirname(path));const fd=openSync(join(root,path),'wx',mode);
  try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
}
function publish(root,file,reverse=false){
  safePath(root,file.path,{missing:true,resource:true});
  const target=join(root,file.path),before=reverse?file.afterHash:file.beforeHash,after=reverse?file.beforeHash:file.afterHash;
  const current=stat(target),actual=current?hash(readSnapshot(target).bytes):'missing';
  if(actual===after)return;
  if(actual!==before)fail('PROJECT_REORGANIZE_CONFLICT','原件已有后续修改，保留现场。',{target:file.path});
  const bytes=reverse?file.before:file.after;
  if(bytes===null){unlinkSync(target);return;}
  if(current)publishFile(readSnapshot(target),Buffer.from(bytes,'base64'));
  else createFile(root,file.path,Buffer.from(bytes,'base64'),file.mode);
}
function summary(r){return {operationId:r.operationId,name:r.name,snapshotPath:r.snapshotPath,phase:r.phase,inventory:{entries:r.entries.length,files:r.entries.filter(e=>e.type==='file').length,links:r.entries.filter(e=>e.type==='link').length,bytes:r.entries.reduce((n,e)=>n+(e.size??0),0),digest:digest(r.entries.map(contentEntry))},documents:r.files.map(f=>f.path),references:r.references.map(f=>f.path)};}
function recordPath(root,id){return journal.path(root,id);}
const validOperation=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id);
function validateRecord(root,r,id){
  if(r.schemaVersion!==1||r.kind!=='governance-reorganize'||r.operationId!==id||!['prepared','moving','publishing','completed','rolled-back'].includes(r.phase))fail('PROJECT_GOVERNANCE_RECOVERY','无效重组记录。');
  validateName(r.name);
  if(r.from!=='项目/'+r.name||r.scope!=='current'||!Array.isArray(r.newProjects)||r.newProjects.length>8||!Array.isArray(r.entries)||!Array.isArray(r.top)||!Array.isArray(r.files)||r.files.length>maxGovernanceFiles||!Array.isArray(r.references)||r.references.length>128)fail('PROJECT_GOVERNANCE_RECOVERY','恢复范围无效。');
  const parts=r.snapshotPath?.split('/')??[];
  if(parts.length!==4||parts.slice(0,3).join('/')!=='档案/项目历史资料/'+r.name)fail('PROJECT_GOVERNANCE_RECOVERY','历史目录无效。');
  validateName(parts[3]);safePath(root,r.snapshotPath+'/guard',{missing:true,resource:true});
  for(const n of r.newProjects){validateName(n);if(n===r.name)fail('PROJECT_GOVERNANCE_RECOVERY','新项目目录无效。');}
  for(const n of r.top)validateName(n);
  if(new Set(r.entries.map(e=>e.path)).size!==r.entries.length||r.top.includes('project.md'))fail('PROJECT_GOVERNANCE_RECOVERY','历史清单重复。');
  for(const e of r.entries)if(typeof e.path!=='string'||e.path.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(e.path)||e.path.split('/').some(p=>!p||p==='.'||p==='..')||!['file','directory','link'].includes(e.type)||e.type==='file'&&!/^[a-f0-9]{64}$/.test(e.sha256))fail('PROJECT_GOVERNANCE_RECOVERY','历史清单无效。');
  const allowed=[r.from,...r.newProjects.map(n=>'项目/'+n)];
  for(const f of [...r.files,...r.references]){
    safePath(root,f.path,{missing:true,resource:true});
    if(typeof f.after!=='string'||hash(Buffer.from(f.after,'base64'))!==f.afterHash||(f.before===null?f.beforeHash!=='missing':typeof f.before!=='string'||hash(Buffer.from(f.before,'base64'))!==f.beforeHash))fail('PROJECT_GOVERNANCE_RECOVERY','恢复内容摘要不一致。');
  }
  for(const f of r.files)if((!withinProject(f.path,allowed)||!(documentKind(f.path)||resourceOwner(f.path,()=>true)||resourceOwner(f.path,()=>false)))||f.before!==null&&f.path!==r.from+'/project.md')fail('PROJECT_GOVERNANCE_RECOVERY','正式原件恢复范围无效。');
  for(const f of r.references)if(!f.path.endsWith('.md')||!(f.path==='README.md'||f.path==='档案/archive.md'||/^(知识|能力|项目)\//.test(f.path))||allowed.some(p=>f.path.startsWith(p+'/')))fail('PROJECT_GOVERNANCE_RECOVERY','引用恢复范围无效。');
}
function prepare(root,name,scope,data){
  if(scope!=='current')fail('PROJECT_REORGANIZE_INPUT','只可重组当前项目。');
  if(!data||typeof data.operationId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(data.operationId))fail('PROJECT_REORGANIZE_INPUT','需要有效operationId。');
  validateName(name);
  const from='项目/'+name,parts=data.snapshotPath?.split('/')??[];
  if(parts.length!==4||parts[0]!=='档案'||parts[1]!=='项目历史资料'||parts[2]!==name)fail('PROJECT_REORGANIZE_INPUT','历史快照须位于档案/项目历史资料/<项目名>/<批次>。');
  validateName(parts[3]);safePath(root,data.snapshotPath+'/guard',{missing:true,resource:true});
  if(stat(join(root,data.snapshotPath)))fail('PROJECT_DESTINATION_EXISTS','历史快照目标已存在，不能覆盖。');
  if(!Array.isArray(data.newProjects)||data.newProjects.length>8||new Set(data.newProjects).size!==data.newProjects.length)fail('PROJECT_REORGANIZE_INPUT','需要明确且不重复的新子项目目录名。');
  for(const child of data.newProjects){validateName(child);if(child===name||stat(join(root,'项目',child)))fail('PROJECT_REORGANIZE_INPUT','新子项目目录已存在。',{target:child});}
  const allowed=[from,...data.newProjects.map(n=>'项目/'+n)];
  if(!Array.isArray(data.changes)||data.changes.some(c=>!withinProject(c?.path,allowed)))fail('PROJECT_REORGANIZE_INPUT','变更超出本项目及声明的新子项目。');
  const p=prepareChanges(root,name,scope,{operationId:data.operationId,ifMatch:data.ifMatch,changes:data.changes});
  if(p.after.project.metadata.id!==p.before.project.metadata.id)fail('PROJECT_REORGANIZE_INPUT','重组必须保留总项目稳定ID。');
  for(const child of data.newProjects){const d=p.after.graph.docs.get('项目/'+child+'/project.md');if(d?.metadata.parent_project?.id!==p.before.project.metadata.id)fail('PROJECT_REORGANIZE_INPUT','新项目必须直接关联本总项目。');}
  // A full material snapshot removes the old direct children. Do not accept an
  // overlay that still relies on formal documents left behind in that tree.
  const overlay=new Map();for(const d of p.before.documents)if(d.path.startsWith(from+'/')&&d.path!==from+'/project.md')overlay.set(d.path,null);
  for(const f of p.files)overlay.set(f.path,Buffer.from(f.after,'base64'));
  const future=readGovernance(root,name,scope,{overlay});
  if(!future.valid)fail('PROJECT_REORGANIZE_INPUT','新安排仍依赖将被封存的正式原件。',{issues:future.errors});
  const references=[];
  if(!Array.isArray(data.referenceChanges??[])||(data.referenceChanges??[]).length>128)fail('PROJECT_REORGANIZE_INPUT','引用变更清单无效。');
  for(const c of data.referenceChanges??[]){
    if(typeof c.path!=='string'||!c.path.endsWith('.md')||!(c.path==='README.md'||c.path==='档案/archive.md'||/^(知识|能力|项目)\//.test(c.path))||c.path.startsWith(from+'/')||allowed.some(a=>c.path.startsWith(a+'/')))fail('PROJECT_REORGANIZE_INPUT','仅支持明确的现行Markdown导航引用变更。');
    safePath(root,c.path,{resource:true});const s=readSnapshot(join(root,c.path));
    if(hash(s.bytes)!==c.ifMatch||typeof c.contentBase64!=='string')fail('PROJECT_REORGANIZE_CONFLICT','引用原件已变化。',{target:c.path});
    const bytes=Buffer.from(c.contentBase64,'base64');if(bytes.toString('base64')!==c.contentBase64||bytes.length>2*1024*1024)fail('PROJECT_REORGANIZE_INPUT','引用原件编码或大小无效。');
    references.push({path:c.path,before:s.bytes.toString('base64'),after:c.contentBase64,beforeHash:c.ifMatch,afterHash:hash(bytes),mode:s.stat.mode&0o7777});
  }
  if(new Set(references.map(f=>f.path)).size!==references.length)fail('PROJECT_REORGANIZE_INPUT','引用变更路径重复。');
  const entries=materialInventory(join(root,from)),top=readdirSync(join(root,from)).filter(n=>n!=='project.md').sort();
  const files=p.files.map(f=>({...f,mode:stat(join(root,f.path))?.mode&0o7777||0o600}));
  if(files.some(f=>f.before!==null&&f.path!==from+'/project.md'))fail('PROJECT_REORGANIZE_INPUT','新安排不能覆盖将被封存的旧路径，请使用新的里程碑名称。');
  return {schemaVersion:1,kind:'governance-reorganize',name,scope,operationId:data.operationId,requestDigest:digest(data),from,snapshotPath:data.snapshotPath,newProjects:data.newProjects,entries,top,files,references,phase:'prepared',at:new Date().toISOString()};
}
function guardSource(root,r){
  const current=materialInventory(join(root,r.from),{hashFiles:false});
  const strip=e=>{const {sha256,...v}=e;return v;};
  if(digest(current.map(strip))!==digest(r.entries.map(strip)))fail('PROJECT_REORGANIZE_CONFLICT','盘点后原目录有并发变化，请重新核对。');
}
export function reorganizeGovernance(root,name,scope,data,{dryRun=false,hooks={}}={}){
  if(!validOperation(data?.operationId))fail('PROJECT_REORGANIZE_INPUT','需要有效operationId。');
  assertNoPending(root);
  if(data?.operationId&&stat(recordPath(root,data.operationId))){
    const r=journal.read(recordPath(root,data.operationId));
    if(r.kind!=='governance-reorganize'||r.requestDigest!==digest(data))fail('PROJECT_GOVERNANCE_OPERATION_CONFLICT','相同操作ID对应不同请求。');
    if(r.phase!=='completed')fail('PROJECT_GOVERNANCE_PENDING','先核对并恢复原操作。',{recoveryId:r.operationId});
    return {...summary(r),changed:false,replayed:true,dryRun};
  }
  const preview=prepare(root,name,scope,data);
  if(dryRun)return {...summary(preview),changed:false,wouldChange:true,dryRun:true};
  return withProjectLock(root,()=>{
    const r=prepare(root,name,scope,data);hooks.beforeCheck?.();guardSource(root,r);
    journal.ensure(root);journal.save(recordPath(root,r.operationId),r);journal.save(journal.pendingPath(root),{operationId:r.operationId,kind:r.kind});
    try{
      ensureDirectory(root,r.snapshotPath);
      const old=readSnapshot(join(root,r.from,'project.md'));
      createFile(root,r.snapshotPath+'/project.md',old.bytes,old.stat.mode&0o7777);
      hooks.fault?.('prepared',r);
      for(const name of r.top){
        renameSync(join(root,r.from,name),join(root,r.snapshotPath,name));
        r.phase='moving';journal.save(recordPath(root,r.operationId),r);hooks.fault?.('moved',r);
      }
      for(const file of [...r.files].sort((a,b)=>Number(a.path.endsWith('/project.md'))-Number(b.path.endsWith('/project.md')))){
        publish(root,file);r.phase='publishing';journal.save(recordPath(root,r.operationId),r);hooks.fault?.('published',r);
      }
      for(const file of r.references){publish(root,file);hooks.fault?.('reference-written',r);}
      if(!sameContent(r.entries,materialInventory(join(root,r.snapshotPath))))fail('PROJECT_REORGANIZE_CONFLICT','封存后的原件摘要与原清单不同，保留现场。');
      for(const f of [...r.files,...r.references])if(hash(readSnapshot(join(root,f.path)).bytes)!==f.afterHash)fail('PROJECT_REORGANIZE_CONFLICT','发布后原件又有变化，保留现场。',{target:f.path});
      const state=readGovernance(root,name,scope,{allowPending:true});
      if(!state.valid)fail('PROJECT_REORGANIZE_INVALID','重组后结构未通过校验。',{issues:state.errors});
      r.phase='completed';journal.save(recordPath(root,r.operationId),r);unlinkSync(journal.pendingPath(root));
      return {...summary(r),changed:true,dryRun:false,valid:state.valid};
    }catch(error){error.details={...error.details,recoveryId:r.operationId};throw error;}
  });
}
function prune(root,paths){
  const dirs=new Set();for(const path of paths){let at=dirname(path);while(at!=='.'&&at!=='项目'){dirs.add(at);at=dirname(at);}}
  for(const path of [...dirs].sort((a,b)=>b.length-a.length))try{rmdirSync(join(root,path));}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}
}
export function recoverGovernanceReorganization(root,id,{dryRun=false}={}){
  if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id))fail('INVALID_ARGUMENTS','无效恢复ID。');
  const perform=()=>{
    const r=journal.read(recordPath(root,id));
    validateRecord(root,r,id);
    if(r.phase==='rolled-back')return {operationId:id,changed:false,rolledBack:true,dryRun};
    const pending=stat(journal.pendingPath(root))?journal.read(journal.pendingPath(root)):null;
    if(pending&&pending.operationId!==id)fail('PROJECT_GOVERNANCE_PENDING','另有待恢复操作。');
    if(stat(join(root,r.snapshotPath))&&readdirSync(join(root,r.snapshotPath)).some(n=>n!=='project.md'&&!r.top.includes(n)))fail('PROJECT_REORGANIZE_CONFLICT','历史目录存在后续新增内容，保留现场。');
    // Validate every original at its actual side before touching either tree.
    const originals=[];
    for(const name of ['project.md',...r.top]){
      const saved=join(root,r.snapshotPath,name),source=join(root,r.from,name);
      if(stat(saved)){
        if(name==='project.md')originals.push({...r.entries.find(e=>e.path===name),sha256:fileHash(saved)});
        else{
          const s=lstatSync(saved);
          if(s.isDirectory())originals.push({path:name,type:'directory',mode:s.mode&0o7777},...materialInventory(saved).map(e=>({...e,path:name+'/'+e.path})));
          else if(s.isSymbolicLink())originals.push({path:name,type:'link',mode:s.mode&0o7777,target:readlinkSync(saved)});
          else originals.push({path:name,type:'file',mode:s.mode&0o7777,size:s.size,sha256:fileHash(saved)});
        }
      }else if(name==='project.md'){
        if(!stat(source)||fileHash(source)!==r.entries.find(e=>e.path===name).sha256)fail('PROJECT_REORGANIZE_CONFLICT','原根卡或快照不可恢复。');
        originals.push(r.entries.find(e=>e.path===name));
      }else if(stat(source)){
        const s=lstatSync(source);
        if(s.isDirectory())originals.push({path:name,type:'directory',mode:s.mode&0o7777},...materialInventory(source).map(e=>({...e,path:name+'/'+e.path})));
        else if(s.isSymbolicLink())originals.push({path:name,type:'link',mode:s.mode&0o7777,target:readlinkSync(source)});
        else originals.push({path:name,type:'file',mode:s.mode&0o7777,size:s.size,sha256:fileHash(source)});
      }else fail('PROJECT_REORGANIZE_CONFLICT','原资源已缺失。',{target:name});
    }
    const sort=xs=>xs.sort((a,b)=>a.path.localeCompare(b.path));
    if(!sameContent(sort(r.entries),sort(originals)))fail('PROJECT_REORGANIZE_CONFLICT','历史原件有后续改动，保留现场。');
    for(const f of [...r.files,...r.references]){
      const s=stat(join(root,f.path)),actual=s?hash(readSnapshot(join(root,f.path)).bytes):'missing';
      if(![f.beforeHash,f.afterHash].includes(actual))fail('PROJECT_REORGANIZE_CONFLICT','现行原件已修改，不能覆盖回退。',{target:f.path});
    }
    const allowed=new Set(r.files.map(f=>f.path));
    for(const directory of [r.from,...r.newProjects.map(n=>'项目/'+n)])if(stat(join(root,directory))){
      for(const e of materialInventory(join(root,directory)))if(e.type!=='directory'){
        const path=directory+'/'+e.path,top=e.path.split('/')[0],unmoved=directory===r.from&&r.top.includes(top)&&!stat(join(root,r.snapshotPath,top));
        if(!allowed.has(path)&&!unmoved)fail('PROJECT_REORGANIZE_CONFLICT','出现后续新增内容，不能回退。',{target:path});
      }
    }
    if(dryRun)return {operationId:id,dryRun:true,changed:false,wouldChange:true};
    for(const f of [...r.references,...r.files].reverse())publish(root,f,true);
    prune(root,r.files.filter(f=>f.before===null).map(f=>f.path));
    for(const name of r.top)if(stat(join(root,r.snapshotPath,name))){
      if(stat(join(root,r.from,name)))fail('PROJECT_REORGANIZE_CONFLICT','恢复目标已存在。',{target:name});
      renameSync(join(root,r.snapshotPath,name),join(root,r.from,name));
    }
    const card=join(root,r.snapshotPath,'project.md');if(stat(card))unlinkSync(card);
    if(stat(join(root,r.snapshotPath)))rmdirSync(join(root,r.snapshotPath));
    r.phase='rolled-back';journal.save(recordPath(root,id),r);if(pending)unlinkSync(journal.pendingPath(root));
    return {operationId:id,changed:true,rolledBack:true,dryRun:false};
  };
  return dryRun?perform():withProjectLock(root,perform,{allowPending:true,recoverStale:true});
}
