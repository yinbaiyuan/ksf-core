import {readFileSync,renameSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {inventory} from '../../services/project-transitions.js';
import {assertNoPending,withProjectLock,stat} from '../storage.js';
import {publishFile} from '../../metadata/files.js';
import {readGovernance,publicState,governanceJournal as journal} from './store.js';
import {loadGraph,checkGraph} from './graph.js';
import {hash,digest,fail,object,snapshot,safePath,encodeDocument} from './model.js';
import {taskCode,codeOf,compareCodes,stageIssues} from './task-codes.js';

import {documentKind} from './layout.js';
import {usedTaskCounters} from './create-task.js';

const validId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(x);
const inside=(path,base)=>path===base||path.startsWith(base+'/');
const movePath=(path,moves)=>{const m=moves.find(m=>inside(path,m.from));return m?m.to+path.slice(m.from.length):path;};
function relocate(value,moves,key=''){
 if(Array.isArray(value))return value.map(x=>relocate(x,moves,key));
 if(object(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['archive_history','task_numbering_history'].includes(k)?v:relocate(v,moves,k)]));
 return ['path','source','inventory','card_backup'].includes(key)&&typeof value==='string'?movePath(value,moves):value;
}
function prepare(root,name,scope,data){
 if(scope!=='current')fail('PROJECT_GOVERNANCE_ARCHIVED','归档项目只读，先恢复再调整编号。');
 if(!object(data)||!validId(data.operationId)||typeof data.ifMatch!=='string'||typeof data.actor!=='string'||!data.actor.trim()||typeof data.reason!=='string'||!data.reason.trim()||!Array.isArray(data.milestones)||!data.milestones.length||data.milestones.length>64)fail('PROJECT_NUMBERING_INPUT','改号需要operationId、读取基线、操作者、原因和显式里程碑映射。');
 const before=readGovernance(root,name,scope);if(before.project?.metadata.governance_schema!==2||!before.valid)fail('PROJECT_NUMBERING_INPUT','先修复原件并使用schema2项目。');
 const moves=[],codes=new Map(),stages=new Map(),seen=new Set();
 for(const plan of data.milestones){
  const m=before.graph.byId.get(plan?.id);if(!m||m.metadata.kind!=='milestone'||m.metadata.project?.id!==before.project.metadata.id||seen.has(plan.id)||stageIssues(plan.task_stages).length||!plan.task_stages.length||!Array.isArray(plan.tasks))fail('PROJECT_NUMBERING_INPUT','里程碑、阶段定义或任务映射无效。');seen.add(plan.id);stages.set(plan.id,plan.task_stages);
  const refs=m.metadata.tasks??[];if(plan.tasks.length!==refs.length||new Set(plan.tasks.map(x=>x?.id)).size!==refs.length)fail('PROJECT_NUMBERING_INPUT','须明确列出本里程碑每个任务，不能遗漏或重复。');
  const used=new Set();
  for(const item of plan.tasks){
   const d=before.graph.byId.get(item?.id);if(!d||!refs.some(r=>r.id===item.id)||!taskCode(item.code)||used.has(item.code)||!plan.task_stages.some(s=>s.code===item.code[0]))fail('PROJECT_NUMBERING_INPUT','任务号须唯一并属于已定义阶段。');used.add(item.code);codes.set(item.id,item.code);
   const from=dirname(d.path),to=dirname(from)+'/'+item.code+'-'+from.split('/').at(-1).split('-').slice(1).join('-');safePath(root,to+'/task.md',{missing:true});
   if(from!==to){if(stat(join(root,to)))fail('PROJECT_NUMBERING_COLLISION','目标任务目录已经存在，不能覆盖。',{target:to});moves.push({id:item.id,from,to});}
  }
 }
 if(codes.size>128)fail('PROJECT_NUMBERING_INPUT','单次最多迁移128个任务。');
 // Retired task codes belong to their original stable identity.
 for(const e of before.project.metadata.task_numbering_history??[])for(const old of e.moves??[])for(const move of moves){if(move.to===old.from&&move.id!==old.id)fail('PROJECT_NUMBERING_COLLISION','旧入口已被其他稳定ID使用，不能重新分配。');}
 const trees=moves.map(m=>({...m,entries:inventory(join(root,m.from))}));
 const baseline=digest({graph:before.etag,trees});if(data.ifMatch!==baseline&&data.ifMatch!==before.etag)fail('PROJECT_GOVERNANCE_CONFLICT','原件或任务上下文已变化，请重新读取并预览。');
 return {before,moves,trees,codes,stages,baseline};
}
function candidate(root,data,p,at){
 const files=[],overlay=new Map();overlay.beforeVersions=new Map();
 for(const tree of p.trees)for(const e of tree.entries)if(e.type==='file'){const old=tree.from+'/'+e.path,path=tree.to+'/'+e.path;overlay.set(path,readFileSync(safePath(root,old)));overlay.set(old,null);}
 for(const d of p.before.graph.docs.values()){
  const path=movePath(d.path,p.moves),metadata=relocate(d.metadata,p.moves);
  if(p.codes.has(metadata.id))metadata.task_code=p.codes.get(metadata.id);
  if(p.stages.has(metadata.id)){metadata.task_counters=usedTaskCounters(root,p.before,d);for(const ref of metadata.tasks){const code=p.codes.get(ref.id);metadata.task_counters[code[0]]=Math.max(metadata.task_counters[code[0]]??0,Number(code.slice(1)));}metadata.task_stages=p.stages.get(metadata.id);metadata.tasks.sort((a,b)=>compareCodes(p.codes.get(a.id),p.codes.get(b.id)));}
  if(d.path===p.before.path)metadata.task_numbering_history=[...(metadata.task_numbering_history??[]),{operation_id:data.operationId,at,actor:data.actor,reason:data.reason,moves:p.moves}];
  if(path===d.path&&digest(metadata)===digest(d.metadata))continue;
  metadata.updated=at;const before=snapshot(root,d.path).bytes,after=encodeDocument(before,{path,metadata}),f={path,originalPath:d.path,before:before.toString('base64'),after:after.toString('base64'),beforeHash:hash(before),afterHash:hash(after)};
  files.push(f);overlay.set(path,after);overlay.beforeVersions.set(path+':'+f.beforeHash,before);if(path!==d.path)overlay.set(d.path,null);
 }
 const graph=loadGraph(root,overlay),checked=checkGraph(root,graph,{start:p.before.path,changedPaths:new Set(files.map(f=>f.path))});
 if(!checked.valid)fail('PROJECT_GOVERNANCE_INVALID','改号后的原件未通过校验。',{issues:checked.errors});
 if(checked.stale.some(id=>!p.before.stale.includes(id)))fail('PROJECT_NUMBERING_EVIDENCE','改号不能使现有验收证据失效。',{issues:checked.warnings});
 return {files,overlay};
}
function verifyTree(root,tree,files,folder){
 const actual=inventory(join(root,folder));if(actual.length!==tree.entries.length)fail('PROJECT_GOVERNANCE_CONFLICT','任务目录有后续增删，请保留现场。',{target:folder});
 const old=new Map(tree.entries.map(e=>[e.path,e]));for(const e of actual){const b=old.get(e.path),f=files.find(f=>f.originalPath===tree.from+'/'+e.path);if(!b||(f?(e.type!=='file'||e.mode!==b.mode||![f.beforeHash,f.afterHash].includes(e.sha256)):JSON.stringify(e)!==JSON.stringify(b)))fail('PROJECT_GOVERNANCE_CONFLICT','任务原件有后续修改。',{target:folder+'/'+e.path});}
}
export function renumberGovernance(root,name,scope,data,{dryRun=false,hooks={}}={}){
 assertNoPending(root);if(!object(data)||!validId(data.operationId))fail('PROJECT_NUMBERING_INPUT','需要唯一改号操作ID。');
 const recordPath=journal.path(root,data.operationId),requestDigest=digest(data);
 if(stat(recordPath)){const r=journal.read(recordPath);if(r.kind!=='governance-numbering'||r.requestDigest!==requestDigest||r.phase!=='completed')fail('PROJECT_GOVERNANCE_OPERATION_CONFLICT','操作ID已使用或原操作待恢复。');for(const t of r.trees)verifyTree(root,t,r.files,t.to);for(const f of r.files)if(hash(snapshot(root,f.path).bytes)!==f.afterHash)fail('PROJECT_GOVERNANCE_CONFLICT','操作后原件已变化。');return {...publicState(readGovernance(root,name,scope)),changed:false,replayed:true,operationId:data.operationId};}
 const p=prepare(root,name,scope,data),c=candidate(root,data,p,new Date().toISOString());
 if(dryRun)return {...publicState(readGovernance(root,name,scope,{overlay:c.overlay})),operationId:data.operationId,ifMatch:p.baseline,moves:p.moves,changes:c.files.map(f=>f.path),dryRun:true,changed:false,wouldChange:true};
 // Commit requires the preview's inventory digest, including non-Markdown contexts.
 if(data.ifMatch!==p.baseline)fail('PROJECT_NUMBERING_PREVIEW_REQUIRED','先预览，使用返回的ifMatch提交。');
 return withProjectLock(root,()=>{
  const latest=prepare(root,name,scope,data),at=new Date().toISOString(),prepared=candidate(root,data,latest,at);hooks.beforeCheck?.();if(prepare(root,name,scope,data).baseline!==latest.baseline)fail('PROJECT_GOVERNANCE_CONFLICT','提交前上下文发生变化。');
  const r={schemaVersion:1,kind:'governance-numbering',operationId:data.operationId,name,scope,at,phase:'prepared',requestDigest,trees:latest.trees,files:prepared.files};journal.ensure(root);journal.save(recordPath,r);journal.save(journal.pendingPath(root),{operationId:r.operationId,kind:r.kind});
  try{
   hooks.fault?.('prepared');for(const t of r.trees){verifyTree(root,t,r.files,t.from);if(stat(join(root,t.to)))fail('PROJECT_NUMBERING_COLLISION','提交时目标目录已出现。');renameSync(join(root,t.from),join(root,t.to));hooks.fault?.('moved');}
   r.phase='moved';journal.save(recordPath,r);
   for(const f of r.files){const s=snapshot(root,f.path);if(hash(s.bytes)!==f.beforeHash)fail('PROJECT_GOVERNANCE_CONFLICT','提交时关联发生变化。');publishFile(s,Buffer.from(f.after,'base64'));hooks.fault?.('reference-written');}
   for(const t of r.trees)verifyTree(root,t,r.files,t.to);r.phase='completed';journal.save(recordPath,r);
   const after=readGovernance(root,name,scope,{allowPending:true});if(!after.valid||after.stale.some(id=>!latest.before.stale.includes(id)))fail('PROJECT_NUMBERING_EVIDENCE','提交后关联或证据需要核对。');
   hooks.fault?.('completed');unlinkSync(journal.pendingPath(root));return {...publicState(after),changed:true,operationId:r.operationId,moves:latest.moves};
  }catch(e){e.details={...e.details,recoveryId:r.operationId};throw e;}
 });
}
export function recoverNumbering(root,id,{dryRun=false}={}){
 const run=()=>{
  const r=journal.read(journal.path(root,id));if(r.kind!=='governance-numbering'||r.schemaVersion!==1||r.operationId!==id||!Array.isArray(r.trees)||r.trees.length>128||!Array.isArray(r.files)||r.files.length>20000)fail('PROJECT_GOVERNANCE_RECOVERY','改号恢复记录无效。');
  if(r.phase==='rolled-back')return {operationId:id,changed:false,replayed:true,dryRun};
  const pending=stat(journal.pendingPath(root))?journal.read(journal.pendingPath(root)):null;if(pending&&pending.operationId!==id)fail('PROJECT_GOVERNANCE_PENDING','其他操作待恢复。');
  const folders=new Map();for(const t of r.trees){safePath(root,t.from+'/task.md',{missing:true});safePath(root,t.to+'/task.md',{missing:true});if(dirname(t.from)!==dirname(t.to)||(!t.from.startsWith('项目/')||documentKind(t.from+'/task.md')!=='task'||documentKind(t.to+'/task.md')!=='task'))fail('PROJECT_GOVERNANCE_RECOVERY','改号恢复位置无效。');if(!!stat(join(root,t.from))===!!stat(join(root,t.to)))fail('PROJECT_GOVERNANCE_CONFLICT','任务必须只有一个存续位置。');const folder=stat(join(root,t.from))?t.from:t.to;verifyTree(root,t,r.files,folder);folders.set(t.from,folder);}
  const actual=f=>{const t=r.trees.find(t=>inside(f.originalPath,t.from));return t?folders.get(t.from)+f.originalPath.slice(t.from.length):f.path;};
  for(const f of r.files){safePath(root,f.path,{missing:true});safePath(root,f.originalPath,{missing:true});if(f.path!==movePath(f.originalPath,r.trees)||!documentKind(f.path)||hash(Buffer.from(f.before,'base64'))!==f.beforeHash||hash(Buffer.from(f.after,'base64'))!==f.afterHash||![f.beforeHash,f.afterHash].includes(hash(snapshot(root,actual(f)).bytes)))fail('PROJECT_GOVERNANCE_CONFLICT','快照损坏或存在后续修改。',{target:f.path});}
  if(dryRun)return {operationId:id,changed:false,wouldChange:true,dryRun:true};
  for(const f of [...r.files].reverse()){const s=snapshot(root,actual(f));if(hash(s.bytes)!==f.beforeHash)publishFile(s,Buffer.from(f.before,'base64'));}
  for(const t of [...r.trees].reverse())if(folders.get(t.from)===t.to)renameSync(join(root,t.to),join(root,t.from));r.phase='rolled-back';journal.save(journal.path(root,id),r);if(pending)unlinkSync(journal.pendingPath(root));return {operationId:id,changed:true,dryRun:false};
 };return dryRun?run():withProjectLock(root,run,{allowPending:true,recoverStale:true});
}
