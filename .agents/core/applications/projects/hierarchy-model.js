/** Derived views only: status and ownership remain in their source documents. */
export function stageProgress(milestone,documents,stale=[]){
  const byPath=new Map(documents.map(d=>[d.path,d]));
  const tasks=(milestone.metadata.tasks??[]).map(r=>byPath.get(r.path)).filter(Boolean);
  const cancelled=tasks.filter(d=>d.metadata.status==='cancelled').length;
  const completed=tasks.filter(d=>d.metadata.status==='completed'&&!stale.includes(d.metadata.id)).length;
  const needsReview=tasks.filter(d=>stale.includes(d.metadata.id)).length;
  return {total:tasks.length,activeTotal:tasks.length-cancelled,completed,cancelled,needsReview,tasks};
}

export function projectProgress(branches, stale = []) {
  let total = 0, completed = 0, sum = 0;
  for (const { milestone, tasks } of branches) {
    const { id, status } = milestone.metadata;
    if (status === 'cancelled') continue;
    total++;
    if (status === 'completed' && !stale.includes(id)) {
      completed++;
      sum += 1;
    } else {
      const progress = stageProgress(milestone, tasks, stale);
      if (progress.activeTotal) sum += progress.completed / progress.activeTotal;
    }
  }
  return { total, completed, fraction: total ? sum / total : null };
}
export function projectHierarchy(record){
  const byPath=new Map(record.documents.map(d=>[d.path,d]));
  const build=(doc,seen=new Set())=>{
    if(!doc||seen.has(doc.metadata.id))return null;
    const next=new Set(seen).add(doc.metadata.id);
    return {doc,milestones:(doc.metadata.milestones??[]).map(r=>byPath.get(r.path)).filter(Boolean),children:(doc.metadata.child_projects??[]).map(r=>build(byPath.get(r.path),next)).filter(Boolean)};
  };
  return build(record.project);
}
export function dependenciesOf(doc,record){
  const own=doc.metadata.depends_on??[],stage=doc.metadata.kind==='task'?record.documents.find(d=>d.path===doc.metadata.milestone?.path):null;
  const inherited=stage?.metadata.depends_on??[],seen=new Set();
  return [...own.map(ref=>({ref,inherited:false})),...inherited.map(ref=>({ref,inherited:true}))].filter(x=>{const key=x.ref.id+'\n'+x.ref.path;if(seen.has(key))return false;seen.add(key);return true;}).map(x=>({...x,doc:record.documents.find(d=>d.path===x.ref.path)}));
}

export const taskLabel = d => (d.metadata.task_code ? d.metadata.task_code+' · ' : '')+d.metadata.name;
export function taskGroups(milestone,documents,stale=[]){
 const all=stageProgress(milestone,documents,stale).tasks,stages=milestone.metadata.task_stages??[];
 if(!stages.length)return [{code:null,name:'任务',tasks:all}];
 return [...stages].sort((a,b)=>a.code.localeCompare(b.code)).map(s=>{
  const tasks=all.filter(t=>t.metadata.task_code?.[0]===s.code).sort((a,b)=>Number(a.metadata.task_code.slice(1))-Number(b.metadata.task_code.slice(1)));
  return {...s,tasks,total:tasks.length,completed:tasks.filter(t=>t.metadata.status==='completed'&&!stale.includes(t.metadata.id)).length};
 });
}

export function milestoneCode(doc) {
  return /^M\d+(?=-|$)/i.exec(doc.path.split('/').at(-2))?.[0] ?? null;
}

/** Return only the indexed objects whose identity and ownership agree in both directions. */
export function projectCardHierarchy(record) {
  const project = record.project;
  const byPath = new Map(record.documents.map(doc => [doc.path, doc]));
  const agrees = (ref, doc) => ref?.id === doc.metadata.id && ref.path === doc.path;
  function children(refs, kind, belongs) {
    const seen = new Set();
    return (refs ?? []).flatMap(ref => {
      const doc = byPath.get(ref.path);
      if (seen.has(ref.path) || doc?.metadata.kind !== kind || !agrees(ref, doc) || !belongs(doc.metadata)) return [];
      seen.add(ref.path);
      return [doc];
    });
  }
  const parentRef = project.metadata.parent_project;
  const parent = byPath.get(parentRef?.path);
  const relations = [];
  if (parent?.metadata.kind === 'project' && parent.path !== project.path && agrees(parentRef, parent)
      && parent.metadata.child_projects?.some(ref => agrees(ref, project))) {
    relations.push({kind:'parent', doc:parent});
  }
  for (const child of children(project.metadata.child_projects, 'project', metadata => agrees(metadata.parent_project, project))) {
    if (child.path !== project.path) relations.push({kind:'child', doc:child});
  }
  const milestones = children(project.metadata.milestones, 'milestone', metadata => agrees(metadata.project, project));
  return {
    project,
    relations,
    branches: milestones.map(milestone => ({
      milestone,
      tasks: children(milestone.metadata.tasks, 'task', metadata => agrees(metadata.project, project) && agrees(metadata.milestone, milestone))
    }))
  };
}
