import {mkdirSync,copyFileSync,chmodSync,constants,readdirSync,renameSync,unlinkSync,rmdirSync,rmSync,lstatSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {readSnapshot,publishFile} from '../../metadata/files.js';
import {withProjectLock,assertNoPending,stat,validateName} from '../storage.js';
import {executionViews} from '../task-execution.js';
import {hash,digest,fail,safePath,encodeDocument} from './model.js';
import {readGovernance,governanceJournal as journal} from './store.js';
import {materialInventory} from './reorganize.js';
import {confirmationScope,confirmationValid} from './confirmation.js';

const inside=(path,base)=>path===base||path.startsWith(base+'/');
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id);
const content=entries=>entries.map(({stamp,...e})=>e);
const inventoryHash=entries=>digest(content(entries));
const ref=d=>({id:d.metadata.id,path:d.path});
const moved=(path,moves)=>{const m=moves.find(m=>inside(path,m.from));return m?m.to+path.slice(m.from.length):path;};
function ensure(root,path,created){
  if(path==='.')return;
  safePath(root,path+'/guard',{resource:true,missing:true});
  if(stat(join(root,path)))return;
  ensure(root,dirname(path),created);mkdirSync(join(root,path));created?.push(path);
}
function copy(root,from,to,mode){
  safePath(root,from,{resource:true});safePath(root,to,{resource:true,missing:true});
  copyFileSync(join(root,from),join(root,to),constants.COPYFILE_EXCL);chmodSync(join(root,to),mode);
}
function append(a=[],b=[]){
  const result=structuredClone(a);
  for(const item of b){const old=result.find(x=>(x.id??x.operation_id)===(item.id??item.operation_id));
    if(old&&digest(old)!==digest(item))fail('PROJECT_MERGE_COLLISION','目标、条件或历史身份冲突，请显式核对。');
    if(!old)result.push(structuredClone(item));
  }return result;
}
function rewrite(value,moves,source,target){
  if(Array.isArray(value))return value.map(v=>rewrite(v,moves,source,target));
  if(!value||typeof value!=='object')return value;
  const out={};for(const [key,v]of Object.entries(value)){
    // These are immutable observations, not present-day structural locations.
    if(['user_confirmation','archive_history','task_numbering_history','project_merge_history'].includes(key)){out[key]=v;continue;}
    out[key]=key==='path'&&typeof v==='string'?moved(v,moves):rewrite(v,moves,source,target);
  }
  if(out.id===source.id&&out.path===target.path)out.id=target.id;
  return out;
}
function brief(r){return {operationId:r.operationId,source:r.sourceProject,target:r.targetProject,snapshotPath:r.snapshotPath,phase:r.phase,ifMatch:r.ifMatch,moves:r.moves,
  inventory:{files:r.entries.filter(e=>e.type==='file').length,bytes:r.entries.reduce((n,e)=>n+(e.size??0),0),digest:inventoryHash(r.entries)},
  milestones:r.milestones,taskCount:r.taskCount,inheritedConfirmations:r.confirmations.map(c=>c.id)};}
function candidate(root,r,{allowPending=false}={}){
  const overlay=new Map(r.files.map(f=>[f.path,Buffer.from(f.after,'base64')]));
  for(const p of r.sourceDocuments)overlay.set(p,null);
  overlay.mergeRecords=[r];overlay.beforeVersions=new Map();overlay.resourceDigests=new Map();
  for(const e of r.entries.filter(e=>e.type==='file')){
    overlay.resourceDigests.set(r.from+'/'+e.path,e.sha256);
    const to=moved(r.from+'/'+e.path,r.moves);if(to!==r.from+'/'+e.path)overlay.resourceDigests.set(to,e.sha256);
  }
  for(const f of r.files)if(f.originalPath){overlay.beforeVersions.set(f.path+':'+f.beforeHash,true);overlay.beforeVersions.set(f.originalPath+':'+f.beforeHash,true);}
  return readGovernance(root,r.targetName,'current',{overlay,allowPending});
}
function prepare(root,name,scope,data){
  if(scope!=='current'||!validId(data?.operationId))fail('PROJECT_MERGE_INPUT','需要当前项目与有效operationId。');
  validateName(name);validateName(data.source);
  const state=readGovernance(root,name,scope),parent=state.project,child=state.graph.docs.get('项目/'+data.source+'/project.md');
  if(!state.valid||!parent||parent.metadata.governance_schema!==2||!child||child.metadata.governance_schema!==2||child.metadata.kind!=='project'||child.metadata.child_projects.length||child.metadata.parent_project?.id!==parent.metadata.id||child.metadata.parent_project?.path!==parent.path)
    fail('PROJECT_MERGE_INPUT','只支持将无下级的schema2直接子项目并回现有父项目。');
  const from=dirname(child.path),to=dirname(parent.path),entries=materialInventory(join(root,from));
  if(entries.some(e=>e.type==='link'))fail('PROJECT_MERGE_INPUT','源资料含符号链接，需先明确保全规则。');
  const baseline=digest({graph:state.etag,entries});
  if(data.ifMatch!==undefined&&data.ifMatch!==baseline)fail('PROJECT_MERGE_CONFLICT','预览后原件或资料已变化，请重新预览。');
  const parts=data.snapshotPath?.split('/')??[];
  if(parts.length!==4||parts.slice(0,3).join('/')!=='档案/项目历史资料/'+data.source)fail('PROJECT_MERGE_INPUT','快照须为档案/项目历史资料/<子项目>/<批次>。');
  validateName(parts[3]);safePath(root,data.snapshotPath+'/guard',{resource:true,missing:true});
  safePath(root,data.snapshotPath+'-retiring/guard',{resource:true,missing:true});
  if(stat(join(root,data.snapshotPath))||stat(join(root,data.snapshotPath+'-retiring')))fail('PROJECT_MERGE_COLLISION','快照或退出目录已存在。');
  const own=state.documents.filter(d=>inside(d.path,from));
  if(Object.keys(executionViews(root,own)).length)fail('PROJECT_EXECUTION_BUSY','子项目仍有执行占用，不能移动。');
  if(!Array.isArray(data.milestones)||data.milestones.length!==child.metadata.milestones.length||new Set(data.milestones.map(m=>m.id)).size!==data.milestones.length)
    fail('PROJECT_MERGE_INPUT','须完整列出子项目阶段到父项目目录的映射。');
  const moves=[],milestones=[];
  for(const m of child.metadata.milestones){
    const mapping=data.milestones.find(x=>x.id===m.id),folder=mapping?.directory;
    if(typeof folder!=='string'||!/^M[1-9]\d*-[^/]+$/.test(folder))fail('PROJECT_MERGE_INPUT','阶段目标须为直接M编号目录。');
    validateName(folder);const destination=to+'/'+folder;
    if(stat(join(root,destination)))fail('PROJECT_MERGE_COLLISION','父项目阶段目录已占用。',{target:destination});
    moves.push({from:dirname(m.path),to:destination});milestones.push({id:m.id,from:m.path,to:destination+'/milestone.md',status:state.graph.docs.get(m.path)?.metadata.status});
  }
  if(new Set(moves.map(m=>m.to)).size!==moves.length||new Set(moves.map(m=>m.to.split('/').at(-1).split('-')[0])).size!==moves.length)fail('PROJECT_MERGE_COLLISION','阶段目标目录或编号重复。');
  const used=new Set(parent.metadata.milestones.map(m=>dirname(m.path).split('/').at(-1).split('-')[0]));
  for(const folder of readdirSync(join(root,to)))if(/^M[1-9]\d*-/.test(folder))used.add(folder.split('-')[0]);
  if(moves.some(m=>used.has(m.to.split('/').at(-1).split('-')[0])))fail('PROJECT_MERGE_COLLISION','阶段编号已占用。');
  const notes=data.materialDirectory??('资料/'+data.source);
  if(typeof notes!=='string'||!notes.startsWith('资料/')||notes.split('/').length!==2)fail('PROJECT_MERGE_INPUT','零散资料须归入父项目资料下的单独目录。');
  validateName(notes.slice(3));
  for(const n of readdirSync(join(root,from)))if(n!=='project.md'&&n!=='.DS_Store'&&!moves.some(m=>m.from===from+'/'+n))moves.push({from:from+'/'+n,to:n==='成果'?to+'/成果':to+'/'+notes+'/'+n});
  moves.push({from:child.path,to:parent.path});
  const materials=entries.filter(e=>e.type==='file'&&e.path!=='project.md'&&e.path!=='.DS_Store').map(e=>({...e,from:from+'/'+e.path,to:moved(from+'/'+e.path,moves)}));
  if(new Set(materials.map(e=>e.to)).size!==materials.length)fail('PROJECT_MERGE_COLLISION','资料目标重复。');
  for(const e of materials){safePath(root,e.to,{resource:true,missing:true});if(stat(join(root,e.to)))fail('PROJECT_MERGE_COLLISION','目标资料已存在，禁止覆盖。',{target:e.to});}
  const dirs=entries.filter(e=>e.type==='directory').map(e=>({path:moved(from+'/'+e.path,moves),mode:e.mode}));
  for(const d of dirs){safePath(root,d.path+'/guard',{resource:true,missing:true});if(stat(join(root,d.path))&&!stat(join(root,d.path)).isDirectory())fail('PROJECT_MERGE_COLLISION','目标目录已被文件占用。');}
  const now=new Date().toISOString(),source=ref(child),target=ref(parent),files=[];
  for(const d of own.filter(d=>d.path!==child.path)){
    const original=readSnapshot(join(root,d.path)),path=moved(d.path,moves);
    if(path===d.path)fail('PROJECT_MERGE_INPUT','存在未映射的正式原件。',{target:path});
    const metadata=rewrite(d.metadata,moves,source,target);
    const after=encodeDocument(original.bytes,{path,metadata});
    files.push({path,originalPath:d.path,before:original.bytes.toString('base64'),beforeHash:hash(original.bytes),after:after.toString('base64'),afterHash:hash(after)});
  }
  // Existing parent tasks can explicitly depend on the child's milestones.
  // Relocate those references without changing their identity, prose or state.
  for(const d of state.documents.filter(d=>inside(d.path,to)&&d.path!==parent.path)){
    const metadata=rewrite(d.metadata,moves,source,target);
    if(digest(metadata)===digest(d.metadata))continue;
    if(d.metadata.kind==='task'&&Object.keys(executionViews(root,[d])).length)fail('PROJECT_EXECUTION_BUSY','待调整引用的父项目任务仍有执行占用。',{target:d.path});
    const old=readSnapshot(join(root,d.path)),after=encodeDocument(old.bytes,{path:d.path,metadata});
    files.push({path:d.path,before:old.bytes.toString('base64'),beforeHash:hash(old.bytes),after:after.toString('base64'),afterHash:hash(after)});
  }
  const update=data.parentUpdate??{};
  if(Object.keys(update).some(k=>!['metadata','body'].includes(k))||Object.keys(update.metadata??{}).some(k=>!['goals','criteria','decisions','risks'].includes(k)))fail('PROJECT_MERGE_INPUT','父项目显式调整仅支持目标、条件、决定、风险和正文。');
  const metadata={goals:append(parent.metadata.goals,child.metadata.goals),criteria:append(parent.metadata.criteria,child.metadata.criteria),decisions:append(parent.metadata.decisions,child.metadata.decisions),risks:append(parent.metadata.risks,child.metadata.risks),...update.metadata,
    milestones:[...parent.metadata.milestones,...milestones.map(m=>({id:m.id,path:m.to}))],child_projects:parent.metadata.child_projects.filter(r=>r.id!==source.id),
    task_numbering_history:append(parent.metadata.task_numbering_history,child.metadata.task_numbering_history),
    project_merge_history:[...(parent.metadata.project_merge_history??[]),{operation_id:data.operationId,at:now,source_id:source.id,source_path:source.path,snapshot_path:data.snapshotPath,moves}],updated:now};
  // Every source goal remains available to the imported objects.
  for(const g of [...parent.metadata.goals,...child.metadata.goals])if(!metadata.goals.some(x=>x.id===g.id))fail('PROJECT_MERGE_INPUT','合并不能丢弃既有目标身份。');
  const old=readSnapshot(join(root,parent.path)),after=encodeDocument(old.bytes,{path:parent.path,metadata,...(update.body===undefined?{}:{body:update.body})});
  files.push({path:parent.path,before:old.bytes.toString('base64'),beforeHash:hash(old.bytes),after:after.toString('base64'),afterHash:hash(after)});
  const r={schemaVersion:1,kind:'governance-merge-child',operationId:data.operationId,requestDigest:digest(data),ifMatch:baseline,graphEtag:state.etag,previousStale:state.stale,targetName:name,sourceName:data.source,sourceProject:source,targetProject:target,from,to,snapshotPath:data.snapshotPath,entries,materials,dirs,moves,files,sourceDocuments:own.map(d=>d.path),milestones,taskCount:own.filter(d=>d.metadata.kind==='task').length,confirmations:[],createdDirs:[],phase:'prepared',at:now};
  let future=candidate(root,r);
  for(const d of own.filter(d=>d.metadata.kind==='milestone')){
    const review=state.graph.docs.get(d.metadata.review_ref?.path),c=review?.metadata.user_confirmation;
    if(!c)continue;
    if(!confirmationValid(d,review,state.graph))fail('PROJECT_MERGE_CONFIRMATION','源阶段确认已失效，请先核对。');
    const next=future.graph.byId.get(d.metadata.id),nextReview=future.graph.docs.get(next.metadata.review_ref.path);
    r.confirmations.push({id:d.metadata.id,from:d.path,to:next.path,confirmationDigest:digest(c),beforeScope:c.scope_digest,afterScope:confirmationScope(next,nextReview,future.graph)});
  }
  future=candidate(root,r);
  if(!future.valid||future.stale.some(id=>!state.stale.includes(id)))fail('PROJECT_MERGE_INVALID','合并会产生结构或验收失效。',{issues:[...future.errors,...future.stale.filter(id=>!state.stale.includes(id)).map(id=>({id,message:'新增失效验收'}))]});
  return r;
}
function save(root,r){journal.save(journal.path(root,r.operationId),r);}
function assertSource(root,r){if(digest(materialInventory(join(root,r.from)))!==digest(r.entries))fail('PROJECT_MERGE_CONFLICT','盘点后源资料有变化。');}
function backupValid(root,r){return inventoryHash(materialInventory(join(root,r.snapshotPath)))===inventoryHash(r.entries);}
function guardPublished(root,r){
  const formal=new Map(r.files.map(f=>[f.path,f.afterHash]));
  for(const e of r.materials){const path=safePath(root,e.to,{resource:true});if(readSnapshot(path,{digestOnly:true}).digest!==(formal.get(e.to)??e.sha256))fail('PROJECT_MERGE_CONFLICT','目标原件在迁移期间有后续修改，保留现场。',{target:e.to});}
  for(const f of r.files)if(readSnapshot(safePath(root,f.path,{resource:true}),{digestOnly:true}).digest!==f.afterHash)fail('PROJECT_MERGE_CONFLICT','目标索引在迁移期间有后续修改。',{target:f.path});
}
export function mergeChildGovernance(root,name,scope,data,{dryRun=false,hooks={}}={}){
  if(!validId(data?.operationId))fail('PROJECT_MERGE_INPUT','需要有效operationId。');
  assertNoPending(root);
  const record=journal.path(root,data.operationId);
  if(stat(record)){
    const r=journal.read(record);if(r.kind!=='governance-merge-child'||r.requestDigest!==digest(data)||r.targetName!==name)fail('PROJECT_GOVERNANCE_OPERATION_CONFLICT','操作ID已用于其他请求。');
    if(r.phase!=='completed')fail('PROJECT_GOVERNANCE_PENDING','请先恢复未完成合并。',{recoveryId:r.operationId});
    return {...brief(r),changed:false,replayed:true,dryRun};
  }
  const preview=prepare(root,name,scope,data);
  if(dryRun)return {...brief(preview),changed:false,wouldChange:true,dryRun:true};
  if(data.ifMatch===undefined)fail('PROJECT_MERGE_INPUT','提交须携带预览返回的ifMatch。');
  return withProjectLock(root,()=>{
    const r=prepare(root,name,scope,data);hooks.beforeCheck?.();assertSource(root,r);
    if(readGovernance(root,name).etag!==r.graphEtag)fail('PROJECT_MERGE_CONFLICT','父项目已变化。');
    journal.ensure(root);save(root,r);journal.save(journal.pendingPath(root),{operationId:r.operationId,kind:r.kind});
    try{
      ensure(root,r.snapshotPath);for(const e of r.entries){if(e.type==='directory'){ensure(root,r.snapshotPath+'/'+e.path);chmodSync(join(root,r.snapshotPath,e.path),e.mode);}else copy(root,r.from+'/'+e.path,r.snapshotPath+'/'+e.path,e.mode);}
      if(!backupValid(root,r))fail('PROJECT_MERGE_CONFLICT','备份摘要不一致。');hooks.fault?.('backed-up',r);
      assertSource(root,r);
      for(const d of r.dirs){ensure(root,d.path,r.createdDirs);save(root,r);}
      r.phase='publishing';save(root,r);
      for(const e of r.materials){ensure(root,dirname(e.to),r.createdDirs);save(root,r);copy(root,r.snapshotPath+'/'+e.path,e.to,e.mode);hooks.fault?.('material-written',r);}
      for(const f of r.files){const s=readSnapshot(join(root,f.path));if(hash(s.bytes)!==f.beforeHash)fail('PROJECT_MERGE_CONFLICT','发布前原件发生变化。',{target:f.path});publishFile(s,Buffer.from(f.after,'base64'));hooks.fault?.('document-written',r);}
      assertSource(root,r);guardPublished(root,r);
      const check=candidate(root,r,{allowPending:true});if(!check.valid||check.stale.some(id=>!r.previousStale.includes(id)))fail('PROJECT_MERGE_INVALID','发布后预检未通过。',{issues:check.errors});
      hooks.fault?.('validated',r);
      // Remove only files whose original bytes still match. The full immutable
      // snapshot remains outside the current/archived project registries.
      r.phase='retiring';save(root,r);
      renameSync(join(root,r.from),join(root,r.snapshotPath+'-retiring'));hooks.fault?.('retired',r);
      guardPublished(root,r);if(!backupValid(root,r)||inventoryHash(materialInventory(join(root,r.snapshotPath+'-retiring')))!==inventoryHash(r.entries))fail('PROJECT_MERGE_CONFLICT','备份或退出目录已有后续变化。');
      const overlay=new Map();overlay.mergeRecords=[r];const final=readGovernance(root,name,'current',{overlay,allowPending:true});
      if(!final.valid||final.stale.some(id=>!check.stale.includes(id)))fail('PROJECT_MERGE_INVALID','源目录退出后的读回校验失败。',{issues:final.errors});
      r.phase='completed';save(root,r);unlinkSync(journal.pendingPath(root));
      rmSync(join(root,r.snapshotPath+'-retiring'),{recursive:true});
      return {...brief(r),changed:true,dryRun:false,valid:true,stale:final.stale};
    }catch(error){error.details={...error.details,recoveryId:r.operationId};throw error;}
  });
}

export function recoverChildMerge(root,id,{dryRun=false}={}){
  if(!validId(id))fail('INVALID_ARGUMENTS','无效恢复ID。');
  const run=()=>{
    const r=journal.read(journal.path(root,id));
    if(r.kind!=='governance-merge-child'||r.operationId!==id)fail('PROJECT_GOVERNANCE_RECOVERY','不是子项目合并记录。');
    validateName(r.sourceName);validateName(r.targetName);
    if(r.from!=='项目/'+r.sourceName||r.to!=='项目/'+r.targetName||!r.snapshotPath.startsWith('档案/项目历史资料/'+r.sourceName+'/')||r.snapshotPath.split('/').length!==4)fail('PROJECT_GOVERNANCE_RECOVERY','恢复范围无效。');
    safePath(root,r.snapshotPath+'/guard',{resource:true,missing:true});
    if(r.phase==='rolled-back')return {operationId:id,changed:false,rolledBack:true,dryRun};
    if(r.phase==='completed')fail('PROJECT_MERGE_COMPLETED','合并已完成；不自动撤回后续工作。');
    const pending=journal.read(journal.pendingPath(root));if(pending.operationId!==id)fail('PROJECT_GOVERNANCE_PENDING','另有待恢复事务。');
    // Validate *all* affected paths before restoring any of them.
    for(const f of r.files){safePath(root,f.path,{resource:true,missing:true});if(!inside(f.path,r.to)||hash(Buffer.from(f.before,'base64'))!==f.beforeHash||hash(Buffer.from(f.after,'base64'))!==f.afterHash||f.originalPath&&(!inside(f.originalPath,r.from)||moved(f.originalPath,r.moves)!==f.path||!r.entries.some(e=>r.from+'/'+e.path===f.originalPath&&e.sha256===f.beforeHash)))fail('PROJECT_GOVERNANCE_RECOVERY','恢复文件无效。');
      const s=stat(join(root,f.path));if(s&&![f.beforeHash,f.afterHash].includes(readSnapshot(join(root,f.path),{digestOnly:true}).digest))fail('PROJECT_MERGE_CONFLICT','原件已有后续修改，保留现场。',{target:f.path});}
    const formal=new Map(r.files.map(f=>[f.path,f]));
    for(const e of r.materials){safePath(root,e.to,{resource:true,missing:true});if(!inside(e.to,r.to)||['project.md','.DS_Store'].includes(e.path)||e.to!==moved(r.from+'/'+e.path,r.moves)||!r.entries.some(v=>v.path===e.path&&v.sha256===e.sha256&&v.type==='file'))fail('PROJECT_GOVERNANCE_RECOVERY','恢复资料越界或清单无效。');const s=stat(join(root,e.to));if(s&&!formal.has(e.to)&&readSnapshot(join(root,e.to),{digestOnly:true}).digest!==e.sha256)fail('PROJECT_MERGE_CONFLICT','资料已有后续修改。',{target:e.to});}
    for(const dir of r.createdDirs){safePath(root,dir+'/guard',{resource:true,missing:true});if(!inside(dir,r.to))fail('PROJECT_GOVERNANCE_RECOVERY','恢复目录越界。');if(stat(join(root,dir)))for(const e of materialInventory(join(root,dir)))if(e.type==='link'||e.type==='file'&&!r.materials.some(m=>m.to===dir+'/'+e.path))fail('PROJECT_MERGE_CONFLICT','目标目录有后续新增资料。');}
    const retired=r.snapshotPath+'-retiring';
    if(stat(join(root,retired))&&inventoryHash(materialInventory(join(root,retired)))!==inventoryHash(r.entries))fail('PROJECT_MERGE_CONFLICT','退出目录已有后续修改。');
    if(stat(join(root,r.from))&&inventoryHash(materialInventory(join(root,r.from)))!==inventoryHash(r.entries))fail('PROJECT_MERGE_CONFLICT','源目录已有后续修改。');
    if(!stat(join(root,r.from))&&!stat(join(root,retired)))fail('PROJECT_MERGE_CONFLICT','源目录缺失，保留备份待核对。');
    if(dryRun)return {operationId:id,wouldChange:true,rolledBack:true,dryRun};
    if(stat(join(root,retired))){if(stat(join(root,r.from)))fail('PROJECT_MERGE_CONFLICT','源目录重新出现。');renameSync(join(root,retired),join(root,r.from));}
    for(const f of r.files.filter(f=>!f.originalPath)){const s=readSnapshot(join(root,f.path));if(hash(s.bytes)!==f.beforeHash)publishFile(s,Buffer.from(f.before,'base64'));}
    for(const e of r.materials)if(stat(join(root,e.to)))unlinkSync(join(root,e.to));
    for(const d of [...r.createdDirs].sort((a,b)=>b.length-a.length))try{rmdirSync(join(root,d));}catch(e){if(e.code!=='ENOENT')throw e;}
    r.phase='rolled-back';save(root,r);unlinkSync(journal.pendingPath(root));
    return {operationId:id,changed:true,rolledBack:true,dryRun:false,snapshotPath:r.snapshotPath};
  };
  return dryRun?run():withProjectLock(root,run,{allowPending:true,recoverStale:true});
}
