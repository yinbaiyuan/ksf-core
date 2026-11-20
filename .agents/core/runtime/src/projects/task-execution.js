import {unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {directory,stat,withProjectLock} from './storage.js';
import {snapshot,document,digest,fail} from './governance/model.js';
import {readSnapshot,publishFile} from '../metadata/files.js';
import {writeDurably} from '../shared/files.js';
import {loadGraph,executionReasons} from './governance/graph.js';
import {locateProjectResource} from './governance/locations.js';

function task(root,path){
  let d;try{d=document(root,path,snapshot(root,path).bytes);}catch(e){if(!['FILE_NOT_FOUND','ENOENT'].includes(e.code))throw e;const location=locateProjectResource(root,{path,metadataOnly:true});path=location.path;d=document(root,path,snapshot(root,path).bytes);}
  const m=d.metadata;
  if(m.kind!=='task'||m.governance_schema!==2)fail('PROJECT_EXECUTION_UNSUPPORTED','执行占用只支持明确的新格式任务。');
  const p=document(root,m.project.path,snapshot(root,m.project.path).bytes),s=document(root,m.milestone.path,snapshot(root,m.milestone.path).bytes);
  if(p.metadata.id!==m.project.id||s.metadata.id!==m.milestone.id||s.metadata.project?.id!==p.metadata.id||s.metadata.project?.path!==p.path||!p.metadata.milestones?.some(r=>r.id===s.metadata.id&&r.path===s.path)||!s.metadata.tasks?.some(r=>r.id===m.id&&r.path===d.path))fail('PROJECT_EXECUTION_TASK','任务身份与双向归属不一致。');
  return {d,p,s};
}
function location(root,id){return join(root,'.agents/runtime-data/projects/executions',digest(id)+'.json');}
function read(root,id){for(const rel of ['.agents','.agents/runtime-data','.agents/runtime-data/projects','.agents/runtime-data/projects/executions']){const at=join(root,rel);if(!stat(at))break;directory(at);}
  const path=location(root,id),entry=stat(path);if(!entry)return null;if(entry.size>65536)fail('PROJECT_EXECUTION_RECORD','执行占用记录过大，请保留现场核对。');const s=readSnapshot(path),r=JSON.parse(s.bytes);if(r.task_id!==id||typeof r.chat_id!=='string'||typeof r.token!=='string'||!Number.isFinite(Date.parse(r.acquired_at)))fail('PROJECT_EXECUTION_RECORD','执行占用记录损坏，请保留现场核对。');return {...r,etag:digest(r)};}
function publicRecord(r,chatId){if(!r)return null;const {token,...data}=r;return {...data,owned:r.chat_id===chatId,...(r.chat_id===chatId?{token}:{})};}
export function executionStatus(root,taskRef,chatId){const {d}=task(root,taskRef),r=read(root,d.metadata.id);return {task:{id:d.metadata.id,path:d.path},claim:publicRecord(r,chatId),blocked:!!r&&r.chat_id!==chatId};}
export function taskExecution(root,{chatId,action,taskRef,token,ifMatch,reason,previousRunSettled=false}){
  if(typeof chatId!=='string'||!chatId)fail('PROJECT_EXECUTION_IDENTITY','需要当前真实聊天身份。');
  if(action==='status')return {complete:true,...executionStatus(root,taskRef,chatId)};
  if(!['acquire','check','release','takeover'].includes(action))fail('PROJECT_EXECUTION_INPUT','执行占用动作须为acquire/check/release/takeover/status。');
  return withProjectLock(root,()=>{
    const {d,p,s}=task(root,taskRef),m=d.metadata,old=read(root,m.id),path=location(root,m.id);
    if(action==='release'){
      if(!old)return {complete:true,released:false};
      if(old.chat_id!==chatId||old.token!==token)fail('PROJECT_EXECUTION_LOST','占用已变化，旧令牌不能释放新执行者。');
      unlinkSync(path);return {complete:true,released:true};
    }
    const allowed=x=>x.status==='active'||m.work_type==='acceptance'&&x.status==='review';
    if(!d.path.startsWith('项目/')||!['active','review'].includes(m.status)||m.blocker||!allowed(p.metadata)||!allowed(s.metadata)||executionReasons(loadGraph(root),m).length)fail('PROJECT_EXECUTION_NOT_READY','任务或所属层级尚未允许当前执行；占用不启动或重开任务。');
    if(action==='check'){
      if(!old||old.chat_id!==chatId||old.token!==token)fail('PROJECT_EXECUTION_LOST','执行占用已释放或转交，请停止执行并重新核对。');
      return {complete:true,...executionStatus(root,d.path,chatId)};
    }
    if(action==='acquire'&&old){if(old.chat_id!==chatId)fail('PROJECT_EXECUTION_BUSY','任务正在其他聊天执行；可只读查阅，明确接手前不得重复执行。',{owner:publicRecord(old,chatId)});return {complete:true,...executionStatus(root,d.path,chatId)};}
    if(action==='takeover'&&(!old||old.etag!==ifMatch||!previousRunSettled||typeof reason!=='string'||!reason.trim()))fail('PROJECT_EXECUTION_TAKEOVER','接手需要最新占用基线、明确原因，并先核对旧运行及未决操作已结束。');
    const record={task_id:m.id,chat_id:chatId,token:randomUUID(),acquired_at:new Date().toISOString(),...(action==='takeover'?{takeover_reason:reason}:{} )};
    for(const rel of ['.agents','.agents/runtime-data','.agents/runtime-data/projects','.agents/runtime-data/projects/executions'])directory(join(root,rel),{create:true});
    if(old)publishFile(readSnapshot(path),Buffer.from(JSON.stringify(record)));else writeDurably(path,Buffer.from(JSON.stringify(record)));
    return {complete:true,...executionStatus(root,d.path,chatId)};
  });
}
export function checkExecutionWrite(root,changes,execution,{chatId,caller}={}){
  const checked=new Set();
  for(const c of changes){
    if(!c.path.endsWith('/task.md'))continue;
    let d;try{d=document(root,c.path,snapshot(root,c.path).bytes);}catch(e){if(['FILE_NOT_FOUND','ENOENT'].includes(e.code))continue;throw e;}
    const id=d.metadata.id;if(d.metadata.kind!=='task'||typeof id!=='string')continue;const r=read(root,id);checked.add(id);
    if(caller?.source==='surface'&&caller?.humanWindow===true)continue;
    if(r&&(r.chat_id!==chatId||execution?.task_id!==id||execution?.token!==r.token))fail('PROJECT_EXECUTION_BUSY','当前任务由已登记聊天执行，写入须携带其有效占用令牌。',{target:c.path});
    if(execution?.task_id===id&&(!r||r.chat_id!==chatId||r.token!==execution.token))fail('PROJECT_EXECUTION_LOST','旧执行令牌已失效，请保留草稿并重新核对。',{target:c.path});
  }
  if(execution&&!checked.has(execution.task_id))fail('PROJECT_EXECUTION_INPUT','执行令牌未对应本次任务变更。');
}

export function executionViews(root,documents){return Object.fromEntries(documents.filter(d=>d.metadata.kind==='task'&&typeof d.metadata.id==='string').flatMap(d=>{try{const r=read(root,d.metadata.id);return r?[[d.metadata.id,publicRecord(r,null)]]:[];}catch(e){return [[d.metadata.id,{blocked:true,error:{code:e.code,message:e.message}}]];}}));}

export function releaseChatExecution(root,taskRef,chatId){let status;try{status=executionStatus(root,taskRef,chatId);}catch(e){if(e.code==='PROJECT_EXECUTION_UNSUPPORTED')return;throw e;}if(status.claim?.owned)taskExecution(root,{chatId,taskRef,action:'release',token:status.claim.token});}
export function releaseEndedExecutions(root,documents){for(const d of documents)if(d.metadata.kind==='task'&&['completed','cancelled','paused'].includes(d.metadata.status)){const r=read(root,d.metadata.id);if(r)unlinkSync(location(root,d.metadata.id));}}
