import {mkdirSync,renameSync,unlinkSync,realpathSync} from 'node:fs';
import {join,dirname,resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {inventory} from '../../services/project-transitions.js';
import {directory,stat,withProjectLock,assertNoPending} from '../storage.js';
import {readSnapshot,publishFile} from '../../metadata/files.js';
import {hash,digest,fail,snapshot,encodeDocument,safePath,STATES} from './model.js';
import {loadGraph,checkGraph,references} from './graph.js';
import {projectPath,readGovernance,publicState,governanceJournal as journal} from './store.js';
import {lifecycleTransition,recoverLifecycle} from './lifecycle.js';

const portable=s=>s.split('\\').join('/');
const replacePrefix=(value,from,to)=>typeof value==='string'&&(value===from||value.startsWith(from+'/'))?to+value.slice(from.length):value;
function relocate(value,from,to,key=''){
  if(Array.isArray(value))return value.map(x=>relocate(x,from,to,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,relocate(v,from,to,k)]));
  // Alias.from remains a historical identity. All active paths are root-relative.
  return ['path','source','inventory','card_backup'].includes(key)?replacePrefix(value,from,to):value;
}
function prepare(root,operation,name,reason,status){
  const fromScope=operation==='archive'?'current':'archived',toScope=operation==='archive'?'archived':'current',from=dirname(projectPath(name,fromScope)),to=dirname(projectPath(name,toScope));
  safePath(root,from+'/project.md',{missing:true});safePath(root,to+'/project.md',{missing:true});
  if(!stat(join(root,from))){if(stat(join(root,to,'project.md')))return {unchanged:true,data:{name,path:to+'/project.md',scope:toScope,changed:false,wouldChange:false}};fail('PROJECT_NOT_FOUND','项目源目录不存在。');}
  if(stat(join(root,to)))fail('PROJECT_DESTINATION_EXISTS','目标已存在，不能合并或覆盖。');
  const state=readGovernance(root,name,fromScope);if(state.format!=='documents'||!state.valid)fail('PROJECT_GOVERNANCE_INVALID','先修复治理原件，再归档/恢复。',{issues:state.errors});
  const entries=inventory(join(root,from)),overlay=new Map(),files=[],operationId=randomUUID(),now=new Date().toISOString();
  const rootPath=from+'/project.md';
  for(const d of state.graph.docs.values()){
    const path=replacePrefix(d.path,from,to),metadata=relocate(d.metadata,from,to);
    if(d.path===rootPath){
      if(Array.isArray(metadata.repositories))metadata.repositories=metadata.repositories.map(v=>v.startsWith('/')?v:portable(relative(join(root,to),resolve(root,from,v))));
      if(status!==undefined)metadata.status=status;
      metadata.archive_history=[...(metadata.archive_history??[]),{operation_id:operationId,action:operation,at:now,reason:reason??null,from,to,previous_status:d.metadata.status}];
    }
    if(path===d.path&&digest(metadata)===digest(d.metadata))continue;
    metadata.updated=now;
    const before=snapshot(root,d.path).bytes,after=encodeDocument(before,{path,metadata});
    files.push({path,originalPath:d.path,before:before.toString('base64'),after:after.toString('base64'),beforeHash:hash(before),afterHash:hash(after)});overlay.set(path,after);if(path!==d.path)overlay.set(d.path,null);
  }
  // Evidence/context remain in place within the moved project. Supply just explicitly
  // referenced bytes for preflight validation, without loading every context into a chat.
  function evidence(value){if(Array.isArray(value)){for(const x of value)evidence(x);}else if(value&&typeof value==='object'){if(typeof value.path==='string'&&value.path.startsWith(to+'/')&&!overlay.has(value.path)){const old=replacePrefix(value.path,to,from);try{const s=snapshot(root,old,{optional:true,resource:true});if(s)overlay.set(value.path,s.bytes);}catch{}}for(const x of Object.values(value))evidence(x);}}
  for(const f of files){const parsed=JSON.parse(JSON.stringify(relocate(state.graph.docs.get(f.originalPath).metadata,from,to)));evidence(parsed);}
  const graph=loadGraph(root,overlay),checked=checkGraph(root,graph,{start:to+'/project.md',changedPaths:new Set(files.map(f=>f.path))});
  if(!checked.valid)fail('PROJECT_GOVERNANCE_INVALID','重定位后的治理关联不完整。',{issues:checked.errors});
  return {operationId,operation,name,fromScope,toScope,from,to,entries,files,phase:'prepared',schemaVersion:1,kind:'governance-transition',at:now};
}
function verifyTree(root,folder,r){
  const entries=inventory(join(root,folder));if(entries.length!==r.entries.length)fail('PROJECT_GOVERNANCE_CONFLICT','项目目录有后续资源变化。');
  const original=new Map(r.entries.map(e=>[e.path,e])),owned=new Map(r.files.filter(f=>f.originalPath.startsWith(r.from+'/')).map(f=>[f.originalPath.slice(r.from.length+1),f]));
  for(const e of entries){const old=original.get(e.path),f=owned.get(e.path);if(!old)fail('PROJECT_GOVERNANCE_CONFLICT','出现新资源。');if(f){if(e.type!=='file'||old.mode!==e.mode||![f.beforeHash,f.afterHash].includes(e.sha256))fail('PROJECT_GOVERNANCE_CONFLICT','受管原件存在后续修改。',{target:e.path});}else if(JSON.stringify(e)!==JSON.stringify(old))fail('PROJECT_GOVERNANCE_CONFLICT','原资源发生变化。',{target:e.path});}
}
export function governanceTransition({root,operation,name,reason,status,data,dryRun=false},hooks={}){
  const scope=operation==='archive'?'current':'archived';
  const card=snapshot(root,projectPath(name,scope),{optional:true})??snapshot(root,projectPath(name,scope==='current'?'archived':'current'),{optional:true});
  if(data!==undefined||card&&readGovernance(root,name,scope).project?.metadata.governance_schema===2)return lifecycleTransition({root,operation,name,reason,status,data,dryRun},hooks);
  root=realpathSync(root);if(!['archive','restore'].includes(operation))fail('INVALID_ARGUMENTS','未知过渡操作。');
  if(operation==='archive'&&!(typeof reason==='string'&&reason.trim()))fail('INVALID_ARGUMENTS','归档需要说明原因。');
  if(status!==undefined&&(operation!=='restore'||!STATES.project.includes(status)))fail('INVALID_ARGUMENTS','恢复状态无效。');
  assertNoPending(root);
  const preview=prepare(root,operation,name,reason,status);
  if(preview.unchanged)return {data:{...preview.data,dryRun},errors:[]};
  const summary=r=>({name,operationId:r.operationId,from:r.from,to:r.to,scope:r.toScope,path:r.to+'/project.md',changed:false,wouldChange:true,dryRun,referenceReview:{updatedStructured:r.files.map(f=>f.path),instruction:'结构化引用已纳入同次过渡；历史文本与Markdown/Wikilinks仍按实际入口复核，不递归归档子项目。'}});
  if(dryRun)return {data:summary(preview),errors:[]};
  return withProjectLock(root,()=>{
    const r=prepare(root,operation,name,reason,status);if(r.unchanged)return {data:r.data,errors:[]};hooks.beforeCheck?.();verifyTree(root,r.from,r);journal.ensure(root);journal.save(journal.path(root,r.operationId),r);journal.save(journal.pendingPath(root),{operationId:r.operationId,kind:r.kind});
    try{
      hooks.fault?.('prepared');let dir=root;for(const part of dirname(r.to).split('/')){dir=join(dir,part);directory(dir,{create:true});}
      if(stat(join(root,r.to)))fail('PROJECT_GOVERNANCE_CONFLICT','目标目录已出现。');
      verifyTree(root,r.from,r);renameSync(join(root,r.from),join(root,r.to));r.phase='moved';journal.save(journal.path(root,r.operationId),r);hooks.fault?.('moved');
      for(const f of r.files){const s=snapshot(root,f.path);if(hash(s.bytes)!==f.beforeHash)fail('PROJECT_GOVERNANCE_CONFLICT','引用原件在发布前变化。',{target:f.path});publishFile(s,Buffer.from(f.after,'base64'));hooks.fault?.('reference-written');}
      verifyTree(root,r.to,r);r.phase='completed';journal.save(journal.path(root,r.operationId),r);hooks.fault?.('completed');unlinkSync(journal.pendingPath(root));return {data:{...summary(r),changed:true,recoveryId:r.operationId},errors:[]};
    }catch(e){e.details={...e.details,recoveryId:r.operationId,data:{...summary(r),recoveryId:r.operationId,changed:!!stat(join(root,r.to))}};throw e;}
  });
}
export function recoverGovernanceTransition(root,id,{dryRun=false}={}){
  if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id))fail('INVALID_ARGUMENTS','无效恢复ID。');
  const run=()=>{
    const r=journal.read(journal.path(root,id));if(r.kind!=='governance-transition'||r.schemaVersion!==1||r.operationId!==id||!Array.isArray(r.files)||!Array.isArray(r.entries))fail('PROJECT_GOVERNANCE_RECOVERY','恢复记录无效。');
    const from=dirname(projectPath(r.name,r.fromScope)),to=dirname(projectPath(r.name,r.toScope));if(from!==r.from||to!==r.to)fail('PROJECT_GOVERNANCE_RECOVERY','恢复位置不一致。');
    if(r.phase==='rolled-back')return {operationId:id,changed:false,replayed:true,dryRun};
    const pending=stat(journal.pendingPath(root))?journal.read(journal.pendingPath(root)):null;if(pending&&pending.operationId!==id)fail('PROJECT_GOVERNANCE_PENDING','其他项目过渡待恢复。');
    const source=stat(join(root,from)),target=stat(join(root,to));if(!!source===!!target)fail('PROJECT_GOVERNANCE_CONFLICT','必须只有一个存续目录。');const folder=source?from:to;verifyTree(root,folder,r);
    for(const f of r.files){if(hash(Buffer.from(f.before,'base64'))!==f.beforeHash||hash(Buffer.from(f.after,'base64'))!==f.afterHash)fail('PROJECT_GOVERNANCE_RECOVERY','恢复摘要不一致。');const path=source?replacePrefix(f.path,to,from):f.path,s=snapshot(root,path);if(![f.beforeHash,f.afterHash].includes(hash(s.bytes)))fail('PROJECT_GOVERNANCE_CONFLICT','存在后续引用修改。',{target:path});}
    if(dryRun)return {operationId:id,changed:false,wouldChange:true,dryRun:true};
    for(const f of [...r.files].reverse()){const path=source?replacePrefix(f.path,to,from):f.path,s=snapshot(root,path);if(hash(s.bytes)!==f.beforeHash)publishFile(s,Buffer.from(f.before,'base64'));}
    if(target){if(stat(join(root,from)))fail('PROJECT_GOVERNANCE_CONFLICT','恢复目标已出现。');renameSync(join(root,to),join(root,from));}
    r.phase='rolled-back';journal.save(journal.path(root,id),r);if(pending)unlinkSync(journal.pendingPath(root));return {operationId:id,changed:true,dryRun:false};
  };
  const record=journal.read(journal.path(root,id));
  if(record.schemaVersion===2)return recoverLifecycle(root,id,{dryRun});
  return dryRun?run():withProjectLock(root,run,{allowPending:true,recoverStale:true});
}
