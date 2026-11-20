import test from 'node:test';
import assert from 'node:assert/strict';
import {resultSections,taskProgressAction,taskProgressPrompt,milestoneTasks,workTasks,milestoneAcceptancePrompt,milestoneCompletionChanges} from '../result-detail-model.js';

const task={path:'项目/甲/M1/B1/task.md',metadata:{id:'t',kind:'task',name:'导入结果',status:'planned',next_action:'核对样本',project:{id:'p',path:'项目/甲/project.md'},milestone:{id:'m',path:'项目/甲/M1/milestone.md'}}};
const record={path:'项目/甲/project.md',projection:{readiness:[{id:'t',path:task.path,ready:false,reasons:['在制容量已满']}]}};
test('result sections preserve old prose, unknown headings and fenced examples without inferring results',()=>{
  const old='# 旧任务\n已实现代码，但未进行用户验收。\n## 过程\n原文';
  assert.deepEqual(resultSections(old),{sections:{目标:'',当前结果:'',未决与缺口:''},original:old});
  const text='# 任务\n\n## 目标\n拿到导入结果\n\n## 当前结果\n已读取样本\n```md\n## 未决与缺口\n这只是示例\n```\n## 未决与缺口\n需要真实样本\n## 历史\n保留';
  const view=resultSections(text);
  assert.equal(view.sections['目标'],'拿到导入结果');
  assert(view.sections['当前结果'].includes('## 未决与缺口\n这只是示例'));
  assert.equal(view.sections['未决与缺口'],'需要真实样本');
  assert(view.original.includes('## 历史\n保留'));
  assert.deepEqual(resultSections().sections,{目标:'',当前结果:'',未决与缺口:''});
});
test('progress preparation respects readiness, pauses, acceptance and terminal tasks without changing state',()=>{
  const before=structuredClone({task,record});
  assert.equal(taskProgressAction(task,record).label,'核对启动条件');
  assert(taskProgressPrompt(task,record,'甲').includes('在制容量已满'));
  for(const [status,label]of [['active','继续此任务'],['paused','核对后恢复'],['review','继续验收']])assert.equal(taskProgressAction({...task,metadata:{...task.metadata,status}},record).label,label);
  for(const status of ['completed','cancelled']){
    const done={...task,metadata:{...task.metadata,status}};
    assert.equal(taskProgressAction(done,record),null);assert.equal(taskProgressPrompt(done,record,'甲'),null);
  }
  const ready={...record,projection:{readiness:[{id:'t',path:task.path,ready:true,reasons:[]}]}};
  assert.equal(taskProgressAction(task,ready).label,'开始此任务');
  assert.equal(taskProgressAction(task,{}).label,'核对启动条件');
  const prompt=taskProgressPrompt(task,ready,'甲');
  for(const content of [task.path,task.metadata.milestone.path,'taskRef','维护同一稳定任务','清空本任务 next_action','等待用户选择，不启动下一任务'])assert(prompt.includes(content));
  assert.deepEqual({task,record},before);
});
test('milestone focus reads only indexed tasks with verified identity and ownership, including drafts at the same identity',()=>{
  const milestone={path:task.metadata.milestone.path,metadata:{id:'m',kind:'milestone',project:task.metadata.project,tasks:[{id:'t',path:task.path},{id:'wrong',path:task.path},{id:'foreign',path:'项目/乙/task.md'}]}};
  const foreign={path:'项目/乙/task.md',metadata:{...task.metadata,id:'foreign',project:{id:'other',path:'项目/乙/project.md'}}};
  assert.deepEqual(milestoneTasks(milestone,{documents:[task,foreign]}),[task]);
  assert.deepEqual(milestoneTasks(milestone,{documents:[{...task,metadata:{...task.metadata,milestone:{id:'m',path:'项目/其他/milestone.md'}}}]}),[]);
});

test('saved drafts yield to a newer source while unsaved edits remain visible and mergeable',async()=>{
  const {documentForReading,documentValue,adoptSavedDocument}=await import('../governance-model.js');
  const before={...task,etag:'before',body:'旧结果',metadata:{...task.metadata,status:'active'}};
  const draft={path:before.path,base:structuredClone(before),value:documentValue(before)};
  const latest={...before,etag:'after',body:'新结果',metadata:{...before.metadata,status:'completed',next_action:null}};
  assert.equal(documentForReading(latest,draft),latest);
  draft.value.metadata.next_action='浏览器未保存的新动作';
  assert.equal(documentForReading(latest,draft).metadata.next_action,'浏览器未保存的新动作');
  const sent=structuredClone(draft.value);adoptSavedDocument(draft,{...sent},latest);
  assert.equal(documentForReading(latest,draft),latest);
  assert.equal(draft.value.metadata.status,'completed');
  draft.evidenceInputs={condition:'待核对路径'};
  assert.notEqual(documentForReading(latest,draft),latest);
});

function workFixture(){
  const project={path:'项目/甲/project.md',metadata:{id:'p',kind:'project',status:'active',milestones:[{id:'m',path:'项目/甲/M1/milestone.md'}],focus_milestones:[{id:'m',path:'项目/甲/M1/milestone.md'}]}};
  const milestone={path:'项目/甲/M1/milestone.md',metadata:{id:'m',kind:'milestone',name:'可评审Demo',status:'active',project:{id:'p',path:project.path},tasks:[{id:'t',path:task.path}],focus_tasks:[]}};
  const t=structuredClone(task);return {project,milestone,t,record:{path:project.path,project,documents:[project,milestone,t]}};
}
test('project and milestone resolve only one explicit current task and never select a sole uncommitted candidate',()=>{
  const f=workFixture(),before=structuredClone(f.record);
  assert.equal(workTasks(f.project,f.record).primary,null);
  assert.equal(workTasks(f.milestone,f.record).candidates.length,1);
  assert.deepEqual(f.record,before);
  f.milestone.metadata.focus_tasks=[{id:'wrong',path:f.t.path}];assert.equal(workTasks(f.milestone,f.record).primary,null);
  f.milestone.metadata.focus_tasks=[{id:'t',path:f.t.path}];assert.equal(workTasks(f.project,f.record).primary,f.t);
  f.t.metadata.status='active';assert.equal(workTasks(f.project,f.record).primary,f.t);
  const other={...structuredClone(f.t),path:'项目/甲/M1/B2/task.md',metadata:{...structuredClone(f.t.metadata),id:'t2'}};
  f.milestone.metadata.tasks.push({id:'t2',path:other.path});f.record.documents.push(other);
  assert.equal(workTasks(f.project,f.record).primary,null);assert.equal(workTasks(f.milestone,f.record).current.length,2);
});
test('task entry rejects terminal containers, broken indexes and foreign ownership; paused containers require a check',()=>{
  const f=workFixture();f.t.metadata.status='active';
  assert(taskProgressPrompt(f.t,f.record,'甲').includes('不为具体工作新增里程碑'));
  f.milestone.metadata.status='paused';assert.equal(taskProgressAction(f.t,f.record).label,'核对推进条件');
  f.milestone.metadata.status='completed';assert.equal(taskProgressAction(f.t,f.record),null);assert.equal(workTasks(f.project,f.record).primary,null);
  f.milestone.metadata.status='active';f.t.metadata.project.id='foreign';assert.equal(taskProgressPrompt(f.t,f.record,'甲'),null);
  assert.equal(workTasks(f.milestone,f.record).primary,null);
  f.t.metadata.project.id='p';f.milestone.metadata.tasks[0].id='wrong';assert.equal(taskProgressPrompt(f.t,f.record,'甲'),null);
  assert.equal(milestoneAcceptancePrompt(f.milestone,{...f.record,readOnly:true},'甲'),null);
  assert(milestoneAcceptancePrompt(f.milestone,f.record,'甲').includes('等待用户明确确认'));
});
test('stage confirmation preserves the draft until explicit transaction, binds identity/basis/scope, and blocks incomplete work',()=>{
  const f=workFixture();f.t.metadata.status='completed';
  Object.assign(f.milestone,{etag:'stage-before'});Object.assign(f.milestone.metadata,{criteria:[{id:'c',text:'能评审'}],review_ref:{id:'r',path:'项目/甲/M1/复盘.md'}});
  const review={path:'项目/甲/M1/复盘.md',etag:'review-before',body:'# 复盘\n历史保留',metadata:{id:'r',kind:'review',status:'draft',outcome:'pending',subject:{id:'m',path:f.milestone.path},basis_digest:'basis',criterion_results:[{criterion_id:'c',result:'passed',reviewer:'Agent 预检',reviewed_at:'2026-11-13T04:00:00.000Z',evidence:[{path:'项目/甲/证据.txt',digest:'a'.repeat(64)}]}]}};
  const before=structuredClone({f,review}),options={basis:'basis',at:'2026-11-13T05:00:00.000Z'};
  const changes=milestoneCompletionChanges(f.milestone,review,f.record,options);
  assert.deepEqual({f,review},before);assert.equal(changes.length,2);assert.equal(changes[0].ifMatch,'stage-before');
  assert.equal(changes[0].metadata.status,'completed');assert.equal(changes[1].metadata.outcome,'passed');
  assert.equal(changes[1].body,review.body);assert(!changes[1].metadata.user_confirmation); // Core alone records verified source and scope.
  f.t.metadata.status='review';assert.throws(()=>milestoneCompletionChanges(f.milestone,review,f.record,options),/未结束/);
  f.t.metadata.status='completed';assert.throws(()=>milestoneCompletionChanges(f.milestone,review,f.record,{...options,basis:'changed'}),/依据/);
  review.metadata.criterion_results[0].result='pending';assert.throws(()=>milestoneCompletionChanges(f.milestone,review,f.record,options),/证据/);
  review.metadata.criterion_results[0].result='passed';review.metadata.subject.id='other';assert.throws(()=>milestoneCompletionChanges(f.milestone,review,f.record,options),/身份/);
});
