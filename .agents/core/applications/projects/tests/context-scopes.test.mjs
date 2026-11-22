import test from 'node:test';
import assert from 'node:assert/strict';
import {contextOwners,contextScopes,contextPanels,contextScopeForPath,isManagedSource} from '../context-scopes.js';

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

test('visible context panels expose each registered level and its own inspiration without mutating records',()=>{
  const {p,m,t,record}=fixture(),before=structuredClone(record),panels=contextPanels(record,t);
  assert.deepEqual(panels.map(x=>[x.owner,x.kind,x.current]),[[p,'项目',false],[m,'里程碑',false],[t,'任务',true]]);
  assert.deepEqual(panels.map(x=>x.notePath),['项目/示例/灵感闪现.md','项目/示例/M1/灵感闪现.md','项目/示例/M1/T1/灵感闪现.md']);
  assert.deepEqual(contextPanels(record,m).map(x=>x.objectPath),[p.path,m.path]);
  assert.deepEqual(contextPanels(record,p).map(x=>x.objectPath),[p.path]);
  assert.deepEqual(record,before);
});

test('context panels never expose a note from an unregistered ancestor',()=>{
  const {t,record}=fixture();t.metadata.milestone.id='wrong';
  assert.deepEqual(contextPanels(record,t).map(x=>x.notePath),['项目/示例/M1/T1/灵感闪现.md']);
});

test('registered source identity keeps managed records out of the ordinary file editor',()=>{
  const {p,m,t,record}=fixture();
  for(const doc of [p,m,t])assert.equal(isManagedSource(record,doc.path),true);
  for(const path of ['项目/示例/资料/task.md','项目/示例/M1/T1/说明.md','项目/其他/project.md'])assert.equal(isManagedSource(record,path),false);
});

import {createContextChangesReader} from '../context-changes.js';

const scopes=[{objectPath:'task.md',root:'task'},{objectPath:'milestone.md',root:'milestone'},{objectPath:'project.md',root:'project'}];
const result=(scope,revision='r1')=>({objectPath:scope.objectPath,root:scope.root,writable:true,revision,entries:[{path:scope.root+'/note.md',kind:'file'}]});
test('one batched read supplies all scopes and restores their entries across navigation',async()=>{
  let calls=0,finish;const revisions=[];
  const sdk={call:async(method,input)=>{calls++;assert.equal(method,'context-files');assert.equal(input.objects.length,3);await new Promise(resolve=>finish=resolve);return {scopes:scopes.map(scope=>result(scope)),governanceRevision:{etag:'g2',projectId:'p'}};}};
  const reader=createContextChangesReader({sdk,project:{name:'p',scope:'current'},reviewSession:'window',getRecord:()=>({etag:'g1'}),onRevision:value=>revisions.push(value)});
  const a=reader.read(scopes),b=reader.read(scopes);assert.equal(calls,1);finish();
  const [first,second]=await Promise.all([a,b]);assert.equal(first.length,3);assert.deepEqual(first,second);
  const newScopes=scopes.map(scope=>({...scope}));assert.deepEqual(reader.peek(newScopes).map(x=>x.result.entries),first.map(x=>x.result.entries));
  assert.equal(revisions[0].baseline,'g1');assert.equal(revisions[0].etag,'g2');reader.dispose();
});
test('an unchanged revision does not resend entries; force still refreshes them',async()=>{
  let calls=0;
  const sdk={call:async(_method,input)=>{calls++;return {scopes:input.objects.map((object,i)=>object.revision?{...result(scopes[i]),entries:undefined}:result(scopes[i])),governanceRevision:{etag:'g'}};}};
  const reader=createContextChangesReader({sdk,project:{},reviewSession:'window'}),current=scopes.map(scope=>({...scope}));
  for(const {scope,result}of await reader.read(current))scope.revision=result.revision;
  // Servers omit this property rather than explicitly clearing the cached tree.
  sdk.call=async(_method,input)=>({scopes:input.objects.map((object,i)=>{const {entries,...value}=result(scopes[i]);return object.revision?value:result(scopes[i]);})});
  assert((await reader.read(current)).every(x=>x.result.entries===undefined));
  assert((await reader.read(current,true)).every(x=>x.result.entries.length===1));reader.dispose();
});
test('old Core falls back to single-scope calls and a bounded freshness read',async()=>{
  const methods=[];const sdk={call:async(method,input)=>{methods.push(method);if(method==='governance.read')return {etag:'g',project:{metadata:{id:'p'}}};return result(scopes.find(scope=>scope.objectPath===input.objectPath));}};
  const reader=createContextChangesReader({sdk,project:{},reviewSession:'window'});
  assert.equal((await reader.read(scopes)).length,3);assert.equal(methods.filter(x=>x==='context-files').length,3);
  await reader.read(scopes);assert.equal(methods.filter(x=>x==='governance.read').length,1);reader.dispose();
});
test('failed reads keep the prior tree and late responses cannot notify a disposed window',async()=>{
  let fail=false,resolve;const revisions=[];
  const sdk={call:async()=>{if(fail)throw Error('offline');return {scopes:scopes.map(scope=>result(scope)),governanceRevision:{etag:'g'}};}};
  const reader=createContextChangesReader({sdk,project:{},onRevision:value=>revisions.push(value)});
  await reader.read(scopes);fail=true;await assert.rejects(reader.read(scopes),/offline/);assert(reader.peek(scopes));
  fail=false;sdk.call=()=>new Promise(done=>resolve=done);const pending=reader.read(scopes),count=revisions.length;reader.dispose();resolve({scopes:scopes.map(scope=>result(scope)),governanceRevision:{etag:'later'}});await pending;assert.equal(revisions.length,count);
});

test('a late prior-object scan cannot replace newer ancestor state or its freshness signal',async()=>{
  const finish=[],revisions=[];
  const sdk={call:(_method,input)=>new Promise(resolve=>finish.push({resolve,input}))};
  const reader=createContextChangesReader({sdk,project:{},onRevision:value=>revisions.push(value)});
  const old=reader.read(scopes),current=reader.read(scopes.slice(1));
  finish[1].resolve({scopes:scopes.slice(1).map(scope=>result(scope,'new')),governanceRevision:{etag:'new'}});await current;
  finish[0].resolve({scopes:scopes.map(scope=>result(scope,'old')),governanceRevision:{etag:'old'}});await old;
  assert.equal(reader.peek(scopes.slice(1))[0].result.revision,'new');assert.deepEqual(revisions.map(value=>value.etag),['new']);reader.dispose();
});
