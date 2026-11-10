import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStatusNeedsReason,projectParentChange,projectPlanReferences,projectPlanView} from '../project-plan-model.js';
import {documentValue} from '../governance-model.js';
import {fixture} from '../../../runtime/tests/helpers/governance-fixture.js';
import {defaultMetadata} from '../../../runtime/src/projects/governance/model.js';
import {projectGovernance} from '../../../runtime/src/services/project-governance.js';

test('project status reasons are requested for pauses, cancellation and reopening while normal progress stays compact',()=>{
  assert.equal(projectStatusNeedsReason({status:'active'},{status:'active'}),false);
  assert.equal(projectStatusNeedsReason({status:'paused'},{status:'active'}),true);
  assert.equal(projectStatusNeedsReason({status:'cancelled'},{status:'planned'}),true);
  assert.equal(projectStatusNeedsReason({status:'active'},{status:'completed'}),true);
  assert.equal(projectStatusNeedsReason({status:'planned'},{status:'cancelled'}),true);
  assert.equal(projectStatusNeedsReason({status:'completed'},{status:'completed'}),false);
});

function readModelFixture(){
  const project={path:'项目/样例/project.md',metadata:{kind:'project',id:'p',name:'样例',criteria:[{id:'pc',text:'整体目标'}],goals:[{id:'g',title:'用户可以完成工作'}],milestones:[],focus_milestones:[]}};
  const milestone={path:'项目/样例/M1/milestone.md',metadata:{kind:'milestone',id:'m',name:'阶段结果',status:'active',project:{id:'p',path:project.path},tasks:[],focus_tasks:[],criteria:[{id:'mc',text:'阶段条件'}]}};
  const task=(id,status,commitment)=>({path:`项目/样例/M1/${id}/task.md`,metadata:{kind:'task',id,name:id,status,commitment,project:{id:'p',path:project.path},milestone:{id:'m',path:milestone.path},criteria:[{id:'tc',text:'可独立完成真实操作'}],goal_ids:['g'],result_refs:[]}});
  const doing=task('doing','active','now'),focused=task('focused','planned','next'),candidate=task('candidate','planned','candidate');
  project.metadata.milestones=[{id:'m',path:milestone.path}];project.metadata.focus_milestones=[{id:'m',path:milestone.path}];
  milestone.metadata.tasks=[doing,focused,candidate].map(d=>({id:d.metadata.id,path:d.path}));milestone.metadata.focus_tasks=[{id:focused.metadata.id,path:focused.path}];
  const record={valid:true,project,documents:[project,milestone,doing,focused,candidate],stale:[],projection:{readiness:[{id:'focused',path:focused.path,ready:false,reasons:['等待依赖','在制容量已满']}]}};
  return {record,project,milestone,doing,focused,candidate};
}

test('project read model separates recorded focus, actual in-flight work, commitment and reproducible readiness',()=>{
  const {record,project,milestone,doing,focused}=readModelFixture();
  const foreign={...doing,path:'项目/其他/task.md',metadata:{...doing.metadata,id:'foreign',project:{id:'other',path:'项目/其他/project.md'}}};record.documents.push(foreign);
  const view=projectPlanView(record);
  assert.deepEqual(view.attention.map(row=>row.document.metadata.id),['m','focused']);
  assert.deepEqual(view.inFlight.map(row=>row.document.metadata.id),['doing']);
  assert.deepEqual(view.next.map(row=>row.document.metadata.id),['focused']);
  assert.equal(view.next[0].ready,false);assert.deepEqual(view.next[0].reasons,['等待依赖','在制容量已满']);
  assert.deepEqual(view.stats,{tasksCompleted:0,tasksTotal:3,milestonesAccepted:0,milestonesTotal:1,referenceFraction:0});
  milestone.metadata.status='completed';record.stale=['m'];assert.equal(projectPlanView(record,project).milestones[0].accepted,false);
  record.stale=[];record.valid=false;assert.equal(projectPlanView(record,project).milestones[0].accepted,false);
  delete record.projection;assert.equal(projectPlanView(record).next[0].ready,null);
  assert.equal(focused.metadata.status,'planned');assert.equal(doing.metadata.status,'active');
});

test('result read model groups file versions while preserving source, condition, review outcome and evidence provenance',()=>{
  const {record,project,milestone,doing}=readModelFixture();
  const path='项目/样例/结果.md',fixed={path,digest:'a'.repeat(64)};
  doing.metadata.result_refs=[{path,role:'当前成果'}];
  doing.metadata.verification={basis_digest:'b'.repeat(64),results:[{criterion_id:'tc',result:'passed',reviewer:'复核者',reviewed_at:'2026-11-07T01:00:00Z',evidence:[fixed]}]};
  const review={path:'项目/样例/M1/复盘.md',metadata:{kind:'review',id:'r',name:'阶段复盘',status:'draft',outcome:'failed',subject:{id:'m',path:milestone.path},basis_digest:'c'.repeat(64),criterion_results:[{criterion_id:'mc',result:'failed',reviewer:'负责人',reviewed_at:'2026-11-07T02:00:00Z',evidence:[{path,digest:'d'.repeat(64)}]}]}};
  record.documents.push(review,{...review,path:'项目/其他/复盘.md',metadata:{...review.metadata,id:'forged',subject:{id:'wrong',path:project.path}}});
  const view=projectPlanView(record),item=view.results[0];
  assert.equal(view.results.length,1);assert.deepEqual(item.versions.map(ref=>ref.digest??'current'),['current','a'.repeat(64),'d'.repeat(64)]);
  assert.deepEqual(item.sources.map(s=>s.id),['doing','r']);assert.deepEqual(item.goals,[{id:'g',title:'用户可以完成工作'}]);
  assert.equal(item.criteria[0].text,'可独立完成真实操作');assert.equal(item.criteria[0].reviewer,'复核者');assert.equal(item.criteria[0].effective,true);
  assert.equal(item.criteria[1].reviewStatus,'draft');assert.equal(item.criteria[1].reviewOutcome,'failed');assert.equal(item.criteria[1].result,'failed');assert.equal(item.criteria[1].effective,false);
  assert.equal(view.reviews.length,1);assert.equal(view.reviews[0].outcome,'failed');
  record.stale=['doing'];const stale=projectPlanView(record).results[0];assert.equal(stale.stale,true);assert.equal(stale.criteria[0].effective,false);
  assert.equal(doing.metadata.verification.results[0].result,'passed');
});

test('project parent edits use the existing atomic relation operation, preserve both sides, and reject a stale graph',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);
  const path='项目/新的上级/project.md',metadata=defaultMetadata('project','new_parent','新的上级');
  assert.deepEqual(f.apply([{path,ifMatch:'missing',metadata,body:'# 新的上级\n'}]).errors,[]);
  const before=f.read(),draft={path:f.pp,base:before.project,value:documentValue(before.project)};
  assert.equal(projectParentChange(draft),undefined);
  draft.value.metadata.parent_project={id:metadata.id,path};
  const request={operationId:'plan-parent-link-001',ifMatch:before.etag,setParent:projectParentChange(draft),changes:[{path:f.pp,ifMatch:before.project.etag,...draft.value}]};
  const saved=f.call('apply',request);assert.deepEqual(saved.errors,[]);assert(saved.data.valid);
  const parent=saved.data.documents.find(doc=>doc.path===path);
  assert.deepEqual(parent.metadata.child_projects,[{id:f.p.id,path:f.pp}]);
  assert.deepEqual(saved.data.project.metadata.parent_project,{id:metadata.id,path});
  const linked=f.read(),detached={path:f.pp,base:linked.project,value:documentValue(linked.project)};detached.value.metadata.parent_project=null;
  const stale={operationId:'plan-parent-unlink-002',ifMatch:linked.etag,setParent:projectParentChange(detached),changes:[{path:f.pp,ifMatch:linked.project.etag,...detached.value}]};
  assert.deepEqual(f.apply([f.change(path,null,'# 其他窗口的新说明\n')]).errors,[]);
  assert(f.call('apply',stale).errors.some(error=>error.code==='PROJECT_GOVERNANCE_CONFLICT'));
  assert.deepEqual(f.read().project.metadata.parent_project,{id:metadata.id,path});
  const latest=f.read();detached.base=latest.project;
  const unlinked=f.call('apply',{...stale,operationId:'plan-parent-unlink-003',ifMatch:latest.etag,changes:[{path:f.pp,ifMatch:latest.project.etag,...detached.value}]});
  assert.deepEqual(unlinked.errors,[]);assert.equal(unlinked.data.project.metadata.parent_project,null);
  const parentState=projectGovernance({root:f.root,name:'新的上级',operation:'read'});
  assert.deepEqual(parentState.errors,[]);assert.deepEqual(parentState.data.project.metadata.child_projects,[]);
});

test('project materials and results retain source attribution, deduplicate evidence, and exclude other projects and invalid review subjects',()=>{
  const project={path:'项目/样例/project.md',metadata:{kind:'project',id:'p',name:'样例',context_refs:[{path:'项目/样例/共享.md'}],result_refs:[]}};
  const task={path:'项目/样例/M1/T1/task.md',metadata:{kind:'task',id:'t',name:'执行任务',project:{id:'p',path:project.path},result_refs:[{path:'项目/样例/共享.md',role:'当前成果'}],verification:{results:[{evidence:[{path:'项目/样例/证据.txt',digest:'a'.repeat(64)}]}]}}};
  const review={path:'项目/样例/项目复盘.md',metadata:{kind:'review',id:'r',name:'项目复盘',subject:{id:'p',path:project.path},criterion_results:[{evidence:[{path:'项目/样例/证据.txt',digest:'a'.repeat(64)}]}]}};
  const foreign={...task,path:'项目/子项目/M1/T1/task.md',metadata:{...task.metadata,project:{id:'other',path:'项目/子项目/project.md'},result_refs:[{path:'项目/子项目/不应聚合.md'}],verification:null}};
  const forged={...review,path:'项目/样例/伪造复盘.md',metadata:{...review.metadata,subject:{id:'wrong',path:project.path},criterion_results:[]}};
  project.metadata.result_refs.push({url:'javascript:alert(1)'},{url:'https://user:password@example.com/private'});
  const record={contextEntries:[{path:'项目/样例/P01-资料.md',owner:{path:project.path}},{path:'项目/子项目/P01-其他.md',owner:{path:'项目/子项目/project.md'}}],documents:[project,task,review,foreign,forged]};
  const refs=projectPlanReferences(record,project);
  assert.deepEqual(refs.materials.map(ref=>ref.path),['项目/样例/P01-资料.md']);
  assert.deepEqual(refs.results.map(ref=>ref.path),['项目/样例/共享.md','项目/样例/证据.txt','项目/样例/项目复盘.md']);
  assert.equal(refs.results[0].source,'执行任务');assert.equal(refs.results[1].digest,'a'.repeat(64));
  review.metadata.criterion_results.push({evidence:[{path:'项目/样例/证据.txt',digest:'b'.repeat(64)}]});
  assert.deepEqual(projectPlanReferences(record,project).results.filter(ref=>ref.path==='项目/样例/证据.txt').map(ref=>ref.digest),['a'.repeat(64),'b'.repeat(64)]);
});
