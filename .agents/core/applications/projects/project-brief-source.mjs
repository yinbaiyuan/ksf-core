import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {filePolicy} from '../sdk/server/workspace.js';
import {projectCardHierarchy} from './hierarchy-model.js';
import {projectPlanView} from './project-plan-model.js';

export const BRIEF_INPUT_BYTES=96*1024;
const MAX_DOCUMENTS=40,MAX_CONTEXT_FILES=3,MAX_CONTEXT_BYTES=8192;
const fields=new Set(['kind','id','name','status','owner','next_action','status_reason','resume_status','blocker','resume_condition','level','mode','phase','parent_project','child_projects','milestones','focus_milestones','wip_limit','goals','criteria','risks','decisions','project','milestone','goal_ids','tasks','focus_tasks','depends_on','work_type','task_code','task_stages','commitment','priority','context_refs','result_refs','verification','review_ref','subject','outcome','basis_digest','criterion_results','guidance']);
const inside=(path,root)=>path===root||path.startsWith(root+'/');
const canonical=value=>JSON.stringify(stable(value));
function stable(value){return Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;}
export const briefDigest=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
export function briefProblem(code,message){return Object.assign(new Error(message),{code});}
function check(value,message){if(!value)throw briefProblem('PROJECT_BRIEF_SOURCE_INVALID',message);}
function clipped(text,limit){const bytes=Buffer.from(text);return bytes.length<=limit?text:bytes.subarray(0,limit).toString('utf8').replace(/\uFFFD$/,'');}
function excerpt(text,limit){
  const bytes=Buffer.from(text);if(bytes.length<=limit)return text;
  const marker='\n\n[中间内容省略；保留开头和最新尾段]\n\n',head=Math.min(1024,Math.floor(limit/4));
  const tail=limit-head-Buffer.byteLength(marker);
  return clipped(text,head)+marker+bytes.subarray(bytes.length-tail).toString('utf8').replace(/^\uFFFD+/,'');
}
function bounded(value,depth=0){
  if(typeof value==='string')return clipped(value,2048);
  if(value===null||typeof value==='number'||typeof value==='boolean')return value;
  if(depth>=6)return '[嵌套内容未纳入本次简报]';
  if(Array.isArray(value))return value.slice(0,24).map(item=>bounded(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,40).map(([key,item])=>[key,bounded(item,depth+1)]));
  return null;
}
const safeSource=path=>typeof path==='string'&&path.length<=4096&&!path.split('/').some(part=>!part||part.startsWith('.')||['node_modules','dist','build','target'].includes(part))&&filePolicy(path)!=='blocked';

/** All data comes from the selected project's checked originals; no recursive or external file reads. */
export async function projectBriefSource({target,record,readContext}){
  const expected=(target.scope==='archived'?'档案/项目/':'项目/')+target.name+'/project.md';
  check(record?.valid===true&&record.format==='documents'&&record.project?.path===expected&&record.project.metadata.kind==='project','请先核对当前项目的治理原件；无法从缺失或损坏的原件生成简报。');
  check(safeSource(expected),'当前项目路径不属于简报读取范围。');
  const root=posix.dirname(expected),hierarchy=projectCardHierarchy(record),project=record.project;
  const owned=[project,...hierarchy.branches.flatMap(({milestone,tasks})=>[milestone,...tasks])];
  const ownerByPath=new Map(owned.map(doc=>[doc.path,doc]));
  const reviews=(record.documents??[]).filter(doc=>{
    const subject=ownerByPath.get(doc.metadata.subject?.path);
    return doc.metadata.kind==='review'&&subject&&subject.metadata.id===doc.metadata.subject.id&&subject.metadata.review_ref?.id===doc.metadata.id&&subject.metadata.review_ref.path===doc.path;
  });
  const all=[...owned,...reviews];
  for(const doc of all)check(inside(doc.path,root)&&safeSource(doc.path)&&/^[a-f0-9]{64}$/.test(doc.etag??''),'项目原件的路径或版本无法核验。');
  const focus=new Set([...(project.metadata.focus_milestones??[]),...hierarchy.branches.flatMap(({milestone})=>milestone.metadata.focus_tasks??[])].map(ref=>ref.path));
  const rank=doc=>doc===project?0:doc.metadata.kind==='milestone'?1:['active','review'].includes(doc.metadata.status)?2:focus.has(doc.path)?3:doc.metadata.kind==='review'?4:doc.metadata.status==='planned'?5:6;
  const ordered=[...all].sort((a,b)=>rank(a)-rank(b)||a.path.localeCompare(b.path));
  const stats=projectPlanView(record).stats;
  const issues=[],documents=[],sources=[];
  let used=Buffer.byteLength(canonical(stats));
  for(const doc of ordered){
    const metadata=Object.fromEntries(Object.entries(doc.metadata).filter(([key])=>fields.has(key)).map(([key,value])=>[key,bounded(value)]));
    const body=excerpt(doc.body??'',doc===project?12288:doc.metadata.kind==='task'?2048:4096);
    const candidate={path:doc.path,metadata,body};
    const size=Buffer.byteLength(canonical(candidate));
    const included=documents.length<MAX_DOCUMENTS&&used+size<BRIEF_INPUT_BYTES-16384;
    const truncated=body!==(doc.body??'')||canonical(metadata)!==canonical(Object.fromEntries(Object.entries(doc.metadata).filter(([key])=>fields.has(key))));
    if(included){documents.push(candidate);used+=size;sources.push({path:doc.path,etag:doc.etag,kind:doc.metadata.kind,included:true,truncated});}
  }
  const omitted=all.length-documents.length;
  if(omitted)issues.push(`本次仅纳入 ${documents.length} 份治理主文，另 ${omitted} 份未展开；统计仍按正式项目索引计算。`);
  if(sources.some(source=>source.truncated))issues.push('较长的治理正文或元数据已按输入上限节选。');
  const versions=all.map(doc=>[doc.path,doc.etag]).sort((a,b)=>a[0].localeCompare(b[0]));
  const candidates=(record.contextEntries??[]).filter(entry=>entry.owner?.id===project.metadata.id&&entry.owner.path===project.path&&entry.kind==='file'&&posix.dirname(entry.path)===root&&safeSource(entry.path)&&/^P\d{2,}-.+\.(?:md|markdown|txt|json|ya?ml)$/i.test(posix.basename(entry.path))).sort((a,b)=>a.path.localeCompare(b.path,'zh-CN',{numeric:true}));
  const contexts=[];
  for(const entry of candidates.slice(0,MAX_CONTEXT_FILES)){
    try{
      const text=await readContext(entry.path);
      check(typeof text==='string','上下文原文不是文本。');
      const etag=briefDigest(text),includedText=excerpt(text,MAX_CONTEXT_BYTES);
      versions.push([entry.path,etag]);
      const included=used+Buffer.byteLength(includedText)<BRIEF_INPUT_BYTES-8192;
      if(included){contexts.push({path:entry.path,text:includedText});used+=Buffer.byteLength(includedText);}
      sources.push({path:entry.path,etag,kind:'context',included,truncated:includedText!==text});
      if(includedText!==text)issues.push(`上下文已节选：${entry.path}`);
    }catch(error){versions.push([entry.path,'unreadable']);issues.push(`未读取上下文：${entry.path}（${error.code??'读取失败'}）`);}
  }
  if(candidates.length>MAX_CONTEXT_FILES)issues.push(`项目级编号上下文仅选取前 ${MAX_CONTEXT_FILES} 份文本文件，未递归读取目录。`);
  const scope={project:{id:project.metadata.id,path:project.path,name:project.metadata.name,scope:target.scope},description:'当前项目的治理主文、程序统计及最多三份项目级编号文本上下文；未读取原始聊天、全部文件、工程目录或外部原件。',partial:!!omitted||sources.some(source=>source.truncated)||issues.length>0,counts:{governanceDocuments:all.length,includedGovernanceDocuments:documents.length,contextFiles:contexts.length,availableContextFiles:candidates.length}};
  // Timestamps of reading/generation are intentionally absent from this fingerprint.
  const sourceDigest=briefDigest({project:scope.project,versions,contextCandidates:candidates.map(entry=>entry.path),stats});
  const input={project:scope.project,statistics:stats,documents,contexts,scope,issues};
  check(Buffer.byteLength(canonical(input))<=BRIEF_INPUT_BYTES,'项目材料超过本次简报输入上限，请缩小材料后重试。');
  return {sourceDigest,sourceVersion:sourceDigest,scope,sources,issues,input};
}
