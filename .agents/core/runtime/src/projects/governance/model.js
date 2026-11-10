import {createHash} from 'node:crypto';
import {resolve,join,isAbsolute,relative} from 'node:path';
import {lstatSync} from 'node:fs';
import {readSnapshot} from '../../metadata/files.js';
import {parseFrontmatter,createFrontmatter,encodeFrontmatter,setField} from '../../metadata/frontmatter.js';
import {MetadataError} from '../../metadata/errors.js';
import {platform} from '../../platform/index.js';
import {historicalProjectBytes,locateProjectResource} from './locations.js';
import {taskCode,stageIssues} from './task-codes.js';

import {SCHEMA,STATES,statesFor,unified} from './states.js';
export {SCHEMA,STATES} from './states.js';
export const terminal=s=>['completed','cancelled'].includes(s);
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
export const digest=x=>hash(JSON.stringify(stable(x)));
export const criteriaDigest=m=>digest(m.criteria??[]);
export const fail=(code,message,details={})=>{throw new MetadataError(code,message,details);};
export const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const timestamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT/.test(x)&&Number.isFinite(Date.parse(x));
export const identifier=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x);
export function safePath(root,path,{missing=false,resource=false}={}){
  if(typeof path!=='string'||path.length>4096||isAbsolute(path)||/[\\\x00-\x1f\x7f]/.test(path)||path.split('/').some(p=>!p||!platform.validSegment(p)||['.','..','.git','node_modules'].includes(p))||(!resource&&!(path.startsWith('项目/')||path.startsWith('档案/项目/')))||(resource&&path.startsWith('.')&&!path.startsWith('.agents/core/')))fail('PROJECT_GOVERNANCE_PATH','项目治理路径无效。',{target:path});
  let at=resolve(root),abs=resolve(root,path);
  if(relative(at,abs).startsWith('..')||isAbsolute(relative(at,abs)))fail('PROJECT_GOVERNANCE_PATH','路径越界。',{target:path});
  for(const part of path.split('/')){at=join(at,part);try{if(lstatSync(at).isSymbolicLink())fail('PROJECT_GOVERNANCE_PATH','不允许符号链接。',{target:path});}catch(e){if(e.code==='ENOENT'&&missing)continue;throw e;}}
  return abs;
}
export function snapshot(root,path,{optional=false,resource=false}={}){
  const abs=safePath(root,path,{missing:optional,resource});
  try{const value=readSnapshot(abs);if(value.bytes.length>2*1024*1024)fail('PROJECT_GOVERNANCE_SIZE','单个原件不得超过2MB。',{target:path});return value;}
  catch(e){if(optional&&e.code==='FILE_NOT_FOUND')return null;throw e;}
}
export function document(root,path,bytes){
  const parsed=parseFrontmatter(bytes,path);
  return {path,metadata:parsed.values,body:parsed.body.toString('utf8'),etag:hash(bytes)};
}
export function encodeDocument(before,change){
  let parsed=parseFrontmatter(before??Buffer.alloc(0),change.path);
  const prefix=parsed.bytes.subarray(0,parsed.bytes.length-parsed.body.length);
  if(change.metadata!==undefined){if(!object(change.metadata))fail('PROJECT_GOVERNANCE_INPUT','metadata应为字段集合。');if(parsed.state==='absent')parsed=createFrontmatter(parsed);for(const [k,v]of Object.entries(change.metadata))setField(parsed.doc,k,v);}
  if(change.body!==undefined){if(typeof change.body!=='string')fail('PROJECT_GOVERNANCE_INPUT','body应为文本。');parsed={...parsed,body:Buffer.from(change.body)};}
  const out=change.metadata!==undefined?encodeFrontmatter(parsed):Buffer.concat([prefix,parsed.body]);
  const check=parseFrontmatter(out,change.path);
  for(const [k,v]of Object.entries(change.metadata??{}))if(digest(check.values[k])!==digest(v))fail('PROJECT_GOVERNANCE_SERIALIZATION','元数据序列化改变了含义。');
  if(change.body!==undefined&&check.body.toString('utf8')!==change.body)fail('PROJECT_GOVERNANCE_SERIALIZATION','正文序列化改变了内容。');
  return out;
}
export function defaultMetadata(kind,id,name,now=new Date().toISOString()){
  const common={governance_schema:SCHEMA,kind,id,name,status:kind==='review'?'draft':'planned',owner:null,updated:now,next_action:null,...(kind==='review'?{}:{status_reason:null,resume_status:null})};
  if(kind==='project')return {...common,blocker:null,resume_condition:null,level:'A',mode:'finite',phase:'definition',parent_project:null,child_projects:[],milestones:[],focus_milestones:[],wip_limit:1,goals:[],criteria:[],review_ref:null,risks:[],decisions:[],archive_history:[]};
  if(kind==='milestone')return {...common,blocker:null,resume_condition:null,project:null,goal_ids:[],task_stages:[],task_counters:{},tasks:[],focus_tasks:[],depends_on:[],criteria:[],review_ref:null};
  if(kind==='task')return {...common,work_type:'delivery',task_code:null,project:null,milestone:null,goal_ids:[],commitment:'candidate',priority:'normal',depends_on:[],criteria:[],blocker:null,resume_condition:null,context_refs:[],result_refs:[],verification:null};
  if(kind==='review')return {...common,subject:null,outcome:'pending',basis_digest:null,criterion_results:[]};
  fail('PROJECT_GOVERNANCE_INPUT','未知原件类型。');
}
export function validateMetadata(d){
  const m=d.metadata,errors=[],add=(field,message)=>errors.push({code:'PROJECT_GOVERNANCE_INVALID',path:d.path,field,message});
  if(![1,SCHEMA].includes(m.governance_schema)){add('governance_schema','不支持此治理格式；保留原件。');return errors;}
  if(!Object.hasOwn(STATES,m.kind)){add('kind','未知原件类型。');return errors;}
  if(!identifier(m.id))add('id','需要稳定ID（字母/数字开头，可含._:-，最长128字符）。');
  if(typeof m.name!=='string'||!m.name.trim())add('name','需要名称。');
  if(!statesFor(m).includes(m.status))add('status','未知状态。');
  if(m.owner!==null&&typeof m.owner!=='string')add('owner','负责人应为文本或null。');
  if(!timestamp(m.updated))add('updated','需要实际ISO更新时间。');
  if(m.next_action!==null&&(typeof m.next_action!=='string'||!m.next_action.trim()))add('next_action','下一步应为具体行动或null。');
  if(m.kind!=='review'&&(m.status==='blocked'||unified(m)&&m.blocker&&!terminal(m.status))&&(!(typeof m.blocker==='string'&&m.blocker.trim())||!(typeof m.owner==='string'&&m.owner.trim())||!m.next_action||!(typeof m.resume_condition==='string'&&m.resume_condition.trim())))add('blocker','受阻对象需要原因、解阻负责人、行动和恢复条件。');
  if(m.kind!=='review'&&m.status==='paused'&&!(typeof m.resume_condition==='string'&&m.resume_condition.trim()))add('resume_condition','暂停对象需要恢复条件。');
  if(unified(m)&&m.kind!=='review'){
    if(m.blocker!==null&&m.blocker!==undefined&&(typeof m.blocker!=='string'||!m.blocker.trim()))add('blocker','阻塞为明确文本或null。');
    if(m.status==='completed'&&m.blocker)add('blocker','完成前必须解除阻塞。');
    if(['paused','cancelled'].includes(m.status)&&!(typeof m.status_reason==='string'&&m.status_reason.trim()))add('status_reason','暂停或取消需要说明原因。');
    if(m.status==='paused'&&!['planned','active','review'].includes(m.resume_status))add('resume_status','暂停需要保存原环节。');
    if(m.kind==='task'&&!['delivery','acceptance'].includes(m.work_type))add('work_type','任务用途使用delivery或acceptance。');
    if(m.kind==='task'&&['active','review'].includes(m.status)&&(!(typeof m.owner==='string'&&m.owner.trim())||!m.next_action||!m.criteria?.length))add('status','推进或验收需要负责人、完成条件和下一步。');
  }
  const ref=(r,k,nullable=false)=>{if(nullable&&r===null)return;if(!object(r)||!identifier(r.id)||typeof r.path!=='string')add(k,'关联需要{id,path}。');};
  const refs=(a,k)=>{if(!Array.isArray(a)){add(k,'应为关联列表。');return;}const ids=new Set();for(const r of a){ref(r,k);if(ids.has(r?.id))add(k,'关联重复。');ids.add(r?.id);}};
  const criteria=()=>{if(!Array.isArray(m.criteria)){add('criteria','需要完成条件列表。');return;}const ids=new Set();for(const c of m.criteria){if(!object(c)||!identifier(c.id)||typeof c.text!=='string'||!c.text.trim()||ids.has(c.id))add('criteria','条件需要唯一id和明确text。');ids.add(c?.id);}};
  if(m.kind==='project'){
    if(m.task_numbering_history!==undefined&&(!Array.isArray(m.task_numbering_history)||m.task_numbering_history.some(e=>!object(e)||!identifier(e.operation_id)||!timestamp(e.at)||!Array.isArray(e.moves))))add('task_numbering_history','任务改号历史格式无效。');
    if(m.archive_history!==undefined&&(!Array.isArray(m.archive_history)||m.archive_history.some(e=>!object(e)||typeof e.operation_id!=='string'||!['archive','restore'].includes(e.action)||!timestamp(e.at)||typeof e.from!=='string'||typeof e.to!=='string'||typeof e.previous_status!=='string')))add('archive_history','归档历史须保留有效操作、时间、位置及原状态。');
    if(!['A','B','C','D'].includes(m.level))add('level','规模使用A/B/C/D。');
    if(!['finite','ongoing'].includes(m.mode))add('mode','项目类型使用finite/ongoing。');
    if(!['definition','planning','execution','review'].includes(m.phase))add('phase','未知管理阶段。');
    ref(m.parent_project,'parent_project',true);refs(m.child_projects,'child_projects');refs(m.milestones,'milestones');refs(m.focus_milestones,'focus_milestones');ref(m.review_ref,'review_ref',true);criteria();
    if(!Number.isSafeInteger(m.wip_limit)||m.wip_limit<1||m.wip_limit>50)add('wip_limit','在制上限为1至50。');
    if(!Array.isArray(m.goals)||m.goals.some(g=>!object(g)||!identifier(g.id)||typeof g.title!=='string'||!g.title.trim())||new Set(m.goals?.map(g=>g?.id)).size!==m.goals?.length)add('goals','目标需要唯一稳定id及title。');
    for(const k of ['risks','decisions'])if(!Array.isArray(m[k])||m[k].some(x=>!object(x)||!identifier(x.id)||typeof x.title!=='string'))add(k,'风险/决定应为带稳定id及title的列表。');
  }
  if(m.kind==='milestone'&&m.task_counters!==undefined&&(!object(m.task_counters)||Object.entries(m.task_counters).some(([k,v])=>!/^[A-Z]$/.test(k)||!Number.isSafeInteger(v)||v<0||v>999999999)))add('task_counters','编号计数应为阶段字母到已用最大号的映射。');
  if(m.kind==='milestone'&&m.task_stages!==undefined)for(const message of stageIssues(m.task_stages))add('task_stages',message);
  if(m.kind==='task'&&m.task_code!==undefined&&m.task_code!==null&&!taskCode(m.task_code))add('task_code','任务号使用A1至Z系列的正整数编号。');
  if(m.kind==='milestone'){ref(m.project,'project');refs(m.tasks,'tasks');refs(m.focus_tasks,'focus_tasks');refs(m.depends_on,'depends_on');ref(m.review_ref,'review_ref',true);criteria();}
  if(m.kind==='task'){
    ref(m.project,'project');ref(m.milestone,'milestone');refs(m.depends_on,'depends_on');criteria();
    if(!['candidate','next','now'].includes(m.commitment))add('commitment','未知承诺。');
    if(!['high','normal','low'].includes(m.priority))add('priority','未知优先级。');
    for(const k of ['context_refs','result_refs']){
      if(!Array.isArray(m[k])||m[k].some(r=>!object(r)||typeof r.path!=='string'&&typeof r.url!=='string'))add(k,'入口需要path或url。');
      else for(const r of m[k])if(r.url!==undefined){try{const u=new URL(r.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('unsafe');}catch{add(k,'网页入口仅接受无凭据HTTP(S)地址。');}}
    }
    if(m.status==='blocked'&&(!(typeof m.blocker==='string'&&m.blocker.trim())||!m.next_action||!(typeof m.resume_condition==='string'&&m.resume_condition.trim())))add('blocker','受阻任务需要原因、解阻行动和恢复条件。');
    if(m.status==='paused'&&!(typeof m.resume_condition==='string'&&m.resume_condition.trim()))add('resume_condition','暂停任务需要恢复条件。');
    if(['ready','in_progress'].includes(m.status)&&(!(typeof m.owner==='string'&&m.owner.trim())||!m.next_action))add('next_action','可开始/在制任务需要负责人及具体下一步。');
    if(['ready','in_progress'].includes(m.status)&&!m.criteria?.length)add('criteria','任务开始前需要明确完成条件。');
  }
  if(['project','milestone'].includes(m.kind)&&m.status!=='planned'&&m.status!=='cancelled'&&!m.criteria?.length)add('criteria','阶段开启前须定义完成条件。');
  if(m.kind==='review'){ref(m.subject,'subject');if(!['pending','passed','failed','cancelled'].includes(m.outcome))add('outcome','未知验收结论。');if(!Array.isArray(m.criterion_results))add('criterion_results','需要逐项结果列表。');}
  const resultList=(rows,key)=>{if(!Array.isArray(rows)||rows.some(r=>!object(r)||!identifier(r.criterion_id)||!['pending','passed','failed'].includes(r.result)||!Array.isArray(r.evidence)||typeof r.reviewer!=='string'||typeof r.reviewed_at!=='string')||new Set(rows.map(r=>r?.criterion_id)).size!==rows.length)add(key,'逐项验收结果格式或稳定身份无效。');};
  if(m.kind==='review'&&Array.isArray(m.criterion_results))resultList(m.criterion_results,'criterion_results');
  if(m.kind==='task'&&m.verification!==null){if(!object(m.verification))add('verification','验收应为对象或null。');else resultList(m.verification.results,'verification.results');}
  if(['milestone','task'].includes(m.kind)&&(!Array.isArray(m.goal_ids)||m.goal_ids.some(x=>!identifier(x))||new Set(m.goal_ids).size!==m.goal_ids.length))add('goal_ids','目标关联应为不重复ID列表。');
  if(m.legacy_dependencies!==undefined&&(!Array.isArray(m.legacy_dependencies)||m.legacy_dependencies.some(x=>!object(x)||!identifier(x.id)||typeof x.source!=='string'||!/^[a-f0-9]{64}$/.test(x.digest??''))))add('legacy_dependencies','历史前置需要id、source和digest。');
  if(m.guidance!==undefined&&(!object(m.guidance)||typeof m.guidance.method!=='string'||!m.guidance.method.trim()||typeof m.guidance.step!=='string'||!m.guidance.step.trim()||!Array.isArray(m.guidance.pending_questions)||m.guidance.pending_questions.some(q=>typeof q!=='string')))add('guidance','引导接续需要method、step、pending_questions。');
  return errors;
}

export function evidenceValid(root,e,overlay=new Map()){
  try{
    if(!object(e))return false;
    if(e.url){const u=new URL(e.url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&typeof e.version==='string'&&!!e.version.trim();}
    if(typeof e.path!=='string'||!/^[a-f0-9]{64}$/.test(e.digest??''))return false;
    safePath(root,e.path,{missing:true,resource:true});
    if(!overlay.has(e.path)&&!snapshot(root,e.path,{optional:true,resource:true}))return locateProjectResource(root,{path:e.path,digest:e.digest}).digest===e.digest;
    const bytes=overlay.get(e.path)??snapshot(root,e.path,{resource:true}).bytes;
    return hash(bytes)===e.digest||!!overlay.beforeVersions?.get(e.path+':'+e.digest)||!!historicalProjectBytes(root,e.path,e.digest,bytes);
  }catch{return false;}
}
export function verificationIssues(root,subject,verification,overlay=new Map()){
  const m=subject.metadata,issues=[];
  if(!verification||verification.basis_digest!==criteriaDigest(m))return ['验收依据与当前完成条件不一致。'];
  const results=verification.results??verification.criterion_results;
  if(!Array.isArray(results)||new Set(results.map(x=>x?.criterion_id)).size!==results.length)return ['逐项结果缺失或重复。'];
  if(!m.criteria?.length)return ['没有完成条件。'];
  for(const c of m.criteria){const r=results.find(x=>x?.criterion_id===c.id);if(!r||r.result!=='passed'||typeof r.reviewer!=='string'||!r.reviewer.trim()||!timestamp(r.reviewed_at)||!Array.isArray(r.evidence)||!r.evidence.length||!r.evidence.every(e=>evidenceValid(root,e,overlay)))issues.push('条件未通过或证据需复核：'+c.id);}
  if(results.some(r=>!m.criteria.some(c=>c.id===r?.criterion_id)))issues.push('包含未知条件结果。');
  return issues;
}
