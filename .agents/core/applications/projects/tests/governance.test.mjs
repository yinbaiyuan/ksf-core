import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createBackend} from '../backend.mjs';
import {mergeDocuments,criteriaDigest,evidenceReferences} from '../governance-model.js';
import {fixture} from '../../../runtime/tests/helpers/governance-fixture.js';
import {projectGovernance} from '../../../runtime/src/services/project-governance.js';
import {criteriaDigest as governanceCriteriaDigest} from '../../../runtime/src/projects/governance/model.js';

test('the application backend computes acceptance baselines with the public governance canonical rules',async t=>{
  const f=fixture(t);f.initialize();
  const app=createBackend({workspace:f.root,dataDirectory:join(f.root,'digest-data')},{cli:async()=>project({root:f.root,operation:'read',name:f.name}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation})});
  t.after(()=>app.dispose());
  const params={name:f.name,scope:'current'},criteria=[{text:'中文完成条件',id:'c1'},{id:'c2',text:'第二项'}];
  const first=await app.call('governance.criteria-digest',{...params,criteria});
  assert.equal(first.digest,governanceCriteriaDigest({criteria}));
  const reordered=criteria.map(({id,text})=>({id,text}));
  assert.equal((await app.call('governance.criteria-digest',{...params,criteria:reordered})).digest,first.digest);
  await assert.rejects(app.call('governance.criteria-digest',{...params,criteria:'invalid'}),/有效列表/);
});
import {project} from '../../../runtime/src/services/projects.js';
import {criteriaDigest as serverDigest} from '../../../runtime/src/projects/governance/model.js';
import {projectHierarchy,stageProgress,projectProgress,dependenciesOf,projectCardHierarchy} from '../hierarchy-model.js';
import {textBase64,reconcileNote} from '../notes-model.js';

test('new app reads only indexed task documents and lazily exposes context through the common service',async t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);const ctx=dirname(f.tp)+'/10-输入.json',projectCtx=dirname(f.pp)+'/P00-背景.md',pack=dirname(f.mp)+'/M01-样本',child=pack+'/输入.txt';
  const snapshot='---\nname: 原件\n---\n包内原件';
  assert.deepEqual(f.apply([{path:ctx,ifMatch:'missing',body:'{"sample":1}'},{path:projectCtx,ifMatch:'missing',body:'共用背景'},{path:child,ifMatch:'missing',contentBase64:textBase64(snapshot)},f.change(f.tp,{context_refs:[{path:ctx,role:'原始输入'}]})]).errors,[]);
  const calls=[],app=createBackend({workspace:f.root,dataDirectory:join(f.root,'.app-data')},{cli:async args=>project({root:f.root,operation:args[1],name:args[2],scope:'current'}),governance:async(operation,input)=>{calls.push(operation);return projectGovernance({...input,root:f.root,operation});}});t.after(()=>app.dispose());
  const params={name:f.name,scope:'current'},detail=await app.call('detail',params);assert.equal(detail.governance.format,'documents');assert.equal(detail.tasks.length,1);assert.equal(detail.tasks[0].schema,'governance');assert(detail.resources.some(x=>x.path===ctx));assert(!JSON.stringify(detail.governance).includes('{"sample":1}'));
  assert.deepEqual(detail.governance.contextEntries.map(e=>e.path).sort(),[projectCtx,pack,ctx].sort());
  assert(!JSON.stringify(detail.governance).includes('包内原件'));
  assert.deepEqual(calls,['read']);
  const children=await app.call('governance.context-list',{...params,data:{path:pack}});
  assert.deepEqual(children.entries.map(e=>e.path),[child]);
  const original=await app.call('file',{...params,path:child,raw:true});
  assert.equal(original.body,readFileSync(join(f.root,child),'utf8'));
  assert.match(original.body,/name: 原件/);
  const evidence=await app.call('governance.evidence',{...params,path:ctx});assert.equal(evidence.digest.length,64);
  const state=await app.call('governance.read',params),task=state.documents.find(d=>d.path===f.tp);
  const saved=await app.call('governance.apply',{...params,data:{operationId:'app-save-operation',ifMatch:state.etag,changes:[{path:f.tp,ifMatch:task.etag,metadata:{next_action:'通过应用维护下一步'}}]}});assert.equal(saved.documents.find(d=>d.path===f.tp).metadata.next_action,'通过应用维护下一步');assert(readFileSync(join(f.root,f.tp),'utf8').includes('通过应用维护下一步'));assert.deepEqual(calls,['read','context-list','read','apply']);
});
test('stale application draft receives a conflict and the current file stays untouched',async t=>{
  const f=fixture(t);f.initialize();const params={name:f.name,scope:'current'},app=createBackend({workspace:f.root,dataDirectory:join(f.root,'data')},{cli:async()=>project({root:f.root,operation:'read',name:f.name}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation})});t.after(()=>app.dispose());
  const old=await app.call('governance.read',params),task=old.documents.find(d=>d.path===f.tp);f.apply([f.change(f.tp,{next_action:'其他窗口'})]);await assert.rejects(app.call('governance.apply',{...params,data:{operationId:'app-conflict-operation',ifMatch:old.etag,changes:[{path:f.tp,ifMatch:task.etag,metadata:{next_action:'旧草稿'}}]}}),e=>e.code==='PROJECT_GOVERNANCE_CONFLICT');assert(readFileSync(join(f.root,f.tp),'utf8').includes('其他窗口'));
});
test('document three-way merge preserves independent changes and asks about overlaps and deletion',()=>{
  const base={path:'task.md',etag:'old',metadata:{id:'t',owner:'A',next_action:'旧'},body:'原文'},draft={path:base.path,base,value:{metadata:{...base.metadata,next_action:'我的'},body:base.body}},latest={...base,etag:'new',metadata:{...base.metadata,owner:'B'}};
  const merged=mergeDocuments([draft],[latest]);assert.equal(merged.conflicts.length,0);assert.equal(merged.drafts[0].value.metadata.owner,'B');assert.equal(merged.drafts[0].value.metadata.next_action,'我的');
  const overlap=mergeDocuments([draft],[{...latest,metadata:{...latest.metadata,next_action:'他人的'}}]);assert.equal(overlap.conflicts.length,1);const resolved=mergeDocuments([draft],[{...latest,metadata:{...latest.metadata,next_action:'他人的'}}],{[overlap.conflicts[0].key]:'theirs'});assert.equal(resolved.drafts[0].value.metadata.next_action,'他人的');assert(mergeDocuments([draft],[]).conflicts.length);
});
test('frontend review basis uses the same canonical digest as the public service',async()=>{const criteria=[{text:'核对',id:'c'}];assert.equal(await criteriaDigest(criteria),serverDigest({criteria}));});
test('inspiration reads and saves independent notes on all three levels with conflict and ownership checks',async t=>{
  const f=fixture(t);f.initialize();const params={name:f.name,scope:'current'},app=createBackend({workspace:f.root,dataDirectory:join(f.root,'data')},{cli:async args=>project({root:f.root,operation:args[1],name:args[2],scope:args[4]??'current'}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation})});t.after(()=>app.dispose());
  const notes=await Promise.all([f.pp,f.mp,f.tp].map(ownerPath=>app.call('inspiration.read',{...params,ownerPath})));
  assert.deepEqual(notes.map(n=>n.ownerKind),['project','milestone','task']);
  assert.deepEqual(notes.map(n=>n.path),[f.pp,f.mp,f.tp].map(path=>dirname(path)+'/灵感闪现.md'));
  for(const note of notes){assert.equal(note.exists,true);assert.equal(note.text,'# 灵感闪现\n');}
  const state=await app.call('governance.read',params),text='---\n这不是元数据: [未闭合\n---\n\n💡 保留我的原话\n';
  const changes=notes.map((note,i)=>({path:note.path,ifMatch:note.etag,contentBase64:textBase64(i===1?text:'记录在'+note.ownerKind+'\n')}));
  await app.call('governance.apply',{...params,data:{operationId:'app-note-save-001',ifMatch:state.etag,changes}});
  for(const note of [notes[0],notes[2]])assert.equal((await app.call('inspiration.read',{...params,ownerPath:note.ownerPath})).text,'记录在'+note.ownerKind+'\n');
  const note=notes[1];
  const saved=await app.call('inspiration.read',{...params,milestonePath:f.mp});assert.equal(saved.text,text);assert.equal(readFileSync(join(f.root,note.path),'utf8'),text);
  writeFileSync(join(f.root,note.path),text+'另一窗口的新想法\n');
  await assert.rejects(app.call('governance.apply',{...params,data:{operationId:'app-note-stale-001',ifMatch:f.read().etag,changes:[{path:note.path,ifMatch:saved.etag,contentBase64:textBase64('旧窗口覆盖')}]}}),e=>e.code==='PROJECT_GOVERNANCE_CONFLICT');
  assert(readFileSync(join(f.root,note.path),'utf8').includes('另一窗口'));assert.equal(f.read().documents.filter(d=>d.metadata.kind==='task').length,1);
  await assert.rejects(app.call('inspiration.read',{...params,milestonePath:'项目/其他/M1-阶段/milestone.md'}),/请选择这个项目/);
});
test('hierarchy keeps recursive project ownership and separates task progress from milestone acceptance',()=>{
  const doc=(id,path,metadata)=>({path,metadata:{id,...metadata}}),task1=doc('t1','t1',{kind:'task',status:'completed'}),task2=doc('t2','t2',{kind:'task',status:'cancelled'}),task3=doc('t3','t3',{kind:'task',status:'active'});
  const m=doc('m1','m1',{kind:'milestone',status:'active',tasks:[task1,task2,task3].map(d=>({id:d.metadata.id,path:d.path}))});
  const grand=doc('p3','p3',{kind:'project',child_projects:[],milestones:[]}),child=doc('p2','p2',{kind:'project',child_projects:[{id:'p3',path:'p3'}],milestones:[]}),p=doc('p1','p1',{kind:'project',child_projects:[{id:'p2',path:'p2'}],milestones:[{id:'m1',path:'m1'}]});
  const record={project:p,documents:[p,child,grand,m,task1,task2,task3]};assert.equal(projectHierarchy(record).children[0].children[0].doc.metadata.id,'p3');const progress=stageProgress(m,record.documents);assert.equal(progress.completed,1);assert.equal(progress.activeTotal,2);assert.equal(progress.cancelled,1);assert.equal(m.metadata.status,'active');assert.equal(stageProgress(m,record.documents,['t1']).completed,0);
  const dependent={metadata:{kind:'task',milestone:{path:'m1'},depends_on:[{id:'t1',path:'t1'}]}};m.metadata.depends_on=[{id:'t1',path:'t1'},{id:'t3',path:'t3'}];const deps=dependenciesOf(dependent,record);assert.equal(deps.length,2);assert.equal(deps[1].inherited,true);
});
test('note reconciliation preserves both competing texts and UTF-8 encoding',()=>{
  const base={text:'原记录',etag:'a'},latest={text:'另一份修改',etag:'b'};const conflict=reconcileNote(base,'我的修改',latest);assert.equal(conflict.conflict,true);assert.equal(conflict.text,'我的修改');assert.equal(conflict.latest.text,'另一份修改');
  assert.equal(reconcileNote(base,base.text,latest).text,latest.text);assert.equal(reconcileNote(base,'我的修改',{...base,etag:'new'}).conflict,false);
  const text='💡 中文\n---\n原样记录';assert.equal(Buffer.from(textBase64(text),'base64').toString('utf8'),text);
});
test('project progress averages milestone ratios and distinguishes valid acceptance, stale results and cancellations',()=>{
  const tasks=Array.from({length:11},(_,i)=>({path:'t'+i,metadata:{id:'t'+i,status:i<7?'completed':i===10?'cancelled':'active'}}));
  const branch=(id,status,items=[])=>({milestone:{metadata:{id,status,tasks:items.map(({path,metadata})=>({path,id:metadata.id}))}},tasks:items});
  const active=branch('m1','active',tasks);
  const planned=['m2','m3','m4','m5'].map(id=>branch(id,'planned'));
  const cancelled=branch('mx','cancelled',tasks);
  const completed=branch('mc','completed');
  const overview=projectProgress([active,...planned,cancelled]);
  assert.equal(overview.total,5);
  assert.equal(Math.round(overview.fraction*100),14);
  assert.deepEqual(projectProgress([completed,cancelled]),{total:1,completed:1,fraction:1});
  assert.deepEqual(projectProgress([completed],['mc']),{total:1,completed:0,fraction:0});
  assert.deepEqual(projectProgress([active],['t0']),{total:1,completed:0,fraction:.6});
  assert.deepEqual(projectProgress([cancelled]),{total:0,completed:0,fraction:null});
  const thirds=branch('m6','active',tasks.slice(5,8));
  const quarters=branch('m7','active',tasks.slice(6,10));
  assert.equal(projectProgress([thirds,quarters]).fraction,(2/3+1/4)/2);
});
test('acceptance evidence stays discoverable without loading its contents and unsafe web links are excluded',async t=>{
  const f=fixture(t);f.initialize();const path=dirname(f.tp)+'/10-验收结果.txt',text='可检查结果';
  assert.deepEqual(f.apply([{path,ifMatch:'missing',body:text},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,path,text)})]).errors,[]);
  const app=createBackend({workspace:f.root,dataDirectory:join(f.root,'data')},{cli:async args=>project({root:f.root,operation:args[1],name:args[2]}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation})});t.after(()=>app.dispose());
  const detail=await app.call('detail',{name:f.name,scope:'current'});assert(detail.resources.some(r=>r.path===path&&r.title.startsWith('验收证据')));assert(!JSON.stringify(detail.governance).includes(text));
  const refs=evidenceReferences({kind:'review',criterion_results:[{evidence:[{url:'javascript:alert(1)'},{url:'https://example.com/result',version:'v1'}]}]});assert.equal(refs.length,1);assert.equal(refs[0].url,'https://example.com/result');
});

test('project results open only the referenced evidence version, including outside-project evidence, without widening ordinary file access',async t=>{
  const f=fixture(t);f.initialize();const path='知识/原始证据.txt',text='已复核的固定原文';
  mkdirSync(join(f.root,'知识'),{recursive:true});writeFileSync(join(f.root,path),text);
  assert.deepEqual(f.apply([f.change(f.tp,{verification:f.proof(f.task,path,text)})]).errors,[]);
  const app=createBackend({workspace:f.root,dataDirectory:join(f.root,'app')},{cli:async args=>project({root:f.root,operation:args[1],name:args[2],scope:args[4]??'current'}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation}),lifecycle:(operation,input)=>project({root:f.root,operation:'locate',name:input.path,source:input.source,digest:input.digest,data:input.read?{read:true}:undefined})});t.after(()=>app.dispose());
  const params={name:f.name,scope:'current'},digest=f.proof(f.task,path,text).results[0].evidence[0].digest;
  assert.equal((await app.call('file',{...params,path,digest,raw:true})).body,text);
  await assert.rejects(app.call('file',{...params,path,raw:true}),/该项目/);
  const other='知识/未引用.txt';writeFileSync(join(f.root,other),text);
  await assert.rejects(app.call('file',{...params,path:other,digest,raw:true}),/已引用/);
  writeFileSync(join(f.root,path),'外部改写后的新内容');
  await assert.rejects(app.call('file',{...params,path,digest,raw:true}),/摘要不匹配/);
});

test('fixed evidence keeps image and download bytes, respects restricted paths, and does not reread an empty snapshot',async t=>{
  const f=fixture(t);f.initialize();const base=dirname(f.tp);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXu0AAAAASUVORK5CYII=','base64');
  const pdf=Buffer.from('%PDF-1.7\nfixed bytes\n'),restricted='.agents/core/abilities/restricted.md';
  mkdirSync(join(f.root,dirname(restricted)),{recursive:true});writeFileSync(join(f.root,restricted),'受限原件');
  const paths=[base+'/截图.png',base+'/成果.pdf',base+'/空记录.txt',restricted],bytes=[png,pdf,Buffer.alloc(0),Buffer.from('受限原件')];
  for(let i=0;i<3;i++)writeFileSync(join(f.root,paths[i]),bytes[i]);
  const refs=paths.map((path,i)=>({path,digest:createHash('sha256').update(bytes[i]).digest('hex')}));
  assert.deepEqual(f.apply([f.change(f.tp,{result_refs:refs})]).errors,[]);
  const app=createBackend({workspace:f.root,dataDirectory:join(f.root,'app')},{cli:async args=>project({root:f.root,operation:args[1],name:args[2],scope:args[4]??'current'}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation}),lifecycle:(operation,input)=>{
    const result=project({root:f.root,operation:'locate',name:input.path,source:input.source,digest:input.digest,data:input.read?{read:true}:undefined});if(input.path===paths[2]&&!result.errors.length)writeFileSync(join(f.root,paths[2]),'读取后改写');return result;
  }});t.after(()=>app.dispose());
  const params={name:f.name,scope:'current'};
  const image=await app.call('file',{...params,...refs[0]});assert.equal(image.preview.kind,'image');assert.equal(image.preview.mimeType,'image/png');assert.deepEqual(Buffer.from(image.preview.base64,'base64'),png);
  const document=await app.call('file',{...params,...refs[1]});assert.equal(document.preview.kind,'download');assert.deepEqual(Buffer.from(document.preview.base64,'base64'),pdf);
  assert.equal((await app.call('file',{...params,...refs[2],raw:true})).body,'');
  await assert.rejects(app.call('file',{...params,...refs[3]}),/不属于项目阅读范围/);
});

test('archive preview/apply/restore use the same service and retain draft conflicts and old entry resolution',async t=>{
 const f=fixture(t);f.initialize();assert.deepEqual(f.apply([f.change(f.pp,{status:'paused',status_reason:'封存',resume_condition:'新输入',next_action:'恢复核对'})]).errors,[]);
 const lifecycle=(operation,input)=>project({root:f.root,operation:operation==='resolve'?'locate':operation,name:operation==='resolve'?input.path:input.name,...input});
 const app=createBackend({workspace:f.root,dataDirectory:join(f.root,'app')},{cli:async args=>project({root:f.root,operation:args[1],name:args[2],scope:args[4]??'current'}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation}),lifecycle});t.after(()=>app.dispose());
 const params={name:f.name,scope:'current'},data={reason:'隔离应用验收',actor:'用户',targets:[{id:f.p.id,path:f.pp}]};const d=await app.call('detail',params);assert(d.governance.lifecycle.supported);
 const preview=await app.call('lifecycle.archive',{...params,data,dryRun:true});assert(preview.allowed);
 writeFileSync(join(f.root,f.tp),readFileSync(join(f.root,f.tp),'utf8')+'\n另一窗口修改');await assert.rejects(app.call('lifecycle.archive',{...params,data:{...data,operationId:'app-archive-conflict',ifMatch:preview.ifMatch}}),e=>e.code==='PROJECT_GOVERNANCE_CONFLICT');assert(readFileSync(join(f.root,f.tp),'utf8').includes('另一窗口修改'));
 const latest=await app.call('lifecycle.archive',{...params,data,dryRun:true}),request={...data,operationId:'app-archive-success',ifMatch:latest.ifMatch};await app.call('lifecycle.archive',{...params,data:request});assert((await app.call('lifecycle.archive',{...params,data:request})).replayed);
 const archived={...params,scope:'archived'},ar=await app.call('detail',archived);assert(ar.governance.readOnly);assert.equal(ar.status,'paused');const file=await app.call('file',{...archived,path:f.tp});assert(file.path.startsWith('档案/项目/'));assert(file.body.includes('另一窗口修改'));
 const rp=await app.call('lifecycle.restore',{...archived,data:{reason:'查看',actor:'用户'},dryRun:true});await app.call('lifecycle.restore',{...archived,data:{reason:'查看',actor:'用户',operationId:'app-restore-success',ifMatch:rp.ifMatch}});assert.equal((await app.call('detail',params)).status,'paused');
});

test('letter task groups sort naturally, expose definitions and preserve ordinary state and readiness',async()=>{
 const {taskGroups,taskLabel}=await import('../hierarchy-model.js');const tasks=['B10','Z1','B2','A1'].map((code,i)=>({path:code,metadata:{id:'t'+i,task_code:code,name:'具体工作',status:i===0?'cancelled':'completed'}})),m={metadata:{task_stages:[{code:'Z',name:'验收复盘',purpose:'核对',exit_criteria:'本层结论明确'},{code:'B',name:'实验',purpose:'验证假设',exit_criteria:'拿到结果'},{code:'A',name:'准备',purpose:'确认',exit_criteria:'可做'}],tasks:tasks.map(d=>({id:d.metadata.id,path:d.path}))}};
 const groups=taskGroups(m,tasks);assert.deepEqual(groups.map(g=>g.code),['A','B','Z']);assert.deepEqual(groups[1].tasks.map(d=>d.metadata.task_code),['B2','B10']);assert.equal(groups[1].completed,1);assert.equal(groups[1].purpose,'验证假设');assert.equal(taskLabel(tasks[0]),'B10 · 具体工作');assert.equal(tasks[0].metadata.status,'cancelled');assert.equal(taskGroups({metadata:{tasks:m.metadata.tasks}},tasks)[0].code,null);
});
test('app resolves old task entry after numbered migration and stale drafts do not recreate a duplicate',async t=>{
 const f=fixture(t);f.initialize();const before=f.read(),old=before.documents.find(d=>d.path===f.tp),data={operationId:'app-stage-numbering',ifMatch:before.etag,actor:'测试',reason:'迁移',milestones:[{id:'m1',task_stages:[{code:'B',name:'实施',purpose:'取得结果',exit_criteria:'可验收'}],tasks:[{id:'t1',code:'B1'}]}]},preview=f.call('renumber',data,true);assert.deepEqual(preview.errors,[]);assert.deepEqual(f.call('renumber',{...data,ifMatch:preview.data.ifMatch}).errors,[]);
 const lifecycle=(operation,input)=>project({root:f.root,operation:'locate',name:input.path,digest:input.digest,data:input.read?{read:true}:undefined});const app=createBackend({workspace:f.root,dataDirectory:join(f.root,'app')},{cli:async args=>project({root:f.root,operation:args[1],name:args[2]}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation}),lifecycle});t.after(()=>app.dispose());const params={name:f.name,scope:'current'},file=await app.call('file',{...params,path:f.tp});assert(file.path.includes('/B1-'));assert((await app.call('detail',params)).governance.taskNumbering.supported);
 await assert.rejects(app.call('governance.apply',{...params,data:{operationId:'old-window-draft',ifMatch:before.etag,changes:[{path:f.tp,ifMatch:old.etag,body:'旧草稿'}]}}),e=>e.code==='PROJECT_GOVERNANCE_CONFLICT');const merged=mergeDocuments([{path:f.tp,base:old,value:{metadata:old.metadata,body:'旧草稿'}}],f.read().documents);assert(merged.conflicts.length);assert.equal(f.read().documents.filter(d=>d.metadata.kind==='task').length,1);
});


test('project cards keep verified relations and indexed work when the layout is invalid', () => {
  const card = (kind, id, path, fields = {}) => ({path, metadata: {kind, id, ...fields}});
  const ref = ({path, metadata}) => ({path, id: metadata.id});
  const project = card('project', 'p', '项目/样本/project.md');
  const parent = card('project', 'parent', '项目/上级/project.md', {child_projects:[ref(project)]});
  const child = card('project', 'child', '项目/下级/project.md', {parent_project:ref(project)});
  const unrelated = card('project', 'other', '项目/无关/project.md', {parent_project:ref(parent)});
  project.metadata.parent_project = ref(parent);
  project.metadata.child_projects = [ref(child), ref(unrelated)];
  const stage = card('milestone', 'm', '项目/样本/里程碑/M1-实施/milestone.md', {project: ref(project)});
  const indexed = card('task', 't', '项目/样本/里程碑/M1-实施/任务/Z1-验收/task.md', {
    project: ref(project), milestone: ref(stage)
  });
  const mismatched = card('task', 'foreign', '项目/样本/里程碑/M1-实施/任务/A2-其他/task.md', {
    project: ref(project), milestone: {...ref(stage), id: 'other'}
  });
  const unindexed = card('task', 'unindexed', '项目/样本/里程碑/M1-实施/任务/A3-未索引/task.md', {
    project: ref(project), milestone: ref(stage)
  });
  project.metadata.milestones = [ref(stage), {...ref(stage), id: 'other'}];
  stage.metadata.tasks = [ref(indexed), ref(mismatched), ref(indexed)];
  const graph = projectCardHierarchy({project, valid: false, documents: [project, parent, child, unrelated, stage, indexed, mismatched, unindexed]});
  assert.deepEqual(graph, {
    project,
    relations: [{kind:'parent', doc:parent}, {kind:'child', doc:child}],
    branches: [{milestone: stage, tasks: [indexed]}]
  });
});
