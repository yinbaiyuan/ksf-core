import {readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {withProjectLock,assertNoPending,stat} from '../storage.js';
import {readGovernance,publicState,applyGovernanceUnderLock,prepareChanges,governanceJournal as journal} from './store.js';
import {defaultMetadata,digest,hash,fail,object,safePath} from './model.js';
import {nextTaskCode,codeOf,compareCodes} from './task-codes.js';
import {contextCode,taskDirectory} from './layout.js';

const validId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(x);
const fields=['operationId','ifMatch','milestone','stage','name','owner','next_action','criteria','goal_ids','depends_on','priority','commitment','work_type','body'];
function validate(data){
 if(!object(data)||Object.keys(data).some(k=>!fields.includes(k))||!validId(data.operationId)||!object(data.milestone)||Object.keys(data.milestone).some(k=>!['id','path'].includes(k))||typeof data.milestone.id!=='string'||typeof data.milestone.path!=='string'||typeof data.name!=='string'||!data.name.trim()||data.name!==data.name.trim()||/[<>:"/\\|?*\x00-\x1f\x7f]/.test(data.name)||/[. ]$/.test(data.name)||Buffer.byteLength(data.name)>200)fail('PROJECT_TASK_CREATE_INPUT','创建任务需要operationId、明确里程碑{id,path}及有效名称（UTF-8最长200字节）。编号、ID和路径由程序生成。');
 if(typeof data.stage!=='string'||!/^[A-Z]$/.test(data.stage))fail('PROJECT_TASK_CREATE_INPUT','阶段使用一个大写字母。');
 if(data.ifMatch!==undefined&&typeof data.ifMatch!=='string'||data.body!==undefined&&typeof data.body!=='string')fail('PROJECT_TASK_CREATE_INPUT','ifMatch和正文应为文本。');
}
// Counters survive cancellation, task detachment and later explicit renumbering.
export function usedTaskCounters(root,state,milestone){
 const counters={...(milestone.metadata.task_counters??{})},reserve=code=>{const m=/^([A-Z])(\d+)$/.exec(code??'');if(m){const n=Number(m[2]);if(!Number.isSafeInteger(n)||n>999999999)fail('PROJECT_TASK_NUMBER_EXHAUSTED','已有编号超出可分配范围。');counters[m[1]]=Math.max(counters[m[1]]??0,n);}};
 for(const ref of milestone.metadata.tasks??[]){const d=state.graph.docs.get(ref.path);if(d)reserve(codeOf(d));}
 const folder=dirname(milestone.path);safePath(root,folder);
 for(const entry of readdirSync(join(root,folder),{withFileTypes:true})){
   if(!entry.isDirectory()||!taskDirectory.test(entry.name))continue;
   if(!contextCode('milestone',entry.name)||stat(join(root,folder,entry.name,'task.md'))?.isFile())reserve(entry.name.split('-')[0]);
 }
 for(const e of state.project.metadata.task_numbering_history??[])for(const move of e.moves??[])for(const path of [move.from,move.to])if(typeof path==='string'&&dirname(path)===folder)reserve(path.split('/').at(-1).split('-')[0]);
 return counters;
}
function prepare(root,name,scope,data){
 if(scope!=='current')fail('PROJECT_GOVERNANCE_ARCHIVED','归档项目只读，先恢复再建任务。');
 const state=readGovernance(root,name,scope);if(state.format==='missing')fail('PROJECT_NOT_FOUND','项目入口不存在，请核对项目名称。');if(state.format!=='documents'||state.project?.metadata.governance_schema!==2)fail('PROJECT_GOVERNANCE_UPGRADE_REQUIRED','自动建档仅支持新版schema2字母阶段项目，请先完成手动迁移。');
 if(!state.valid)fail('PROJECT_GOVERNANCE_INVALID','先修复项目原件再创建任务。',{issues:state.errors});
 const milestone=state.graph.docs.get(data.milestone.path),project=state.project;
 if(!milestone||milestone.metadata.id!==data.milestone.id||milestone.metadata.kind!=='milestone'||milestone.metadata.project?.id!==project.metadata.id)fail('PROJECT_TASK_CREATE_INPUT','里程碑ID、路径或所属项目不一致。');
 if(['completed','cancelled'].includes(milestone.metadata.status))fail('PROJECT_TASK_CREATE_CLOSED','先按正常流程重新开启里程碑，再增加任务。');
 const ancestors=[],seen=new Set();let p=project;while(p&&!seen.has(p.path)){seen.add(p.path);if(p.scope==='archived'||['completed','cancelled'].includes(p.metadata.status))fail('PROJECT_TASK_CREATE_CLOSED','所属项目或祖先已结束/归档，不能创建新工作。');ancestors.push({id:p.metadata.id,path:p.path,status:p.metadata.status,blocker:p.metadata.blocker});p=state.graph.docs.get(p.metadata.parent_project?.path);}
 const stage=data.stage;
 if(!milestone.metadata.task_stages?.some(s=>s.code===stage))fail('PROJECT_TASK_CREATE_STAGE','先由基本功确定已定义的字母阶段；此入口不兼容未迁移的旧任务结构。');
 const {tasks,focus_tasks,task_counters,updated,...definition}=milestone.metadata;
 // Append-only creation can merge another creation, but never a changed stage definition.
 const basis=digest({definition,body:milestone.body,ancestors,goals:project.metadata.goals});
 if(data.ifMatch!==undefined&&data.ifMatch!==basis)fail('PROJECT_GOVERNANCE_CONFLICT','任务阶段或项目条件已变化，请重新预览。');
 const counters=usedTaskCounters(root,state,milestone);if((counters[stage]??0)>=999999999)fail('PROJECT_TASK_NUMBER_EXHAUSTED','本阶段任务号已用尽。');const task_code=nextTaskCode(stage,[],{minimum:counters[stage]??0}),id='task_'+hash(project.metadata.id+'\n'+milestone.metadata.id+'\n'+data.operationId).slice(0,32),path=dirname(milestone.path)+'/'+task_code+'-'+data.name+'/task.md';
 if(state.graph.byId.has(id))fail('PROJECT_GOVERNANCE_DUPLICATE_ID','创建操作对应的稳定ID已存在，请对账。');
 safePath(root,path,{missing:true});if(stat(join(root,dirname(path))))fail('PROJECT_TASK_CREATE_COLLISION','任务目标目录已存在，不能覆盖。');
 const metadata={...defaultMetadata('task',id,data.name),project:{id:project.metadata.id,path:project.path},milestone:{id:milestone.metadata.id,path:milestone.path},task_code};
 for(const key of ['owner','next_action','criteria','goal_ids','depends_on','priority','commitment','work_type'])if(Object.hasOwn(data,key))metadata[key]=data[key];
 const nextCounters={...counters,[stage]:Number(task_code.slice(1))},task={id,path,code:task_code,stage,numberingMode:'staged'},body=data.body??'# '+data.name+'\n\n';
 const refs=[...milestone.metadata.tasks,{id,path}].sort((a,b)=>compareCodes(a.id===id?task_code:codeOf(state.graph.byId.get(a.id)),b.id===id?task_code:codeOf(state.graph.byId.get(b.id))));
 const changes=[{path,ifMatch:'missing',metadata,body},{path:milestone.path,ifMatch:milestone.etag,metadata:{tasks:refs,task_counters:nextCounters}}],write={operationId:data.operationId,ifMatch:state.etag,changes};
 const prepared=prepareChanges(root,name,scope,write,{allowTaskCounters:true});
 return {state,milestone,basis,task,write,prepared};
}
function replay(root,name,scope,data){
 const path=journal.path(root,data.operationId);if(!stat(path))return null;const record=journal.read(path),c=record.taskCreation;
 if(!c||record.name!==name||record.scope!==scope||c.requestDigest!==digest(data))fail('PROJECT_GOVERNANCE_OPERATION_CONFLICT','同一操作ID不能对应其他建档请求。');
 if(record.phase!=='completed')fail('PROJECT_GOVERNANCE_PENDING','原创建未完成或已回退，请先按原操作ID恢复并对账。',{recoveryId:record.operationId});
 const state=readGovernance(root,name,scope),task=state.graph.byId.get(c.task.id);
 if(!task||task.metadata.project?.id!==c.projectId||task.metadata.milestone?.id!==c.milestoneId)fail('PROJECT_TASK_CREATE_REPLAY','原任务已经移动、移除或变更归属，请按稳定ID核对；不重复创建。',{taskId:c.task.id});
 return {...publicState(state),operationId:data.operationId,task:{...c.task,path:task.path,code:codeOf(task)},changed:false,replayed:true};
}
export function createGovernanceTask(root,name,scope,data,{dryRun=false,hooks={}}={}){
 validate(data);
 if(dryRun){assertNoPending(root);const existing=replay(root,name,scope,data);if(existing)return {...existing,dryRun};const p=prepare(root,name,scope,data);return {...publicState(p.prepared.after),task:p.task,operationId:data.operationId,ifMatch:p.basis,dryRun:true,changed:false,wouldChange:true,numberReserved:false};}
 if(typeof data.ifMatch!=='string')fail('PROJECT_TASK_CREATE_PREVIEW_REQUIRED','先dry-run预览，再带返回的ifMatch提交；预览编号不占号。');
 // Bounded cross-process contention retry; every retry re-reads under the root lock.
 const deadline=Date.now()+5000;while(true){try{return withProjectLock(root,()=>{
  assertNoPending(root);const existing=replay(root,name,scope,data);if(existing)return existing;
  const p=prepare(root,name,scope,data);hooks.beforeCheck?.();
  if(stat(join(root,dirname(p.task.path)))||nextTaskCode(p.task.stage,[],{minimum:usedTaskCounters(root,p.state,p.milestone)[p.task.stage]??0})!==p.task.code)fail('PROJECT_GOVERNANCE_CONFLICT','取号后任务目录发生变化，请重新预览，保留现场。');
  const result=applyGovernanceUnderLock(root,name,scope,p.write,{hooks,allowTaskCounters:true,taskCreation:{requestDigest:digest(data),projectId:p.state.project.metadata.id,milestoneId:p.milestone.metadata.id,task:p.task}});
  return {...result,task:p.task};
 },{allowPending:true});}catch(e){if(e.code!=='PROJECT_LOCKED'||Date.now()>=deadline)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}}
}
