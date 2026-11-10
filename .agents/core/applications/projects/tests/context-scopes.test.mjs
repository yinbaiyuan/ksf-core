import test from 'node:test';
import assert from 'node:assert/strict';
import {contextOwners,contextScopes,contextScopeForPath} from '../context-scopes.js';

function fixture(){
  const doc=(kind,id,path,metadata={})=>({path,metadata:{kind,id,name:id,...metadata}});
  const ref=doc=>({id:doc.metadata.id,path:doc.path});
  const p=doc('project','p','项目/示例/project.md',{parent_project:{id:'parent',path:'项目/总项目/project.md'}});
  const m=doc('milestone','m','项目/示例/M1/milestone.md',{project:ref(p)});
  const t=doc('task','t','项目/示例/M1/T1/task.md',{project:ref(p),milestone:ref(m)});
  const sibling=doc('task','t2','项目/示例/M1/T2/task.md',{project:ref(p),milestone:ref(m)});
  p.metadata.milestones=[ref(m)];m.metadata.tasks=[ref(t),ref(sibling)];
  return {p,m,t,sibling,record:{project:p,documents:[p,m,t,sibling]}};
}

test('context inherits only the registered current object and its milestone/project ancestors',()=>{
  const {p,m,t,record}=fixture();
  assert.deepEqual(contextOwners(record,p),[p]);
  assert.deepEqual(contextOwners(record,m),[m,p]);
  assert.deepEqual(contextOwners(record,t),[t,m,p]);
  assert.deepEqual(contextScopes(record,t).map(s=>s.label),['项目 · p','里程碑 · m','任务 · t']);
  assert.deepEqual(contextScopes(record,m).map(s=>s.label),['项目 · p','里程碑 · m']);
  assert.deepEqual(contextScopes(record,t).filter(s=>s.current).map(s=>s.objectPath),[t.path]);
});

test('missing or mismatched ownership does not infer an ancestor from directory nesting',()=>{
  for(const change of [f=>f.t.metadata.milestone.id='other',f=>f.t.metadata.project.path='项目/其他/project.md',f=>f.m.metadata.tasks=[],f=>f.p.metadata.milestones=[]]){
    const f=fixture();change(f);assert.deepEqual(contextOwners(f.record,f.t),[f.t]);
  }
});

test('operations resolve to the deepest displayed scope, keeping identical filenames separate',()=>{
  const {record,t}=fixture(),scopes=contextScopes(record,t);
  for(const [path,owner] of [['项目/示例/说明.md','项目/示例/project.md'],['项目/示例/M1/说明.md','项目/示例/M1/milestone.md'],['项目/示例/M1/T1/说明.md',t.path],['项目/示例/M1/T1/资料/说明.md',t.path]])
    assert.equal(contextScopeForPath(scopes,path).objectPath,owner);
  assert.equal(contextScopeForPath(scopes,'项目/示例/M1').objectPath,'项目/示例/M1/milestone.md');
  assert.equal(contextScopeForPath(scopes,'项目/示例2/说明.md'),undefined);
  assert.equal(contextScopeForPath(scopes,'项目/其他/说明.md'),undefined);
});
