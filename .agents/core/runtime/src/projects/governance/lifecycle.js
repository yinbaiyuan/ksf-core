import {mkdirSync,renameSync,unlinkSync,realpathSync} from 'node:fs';
import {join,dirname,relative,resolve} from 'node:path';
import {inventory} from '../../services/project-transitions.js';
import {directory,stat,withProjectLock,assertNoPending,validateName} from '../storage.js';
import {publishFile} from '../../metadata/files.js';
import {hash,digest,fail,snapshot,encodeDocument,safePath,terminal} from './model.js';
import {loadGraph,checkGraph} from './graph.js';
import {projectPath,readGovernance,governanceJournal as journal} from './store.js';
import {ARCHIVE_STATES} from './states.js';

const text=x=>typeof x==='string'&&!!x.trim();
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(x);
const inside=(path,base)=>path===base||path.startsWith(base+'/');
const movePath=(path,moves)=>{const m=moves.find(m=>inside(path,m.from));return m?m.to+path.slice(m.from.length):path;};
function relocate(value,moves,key=''){
  if(Array.isArray(value))return value.map(x=>relocate(x,moves,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['archive_history','task_numbering_history'].includes(k)?v:relocate(v,moves,k)]));
  return ['path','source','inventory','card_backup'].includes(key)&&typeof value==='string'?movePath(value,moves):value;
}
function request(root,operation,name,data={},reason){
  if(!['archive','restore'].includes(operation)||!data||typeof data!=='object'||Array.isArray(data))fail('PROJECT_TRANSITION_INPUT','归档/恢复请求无效。');
  validateName(name);const fromScope=operation==='archive'?'current':'archived',toScope=operation==='archive'?'archived':'current';
  const targets=data.targets??[{path:projectPath(name,fromScope)}];
  if(!Array.isArray(targets)||!targets.length||targets.length>64||new Set(targets.map(x=>x?.path)).size!==targets.length)fail('PROJECT_TRANSITION_INPUT','显式项目清单为1至64项且不能重复。');
  const moves=targets.map(t=>{const path=t?.path;if(typeof path!=='string'||!new RegExp('^'+(fromScope==='current'?'项目':'档案/项目')+'/[^/]+/project\\.md$').test(path))fail('PROJECT_TRANSITION_INPUT','项目位置与操作范围不一致。');const n=path.split('/').at(-2);validateName(n);return {id:t.id??null,name:n,from:dirname(path),to:dirname(projectPath(n,toScope))};}).sort((a,b)=>a.from.localeCompare(b.from));
  if(!moves.some(m=>m.name===name))fail('PROJECT_TRANSITION_INPUT','命令指定项目必须在显式清单中。');
  return {operation,name,fromScope,toScope,moves,reason:data.reason??reason??'',actor:data.actor??'',operationId:data.operationId,ifMatch:data.ifMatch};
}
function prepare(root,q){
  const graph=loadGraph(root),blockers=[],warnings=[],trees=[];
  const add=(code,message,path)=>blockers.push({code,message,path});
  if(!text(q.reason)||q.reason.length>4000)add('PROJECT_TRANSITION_REASON','请说明归档或恢复原因，最长4000字。');
  if(!text(q.actor)||q.actor.length>128)add('PROJECT_TRANSITION_ACTOR','请记录操作者，最长128字。');
  for(const move of q.moves){
    safePath(root,move.from+'/project.md',{missing:true});safePath(root,move.to+'/project.md',{missing:true});
    const d=graph.docs.get(move.from+'/project.md');
    if(!d){add('PROJECT_TRANSITION_SOURCE','项目原件缺失或不是治理格式。',move.from);continue;}
    if(d.metadata.governance_schema!==2){add('PROJECT_GOVERNANCE_UPGRADE_REQUIRED','此入口仅支持schema2，请先审阅迁移。',d.path);continue;}
    if(move.id&&move.id!==d.metadata.id){add('PROJECT_TRANSITION_ID','项目ID与路径不一致。',d.path);continue;}move.id=d.metadata.id;
    const checked=checkGraph(root,graph,{start:d.path});blockers.push(...checked.errors);warnings.push(...checked.warnings);
    if(stat(join(root,move.to)))add('PROJECT_DESTINATION_EXISTS','目标目录已存在，不能合并覆盖。',move.to);
    const m=d.metadata;
    if(q.operation==='archive'){
      if(!ARCHIVE_STATES.includes(m.status))add('PROJECT_ARCHIVE_STATE','先完成、取消或暂停项目，再归档。',d.path);
      if(m.status==='completed'&&checked.stale.length)add('PROJECT_ARCHIVE_ACCEPTANCE','完成项目仍有验收需复核。',d.path);
      if(m.status==='cancelled'){
        const r=graph.docs.get(m.review_ref?.path);
        if(!text(m.status_reason)||!r||r.metadata.status!=='completed'||r.metadata.outcome!=='cancelled'||!r.body.trim())add('PROJECT_ARCHIVE_CLOSURE','取消归档需要停止原因、项目复盘中的已有结果及遗留去向。',d.path);
      }
      if(m.status==='paused'&&(!text(m.status_reason)||!text(m.resume_condition)||!text(m.next_action)||!d.body.trim()))add('PROJECT_ARCHIVE_PAUSE','暂停封存须保留进度、暂停原因、恢复条件及下一步。',d.path);
      for(const child of m.child_projects??[]){const c=graph.docs.get(child.path);if(c?.scope==='current'&&!terminal(c.metadata.status)&&!q.moves.some(x=>x.from===dirname(c.path)))add('PROJECT_ARCHIVE_CHILD','未结束子项目须先调整归属，或明确纳入本次封存。',child.path);}
    }
    try{trees.push({...move,entries:inventory(join(root,move.from))});}catch(e){add(e.code??'PROJECT_RESOURCE_INVALID',e.message,move.from);}
  }
  const baseline=digest({operation:q.operation,reason:q.reason,actor:q.actor,moves:q.moves,trees,graph:graph.etag});
  return {graph,trees,blockers,warnings,ifMatch:baseline};
}
function candidate(root,q,p,at){
  const files=[],overlay=new Map();overlay.beforeVersions=new Map();overlay.lifecycle=true;
  for(const d of p.graph.docs.values()){
    const path=movePath(d.path,q.moves),metadata=relocate(d.metadata,q.moves),own=q.moves.find(m=>d.path===m.from+'/project.md');
    if(own){
      if(Array.isArray(metadata.repositories))metadata.repositories=metadata.repositories.map(v=>v.startsWith('/')?v:relative(join(root,own.to),resolve(root,own.from,v)).split('\\').join('/'));
      if(metadata.archive_history!==undefined&&!Array.isArray(metadata.archive_history))fail('PROJECT_TRANSITION_HISTORY','归档历史格式损坏，保留原件先修复。');
      metadata.archive_history=[...(metadata.archive_history??[]),{operation_id:q.operationId,action:q.operation,at,actor:q.actor,reason:q.reason,from:own.from,to:own.to,previous_status:d.metadata.status}];
    }
    if(path===d.path&&digest(metadata)===digest(d.metadata))continue;
    metadata.updated=at;const before=snapshot(root,d.path).bytes,after=encodeDocument(before,{path,metadata});
    const f={path,originalPath:d.path,before:before.toString('base64'),after:after.toString('base64'),beforeHash:hash(before),afterHash:hash(after)};files.push(f);overlay.set(path,after);overlay.beforeVersions.set(path+':'+f.beforeHash,before);if(path!==d.path)overlay.set(d.path,null);
  }
  // A preview uses the actual bytes at their proposed locations, without writing them.
  for(const tree of p.trees)for(const e of tree.entries)if(e.type==='file'){const old=tree.from+'/'+e.path,path=tree.to+'/'+e.path;if(!overlay.has(path))overlay.set(path,snapshot(root,old,{resource:true}).bytes);overlay.set(old,null);}
  const graph=loadGraph(root,overlay);
  for(const move of q.moves){const checked=checkGraph(root,graph,{start:move.to+'/project.md'});if(!checked.valid)fail('PROJECT_GOVERNANCE_INVALID','重定位后关联不完整。',{issues:checked.errors});if(q.operation==='archive'&&p.graph.docs.get(move.from+'/project.md').metadata.status==='completed'&&checked.stale.length)fail('PROJECT_ARCHIVE_ACCEPTANCE','重定位后证据版本需要复核。',{issues:checked.warnings});}
  return files;
}
function verifyTree(root,tree,files,folder){
  const actual=inventory(join(root,folder)),old=new Map(tree.entries.map(e=>[e.path,e]));
  if(actual.length!==tree.entries.length)fail('PROJECT_GOVERNANCE_CONFLICT','项目目录出现后续资源变化。',{target:folder});
  for(const e of actual){const b=old.get(e.path),f=files.find(f=>f.originalPath===tree.from+'/'+e.path);if(!b)fail('PROJECT_GOVERNANCE_CONFLICT','项目出现新资源。');if(f){if(e.type!=='file'||e.mode!==b.mode||![f.beforeHash,f.afterHash].includes(e.sha256))fail('PROJECT_GOVERNANCE_CONFLICT','受管原件有后续修改。',{target:folder+'/'+e.path});}else if(JSON.stringify(e)!==JSON.stringify(b))fail('PROJECT_GOVERNANCE_CONFLICT','原资源有后续修改。',{target:folder+'/'+e.path});}
}
function summary(q,p){return {operation:q.operation,operationId:q.operationId??null,allowed:!p.blockers.length,blockers:p.blockers,warnings:p.warnings,ifMatch:p.ifMatch,targets:q.moves.map(m=>({id:m.id,name:m.name,from:m.from,to:m.to,scope:q.toScope})),changed:false,wouldChange:!p.blockers.length,readOnly:q.operation==='archive',referenceReview:{instruction:'同步结构化引用；正文与历史保持原字节，旧入口通过位置解析查阅。'}};}
export function lifecycleTransition({root,operation,name,data,reason,status,dryRun=false},hooks={}){
  root=realpathSync(root);if(status!==undefined)fail('PROJECT_RESTORE_STATE','恢复只还原位置；状态变更请在恢复后按正常流程办理。');
  const q=request(root,operation,name,data,reason),requestDigest=digest(q);assertNoPending(root);
  if(!dryRun&&validId(q.operationId)&&stat(journal.path(root,q.operationId))){
    const r=journal.read(journal.path(root,q.operationId));if(r.kind!=='governance-transition'||r.schemaVersion!==2||r.requestDigest!==requestDigest)fail('PROJECT_TRANSITION_OPERATION','同一操作ID不能用于其他请求。');if(r.phase!=='completed')fail('PROJECT_TRANSITION_PENDING','原操作未完成或已回退，请先核对恢复。');
    for(const t of r.trees)verifyTree(root,t,r.files,t.to);for(const f of r.files)if(hash(snapshot(root,f.path).bytes)!==f.afterHash)fail('PROJECT_GOVERNANCE_CONFLICT','操作后原件发生变化。');return {data:{...r.result,changed:false,replayed:true},errors:[]};
  }
  const p=prepare(root,q),out=summary(q,p);
  if(dryRun){if(!p.blockers.length){const preview={...q,operationId:q.operationId??'preview-operation'};out.referenceReview.updatedStructured=candidate(root,preview,p,'1970-01-01T00:00:00.000Z').map(f=>f.path);}return {data:{...out,dryRun:true},errors:[]};}
  if(!validId(q.operationId)||!text(q.ifMatch))fail('PROJECT_TRANSITION_PREVIEW_REQUIRED','先预览，再使用operationId和返回的ifMatch提交。');
  if(p.blockers.length)fail('PROJECT_ARCHIVE_BLOCKED','归档/恢复条件未满足。',{issues:p.blockers});
  if(q.ifMatch!==p.ifMatch)fail('PROJECT_GOVERNANCE_CONFLICT','预览后原件或关联已变化，请重新预览。');
  return withProjectLock(root,()=>{
    const current=prepare(root,q);if(current.ifMatch!==q.ifMatch||current.blockers.length)fail('PROJECT_GOVERNANCE_CONFLICT','提交前原件或关联已变化。');
    const at=new Date().toISOString(),files=candidate(root,q,current,at);hooks.beforeCheck?.();
    if(prepare(root,q).ifMatch!==q.ifMatch)fail('PROJECT_GOVERNANCE_CONFLICT','提交前资源发生并发变化。');
    const r={schemaVersion:2,kind:'governance-transition',operationId:q.operationId,operation:q.operation,name,at,phase:'prepared',requestDigest,trees:current.trees,files,result:{...summary(q,current),changed:true,recoveryId:q.operationId,referenceReview:{...out.referenceReview,updatedStructured:files.map(f=>f.path)}}};
    journal.ensure(root);journal.save(journal.path(root,r.operationId),r);journal.save(journal.pendingPath(root),{operationId:r.operationId,kind:r.kind});
    try{
      hooks.fault?.('prepared');for(const t of r.trees){let dir=root;for(const part of dirname(t.to).split('/')){dir=join(dir,part);directory(dir,{create:true});}verifyTree(root,t,files,t.from);if(stat(join(root,t.to)))fail('PROJECT_GOVERNANCE_CONFLICT','目标目录已经出现。');renameSync(join(root,t.from),join(root,t.to));hooks.fault?.('moved');}
      r.phase='moved';journal.save(journal.path(root,r.operationId),r);
      for(const f of files){const s=snapshot(root,f.path);if(hash(s.bytes)!==f.beforeHash)fail('PROJECT_GOVERNANCE_CONFLICT','关联在发布前变化。',{target:f.path});publishFile(s,Buffer.from(f.after,'base64'));hooks.fault?.('reference-written');}
      for(const t of r.trees)verifyTree(root,t,files,t.to);
      r.phase='completed';journal.save(journal.path(root,r.operationId),r);
      for(const t of r.trees){const check=readGovernance(root,t.name,q.toScope,{allowPending:true});if(!check.valid)fail('PROJECT_GOVERNANCE_INVALID','发布后治理核验失败。',{issues:check.errors});}
      hooks.fault?.('completed');unlinkSync(journal.pendingPath(root));return {data:r.result,errors:[]};
    }catch(e){e.details={...e.details,recoveryId:r.operationId};throw e;}
  });
}
export function recoverLifecycle(root,id,{dryRun=false}={}){
  const run=()=>{
    const r=journal.read(journal.path(root,id));if(r.schemaVersion!==2||r.kind!=='governance-transition'||r.operationId!==id||!Array.isArray(r.trees)||!Array.isArray(r.files))fail('PROJECT_GOVERNANCE_RECOVERY','过渡恢复记录无效。');
    if(r.phase==='rolled-back')return {operationId:id,changed:false,replayed:true,dryRun};
    const pending=stat(journal.pendingPath(root))?journal.read(journal.pendingPath(root)):null;if(pending&&pending.operationId!==id)fail('PROJECT_TRANSITION_PENDING','其他项目操作待恢复。');
    const folders=new Map();for(const t of r.trees){validateName(t.name);if(![projectPath(t.name,'current'),projectPath(t.name,'archived')].includes(t.from+'/project.md')||!['archive','restore'].includes(r.operation)||t.to!==dirname(projectPath(t.name,r.operation==='archive'?'archived':'current')))fail('PROJECT_GOVERNANCE_RECOVERY','恢复位置无效。');const from=stat(join(root,t.from)),to=stat(join(root,t.to));if(!!from===!!to)fail('PROJECT_GOVERNANCE_CONFLICT','每个项目必须只有一个存续位置。');const folder=from?t.from:t.to;verifyTree(root,t,r.files,folder);folders.set(t.from,folder);}
    const actual=f=>{const t=r.trees.find(t=>inside(f.originalPath,t.from));return t?folders.get(t.from)+f.originalPath.slice(t.from.length):f.path;};
    for(const f of r.files){safePath(root,f.path,{missing:true});safePath(root,f.originalPath,{missing:true});if(hash(Buffer.from(f.before,'base64'))!==f.beforeHash||hash(Buffer.from(f.after,'base64'))!==f.afterHash||![f.beforeHash,f.afterHash].includes(hash(snapshot(root,actual(f)).bytes)))fail('PROJECT_GOVERNANCE_CONFLICT','快照损坏或存在后续修改，保留现场。',{target:f.path});}
    if(dryRun)return {operationId:id,changed:false,wouldChange:true,dryRun:true};
    for(const f of [...r.files].reverse()){const s=snapshot(root,actual(f));if(hash(s.bytes)!==f.beforeHash)publishFile(s,Buffer.from(f.before,'base64'));}
    for(const t of [...r.trees].reverse())if(folders.get(t.from)===t.to)renameSync(join(root,t.to),join(root,t.from));
    r.phase='rolled-back';journal.save(journal.path(root,id),r);if(pending)unlinkSync(journal.pendingPath(root));return {operationId:id,changed:true,dryRun:false};
  };return dryRun?run():withProjectLock(root,run,{allowPending:true,recoverStale:true});
}
