import {evidenceReferences} from './governance-model.js';
import {projectCardHierarchy,projectProgress,stageProgress} from './hierarchy-model.js';

export const PROJECT_PLAN_TABS=[['plan','方案'],['progress','推进'],['materials','资料与成果']];
export const projectReferenceKey=ref=>JSON.stringify([ref.path??ref.url,ref.digest??ref.version??'']);

export function projectStatusNeedsReason(metadata,base){
  return ['paused','cancelled'].includes(metadata.status)
    ||!!base&&['completed','cancelled'].includes(base.status)&&metadata.status!==base.status;
}

export function projectParentChange(draft){
  if(draft.value.metadata.kind!=='project'||!draft.base)return;
  const before=draft.base.metadata.parent_project??null,after=draft.value.metadata.parent_project??null;
  if(before?.id===after?.id&&before?.path===after?.path)return;
  return {child:{id:draft.value.metadata.id,path:draft.path},parent:after};
}

export function projectPlanReferences(record,project){
  const materials=[],results=[],seenMaterials=new Set(),seenResults=new Set();
  const list=value=>Array.isArray(value)?value:[];
  function add(list,seen,reference,source){
    if(!reference||typeof reference!=='object')return;
    if(!reference.path){
      try{const url=new URL(reference.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;}
      catch{return;}
    }
    const location=reference.path??reference.url,key=projectReferenceKey(reference);
    if(typeof location!=='string'||!location||seen.has(key))return;
    seen.add(key);list.push({...reference,source});
  }
  for(const entry of record.contextEntries??[])if(entry.owner?.path===project.path){
    add(materials,seenMaterials,entry,project.metadata.name);
  }
  for(const ref of list(project.metadata.context_refs))add(materials,seenMaterials,ref,project.metadata.name);
  for(const ref of list(project.metadata.result_refs))add(results,seenResults,ref,project.metadata.name);
  const owned=(record.documents??[]).filter(doc=>doc.metadata.project?.id===project.metadata.id&&doc.metadata.project?.path===project.path);
  const subjects=new Map([project,...owned].map(doc=>[doc.path,doc.metadata.id]));
  for(const doc of [...owned,...(record.documents??[]).filter(doc=>doc.metadata.kind==='review'&&subjects.get(doc.metadata.subject?.path)===doc.metadata.subject?.id&&doc.metadata.subject?.id)]){
    for(const ref of list(doc.metadata.result_refs))add(results,seenResults,ref,doc.metadata.name);
    for(const ref of evidenceReferences(doc.metadata))add(results,seenResults,ref,doc.metadata.name);
    if(doc.metadata.kind==='review')add(results,seenResults,{path:doc.path,role:'复盘记录'},doc.metadata.name);
  }
  return {materials:materials.filter(ref=>!seenResults.has(projectReferenceKey(ref))),results};
}

/** A read model: recorded arrangements and reproducible counts never infer an Agent judgement. */
export function projectPlanView(record,project=record.project){
  const {branches}=projectCardHierarchy({...record,project});
  const staleIds=new Set(record.stale??[]);
  const tasks=branches.flatMap(branch=>branch.tasks);
  const subjects=[project,...branches.flatMap(branch=>[branch.milestone,...branch.tasks])];
  const byPath=new Map(subjects.map(doc=>[doc.path,doc]));
  const matches=(ref,doc)=>ref?.id===doc?.metadata.id&&ref?.path===doc?.path;
  const localCriteriaChanged=JSON.stringify(project.metadata.criteria??[])!==JSON.stringify(record.project.metadata.criteria??[]);
  const isStale=doc=>staleIds.has(doc.metadata.id)||(doc.path===project.path&&localCriteriaChanged);
  const source=doc=>({path:doc.path,id:doc.metadata.id,name:doc.metadata.name,kind:doc.metadata.kind});
  const readiness=new Map((record.projection?.readiness??[]).map(row=>[row.path,row]));
  const attention=[];
  for(const ref of project.metadata.focus_milestones??[]){
    const doc=byPath.get(ref.path);if(matches(ref,doc)&&doc.metadata.kind==='milestone')attention.push({document:doc,kind:'milestone',stale:isStale(doc)});
  }
  for(const {milestone}of branches)for(const ref of milestone.metadata.focus_tasks??[]){
    const doc=byPath.get(ref.path);if(matches(ref,doc)&&doc.metadata.kind==='task'&&!attention.some(row=>row.document.path===doc.path))attention.push({document:doc,kind:'task',stale:isStale(doc)});
  }
  const taskRow=doc=>{
    const row=readiness.get(doc.path),known=row&&row.id===doc.metadata.id;
    return {document:doc,ready:known?!!row.ready:null,reasons:known?[...(row.reasons??[])]:['当前 Core 未提供可开始判断'],stale:isStale(doc)};
  };
  const inFlight=tasks.filter(doc=>['active','review'].includes(doc.metadata.status)).map(taskRow);
  const next=tasks.filter(doc=>doc.metadata.status==='planned'&&['next','now'].includes(doc.metadata.commitment)).map(taskRow);
  const milestones=branches.map(({milestone,tasks})=>{
    const progress=stageProgress(milestone,tasks,record.stale??[]);
    return {document:milestone,tasks,completed:progress.completed,total:progress.activeTotal,
      focus:(project.metadata.focus_milestones??[]).some(ref=>matches(ref,milestone)),stale:isStale(milestone),
      accepted:record.valid===true&&milestone.metadata.status==='completed'&&!isStale(milestone)};
  });
  const goals=new Map((project.metadata.goals??[]).map(goal=>[goal.id,{id:goal.id,title:goal.title}]));
  const resultMap=new Map();
  const validReference=ref=>{
    if(typeof ref?.path==='string'&&ref.path)return true;
    try{const url=new URL(ref?.url);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
  };
  function add(ref,doc,{role='成果引用',criterion,reviewStatus,reviewOutcome,subject=doc}={}){
    if(!validReference(ref))return;
    const key=ref.path??ref.url,origin=source(doc),stale=isStale(doc)||isStale(subject);
    let item=resultMap.get(key);
    if(!item){item={key,name:ref.name??ref.path?.split('/').at(-1)??ref.role??ref.url,reference:{...ref},versions:[],source:origin,sources:[],criteria:[],usages:[],goals:[],stale:false};resultMap.set(key,item);}
    if(!item.versions.some(version=>projectReferenceKey(version)===projectReferenceKey(ref)))item.versions.push({...ref});
    if(!item.sources.some(value=>value.id===origin.id&&value.path===origin.path))item.sources.push(origin);
    const linkedGoals=(subject.metadata.goal_ids??[]).flatMap(id=>goals.has(id)?[goals.get(id)]:[]);
    for(const goal of linkedGoals)if(!item.goals.some(value=>value.id===goal.id))item.goals.push(goal);
    const usage={reference:{...ref},source:origin,role:ref.role??role,goals:linkedGoals,stale,
      ...(criterion?{criterion}:{}),...(reviewStatus?{reviewStatus}:{}),...(reviewOutcome?{reviewOutcome}:{})};
    // Repeated references can support different conditions or carry different review outcomes.
    const signature=JSON.stringify([origin.path,projectReferenceKey(ref),usage.role,criterion?.id,criterion?.result,criterion?.reviewer,criterion?.reviewedAt,reviewStatus,reviewOutcome]);
    if(!item.usages.some(value=>value.signature===signature))item.usages.push({...usage,signature});
    if(criterion&&!item.criteria.some(value=>value.source.path===origin.path&&value.id===criterion.id&&projectReferenceKey(value.reference)===projectReferenceKey(ref)&&value.result===criterion.result))item.criteria.push({...criterion,source:origin,reference:{...ref},reviewStatus,reviewOutcome,stale});
    item.stale||=stale;
  }
  function assessments(doc,subject,rows,basis,{reviewStatus,reviewOutcome}={}){
    const conditions=new Map((subject.metadata.criteria??[]).map(condition=>[condition.id,condition.text]));
    for(const row of Array.isArray(rows)?rows:[]){
      const criterion={id:row.criterion_id,text:conditions.get(row.criterion_id)??'原条件未找到',result:row.result??'pending',reviewer:row.reviewer??'',reviewedAt:row.reviewed_at??'',
        effective:record.valid===true&&!!basis&&conditions.has(row.criterion_id)&&row.result==='passed'&&!isStale(doc)&&!isStale(subject)&&(!reviewStatus||reviewStatus==='completed'&&reviewOutcome==='passed')};
      for(const ref of Array.isArray(row.evidence)?row.evidence:[])add(ref,doc,{role:'验收证据',criterion,subject,reviewStatus,reviewOutcome});
    }
  }
  for(const doc of subjects){
    for(const ref of Array.isArray(doc.metadata.result_refs)?doc.metadata.result_refs:[])add(ref,doc);
    if(doc.metadata.kind==='task')assessments(doc,doc,doc.metadata.verification?.results,doc.metadata.verification?.basis_digest);
  }
  const reviews=[];
  for(const doc of record.documents??[]){
    if(doc.metadata.kind!=='review')continue;
    const subject=byPath.get(doc.metadata.subject?.path);if(!matches(doc.metadata.subject,subject))continue;
    const {status,outcome,basis_digest,criterion_results}=doc.metadata;
    reviews.push({document:doc,subject,outcome,status,stale:isStale(doc)||isStale(subject)});
    assessments(doc,subject,criterion_results,basis_digest,{reviewStatus:status,reviewOutcome:outcome});
    for(const ref of Array.isArray(doc.metadata.result_refs)?doc.metadata.result_refs:[])add(ref,doc,{role:'复盘引用',subject,reviewStatus:status,reviewOutcome:outcome});
  }
  const progress=projectProgress(branches,record.stale??[]);
  const cancelled=tasks.filter(doc=>doc.metadata.status==='cancelled').length;
  return {attention,inFlight,next,milestones,results:[...resultMap.values()],reviews,
    materials:projectPlanReferences(record,project).materials,
    stats:{tasksCompleted:tasks.filter(doc=>doc.metadata.status==='completed'&&!isStale(doc)).length,tasksTotal:tasks.length-cancelled,
      milestonesAccepted:milestones.filter(row=>row.accepted).length,milestonesTotal:progress.total,referenceFraction:progress.fraction}};
}
