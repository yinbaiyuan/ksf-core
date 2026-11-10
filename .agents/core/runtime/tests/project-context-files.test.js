import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, readFile, rename, rm, symlink, writeFile} from 'node:fs/promises';
import {join, posix} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture} from './helpers/governance-fixture.js';
import {createProjectContextFiles} from '../src/services/project-context-files.js';
import {createWorkspaceFiles} from '../src/services/workspace-files.js';
import {createApplicationStorage} from '../src/services/application-storage.js';
import {createCoordinator} from '../src/services/workbench-common.js';
import {project} from '../src/services/projects.js';

function setup(t) {
  const f=fixture(t);
  assert.deepEqual(f.initialize().errors,[]);
  const root=posix.dirname(f.pp);
  const service=()=>createProjectContextFiles(createWorkspaceFiles(f.root,createCoordinator()),createApplicationStorage(f.root));
  let api=service();
  t.after(()=>api.close());
  const call=(action,input={})=>api.call({action,name:f.name,scope:'current',...input});
  return {...f,base:root,at:name=>root+'/'+name,absolute:name=>join(f.root,root,name),call,reopen(){api.close();api=service();}};
}

async function changed(f,find,input={}) {
  const deadline=Date.now()+6500;
  do {
    const view=await f.call('changes',input);
    const match=find(view.entries);
    if(match)return match;
    await delay(150);
  } while(Date.now()<deadline);
  assert.fail('Timed out waiting for project directory reconciliation');
}

test('initial baseline, nested external writes, read receipts, and move identity survive restart',async t=>{
  const f=setup(t);
  await mkdir(f.absolute('素材'));
  await writeFile(f.absolute('旧记录.md'),'已有');
  const base=await f.call('changes');
  assert.equal(base.entries.find(e=>e.name==='旧记录.md').unread,null);
  assert(!base.entries.some(e=>e.path===f.mp));
  assert.equal((await f.call('changes',{revision:base.revision})).entries,undefined);
  await mkdir(f.absolute('素材/阶段'));
  await writeFile(f.absolute('素材/阶段/新记录.md'),'Agent 产出');
  const entry=await changed(f,entries=>entries.find(e=>e.name==='新记录.md'&&e.unread));
  assert.equal(entry.reason,'new');
  await f.call('markRead',{path:entry.path,unread:'stale'});
  assert.equal((await f.call('changes')).entries.find(e=>e.path===entry.path).unread,entry.unread);
  await f.call('markRead',{path:entry.path,unread:entry.unread});
  assert.equal((await f.call('changes')).entries.find(e=>e.path===entry.path).unread,null);
  await rename(f.absolute('素材/阶段/新记录.md'),f.absolute('素材/阶段/改名.md'));
  assert.equal((await changed(f,entries=>entries.find(e=>e.name==='改名.md'))).unread,null);
  assert(!(await f.call('changes',{includeDeleted:true})).entries.some(e=>e.path===entry.path));
  await writeFile(f.absolute('稍后补查.md'),'关闭后生成');
  f.reopen();
  const reopened=(await f.call('changes')).entries;
  assert(reopened.find(e=>e.name==='稍后补查.md').unread);
  assert.equal(reopened.find(e=>e.name==='改名.md').unread,null);
});

test('deletion receipts survive restart, never hide restored files and remain opt-in for older clients',async t=>{
  const f=setup(t), path=f.at('素材/记录.md'), input={includeDeleted:true};
  await mkdir(f.absolute('素材'));
  await writeFile(f.absolute('素材/记录.md'),'版本一');
  await f.call('changes',input);
  await rm(f.absolute('素材'),{recursive:true});
  const deleted=await changed(f,entries=>entries.find(e=>e.path===path&&e.reason==='deleted'),input);
  assert.equal(deleted.canMove,false);
  assert(!(await f.call('changes')).entries.some(e=>e.path===path));
  f.reopen();
  const reopened=(await f.call('changes',input)).entries.find(e=>e.path===path);
  assert.equal(reopened.unread,deleted.unread);
  await f.call('markRead',{path,unread:'stale'});
  assert((await f.call('changes',input)).entries.some(e=>e.path===path));
  await f.call('markRead',{path,unread:deleted.unread});
  assert(!(await f.call('changes',input)).entries.some(e=>e.path===path));
  f.reopen();
  assert(!(await f.call('changes',input)).entries.some(e=>e.path===path));

  await mkdir(f.absolute('素材'));
  await writeFile(f.absolute('素材/记录.md'),'版本二');
  await changed(f,entries=>entries.find(e=>e.path===path&&e.reason==='new'),input);
  await rm(f.absolute('素材/记录.md'));
  const second=await changed(f,entries=>entries.find(e=>e.path===path&&e.reason==='deleted'),input);
  assert.notEqual(second.unread,deleted.unread);
  await writeFile(f.absolute('素材/记录.md'),'恢复');
  const restored=await changed(f,entries=>entries.find(e=>e.path===path&&e.reason==='new'),input);
  await f.call('markRead',{path,unread:second.unread});
  assert.equal((await f.call('changes',input)).entries.find(e=>e.path===path).unread,restored.unread);
});

test('external file revisions remain distinct from new files and require a receipt for the current revision',async t=>{
  const f=setup(t), path=f.at('记录.md');
  await writeFile(f.absolute('记录.md'),'版本一');
  const before=(await f.call('changes')).entries.find(e=>e.path===path);
  assert.equal(before.reason,null);
  await delay(20);
  await writeFile(f.absolute('记录.md'),'版本二');
  const updated=await changed(f,entries=>entries.find(e=>e.path===path&&e.reason==='updated'));
  assert.notEqual(updated.stamp,before.stamp);
  assert.equal((await f.call('read',{path})).stamp,updated.stamp);

  // A typical editor writes a temporary file and renames it over the original.
  await writeFile(f.absolute('.替换.md'),'版本三');
  await rename(f.absolute('.替换.md'),f.absolute('记录.md'));
  f.reopen();
  const next=(await f.call('changes')).entries.find(e=>e.path===path);
  assert.equal(next.reason,'updated');
  assert.notEqual(next.unread,updated.unread);
  await f.call('markRead',{path,unread:updated.unread});
  assert.equal((await f.call('changes')).entries.find(e=>e.path===path).unread,next.unread);
  await f.call('markRead',{path,unread:next.unread});
  const read=(await f.call('changes')).entries.find(e=>e.path===path);
  assert.equal(read.stamp,next.stamp);
  assert.equal(read.unread,null);
  assert.equal(read.reason,null);
});

test('safe creation, byte-exact save, conflicting updates, move and project boundaries',async t=>{
  const f=setup(t),path=f.at('记录.md');
  await f.call('changes');
  await f.call('create',{path,kind:'file'});
  assert.equal((await f.call('changes')).entries.find(e=>e.path===path).unread,null);
  await assert.rejects(f.call('create',{path,kind:'file'}),{code:'WORKSPACE_EXISTS'});
  const before=await f.call('read',{path});
  const text='\uFEFF---\r\ntitle: 示例\r\n---\r\n正文\r\n';
  const saved=await f.call('save',{path,text,version:before.version});
  assert.equal(saved.text,text);
  const afterSave=(await f.call('changes')).entries.find(e=>e.path===path);
  assert.equal(afterSave.stamp,saved.stamp);
  assert.equal(afterSave.unread,null);
  await assert.rejects(f.call('save',{path,text:'覆盖',version:before.version}),{code:'WORKSPACE_CONFLICT'});
  assert.equal(await readFile(f.absolute('记录.md'),'utf8'),text);
  await f.call('create',{path:f.at('资料'),kind:'directory'});
  const {version}=await f.call('moveVersion',{path});
  await f.call('move',{path,destination:f.at('资料/记录.md'),version});
  assert.equal(await readFile(f.absolute('资料/记录.md'),'utf8'),text);
  const moved=(await f.call('changes',{includeDeleted:true})).entries;
  assert.equal(moved.find(e=>e.path===f.at('资料/记录.md')).unread,null);
  assert(!moved.some(e=>e.path===path));
  await assert.rejects(f.call('save',{path:f.pp,text:'裸写',version:saved.version}),{code:'PROJECT_CONTEXT_READONLY'});
  await assert.rejects(f.call('create',{path:f.at('../越界.md'),kind:'file'}));
  await assert.rejects(f.call('create',{path:f.at('M1-交付/绕行.md'),kind:'file'}),{code:'PROJECT_CONTEXT_PATH'});
  if(process.platform!=='win32'){
    await symlink(f.absolute('资料'),f.absolute('链接'));
    await assert.rejects(f.call('read',{path:f.at('链接/记录.md')}),{code:'WORKSPACE_SYMLINK'});
  }
  const referenced=f.at('资料/记录.md');
  const task=f.read().documents.find(d=>d.path===f.tp);
  const governed=f.apply([f.change(f.tp,{...task.metadata,context_refs:[{path:referenced}]})]);
  assert.deepEqual(governed.errors,[]);
  const folder=f.at('资料'), current=await f.call('moveVersion',{path:folder});
  await assert.rejects(f.call('move',{path:folder,destination:f.at('新资料'),version:current.version}),{code:'PROJECT_CONTEXT_REFERENCED'});
});

test('review sessions snapshot unopened text, retain changes after reading and saving, and confirm only the displayed version',async t=>{
  const f=setup(t),path=f.at('审阅.md'),reviewSession='review-session-first-window';
  const call=(action,input={})=>f.call(action,{reviewSession,reviewOwnerPid:process.pid,...input});
  await writeFile(f.absolute('审阅.md'),'旧内容\r\n');
  await call('changes');
  await writeFile(f.absolute('审阅.md'),'新内容\r\n');
  const entry=await changed(f,entries=>entries.find(e=>e.path===path&&e.reason==='updated'),{reviewSession});
  const value=await call('read',{path});
  assert.equal(value.reviewOriginal,'旧内容\r\n');
  assert.equal(value.text,'新内容\r\n');
  assert.deepEqual(await call('markRead',{path,unread:entry.unread}),{reviewRequired:true});
  assert((await call('changes')).entries.find(e=>e.path===path).unread);
  const own=await call('save',{path,text:'手动编辑\r\n',version:value.version});
  assert.equal((await call('read',{path})).reviewOriginal,'旧内容\r\n');
  await assert.rejects(call('markReviewed',{path,version:value.version}),{code:'WORKSPACE_CONFLICT'});
  const confirmed=await call('markReviewed',{path,version:own.version});
  assert.equal(confirmed.reviewOriginal,'手动编辑\r\n');
  assert.equal((await call('changes')).entries.find(e=>e.path===path).unread,null);
  await writeFile(f.absolute('审阅.md'),'之后的新改动');
  await changed(f,entries=>entries.find(e=>e.path===path&&e.unread),{reviewSession});
  assert.equal((await call('read',{path})).reviewOriginal,'手动编辑\r\n');
});

test('new application sessions establish fresh baselines and recognized moves preserve the earlier original',async t=>{
  const f=setup(t),path=f.at('审阅.md'),first='review-session-window-one',second='review-session-window-two';
  await writeFile(f.absolute('审阅.md'),'初始正文');
  await f.call('changes',{reviewSession:first});
  await writeFile(f.absolute('审阅.md'),'外部改写');
  await changed(f,entries=>entries.find(e=>e.path===path&&e.unread),{reviewSession:first});
  assert.equal((await f.call('changes',{reviewSession:second})).entries.find(e=>e.path===path).unread,null);
  assert.equal((await f.call('read',{reviewSession:second,path})).reviewOriginal,'外部改写');
  assert.equal((await f.call('read',{reviewSession:first,path})).reviewOriginal,'初始正文');
  await f.call('create',{reviewSession:first,path:f.at('文件夹'),kind:'directory'});
  const {version}=await f.call('moveVersion',{path});
  const moved=f.at('文件夹/审阅.md');
  await f.call('move',{reviewSession:first,path,destination:moved,version});
  assert.equal((await f.call('read',{reviewSession:first,path:moved})).reviewOriginal,'初始正文');
  await f.call('endReview',{reviewSession:first});
  assert.equal((await f.call('read',{reviewSession:'review-session-reopened',path:moved})).reviewOriginal,'外部改写');
});

test('registered milestone and task roots expose only their own context and reject forged object scopes',async t=>{
  const f=setup(t), milestone=posix.dirname(f.mp), task=posix.dirname(f.tp);
  await writeFile(join(f.root,f.at('项目材料.md')),'项目材料');
  for(const [folder,text] of [[milestone,'阶段材料'],[task,'任务材料']]){
    await mkdir(join(f.root,folder,'普通子目录'));
    await writeFile(join(f.root,folder,'普通子目录','记录.md'),text);
  }
  // Unindexed object-looking directories must remain behind their own entrance too.
  await mkdir(join(f.root,milestone,'B9-未登记'));
  await writeFile(join(f.root,milestone,'B9-未登记','task.md'),'# 未登记任务');
  const projectView=await f.call('changes');
  assert.equal(projectView.root,f.base);
  assert.equal(projectView.objectPath,f.pp);
  assert(!projectView.entries.some(entry=>entry.path.startsWith(milestone+'/')));
  const milestoneView=await f.call('changes',{objectPath:f.mp});
  assert.equal(milestoneView.root,milestone);
  assert.equal(milestoneView.objectPath,f.mp);
  assert(milestoneView.entries.some(entry=>entry.path===milestone+'/普通子目录/记录.md'));
  assert(!milestoneView.entries.some(entry=>entry.path.startsWith(task+'/')||entry.path.includes('/B9-未登记')));
  const taskView=await f.call('changes',{objectPath:f.tp});
  assert.equal(taskView.root,task);
  assert(taskView.entries.every(entry=>entry.path.startsWith(task+'/')));
  assert(taskView.entries.some(entry=>entry.path===task+'/普通子目录/记录.md'));
  assert.deepEqual((await f.call('changes',{objectPath:f.pp})).entries,projectView.entries);
  for(const objectPath of [milestone, milestone+'/B9-未登记/task.md', task+'/普通子目录/记录.md',f.mp+'/../milestone.md','项目/其他/project.md','']){
    await assert.rejects(f.call('changes',{objectPath}),{code:'PROJECT_CONTEXT_PATH'});
  }
  await assert.rejects(f.call('read',{objectPath:f.mp,path:task+'/普通子目录/记录.md'}),{code:'PROJECT_CONTEXT_PATH'});
  await assert.rejects(f.call('read',{objectPath:f.tp,path:milestone+'/普通子目录/记录.md'}),{code:'PROJECT_CONTEXT_PATH'});
});

test('object-scoped creation, exact saves and moves retain CAS, numbered paths, references and project boundaries',async t=>{
  const f=setup(t);
  for(const [objectPath,numberedName] of [[f.mp,'M01-依据.md'],[f.tp,'01-依据.md']]){
    const root=posix.dirname(objectPath), path=root+'/记录.md';
    const call=(action,input={})=>f.call(action,{objectPath,...input});
    await call('changes');
    await call('create',{path,kind:'file'});
    const empty=await call('read',{path});
    const text='\uFEFF---\r\ntitle: 原始格式\r\n---\r\n真实内容\r\n';
    const saved=await call('save',{path,text,version:empty.version});
    assert.equal(await readFile(join(f.root,path),'utf8'),text);
    await assert.rejects(call('save',{path,text:'旧版本覆盖',version:empty.version}),{code:'WORKSPACE_CONFLICT'});
    await call('create',{path:root+'/资料',kind:'directory'});
    const current=await call('moveVersion',{path});
    await call('move',{path,destination:root+'/资料/记录.md',version:current.version});
    assert.equal((await call('read',{path:root+'/资料/记录.md'})).text,text);
    const moved=(await call('changes',{includeDeleted:true})).entries;
    assert(!moved.some(entry=>entry.path===path));
    assert.equal(moved.find(entry=>entry.path===root+'/资料/记录.md').unread,null);
    await assert.rejects(call('save',{path:objectPath,text:'裸写原件',version:saved.version}),{code:'PROJECT_CONTEXT_READONLY'});
    await assert.rejects(call('create',{path:root+'/复盘.md',kind:'file'}),{code:'PROJECT_CONTEXT_READONLY'});
    await assert.rejects(call('create',{path:f.at('不能跨对象.md'),kind:'file'}),{code:'PROJECT_CONTEXT_PATH'});
    await assert.rejects(call('create',{path:root+'/../绕行.md',kind:'file'}),{code:'PROJECT_CONTEXT_PATH'});
    await call('create',{path:root+'/'+numberedName,kind:'file'});
    const numbered=(await call('changes')).entries.find(entry=>entry.name===numberedName);
    assert.equal(numbered.canMove,false);
    const numberedVersion=await call('moveVersion',{path:numbered.path});
    await assert.rejects(call('move',{path:numbered.path,destination:root+'/改名.md',version:numberedVersion.version}),{code:'PROJECT_CONTEXT_REFERENCED'});
    const ordinary=await call('moveVersion',{path:root+'/资料/记录.md'});
    await assert.rejects(call('move',{path:root+'/资料/记录.md',destination:root+'/'+numberedName.replace('依据','新依据'),version:ordinary.version}),{code:'PROJECT_CONTEXT_REFERENCED'});
    await assert.rejects(call('move',{path:root+'/资料/记录.md',destination:f.at('越界移动.md'),version:ordinary.version}),{code:'PROJECT_CONTEXT_PATH'});
  }
  const path=posix.dirname(f.tp)+'/资料/记录.md';
  assert.deepEqual(f.apply([f.change(f.tp,{context_refs:[{path}]})]).errors,[]);
  const folder=posix.dirname(path), current=await f.call('moveVersion',{objectPath:f.tp,path:folder});
  await assert.rejects(f.call('move',{objectPath:f.tp,path:folder,destination:posix.dirname(folder)+'/新资料',version:current.version}),{code:'PROJECT_CONTEXT_REFERENCED'});
});

test('milestone and task changes use independent review baselines and current-version M and D receipts',async t=>{
  const f=setup(t), reviewSession='review-scoped-object-window';
  const roots=[f.mp,f.tp];
  for(const objectPath of roots){
    const path=posix.dirname(objectPath)+'/审阅.md';
    await writeFile(join(f.root,path),objectPath+' 原始正文\r\n');
    await f.call('changes',{objectPath,reviewSession,includeDeleted:true});
  }
  for(const objectPath of roots){
    const path=posix.dirname(objectPath)+'/审阅.md';
    const call=(action,input={})=>f.call(action,{objectPath,reviewSession,...input});
    await writeFile(join(f.root,path),objectPath+' 外部改写\r\n');
    const entry=await changed(f,entries=>entries.find(entry=>entry.path===path&&entry.reason==='updated'),{objectPath,reviewSession,includeDeleted:true});
    const value=await call('read',{path});
    assert.equal(value.reviewOriginal,objectPath+' 原始正文\r\n');
    assert.deepEqual(await call('markRead',{path,unread:entry.unread}),{reviewRequired:true});
    const own=await call('save',{path,text:value.text+'手工编辑\r\n',version:value.version});
    await assert.rejects(call('markReviewed',{path,version:value.version}),{code:'WORKSPACE_CONFLICT'});
    assert.equal((await call('markReviewed',{path,version:own.version})).reviewOriginal,own.text);
    assert.equal((await call('changes')).entries.find(entry=>entry.path===path).unread,null);
    await rm(join(f.root,path));
    const removed=await changed(f,entries=>entries.find(entry=>entry.path===path&&entry.reason==='deleted'),{objectPath,reviewSession,includeDeleted:true});
    await call('markRead',{path,unread:removed.unread});
    assert(!(await call('changes',{includeDeleted:true})).entries.some(entry=>entry.path===path));
  }
  assert(!(await f.call('changes',{reviewSession,includeDeleted:true})).entries.some(entry=>entry.path.endsWith('/审阅.md')));
});

test('archived milestone and task contexts stay readable with all mutation paths disabled',async t=>{
  const f=setup(t);
  for(const objectPath of [f.mp,f.tp])await writeFile(join(f.root,posix.dirname(objectPath),'原始材料.md'),'归档材料');
  assert.deepEqual(f.apply([f.change(f.pp,{status:'paused',status_reason:'等待输入',resume_condition:'收到新输入',next_action:'复核材料'})]).errors,[]);
  const data={reason:'隔离归档验收',actor:'测试'};
  const preview=project({root:f.root,name:f.name,operation:'archive',data,dryRun:true});
  assert.equal(preview.data.allowed,true,JSON.stringify(preview.errors));
  const result=project({root:f.root,name:f.name,operation:'archive',data:{...data,operationId:'archive-scoped-contexts',ifMatch:preview.data.ifMatch}});
  assert.deepEqual(result.errors,[]);
  for(const original of [f.mp,f.tp]){
    const objectPath='档案/'+original, path=posix.dirname(objectPath)+'/原始材料.md';
    const call=(action,input={})=>f.call(action,{scope:'archived',objectPath,...input});
    const state=await call('changes');
    assert.equal(state.root,posix.dirname(objectPath));
    assert.equal(state.writable,false);
    const file=await call('read',{path});
    assert.equal(file.text,'归档材料');
    assert.equal(file.writable,false);
    for(const [action,input] of [['save',{path,text:'覆盖',version:file.version}],['create',{path:posix.dirname(path)+'/新建.md',kind:'file'}],['move',{path,destination:posix.dirname(path)+'/改名.md',version:file.version}]]){
      await assert.rejects(call(action,input),{code:'PROJECT_CONTEXT_READONLY'});
    }
    assert.equal(await readFile(join(f.root,path),'utf8'),'归档材料');
  }
});
