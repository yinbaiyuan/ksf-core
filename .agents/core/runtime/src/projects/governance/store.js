import {mkdirSync,readdirSync,rmdirSync,unlinkSync,linkSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readSnapshot,publishFile} from '../../metadata/files.js';
import {withTemporaryFile,writeDurably} from '../../shared/files.js';
import {withProjectLock,assertNoPending,directory,stat,validateName} from '../storage.js';
import {STATES,LEGACY_STATES,ARCHIVE_STATES,unified,activeStates,initialStates,transitionProblem} from './states.js';
import {hash,digest,fail,object,safePath,snapshot,encodeDocument,document} from './model.js';
import {loadGraph,checkGraph,closure,projection} from './graph.js';
import {documentKind,inspirationPath,resourceOwner} from './layout.js';
import {contextEntries} from './contexts.js';

const operationId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id);
const maxRequestedChanges=128;
export const maxGovernanceFiles=2*maxRequestedChanges+3;
const pendingPath=root=>join(root,'.agents/runtime-data/projects/pending.json');
const operations=root=>join(root,'.agents/runtime-data/projects/governance/operations');
function ensureInternal(root){for(const part of ['.agents','.agents/runtime-data','.agents/runtime-data/projects','.agents/runtime-data/projects/governance','.agents/runtime-data/projects/governance/operations'])directory(join(root,part),{create:true});}
function saveJSON(path,value){const bytes=Buffer.from(JSON.stringify(value)+'\n');if(stat(path)){const old=readSnapshot(path);publishFile(old,bytes);}else writeDurably(path,bytes);}
function readJSON(path){return JSON.parse(readSnapshot(path).bytes.toString('utf8'));}
export const governanceJournal={ensure:ensureInternal,path:journal,save:saveJSON,read:readJSON,pendingPath};
export function projectPath(name,scope='current'){validateName(name);if(!['current','archived'].includes(scope))fail('INVALID_ARGUMENTS','scope使用current或archived。');return (scope==='archived'?'档案/项目/':'项目/')+name+'/project.md';}
export function readGovernance(root,name,scope='current',{overlay=new Map(),changedPaths=null,allowPending=false}={}){
  if(!allowPending)assertNoPending(root);
  const path=projectPath(name,scope),graph=loadGraph(root,overlay),rootDoc=graph.docs.get(path)??graph.legacy.get(path);
  if(!rootDoc)return {format:'missing',state:'missing',path,etag:'missing',readOnly:scope==='archived',documents:[],errors:graph.errors.filter(x=>x.path===path),warnings:[],graph};
  const checked=checkGraph(root,graph,{start:path,changedPaths}),paths=closure(graph,path);
  const documents=[...paths].map(p=>graph.docs.get(p)).filter(Boolean);
  return {format:graph.legacy.has(path)?'legacy':'documents',state:'present',path,etag:graph.etag,readOnly:scope==='archived'||rootDoc.metadata.governance_schema===1,project:rootDoc,stateModel:{version:2,unified:unified(rootDoc.metadata),states:unified(rootDoc.metadata)?STATES:LEGACY_STATES},documents,valid:checked.valid,errors:checked.errors,warnings:checked.warnings,stale:checked.stale,projection:projection(graph,path,checked),graph};
}
export function publicState(state){const {graph,...data}=state;return {...data,contextEntries:contextEntries(graph.root,state),taskCreation:{version:1,supported:state.project?.metadata.governance_schema===2,operation:'create-task'},taskNumbering:{version:1,supported:state.project?.metadata.governance_schema===2},lifecycle:{version:1,supported:state.project?.metadata.governance_schema===2,operations:['archive','restore'],states:ARCHIVE_STATES}};}
export function prepareChanges(root,name,scope,data,{allowArchived=false,allowTaskCounters=false}={}){
  if(!object(data)||!operationId(data.operationId)||typeof data.ifMatch!=='string'||!Array.isArray(data.changes)||data.changes.length>maxRequestedChanges)fail('PROJECT_GOVERNANCE_INPUT','需要operationId、ifMatch及不超过128项changes。');
  const before=readGovernance(root,name,scope);
  if(before.etag!==data.ifMatch)fail('PROJECT_GOVERNANCE_CONFLICT','项目原件已变化，请读取最新版本并合并。',{etag:before.etag});
  if(scope==='archived'&&!allowArchived)fail('PROJECT_GOVERNANCE_ARCHIVED','归档项目只读。');
  const changes=structuredClone(data.changes),byPath=new Map(changes.map(c=>[c?.path,c]));
  if(byPath.size!==changes.length)fail('PROJECT_GOVERNANCE_INPUT','变更路径不可重复。');
  if(data.setParent!==undefined){
    const request=data.setParent,child=before.graph.docs.get(request?.child?.path),parent=request?.parent===null?null:before.graph.docs.get(request?.parent?.path);
    if(!child||child.path!==before.path||child.metadata.kind!=='project'||child.metadata.id!==request.child.id||request.parent!==null&&(!parent||parent.metadata.kind!=='project'||parent.metadata.id!==request.parent.id))fail('PROJECT_GOVERNANCE_RELATION','父子关联对象不明确。');
    const patch=(d,metadata)=>{const c=byPath.get(d.path);if(c){c.metadata={...c.metadata,...metadata};}else{const added={path:d.path,ifMatch:d.etag,metadata};changes.push(added);byPath.set(d.path,added);}};
    const old=before.graph.docs.get(child.metadata.parent_project?.path);
    if(old)patch(old,{child_projects:old.metadata.child_projects.filter(r=>r.id!==child.metadata.id)});
    if(parent)patch(parent,{child_projects:[...parent.metadata.child_projects.filter(r=>r.id!==child.metadata.id),{id:child.metadata.id,path:child.path}]});
    patch(child,{parent_project:parent?{id:parent.metadata.id,path:parent.path}:null});
  }
  const newNotes=new Set();
  for (const c of [...changes]) {
    if (!unified(c?.metadata) || before.graph.docs.has(c.path)) continue;
    const path = inspirationPath(c.path);
    if (!path || byPath.has(path)) continue;
    const existing = stat(safePath(root,path,{missing:true}));
    if (existing) {
      if (!existing.isFile()) fail('PROJECT_GOVERNANCE_PATH','灵感闪现必须是普通文件。',{target:path});
      continue;
    }
    const note = {path,ifMatch:'missing',body:'# 灵感闪现\n'};
    changes.push(note);
    byPath.set(path,note);
    newNotes.add(path);
  }
  const overlay=new Map(),files=[],owners=new Map();
  const hasTask=path=>byPath.has(path)||!!stat(safePath(root,path,{missing:true}));
  for(const c of changes){
    if(!object(c)||typeof c.path!=='string'||typeof c.ifMatch!=='string'||Object.keys(c).some(k=>!['path','ifMatch','metadata','body','contentBase64'].includes(k)))fail('PROJECT_GOVERNANCE_INPUT','每项变更需要受管路径和文件ifMatch。');
    safePath(root,c.path,{missing:true});
    const kind=documentKind(c.path),owner=kind?null:resourceOwner(c.path,hasTask);
    if(!kind&&!owner)fail('PROJECT_GOVERNANCE_PATH','不属于新版项目目录。里程碑直接放项目根目录，任务直接放里程碑目录。',{target:c.path});
    for(let ancestor=dirname(c.path);ancestor!=='.';ancestor=dirname(ancestor)){
      if(byPath.has(ancestor))fail('PROJECT_GOVERNANCE_PATH','同一路径不能同时作为文件和目录。',{target:ancestor});
    }
    if(owner)owners.set(c.path,owner);
    if(c.path.startsWith('档案/')&&!allowArchived)fail('PROJECT_GOVERNANCE_ARCHIVED','归档原件只允许显式过渡操作重定位。');
    const original=snapshot(root,c.path,{optional:true}),bytes=original?.bytes??null;
    if(kind==='task'&&!original&&stat(join(root,dirname(c.path))))fail('PROJECT_TASK_CREATE_COLLISION','任务目标目录已存在，不能覆盖上下文包。',{target:dirname(c.path)});
    if((bytes?hash(bytes):'missing')!==c.ifMatch)fail('PROJECT_GOVERNANCE_CONFLICT','原件已改变：'+c.path,{target:c.path});
    let after;
    if(c.contentBase64!==undefined){
      if(!owner||c.metadata!==undefined||c.body!==undefined||typeof c.contentBase64!=='string')fail('PROJECT_GOVERNANCE_INPUT','原始内容仅用于编号上下文和灵感闪现。');
      after=Buffer.from(c.contentBase64,'base64');if(after.toString('base64')!==c.contentBase64)fail('PROJECT_GOVERNANCE_INPUT','不是规范base64。');
    }else {
      if(owner&&c.metadata!==undefined)fail('PROJECT_GOVERNANCE_INPUT','编号上下文和灵感闪现使用原始内容或正文。');
      const typed=!!kind;
      const old=typed&&bytes?document(root,c.path,bytes).metadata:null;
      if(c.metadata?.task_counters!==undefined&&digest(old?.task_counters??{})!==digest(c.metadata.task_counters)&&!allowTaskCounters)fail('PROJECT_TASK_COUNTERS','任务编号计数由公共创建或改号程序维护。');
      if(old?.id&&c.metadata?.id!==undefined&&c.metadata.id!==old.id)fail('PROJECT_GOVERNANCE_ID','对象稳定ID不可修改。');
      if(old?.kind==='project'&&c.metadata?.task_numbering_history!==undefined&&digest(old.task_numbering_history??[])!==digest(c.metadata.task_numbering_history))fail('PROJECT_NUMBERING_HISTORY','改号历史只能由显式改号事务维护。');
      if(old?.kind==='project'&&c.metadata?.archive_history!==undefined&&digest(old.archive_history??[])!==digest(c.metadata.archive_history)&&!allowArchived)fail('PROJECT_TRANSITION_HISTORY','归档历史只能由显式过渡操作维护。');
      const extra={};if(typed&&old&&unified({...old,...c.metadata})&&c.metadata?.status==='paused'&&old.status!=='paused')extra.resume_status=old.status;
      const stamped=typed?{...c,metadata:{...c.metadata,...extra,updated:new Date().toISOString()}}:c;
      after=encodeDocument(bytes,stamped);
    }
    if(after.length>2*1024*1024)fail('PROJECT_GOVERNANCE_SIZE','单个原件不得超过2MB。');
    overlay.set(c.path,after);
    if(!bytes?.equals(after))files.push({path:c.path,before:bytes?.toString('base64')??null,after:after.toString('base64'),beforeHash:bytes?hash(bytes):'missing',afterHash:hash(after)});
  }
  const after=readGovernance(root,name,scope,{overlay,changedPaths:new Set(changes.map(c=>c.path))});
  if(after.format!=='documents')fail('PROJECT_GOVERNANCE_SCHEMA','apply需要新格式项目根卡。');
  if(before.project?.metadata.governance_schema===1&&after.project?.metadata.governance_schema===1&&!allowArchived)fail('PROJECT_GOVERNANCE_UPGRADE_REQUIRED','此项目保留旧格式只读，请先预演governance migrate升级状态。');
  for(const c of changes)if(documentKind(c.path)&&!after.graph.docs.has(c.path))fail('PROJECT_GOVERNANCE_ORPHAN','正式原件必须接入双向索引：'+c.path);
  const visible=new Set(after.documents.map(d=>d.path));
  for(const [path,owner] of owners){
    if(visible.has(owner)||newNotes.has(path)&&after.graph.docs.has(owner))continue;
    fail('PROJECT_GOVERNANCE_ORPHAN','材料缺少当前项目可达的正式归属。',{target:path,owner});
  }
  for(const c of changes)if(after.graph.docs.has(c.path)){
    const other=checkGraph(root,after.graph,{start:c.path,changedPaths:new Set(changes.map(x=>x.path))});
    for(const e of other.errors)if(!after.errors.some(x=>digest(x)===digest(e)))after.errors.push(e);
  }
  after.valid=after.errors.length===0;
  if(!after.valid)fail('PROJECT_GOVERNANCE_INVALID','治理原件未通过校验。',{issues:after.errors});
  for(const c of changes){const d=after.graph.docs.get(c.path);if(!d)continue;const old=before.graph.docs.get(c.path)?.metadata,m=d.metadata;
    const problem=transitionProblem(old,m);if(problem)fail('PROJECT_GOVERNANCE_TRANSITION',problem,{target:d.path});
    if(m.kind!=='task')continue;
    const previous=old?.status,starting=unified(m)?activeStates(m).includes(m.status)&&(!old||initialStates(old).includes(previous)||previous==='paused'||previous==='cancelled'||previous==='completed'&&m.status!==previous):m.status==='in_progress'&&previous!=='in_progress';
    const p=projection(after.graph,m.project.path,checkGraph(root,after.graph,{start:m.project.path}),{startingTaskId:starting?m.id:null}),ready=p.readiness.find(x=>x.id===m.id);
    if((!unified(m)&&m.status==='ready'&&previous!=='ready'||starting)&&ready&&!ready.ready)fail('PROJECT_GOVERNANCE_NOT_READY','任务不具备启动条件：'+ready.reasons.join('；'),{target:d.path});
    if(activeStates(m).includes(m.status)&&!activeStates(m).includes(previous)&&p.overCapacity)fail('PROJECT_GOVERNANCE_NOT_READY','在制容量已满，请先收口或调整承诺。');
  }
  return {before,after,files,changes};
}
function journal(root,id){for(const path of ['.agents','.agents/runtime-data','.agents/runtime-data/projects','.agents/runtime-data/projects/governance','.agents/runtime-data/projects/governance/operations']){if(!stat(join(root,path)))break;directory(join(root,path));}return join(operations(root),id+'.json');}
function committedRecord(root,data){
  const path=journal(root,data.operationId);if(!stat(path))return null;
  const r=readJSON(path);
  if(r.requestDigest!==digest(data))fail('PROJECT_GOVERNANCE_OPERATION_CONFLICT','同一操作ID对应不同请求。');
  if(r.phase!=='completed')fail('PROJECT_GOVERNANCE_PENDING','操作未完成或已回退，请先核对恢复记录。',{operationId:r.operationId});
  for(const f of r.files)if(hash(snapshot(root,f.path).bytes)!==f.afterHash)fail('PROJECT_GOVERNANCE_OPERATION_CONFLICT','操作后原件又发生变化。',{target:f.path});
  return r;
}
export function applyGovernance(root,name,scope,data,{dryRun=false,hooks={}}={}){
  if(!object(data)||!operationId(data.operationId))fail('PROJECT_GOVERNANCE_INPUT','需要唯一操作ID。');
  assertNoPending(root);
  const replay=committedRecord(root,data);if(replay)return {...publicState(readGovernance(root,name,scope)),changed:false,replayed:true,operationId:data.operationId,dryRun};
  if(dryRun){const p=prepareChanges(root,name,scope,data);return {...publicState(p.after),changed:false,wouldChange:!!p.files.length,dryRun:true,changes:p.files.map(f=>({path:f.path,created:f.before===null}))};}
  return withProjectLock(root,()=>applyGovernanceUnderLock(root,name,scope,data,{hooks}));
}
// Internal transaction entry: allocation and publication must share the same root lock.
export function applyGovernanceUnderLock(root,name,scope,data,{hooks={},allowTaskCounters=false,taskCreation=null}={}){
  const lock=join(root,'.agents/runtime-data/projects/write.lock');
  if(!stat(lock)||readJSON(lock).pid!==process.pid)fail('PROJECT_LOCKED','任务创建必须在项目写锁内提交。');

    const again=committedRecord(root,data);if(again)return {...publicState(readGovernance(root,name,scope)),changed:false,replayed:true,operationId:data.operationId};
    const p=prepareChanges(root,name,scope,data,{allowTaskCounters});
    if(!p.files.length)return {...publicState(p.before),changed:false,operationId:data.operationId};
    ensureInternal(root);
    const createdDirectories=new Set();for(const f of p.files){let path=dirname(f.path);while(path!=='.'&&!stat(join(root,path))){createdDirectories.add(path);path=dirname(path);}}
    const r={schemaVersion:1,kind:'governance',operationId:data.operationId,name,scope,phase:'prepared',requestDigest:digest(data),files:p.files,createdDirectories:[...createdDirectories].sort((a,b)=>b.length-a.length),at:new Date().toISOString(),...(taskCreation?{taskCreation}:{})};
    saveJSON(journal(root,r.operationId),r);saveJSON(pendingPath(root),{operationId:r.operationId,kind:'governance'});
    try{
      hooks.fault?.('prepared',r);
      // Root cards are published last, so format activation follows all supporting documents.
      const ordered=[...r.files].sort((a,b)=>Number(documentKind(a.path)==='project')-Number(documentKind(b.path)==='project'));
      for(const f of ordered){
        const target=safePath(root,f.path,{missing:true}),parts=dirname(f.path).split('/');let current=root;
        for(const part of parts){current=join(current,part);directory(current,{create:true});}
        const latest=snapshot(root,f.path,{optional:true});if((latest?hash(latest.bytes):'missing')!==f.beforeHash)fail('PROJECT_GOVERNANCE_CONFLICT','发布前原件变化。',{target:f.path});
        if(latest)publishFile(latest,Buffer.from(f.after,'base64'));
        else withTemporaryFile(join(dirname(target),'.ksf-project-governance-'+randomUUID()+'.tmp'),Buffer.from(f.after,'base64'),{},temporary=>{safePath(root,f.path,{missing:true});try{linkSync(temporary,target);}catch(e){if(e.code==='EEXIST')fail('PROJECT_GOVERNANCE_CONFLICT','目标已被创建。',{target:f.path});throw e;}unlinkSync(temporary);});
        hooks.fault?.('file-written',f);
      }
      for(const f of r.files)if(hash(snapshot(root,f.path).bytes)!==f.afterHash)fail('PROJECT_GOVERNANCE_CONFLICT','提交核对发现后续修改。',{target:f.path});
      const published=readGovernance(root,name,scope,{allowPending:true,changedPaths:new Set(r.files.map(f=>f.path))});
      if(!published.valid)fail('PROJECT_GOVERNANCE_CONFLICT','提交后原件或验收依据发生变化，先按操作ID恢复。',{issues:published.errors});
      r.phase='completed';saveJSON(journal(root,r.operationId),r);hooks.fault?.('completed',r);unlinkSync(pendingPath(root));
      return {...publicState(readGovernance(root,name,scope)),changed:true,operationId:r.operationId,recoveryId:r.operationId};
    }catch(e){if(!e.code)e.code='PROJECT_GOVERNANCE_WRITE_FAILED';e.details={...e.details,operationId:r.operationId,recoveryId:r.operationId};throw e;}

}

export function recoverGovernance(root,id,{dryRun=false}={}){
  if(!operationId(id))fail('PROJECT_GOVERNANCE_INPUT','需要操作ID。');
  const run=()=>{
    const r=readJSON(journal(root,id));if(r.kind!=='governance'||r.schemaVersion!==1||r.operationId!==id||!Array.isArray(r.files)||r.files.length>maxGovernanceFiles||!Array.isArray(r.createdDirectories))fail('PROJECT_GOVERNANCE_RECOVERY','恢复记录无效。');
    if(r.phase==='rolled-back')return {operationId:id,changed:false,replayed:true,dryRun};
    const pending=stat(pendingPath(root))?readJSON(pendingPath(root)):null;
    if(pending&&(pending.kind!=='governance'||pending.operationId!==id))fail('PROJECT_GOVERNANCE_PENDING','另一项项目过渡尚未完成。');
    const changedPaths=new Set(r.files.map(f=>f.path));
    const hasTask=path=>changedPaths.has(path)||!!stat(safePath(root,path,{missing:true}));
    for(const f of r.files){
      if(!(documentKind(f.path)||resourceOwner(f.path,hasTask))||hash(Buffer.from(f.after,'base64'))!==f.afterHash||(f.before!==null&&hash(Buffer.from(f.before,'base64'))!==f.beforeHash))fail('PROJECT_GOVERNANCE_RECOVERY','恢复内容摘要不一致。');
      const current=snapshot(root,f.path,{optional:true}),h=current?hash(current.bytes):'missing';
      if(![f.beforeHash,f.afterHash].includes(h))fail('PROJECT_GOVERNANCE_CONFLICT','存在后续修改，保留现场：'+f.path,{target:f.path});
    }
    const allowedDirectories=new Set();for(const f of r.files.filter(f=>f.before===null)){let p=dirname(f.path);while(p!=='.'){allowedDirectories.add(p);p=dirname(p);}}
    for(const p of r.createdDirectories){if(!allowedDirectories.has(p))fail('PROJECT_GOVERNANCE_RECOVERY','恢复目录不属于本次新建资源。');safePath(root,p+'/__directory_guard__',{missing:true});}
    if(dryRun)return {operationId:id,changed:false,wouldChange:true,files:r.files.map(f=>f.path),dryRun:true};
    for(const f of [...r.files].reverse()){
      const current=snapshot(root,f.path,{optional:true});if((current?hash(current.bytes):'missing')===f.beforeHash)continue;
      if(f.before===null)unlinkSync(safePath(root,f.path));else publishFile(current,Buffer.from(f.before,'base64'));
    }
    for(const p of r.createdDirectories){if(!allowedDirectories.has(p))fail('PROJECT_GOVERNANCE_RECOVERY','恢复目录不属于本次新建资源。');safePath(root,p+'/__directory_guard__',{missing:true});try{rmdirSync(join(root,p));}catch(e){if(!['ENOTEMPTY','ENOENT'].includes(e.code))throw e;}}
    r.phase='rolled-back';saveJSON(journal(root,id),r);if(pending)unlinkSync(pendingPath(root));return {operationId:id,changed:true,dryRun:false};
  };
  return dryRun?run():withProjectLock(root,run,{allowPending:true,recoverStale:true});
}
