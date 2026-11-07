import {upgradeStatusGovernance} from './status-upgrade.js';
import {dirname} from 'node:path';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {snapshot,hash,digest,document,defaultMetadata,criteriaDigest,fail,safePath} from './model.js';
import {readGovernance,applyGovernance,projectPath,publicState} from './store.js';

const slug=x=>String(x).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,70)||'未命名';
const ref=d=>({id:d.metadata.id,path:d.path});
export function migrationProposal(root,name,scope='current',mapping={}){
  const state=readGovernance(root,name,scope);
  if(state.format==='documents')return {alreadyMigrated:true,state:publicState(state)};
  if(scope!=='current'||state.format!=='legacy')fail('PROJECT_GOVERNANCE_MIGRATION','仅对当前已有旧项目生成迁移清单。');
  const path=projectPath(name),folder=dirname(path),source=snapshot(root,folder+'/项目管理.json'),card=snapshot(root,path),raw=JSON.parse(source.bytes.toString('utf8'));
  if(raw.schemaVersion!==1||!Array.isArray(raw.plan?.items)||!Array.isArray(raw.plan?.stages)||!Array.isArray(raw.plan?.goals))fail('PROJECT_GOVERNANCE_MIGRATION','旧管理主件格式不受支持，保留原件。');
  const plan=raw.plan,now=raw.updatedAt,projectId=mapping.project_id??'project_'+hash(path).slice(0,20),project={path,metadata:{...state.project.metadata,...defaultMetadata('project',projectId,mapping.name??state.project.metadata.name??name,now)},body:state.project.body};
  Object.assign(project.metadata,{level:mapping.level??'C',mode:mapping.mode??'ongoing',phase:'execution',status:'active',owner:mapping.owner??null,wip_limit:plan.wipLimit,goals:plan.goals,criteria:mapping.criteria??plan.goals.map(g=>({id:'criterion_'+g.id,text:g.successCriteria})),next_action:mapping.next_action??'核对迁移清单并接续当前阶段',risks:plan.risks,decisions:plan.decisions});
  project.body=project.body.replace(/## 当前项目管理\n[\s\S]*?(?=\n## |$)/,'## 当前项目管理\n\n项目、里程碑和任务Markdown原件持有现行安排；原项目管理.json仅保留为冻结历史。沿元数据索引读取当前重点。\n');
  project.body=project.body.replace(/## 下一步\n[\s\S]*?(?=\n## |$)/,'');
  if(mapping.body!==undefined){if(typeof mapping.body!=='string')fail('PROJECT_GOVERNANCE_MIGRATION','根卡正文应为文本。');project.body=mapping.body;}
  const changes=[],milestones=new Map(),tasks=new Map(),questions=[],warnings=[],history=plan.items.filter(x=>['completed','cancelled'].includes(x.state)),current=plan.items.filter(x=>!['completed','cancelled'].includes(x.state));
  for(const x of plan.items)if(x.source){const old=snapshot(root,x.source.path,{optional:true,resource:true});if(!old)warnings.push({itemId:x.id,path:x.source.path,history:history.includes(x),message:'历史来源缺失。'});else if(hash(old.bytes)!==x.source.digest)warnings.push({itemId:x.id,path:x.source.path,history:history.includes(x),expectedDigest:x.source.digest,currentDigest:hash(old.bytes),message:'历史来源已变化，保留旧摘要，先核对差异。'});}
  for(const [i,s]of plan.stages.entries()){
    const selected=mapping.milestones?.[s.id]??{},m={path:folder+'/M'+(i+1)+'-'+slug(selected.name??s.title)+'/milestone.md',metadata:defaultMetadata('milestone',projectId+'::'+s.id,selected.name??s.title,now),body:'# '+(selected.name??s.title)+'\n\n'+(s.description||'阶段成果定义待校准。')+'\n'};
    const criteria=selected.criteria??s.criteria.map(c=>({id:c.id,text:c.text}));
    Object.assign(m.metadata,{project:ref(project),goal_ids:s.goalIds,criteria,status:selected.status??(criteria.length&&s.state==='active'?'active':'planned'),owner:selected.owner??null,next_action:selected.next_action??'核对阶段成果和第一项可执行工作',legacy_id:s.id});
    if(!criteria.length)questions.push({stageId:s.id,message:'缺少阶段完成条件，保持planned，须在开启前补齐。'});
    milestones.set(s.id,m);project.metadata.milestones.push(ref(m));
  }
  for(const [i,x]of current.entries()){
    const choice=mapping.items?.[x.id]??{},m=milestones.get(choice.stage_id??x.stageId);if(!m){questions.push({itemId:x.id,message:'没有可用阶段归属。'});continue;}
    const t={path:dirname(m.path)+'/T'+(i+1)+'-'+slug(x.title)+'/task.md',metadata:defaultMetadata('task',projectId+'::'+x.id,x.title,now),body:'# '+x.title+'\n\n## 目标\n'+(x.description||x.title)+'\n\n## 当前进展\n由旧管理主件迁入；历史记录与新标准验收分别表达。\n\n## 结果与未决\n'+(x.blocker||'待按实际产物复核当前安排。')+'\n'};
    Object.assign(t.metadata,{project:ref(project),milestone:ref(m),goal_ids:x.goalIds,commitment:x.commitment,priority:x.priority,owner:x.owner||null,next_action:x.nextAction||null,status:choice.status??({backlog:'planned',ready:'planned',in_progress:'active'})[x.state]??x.state,blocker:x.blocker||null,resume_condition:x.state==='paused'?'用户明确恢复并复核当前目标与依赖':x.state==='blocked'?'取得所需输入或完成解阻后复核':null,criteria:x.acceptance.map(c=>({id:c.id,text:c.text})),legacy_id:x.id,legacy_dependencies:[]});
    if(x.source){t.metadata.legacy_source=x.source;t.metadata.context_refs.push({path:x.source.path,role:'历史来源'});}
    for(const dep of x.dependsOn??[])if(history.some(h=>h.id===dep))t.metadata.legacy_dependencies.push({id:dep,source:folder+'/项目管理.json',digest:hash(source.bytes),verification:null});
    Object.assign(t.metadata,choice);delete t.metadata.stage_id;
    if(['planned','active'].includes(t.metadata.status)&&(!t.metadata.owner||t.metadata.legacy_dependencies.length||m.metadata.status!=='active')){t.metadata.status='planned';questions.push({itemId:x.id,message:'负责人、历史前置或阶段条件需核对；保留承诺，暂不声明可开始。'});}
    if(['blocked','paused'].includes(x.state)&&(!choice.status||choice.status==='paused'&&(!choice.resume_status||!choice.status_reason)))questions.push({itemId:x.id,blocking:true,message:'旧受阻/暂停工作需要明确目标状态及接续安排。'});
    if(!t.metadata.criteria.length)questions.push({itemId:x.id,message:'执行前应通过引导明确任务完成条件。'});
    m.metadata.tasks.push(ref(t));tasks.set(x.id,t);
  }
  for(const x of current){const t=tasks.get(x.id);if(!t)continue;t.metadata.depends_on=mapping.items?.[x.id]?.depends_on??(x.dependsOn??[]).filter(id=>tasks.has(id)).map(id=>ref(tasks.get(id)));}
  for(const extra of mapping.extra_tasks??[]){
    const m=milestones.get(extra.stage_id);if(!m)fail('PROJECT_GOVERNANCE_MIGRATION','新增任务阶段不存在。');
    const t={path:dirname(m.path)+'/'+extra.directory+'/task.md',metadata:{...defaultMetadata('task',extra.id,extra.name,now),...extra.metadata,project:ref(project),milestone:ref(m)},body:extra.body??'# '+extra.name+'\n'};
    m.metadata.tasks.push(ref(t));tasks.set(extra.id,t);
  }
  project.metadata.focus_milestones=(mapping.focus_milestones??[plan.currentStageId]).filter(id=>milestones.has(id)).map(id=>ref(milestones.get(id)));
  const evidenceTask=[...tasks.values()].find(t=>t.metadata.id===mapping.evidence_task_id)??tasks.values().next().value;
  if(!evidenceTask)fail('PROJECT_GOVERNANCE_MIGRATION','迁移需要一个明确任务承载备份和证据。');
  const evidenceRoot=dirname(evidenceTask.path),backup=evidenceRoot+'/00-迁移前原件',inventoryPath=evidenceRoot+'/10-迁移清单.json';
  const aliases=current.filter(x=>x.source&&tasks.has(x.id)).map(x=>({from:x.source.path,taskId:x.source.taskId,to:ref(tasks.get(x.id))}));
  for(const a of mapping.aliases??[])aliases.push(a);
  project.metadata.migration={source_plan:{path:folder+'/项目管理.json',digest:hash(source.bytes),revision:raw.revision},card_backup:backup+'/project.md.txt',inventory:inventoryPath,history_item_ids:history.map(x=>x.id),aliases};
  const legacyTasks=[];
  const scanLegacy=dir=>{safePath(root,dir+'/__directory_guard__',{missing:true,resource:true});let entries;try{entries=readdirSync(join(root,dir),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const e of entries){const path=dir+'/'+e.name;if(e.isSymbolicLink()){warnings.push({path,message:'旧任务目录包含链接，保留原件并跳过。'});continue;}if(e.isDirectory()){if(legacyTasks.length>20000)fail('PROJECT_GOVERNANCE_SIZE','旧任务清单过大，先分批盘点。');scanLegacy(path);}else if(e.isFile()&&e.name.endsWith('.md')){const bytes=snapshot(root,path,{resource:true}).bytes;let m={},issue=null;try{m=document(root,path,bytes).metadata;}catch(error){issue=error.message;}legacyTasks.push({path,digest:hash(bytes),taskId:m.task_id??null,checkpointSchema:m.checkpoint_schema??null,recordedState:m.state??null,formalItemIds:plan.items.filter(x=>x.source?.path===path).map(x=>x.id),issue});}}};
  scanLegacy(folder+'/任务');
  const inventory={sourceRevision:raw.revision,sourceDigest:hash(source.bytes),legacyTasks,currentItems:current.map(x=>({id:x.id,state:x.state,commitment:x.commitment,target:tasks.get(x.id)?.path??null})),historyItems:history.map(x=>({id:x.id,state:x.state})),milestones:[...milestones].map(([id,m])=>({legacyId:id,path:m.path,status:m.metadata.status,criteria:m.metadata.criteria})),questions,warnings};
  for(const d of [...milestones.values(),...tasks.values()])changes.push({path:d.path,ifMatch:'missing',metadata:d.metadata,body:d.body});
  changes.push({path:backup+'/project.md.txt',ifMatch:'missing',contentBase64:card.bytes.toString('base64')},{path:backup+'/项目管理.json',ifMatch:'missing',contentBase64:source.bytes.toString('base64')},{path:inventoryPath,ifMatch:'missing',body:JSON.stringify(inventory,null,2)+'\n'});
  changes.push({path,ifMatch:hash(card.bytes),metadata:project.metadata,body:project.body});
  return {alreadyMigrated:false,requiresReview:true,approvalDigest:digest({mapping,inventory,card:hash(card.bytes)}),ifMatch:state.etag,inventory,changes,project:ref(project)};
}
export function migrateGovernance(root,name,scope,data={},options={}){
  const current=readGovernance(root,name,scope);if(current.format==='documents'&&current.project.metadata.governance_schema===1)return upgradeStatusGovernance(root,name,scope,data,options);
  const proposal=migrationProposal(root,name,scope,data.mapping??{});
  if(proposal.alreadyMigrated)return {...proposal.state,alreadyMigrated:true,changed:false};
  if(options.dryRun||!data.approvalDigest)return {...proposal,dryRun:true,changed:false};
  if(proposal.inventory.questions.some(q=>q.blocking))fail('PROJECT_GOVERNANCE_MIGRATION','先明确旧状态映射。');
  if(data.approvalDigest!==proposal.approvalDigest)fail('PROJECT_GOVERNANCE_CONFLICT','迁移清单或来源已变化，须重新审阅。');
  return applyGovernance(root,name,scope,{operationId:data.operationId,ifMatch:proposal.ifMatch,changes:proposal.changes},options);
}
