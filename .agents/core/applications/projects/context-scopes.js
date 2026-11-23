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

// Keep the window's deeper context while reading one of its registered owners.
// A different branch, missing object or changed ownership selects a new context.
export function retainContextSubject(record,previousPath,current){
  const previous=[record.project,...(record.documents??[])].find(doc=>doc.path===previousPath);
  return previous&&contextOwners(record,previous).some(owner=>matches(owner,{path:current.path,id:current.metadata.id}))?previous:current;
}

export function contextScopes(record,current){
  return contextOwners(record,current).map((doc,index)=>({
    objectPath:doc.path,root:parent(doc.path),label:labels[doc.metadata.kind]+' · '+doc.metadata.name,
    current:index===0,
  })).reverse();
}

// Visible access points share the exact same registered owners as file operations.
export function contextPanels(record,current){
  return contextOwners(record,current).map((doc,index)=>({
    owner:doc,objectPath:doc.path,root:parent(doc.path),kind:labels[doc.metadata.kind]??'记录',
    name:doc.metadata.name,label:labels[doc.metadata.kind]+' · '+doc.metadata.name,
    notePath:parent(doc.path)+'/灵感闪现.md',current:index===0,
  })).reverse();
}

export function isManagedSource(record,path){
  return [record.project,...(record.documents??[])].some(d=>d?.path===path);
}

// Current object links use object navigation; a fixed version remains evidence.
export function contextObjectReference(record,reference){
  if(!reference?.path||reference.digest)return undefined;
  return [record.project,...(record.documents??[])].find(doc=>doc?.path===reference.path&&
    (doc===record.project||['milestone','task'].includes(doc.metadata.kind)&&matches(record.project,doc.metadata.project)));
}

export function contextScopeForPath(scopes,path){
  if(typeof path!=='string')return undefined;
  return scopes.filter(scope=>path===scope.root||path.startsWith(scope.root+'/'))
    .sort((a,b)=>b.root.length-a.root.length)[0];
}

function contextTreeEntries(entries,excluded,scopes){
  const visible=entries.filter(entry=>!excluded.has(entry.path));
  const directories=new Set(visible.filter(entry=>entry.kind==='directory').map(entry=>entry.path));
  const folderFor=entry=>{
    let folder=parent(entry.path);
    const scope=contextScopeForPath(scopes,entry.path);
    if(entry.reason==='deleted'&&scope){
      while(folder!==scope.root&&!directories.has(folder)&&folder.startsWith(scope.root+'/'))folder=parent(folder);
    }
    return folder;
  };
  return {visible,folderFor};
}

// Count backend-issued unread tokens within their registered owner only.
export function contextFileReview(entries,scopes,excluded=new Set()){
  const {visible,folderFor}=contextTreeEntries(entries,excluded,scopes),counts=new Map(),notices=new Map();
  for(const entry of visible){
    if(entry.kind!=='file'||!entry.unread)continue;
    notices.set(entry.path,entry.reason==='updated'?'modified':entry.reason==='deleted'?'deleted':'new');
    const scope=contextScopeForPath(scopes,entry.path);
    if(!scope)continue;
    for(let folder=folderFor(entry);folder===scope.root||folder.startsWith(scope.root+'/');folder=parent(folder)){
      counts.set(folder,(counts.get(folder)??0)+1);
      if(folder===scope.root)break;
    }
  }
  return {counts,notices};
}

// Deleted paths stay visible under their nearest surviving folder, as in the
// original file reader. Normal files retain their exact registered hierarchy.
export function contextFileNodes(entries,excluded=new Set(),scopes=[]){
  const {visible,folderFor}=contextTreeEntries(entries,excluded,scopes);
  const children=new Map();
  for(const entry of visible){
    const folder=folderFor(entry),members=children.get(folder)??[];
    members.push(entry);children.set(folder,members);
  }
  const nodes=folder=>(children.get(folder)??[]).map(entry=>({id:entry.path,label:parent(entry.path)===folder?entry.name??entry.path.split('/').at(-1):entry.path.slice(folder.length+1),children:entry.kind==='directory'?nodes(entry.path):undefined}));
  return nodes;
}
