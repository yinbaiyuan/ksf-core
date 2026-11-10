const parent=path=>path.slice(0,path.lastIndexOf('/'));
const labels={project:'项目',milestone:'里程碑',task:'任务'};
const matches=(doc,ref)=>!!ref&&doc?.path===ref.path&&doc.metadata.id===ref.id;

// Follow registered ownership only; never infer ancestors from directory names.
export function contextOwners(record,current){
  const project=record.project;
  if(current.path===project.path)return [current];
  if(!matches(project,current.metadata.project))return [current];
  const milestone=current.metadata.kind==='milestone'?current:
    record.documents.find(doc=>doc.metadata.kind==='milestone'&&matches(doc,current.metadata.milestone));
  const registered=milestone&&matches(project,milestone.metadata.project)&&
    project.metadata.milestones?.some(ref=>matches(milestone,ref));
  if(!registered)return [current];
  if(current===milestone)return [current,project];
  if(current.metadata.kind!=='task'||!milestone.metadata.tasks?.some(ref=>matches(current,ref)))return [current];
  return [current,milestone,project];
}

export function contextScopes(record,current){
  return contextOwners(record,current).map((doc,index)=>({
    objectPath:doc.path,root:parent(doc.path),label:labels[doc.metadata.kind]+' · '+doc.metadata.name,
    current:index===0,
  })).reverse();
}

export function contextScopeForPath(scopes,path){
  if(typeof path!=='string')return undefined;
  return scopes.filter(scope=>path===scope.root||path.startsWith(scope.root+'/'))
    .sort((a,b)=>b.root.length-a.root.length)[0];
}
