import test from 'node:test';import assert from 'node:assert/strict';
import {defaultMetadata} from '../src/projects/governance/model.js';
import {domainDocument,domainStatus,domainIntent} from '../../applications/projects/private-ui/domain-model.ts';
test('current project service metadata fits all three summaries without changing its original fields',()=>{
 for(const kind of ['project','task','milestone']         ){
  const metadata=defaultMetadata(kind,kind+'-original','现有'+kind);Object.assign(metadata,{status:'active',owner:'原负责人',next_action:'核对原件'});
  const doc={path:'项目/样例/'+kind+'../../../applications/sdk/tests/.md',etag:'original-version',metadata},before=structuredClone(doc),view=domainDocument(doc,kind) ;
  assert.equal(view.name,metadata.name);assert.equal(view.status.raw,'active');assert.equal(view.owner,'原负责人');assert.equal(view.nextAction,'核对原件');assert.deepEqual(view.target,{kind,id:metadata.id,path:doc.path,version:'original-version'});assert.deepEqual(doc,before);assert.ok(Object.isFrozen(view.target));
 }
});
test('blockers, readiness and main state remain distinct, including prior state spellings',()=>{
 for(const status of ['planned','active','paused','review','completed','cancelled','in_progress','blocked','ready','backlog','archived']){
  const metadata={kind:'task',id:'original',name:'任务',status,blocker:'缺少原材料',resume_condition:'材料可读',depends_on:[{id:'dep',path:'项目/样例/依赖/task.md'}]};
  const view=domainDocument({path:'项目/样例/task.md',metadata},'task') ;assert.equal(view.status.raw,status);assert.equal(view.blocker,'缺少原材料');assert.equal(view.resumeCondition,'材料可读');assert.equal(view.dependencies[0].id,'dep');assert.equal(Object.hasOwn(view,'ready'),false);
 }
});
test('unknown and missing states stay neutral and retain their literal value, including prototype names',()=>{
 for(const value of ['future-state','constructor','__proto__']){const status=domainStatus(value);assert.equal(status.raw,value);assert.equal(status.known,false);assert.equal(status.tone,'neutral');assert.match(status.label,new RegExp(value));}
 assert.equal(domainStatus(null).label,'未标注状态');
 const legacy=domainDocument({path:'项目/旧项目/project.md',metadata:{name:'旧项目',status:'in_progress'}},'project') ;
 assert.equal(legacy.target.id,null);assert.equal(legacy.target.version,null);assert.equal(legacy.owner,null);assert.equal(legacy.nextAction,null);assert.equal(legacy.name,'旧项目');
});
test('task completion, task evidence and milestone user confirmation are not inferred from one another',()=>{
 const metadata={kind:'milestone',id:'m',name:'阶段',status:'completed',tasks:[{id:'t',path:'t.md'}],verification:{results:[{result:'passed'}]},review_ref:{id:'r',path:'复盘.md'}};
 const view=domainDocument({path:'milestone.md',metadata},'milestone') ;
 assert.equal(view.status.raw,'completed');assert.deepEqual(view.reviewRef,{id:'r',path:'复盘.md'});for(const key of ['progress','percentage','confirmation','verification','completedTasks'])assert.equal(Object.hasOwn(view,key),false);
});
test('goals, criteria and references retain their actual text while malformed optional entries stay explainable',()=>{
 const view=domainDocument({path:'project.md',metadata:{kind:'project',name:'项目',goals:[{id:'g',title:'原目标'},null],goal_ids:['g',null],criteria:[{id:'c',text:'原条件'},null,{}],depends_on:[null,{id:'up',path:'up.md'},{}]}},'project') ;
 assert.deepEqual(view.goals,['原目标']);assert.deepEqual(view.goalIds,['g']);assert.deepEqual(view.criteria.map(x=>x.text),['原条件']);assert.equal(view.dependencies[0].path,'up.md');assert.equal(domainDocument({path:'',metadata:{}},'project'),null);assert.equal(domainDocument({path:'task.md',metadata:{kind:'task'}},'project'),null);assert.equal(domainDocument(null,'task'),null);
});
test('an action captures the original target/version and never mutates the source or returns an execution decision',()=>{
 const document={path:'项目/样例/task.md',etag:'v1',metadata:{kind:'task',id:'t',name:'原任务',status:'review'}},view=domainDocument(document,'task') ,intent=domainIntent(view.target,'inspect');
 document.etag='v2';document.metadata.status='completed';assert.equal(intent.target.version,'v1');assert.equal(intent.actionId,'inspect');assert.ok(Object.isFrozen(intent));assert.ok(Object.isFrozen(intent.target));assert.deepEqual(Object.keys(intent).sort(),['actionId','target']);assert.throws(()=>domainIntent(view.target,''));
});
