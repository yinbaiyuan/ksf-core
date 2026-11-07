import {readdirSync,lstatSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {taskCode,codeOf} from './task-codes.js';
import {documentKind} from './layout.js';
import {MAIN_STATES,unified,activeStates,initialStates} from './states.js';
import {snapshot,document,safePath,hash,digest,validateMetadata,verificationIssues,terminal,evidenceValid} from './model.js';

export function references(m){
  const list=x=>Array.isArray(x)?x:[];
  if(m.kind==='project')return [m.parent_project,...list(m.child_projects),...list(m.milestones),...list(m.focus_milestones),m.review_ref].filter(Boolean);
  if(m.kind==='milestone')return [m.project,...list(m.tasks),...list(m.focus_tasks),...list(m.depends_on),m.review_ref].filter(Boolean);
  if(m.kind==='task')return [m.project,m.milestone,...list(m.depends_on)].filter(Boolean);
  if(m.kind==='review')return [m.subject].filter(Boolean);
  return [];
}
export function loadGraph(root,overlay=new Map()){
  const docs=new Map(),legacy=new Map(),errors=[],roots=[],queue=[];
  for(const scope of ['项目','档案/项目']){
    let entries;try{safePath(root,scope+'/placeholder',{missing:true});entries=readdirSync(join(root,scope),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;errors.push({code:e.code??'PROJECT_GOVERNANCE_READ',path:scope,message:e.message});continue;}
    for(const e of entries){if(e.isSymbolicLink()){errors.push({code:'PROJECT_GOVERNANCE_PATH',path:scope+'/'+e.name,message:'跳过链接项目。'});continue;}if(e.isDirectory())queue.push(scope+'/'+e.name+'/project.md');}
  }
  for(const path of overlay.keys())if(/^(项目|档案\/项目)\/[^/]+\/project\.md$/.test(path)&&!queue.includes(path))queue.push(path);
  const visited=new Set();
  while(queue.length){
    const path=queue.shift();if(typeof path!=='string'||visited.has(path))continue;visited.add(path);
    if(overlay.has(path)&&overlay.get(path)===null)continue;
    if(visited.size>20000){errors.push({code:'PROJECT_GOVERNANCE_LIMIT',path,message:'显式索引超过20000项，读取不完整。'});break;}
    try{
      safePath(root,path,{missing:overlay.has(path)});
      const snap=overlay.has(path)?null:snapshot(root,path,{optional:true});
      const bytes=overlay.get(path)??snap?.bytes;
      if(!bytes){errors.push({code:'PROJECT_GOVERNANCE_MISSING',path,message:'关联原件不存在。'});continue;}
      const d=document(root,path,bytes);d.scope=path.startsWith('档案/')?'archived':'current';
      if(/^(项目|档案\/项目)\/[^/]+\/project\.md$/.test(path))roots.push(path);
      if(d.metadata.governance_schema===undefined){legacy.set(path,d);continue;}
      docs.set(path,d);errors.push(...validateMetadata(d));
      for(const r of references(d.metadata))if(typeof r?.path==='string')queue.push(r.path);
    }catch(e){errors.push({code:e.code??'PROJECT_GOVERNANCE_READ',path,message:e.message});}
  }
  const byId=new Map();
  for(const d of docs.values()){
    const other=byId.get(d.metadata.id);
    if(other){for(const x of [d,other])errors.push({code:'PROJECT_GOVERNANCE_DUPLICATE_ID',path:x.path,message:'稳定ID重复：'+d.metadata.id});}
    else byId.set(d.metadata.id,d);
  }
  return {root,overlay,docs,legacy,roots,errors,byId,etag:digest([...docs.values(),...legacy.values()].map(d=>[d.path,d.etag]).sort((a,b)=>a[0].localeCompare(b[0])))};
}
export function closure(graph,start){
  const incoming=new Map();
  for(const d of graph.docs.values()){
    const m=d.metadata,owners=m.kind==='project'?[m.parent_project]:m.kind==='milestone'?[m.project]:m.kind==='task'?[m.project,m.milestone]:m.kind==='review'?[m.subject]:[];
    for(const r of owners)if(r?.path){const a=incoming.get(r.path)??[];a.push(d.path);incoming.set(r.path,a);}
  }
  const paths=new Set(),queue=[start];while(queue.length){const path=queue.pop();if(paths.has(path))continue;paths.add(path);for(const r of references(graph.docs.get(path)?.metadata??{}))if(r?.path)queue.push(r.path);queue.push(...(incoming.get(path)??[]));}return paths;
}
export function executionReasons(graph,m){
  const reasons=[],acceptance=m.work_type==='acceptance',stage=graph.docs.get(m.milestone?.path)?.metadata;
  const allowed=x=>x?.status==='active'||acceptance&&x?.status==='review';
  if(!allowed(stage))reasons.push(stage?.status==='review'?'待验收里程碑只允许验收补证任务':'里程碑尚未开启或已暂停/结束');
  if(stage?.blocker)reasons.push('里程碑受阻：'+stage.blocker);
  let p=graph.docs.get(m.project?.path),seen=new Set();
  while(p&&!seen.has(p.path)){seen.add(p.path);if(p.scope==='archived')reasons.push('所属项目或祖先项目已归档：'+p.metadata.name);if(!allowed(p.metadata))reasons.push('所属项目或祖先项目未开放当前工作：'+p.metadata.name);if(p.metadata.blocker)reasons.push('所属项目受阻：'+p.metadata.blocker);p=graph.docs.get(p.metadata.parent_project?.path);}
  return reasons;
}
export function checkGraph(root,graph,{start,changedPaths=null}={}){
  const relevant=start?closure(graph,start):new Set(graph.docs.keys()),errors=graph.errors.filter(e=>relevant.has(e.path)),warnings=[],stale=new Set();
  const add=(d,message,field,code='PROJECT_GOVERNANCE_RELATION')=>errors.push({code,path:d.path,field,message});
  const resolve=(d,r,kind)=>{if(!r)return null;const out=graph.docs.get(r.path);if(!out||out.metadata.id!==r.id||kind&&out.metadata.kind!==kind){add(d,'关联ID、路径或类型不一致：'+String(r.path),kind);return null;}return out;};
  const contains=(a,d)=>Array.isArray(a)&&a.some(r=>r.id===d.metadata.id&&r.path===d.path);
  const dependencies=new Map(),parents=new Map();
  for(const d of graph.docs.values()){
    const m=d.metadata;
    if(!relevant.has(d.path))continue;
    if(validateMetadata(d).length)continue;
    for(const r of references(m))resolve(d,r);
    if(m.kind==='project'){
      if(!/^(项目|档案\/项目)\/[^/]+\/project\.md$/.test(d.path))add(d,'项目根卡必须位于直接项目目录。');
      const p=resolve(d,m.parent_project,'project');if(p){parents.set(m.id,[p.metadata.id]);if(!contains(p.metadata.child_projects,d))add(d,'父项目没有反向列出本子项目。');}
      for(const r of m.child_projects??[]){const c=resolve(d,r,'project');if(c&&(c.metadata.parent_project?.id!==m.id||c.metadata.parent_project?.path!==d.path))add(d,'子项目没有回指唯一直接父项目。');}
      for(const r of m.milestones??[]){const child=resolve(d,r,'milestone');if(child&&(child.metadata.project?.id!==m.id||child.metadata.project?.path!==d.path))add(d,'里程碑未回指本项目。');}
      for(const r of m.focus_milestones??[])if(!m.milestones?.some(x=>x.id===r.id&&x.path===r.path))add(d,'重点里程碑不在本项目索引中。');
    }
    if(m.kind==='milestone'){
      const p=resolve(d,m.project,'project');if(p){if(unified(m)&&p.metadata.governance_schema!==m.governance_schema)add(d,'里程碑和项目的治理格式不一致。');if(!contains(p.metadata.milestones,d))add(d,'项目没有反向列出里程碑。');if(documentKind(d.path)!=='milestone'||dirname(dirname(d.path))!==dirname(p.path))add(d,'请将 M编号-名称/milestone.md 直接放在项目根目录并更新引用。');}
      for(const r of m.tasks??[]){const t=resolve(d,r,'task');if(t&&(t.metadata.milestone?.id!==m.id||t.metadata.milestone?.path!==d.path||t.metadata.project?.id!==m.project?.id))add(d,'任务的里程碑/项目归属不一致。');}
      const codes=new Set();for(const r of m.tasks??[]){const t=graph.docs.get(r.path);if(!t)continue;const code=codeOf(t);if(codes.has(code))add(d,'任务号重复：'+code,'tasks');codes.add(code);if((m.task_stages?.length||t.metadata.task_code||taskCode(code)&&code[0]!=='T')&&(!taskCode(t.metadata.task_code)||!m.task_stages?.some(s=>s.code===t.metadata.task_code[0])))add(t,'任务号必须属于本里程碑定义的字母阶段。','task_code');}
      for(const r of m.focus_tasks??[])if(!m.tasks?.some(x=>x.id===r.id&&x.path===r.path))add(d,'重点任务不在索引中。');
    }
    if(m.kind==='task'){
      const p=resolve(d,m.project,'project'),mstone=resolve(d,m.milestone,'milestone');
      if(mstone){if(!contains(mstone.metadata.tasks,d))add(d,'里程碑没有反向列出任务。');if(documentKind(d.path)!=='task'||dirname(dirname(d.path))!==dirname(mstone.path))add(d,'请将 字母阶段及任务号-名称/task.md 直接放在里程碑目录并更新引用。');if(m.task_code&&d.path.split('/').at(-2).split('-')[0]!==m.task_code)add(d,'目录编号与task_code不一致。','task_code');if(mstone.metadata.project?.id!==p?.metadata.id)add(d,'任务与里程碑的项目不一致。');}
      for(const r of [...(m.context_refs??[]),...(m.result_refs??[])]){try{if(r.path&&!graph.overlay.has(r.path)&&!snapshot(root,r.path,{optional:true,resource:true}))warnings.push({path:d.path,message:'上下文入口缺失：'+r.path});}catch(e){add(d,e.message,'context_refs','PROJECT_GOVERNANCE_PATH');}}
      if((unified(m)?['active','review']:['ready','in_progress']).includes(m.status)&&m.commitment==='candidate')add(d,'可开始/在制任务必须纳入承诺。');
      if(unified(m)&&p&&p.metadata.governance_schema!==m.governance_schema)add(d,'任务和项目的治理格式不一致。');
      if(unified(m)&&mstone&&mstone.metadata.governance_schema!==m.governance_schema)add(d,'任务和里程碑的治理格式不一致。');
      if(unified(m)&&['active','review'].includes(m.status))for(const reason of executionReasons(graph,m)){
        if(d.scope==='archived'||!changedPaths?.has(d.path)||graph.overlay.lifecycle)warnings.push({path:d.path,message:reason});else add(d,reason);
      }
      if(!unified(m)&&['ready','in_progress'].includes(m.status)&&mstone?.metadata.status!=='active'){if(changedPaths?.has(d.path))add(d,'可开始/在制任务的里程碑必须开启。');else warnings.push({path:d.path,message:'所属里程碑未开启，当前不具备启动条件。'});}
      if((unified(m)?['active','review']:['ready','in_progress']).includes(m.status))for(const dep of m.legacy_dependencies??[])if(!legacyDependencyValid(root,dep,graph.overlay))add(d,'历史前置需要复核：'+dep.id,'legacy_dependencies');
    }
    if(['task','milestone'].includes(m.kind)){
      // A milestone cannot finish until its own tasks have ended. Include that
      // prerequisite in cycle detection without turning project ownership into
      // an execution dependency.
      const inherited=graph.docs.get(m.milestone?.path)?.metadata.depends_on;
      dependencies.set(m.id,(m.kind==='milestone'?m.tasks:Array.isArray(inherited)?inherited:[]).map(r=>r.id));
      for(const r of m.depends_on??[]){const dep=resolve(d,r);if(dep){if(!['task','milestone'].includes(dep.metadata.kind))add(d,'硬依赖只能引用任务或里程碑。');dependencies.get(m.id).push(dep.metadata.id);}}
    }
    if(['project','milestone','task'].includes(m.kind)){
      const p=m.kind==='project'?d:resolve(d,m.project,'project');
      for(const id of m.goal_ids??[])if(!Array.isArray(p?.metadata.goals)||!p.metadata.goals.some(g=>g.id===id))add(d,'关联目标不存在：'+id);
      if(m.status==='completed'){
        let v=m.verification;
        if(m.kind!=='task'){
          const review=resolve(d,m.review_ref,'review');
          if(!review||review.metadata.status!=='completed'||review.metadata.outcome!=='passed')v=null;else v=review.metadata;
          const children=m.kind==='project'?[...(m.milestones??[]),...(m.child_projects??[])]:m.tasks??[];
          if(children.some(r=>!terminal(graph.docs.get(r.path)?.metadata.status)))add(d,'仍有未结束的下级工作，不能完成。');
        }
        const issues=verificationIssues(root,d,v,graph.overlay);
        if(issues.length){stale.add(m.id);for(const message of issues){if(changedPaths?.has(d.path))add(d,message,'verification','PROJECT_GOVERNANCE_ACCEPTANCE');else warnings.push({path:d.path,message});}}
      }
    }
    if(m.kind==='review'){
      const subject=resolve(d,m.subject);if(subject){const s=subject.metadata;if(!['project','milestone'].includes(s.kind))add(d,'复盘对象只能是项目或里程碑。');const expected=dirname(subject.path)+(s.kind==='project'?'/项目复盘.md':'/复盘.md');if(expected!==d.path)add(d,'请将复盘放在 '+expected+' 并更新引用。');if(s.review_ref?.id!==m.id||s.review_ref?.path!==d.path)add(d,'复盘对象未回指本记录。');
        if(m.status==='completed'&&m.outcome==='pending')add(d,'复盘已完成时须有明确结论。');
        if(m.outcome==='passed')for(const message of verificationIssues(root,subject,m,graph.overlay)){stale.add(s.id);if(changedPaths?.has(d.path))add(d,message,'criterion_results','PROJECT_GOVERNANCE_ACCEPTANCE');else warnings.push({path:d.path,message});}
      }
    }
  }
  const cycles=(edges,label)=>{
    const degree=new Map([...edges.keys()].map(id=>[id,0])),reverse=new Map();
    for(const [id,deps]of edges)for(const dep of deps)if(degree.has(dep)){degree.set(id,degree.get(id)+1);const a=reverse.get(dep)??[];a.push(id);reverse.set(dep,a);}
    const queue=[...degree].filter(([,n])=>n===0).map(([id])=>id);while(queue.length){const id=queue.pop();degree.delete(id);for(const next of reverse.get(id)??[]){degree.set(next,degree.get(next)-1);if(degree.get(next)===0)queue.push(next);}}
    for(const id of degree.keys()){const d=graph.byId.get(id);if(d)add(d,label+'形成循环。');}
  };
  cycles(parents,'父子关系');cycles(dependencies,'硬依赖');
  let expanded=true;
  while(expanded){expanded=false;for(const d of graph.docs.values())if(relevant.has(d.path)&&d.metadata.status==='completed'&&!stale.has(d.metadata.id)){
    const m=d.metadata,required=[...(Array.isArray(m.depends_on)?m.depends_on:[]),...(m.kind==='project'?[...(m.milestones??[]),...(m.child_projects??[])]:m.kind==='milestone'?m.tasks??[]:[])];
    if(required.some(r=>stale.has(r.id))){stale.add(m.id);expanded=true;if(changedPaths?.has(d.path))add(d,'必需前置或下级验收需复核。','verification','PROJECT_GOVERNANCE_ACCEPTANCE');else warnings.push({path:d.path,message:'必需前置或下级验收需复核。'});}
  }}
  const validCompleted=d=>d?.metadata.status==='completed'&&!stale.has(d.metadata.id);
  for(const d of graph.docs.values())if(relevant.has(d.path)&&!validateMetadata(d).length&&(d.metadata.kind==='task'&&(unified(d.metadata)?['active','review','completed']:['ready','in_progress','completed']).includes(d.metadata.status)||d.metadata.kind==='milestone'&&['active','review','completed'].includes(d.metadata.status)))for(const dep of d.metadata.depends_on??[])if(!validCompleted(graph.docs.get(dep.path))){if(changedPaths?.has(d.path))add(d,'硬依赖尚未完成或验收需复核：'+dep.id,'depends_on');else warnings.push({path:d.path,message:'硬依赖需复核：'+dep.id});}
  return {valid:errors.length===0,errors,warnings,stale:[...stale]};
}
export function projection(graph,projectPath,checked,{startingTaskId=null}={}){
  const project=graph.docs.get(projectPath),p=project?.metadata, tasks=[...graph.docs.values()].filter(d=>d.metadata.kind==='task'&&d.metadata.project?.id===p?.id&&!validateMetadata(d).length),active=tasks.filter(d=>activeStates(d.metadata).includes(d.metadata.status));
  const stale=new Set(checked.stale),readiness=tasks.map(d=>{
    const m=d.metadata,reasons=[];
    if(!initialStates(m).includes(m.status)&&m.id!==startingTaskId)reasons.push('当前状态不可启动');
    if(m.commitment==='candidate')reasons.push('尚未纳入承诺');
    if(!m.owner)reasons.push('负责人待确认');
    if(!m.next_action)reasons.push('缺少下一行动');
    if(!m.criteria.length)reasons.push('完成条件待明确');
    if(m.blocker)reasons.push('阻塞：'+m.blocker);
    for(const dep of m.legacy_dependencies??[])if(!legacyDependencyValid(graph.root??'',dep,graph.overlay))reasons.push('历史前置待复核：'+dep.id);
    const milestone=graph.docs.get(m.milestone?.path)?.metadata;
    if(unified(m))reasons.push(...executionReasons(graph,m));else if(milestone?.status!=='active')reasons.push('里程碑尚未开启');
    for(const dep of [...m.depends_on,...(Array.isArray(milestone?.depends_on)?milestone.depends_on:[])]){const x=graph.docs.get(dep.path);if(x?.metadata.status!=='completed'||stale.has(dep.id))reasons.push('等待依赖或复核：'+dep.id);}
    if(active.filter(x=>x.metadata.id!==startingTaskId).length>=(p?.wip_limit??1))reasons.push('在制容量已满');
    return {id:m.id,path:d.path,blocked:!!m.blocker,ready:!reasons.length,reasons};
  });
  return {activeCount:active.length,capacity:Math.max(0,(p?.wip_limit??1)-active.length),overCapacity:active.length>(p?.wip_limit??1),readiness,ready:readiness.filter(x=>x.ready).map(x=>x.id),counts:Object.fromEntries((unified(p)?MAIN_STATES:['backlog','ready','in_progress','blocked','paused','review','completed','cancelled']).map(s=>[s,tasks.filter(d=>d.metadata.status===s).length]))};
}
function legacyDependencyValid(root,dep,overlay=new Map()){
  try{if(!dep?.verification||typeof dep.verification.reviewer!=='string'||!dep.verification.reviewer.trim()||!Array.isArray(dep.verification.evidence)||!dep.verification.evidence.length)return false;return hash(overlay.get(dep.source)??snapshot(root,dep.source,{resource:true}).bytes)===dep.digest&&dep.verification.evidence.every(e=>evidenceValid(root,e,overlay));}catch{return false;}
}
