import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {fixture} from './helpers/governance-fixture.js';
import {defaultMetadata,hash,criteriaDigest,encodeDocument,document,validateMetadata} from '../src/projects/governance/model.js';
import {projectGovernance} from '../src/services/project-governance.js';
import {projectManagement,emptyProjectPlan} from '../src/services/project-management.js';
import {runProjectCommand} from '../src/commands/projects.js';

test('flat layout discovers all three context levels and lists one directory at a time through CLI',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);
  const p=dirname(f.pp),m=dirname(f.mp),task=dirname(f.tp);
  const pack=p+'/P10-跨阶段',stage=m+'/M01-样本',leaf=task+'/00-调研.md';
  const raw=Buffer.from([0,255,31,137]);
  const changes=[
    {path:pack+'/nested/原件.bin',ifMatch:'missing',contentBase64:raw.toString('base64')},
    {path:p+'/P100-后来.md',ifMatch:'missing',body:'之后'},
    {path:stage+'/project.md',ifMatch:'missing',contentBase64:Buffer.from('不解析为根卡').toString('base64')},
    {path:leaf,ifMatch:'missing',body:'任务细节'},
  ];
  const request={operationId:'flat-context-write',ifMatch:f.read().etag,changes};
  const preview=f.call('apply',request,true);
  assert.deepEqual(preview.errors,[]);
  assert(preview.data.contextEntries.some(entry=>entry.path===pack&&entry.kind==='directory'));
  assert(!existsSync(join(f.root,pack)));
  assert.deepEqual(f.call('apply',request).errors,[]);
  writeFileSync(join(f.root,p,'P00-手工加入.md'),'项目共用原件');
  writeFileSync(join(f.root,m,'M00-阶段共识.md'),'阶段共用原件');
  symlinkSync(join(f.root,p,'P00-手工加入.md'),join(f.root,stage,'跳过链接.md'));
  const run=(...args)=>{
    const r=runProjectCommand(['governance',...args,'--json'],f.root);
    return {exit:r.exitCode,...JSON.parse(r.stdout)};
  };
  const state=run('read',f.name);
  assert.equal(state.exit,0);
  assert.equal(state.data.documents.length,3);
  assert.deepEqual(state.data.contextEntries.filter(e=>e.owner.kind==='project').map(e=>e.code),['P00','P10','P100']);
  assert.deepEqual(state.data.contextEntries.filter(e=>e.owner.kind==='milestone').map(e=>e.code),['M00','M01']);
  assert.deepEqual(state.data.contextEntries.filter(e=>e.owner.kind==='task').map(e=>e.path),[leaf]);
  assert(!JSON.stringify(state.data.contextEntries).includes('不解析为根卡'));
  const list=path=>run('context-list',f.name,'--data',JSON.stringify({path}));
  assert.deepEqual(list(pack).data.entries.map(e=>[e.name,e.kind]),[['nested','directory']]);
  assert.deepEqual(list(pack+'/nested').data.entries.map(e=>e.name),['原件.bin']);
  assert.deepEqual(list(stage).data.entries.map(e=>e.name),['project.md']);
  assert.notEqual(list(stage+'/跳过链接.md').exit,0);
  assert.notEqual(list(pack+'/../../M1-交付').exit,0);
  assert.notEqual(list(p).exit,0);
  assert.deepEqual(readFileSync(join(f.root,pack,'nested','原件.bin')),raw);
  assert(!existsSync(join(f.root,'.agents/core/docs')));
});

test('flat layout diagnoses indexed old paths and rejects ambiguous or unowned writes',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);
  const m=dirname(f.mp),p=dirname(f.pp);
  const file=path=>({path,ifMatch:'missing',body:'材料'});
  assert(f.apply([file(m+'/M00-样本/task.md')]).errors.some(e=>e.code==='PROJECT_GOVERNANCE_PATH'));
  assert(f.apply([file(p+'/P00-材料'),file(p+'/P00-材料/原件.md')]).errors.some(e=>e.code==='PROJECT_GOVERNANCE_PATH'));
  assert(f.apply([file(p+'/M2-未建档/M00-共识.md')]).errors.some(e=>e.code==='PROJECT_GOVERNANCE_ORPHAN'));
  assert(!existsSync(join(f.root,p,'P00-材料')));
  const oldMilestone=p+'/里程碑/M1-交付/milestone.md';
  const oldTask=dirname(oldMilestone)+'/任务/T1-验证/task.md';
  const ref=(id,path)=>({id,path});
  const put=(path,metadata)=>{
    mkdirSync(join(f.root,dirname(path)),{recursive:true});
    writeFileSync(join(f.root,path),encodeDocument(null,{path,metadata,body:'# 原始资料\n'}));
  };
  put(f.pp,{...f.p,milestones:[ref('m1',oldMilestone)],focus_milestones:[]});
  put(oldMilestone,{...f.m,tasks:[ref('t1',oldTask)]});
  put(oldTask,{...f.task,milestone:ref('m1',oldMilestone)});
  const checked=f.call('check');
  assert(checked.errors.some(e=>e.path===oldMilestone&&e.message.includes('直接放在项目根目录')));
  assert(checked.errors.some(e=>e.path===oldTask&&e.message.includes('直接放在里程碑目录')));
  assert(existsSync(join(f.root,oldTask)));
});

test('read/check and preview never create project business or runtime files; apply preserves body-only edits',t=>{
  const f=fixture(t);assert.equal(f.read().format,'legacy');assert(!existsSync(join(f.root,'.agents')));
  const data={operationId:'preview-operation',ifMatch:f.read().etag,changes:[f.change(f.pp,f.p,'# P\n'),f.change(f.mp,f.m,'# M\n'),f.change(f.tp,f.task,'# T\n')]};
  const preview=f.call('apply',data,true);assert.deepEqual(preview.errors,[]);assert.equal(preview.data.changed,false);assert(!existsSync(join(f.root,'.agents')));assert(!existsSync(join(f.root,dirname(f.mp))));
  assert.deepEqual(f.initialize().errors,[]);assert.equal(f.read().documents.length,3);
  const old=readFileSync(join(f.root,f.tp),'utf8');assert.deepEqual(f.apply([f.change(f.tp,null,'# 当前任务\n\n新进度。\n')]).errors,[]);const now=readFileSync(join(f.root,f.tp),'utf8');assert(now.endsWith('# 当前任务\n\n新进度。\n'));assert(now.includes('id: t1'));assert.notEqual(now,old);
});
test('CAS, duplicate operations and later manual changes are preserved',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);const data={operationId:'stable-operation',ifMatch:f.read().etag,changes:[f.change(f.tp,{next_action:'检查新结果'})]};
  assert.deepEqual(f.call('apply',data).errors,[]);assert.equal(f.call('apply',data).data.replayed,true);
  const wrong=structuredClone(data);wrong.changes[0].metadata.next_action='不同内容';assert.equal(f.call('apply',wrong).errors[0].code,'PROJECT_GOVERNANCE_OPERATION_CONFLICT');
  writeFileSync(join(f.root,f.tp),readFileSync(join(f.root,f.tp),'utf8')+'\n人工补充\n');assert(f.call('apply',data).errors.length);assert(readFileSync(join(f.root,f.tp),'utf8').includes('人工补充'));
});
test('task completion requires current evidence; negative research outcome may pass without closing milestone',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);assert(f.apply([f.change(f.tp,{status:'completed',next_action:null})]).errors.length);
  const evidence=dirname(f.tp)+'/10-验证结果.txt',text='假设被排除，已满足研究交付标准。';
  const result=f.apply([{path:evidence,ifMatch:'missing',body:text},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,evidence,text),result_refs:[{path:evidence}]})]);assert.deepEqual(result.errors,[]);
  assert.equal(f.read().documents.find(d=>d.path===f.mp).metadata.status,'active');writeFileSync(join(f.root,evidence),'证据已变化');assert(f.read().stale.includes('t1'));assert(f.read().warnings.length);
});
test('milestone and project reviews have their own outcomes and evidence; no automatic close or aggregate deliverable',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);const ev=dirname(f.tp)+'/10-结果.txt',text='结果';assert.deepEqual(f.apply([{path:ev,ifMatch:'missing',body:text},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,ev,text)})]).errors,[]);
  const rp=dirname(f.mp)+'/复盘.md',review={...defaultMetadata('review','r1','阶段复盘'),subject:{id:'m1',path:f.mp},status:'completed',outcome:'passed',basis_digest:criteriaDigest(f.m),criterion_results:f.proof(f.m,ev,text).results};
  assert.deepEqual(f.apply([f.change(rp,review,'# 复盘\n实际结果达成；保留下次改进行动。'),f.change(f.mp,{status:'completed',next_action:null,review_ref:{id:'r1',path:rp}})]).errors,[]);assert.equal(f.read().project.metadata.status,'active');
  const pr=dirname(f.pp)+'/项目复盘.md',pv={...defaultMetadata('review','pr1','项目复盘'),subject:{id:'p1',path:f.pp},status:'completed',outcome:'passed',basis_digest:criteriaDigest(f.p),criterion_results:f.proof(f.p,ev,text).results};
  assert.deepEqual(f.apply([f.change(pr,pv,'# 项目复盘\n完成整体目标；改进动作留给下一轮。'),f.change(f.pp,{status:'completed',next_action:null,review_ref:{id:'pr1',path:pr}})]).errors,[]);assert.equal(f.read().project.metadata.status,'completed');assert(!existsSync(join(f.root,'项目/示例/成果')));
});
test('failed or cancelled review may be complete but cannot mark subject completed',t=>{
  const f=fixture(t);f.initialize();const rp=dirname(f.mp)+'/复盘.md',r={...defaultMetadata('review','r1','阶段复盘'),subject:{id:'m1',path:f.mp},status:'completed',outcome:'failed'};
  assert.deepEqual(f.apply([f.change(rp,r,'# 复盘\n结果未达成，下一轮修正。'),f.change(f.mp,{review_ref:{id:'r1',path:rp}})]).errors,[]);assert(f.apply([f.change(f.mp,{status:'completed'})]).errors.length);
});
test('parent links update both ends; self/ancestor cycles, wrong IDs and one-sided edits fail',t=>{
  const f=fixture(t);f.initialize();const path='项目/子项目/project.md',p={...defaultMetadata('project','p2','子项目'),criteria:[],parent_project:null};
  mkdirSync(join(f.root,'项目/子项目'));writeFileSync(join(f.root,path),'# 子项目');assert.deepEqual(f.apply([{path,ifMatch:hash('# 子项目'),metadata:p,body:'# 子项目'}]).errors,[]);
  const call=(data)=>projectGovernance({root:f.root,name:'子项目',operation:'apply',data});let state=projectGovernance({root:f.root,name:'子项目'}).data;
  const link=call({operationId:'link-parent-operation',ifMatch:state.etag,changes:[],setParent:{child:{id:'p2',path},parent:{id:'p1',path:f.pp}}});assert.deepEqual(link.errors,[]);assert.equal(f.read().project.metadata.child_projects[0].id,'p2');
  assert(f.apply([f.change(f.pp,{parent_project:{id:'p2',path}})]).errors.length);
  assert(f.apply([f.change(f.pp,{child_projects:[]})]).errors.length);
  assert(f.apply([f.change(f.mp,{project:{id:'wrong',path:f.pp}})]).errors.length);
});
test('unknown formats, malformed metadata, traversal and symlink targets do not mutate originals',t=>{
  const f=fixture(t);f.initialize();const old=readFileSync(join(f.root,f.tp));for(const metadata of [{governance_schema:99},{depends_on:{}},{criteria:null},{status:'active',owner:null},{status:'paused',resume_condition:null}])assert(f.apply([f.change(f.tp,metadata)]).errors.length);assert.deepEqual(readFileSync(join(f.root,f.tp)),old);
  assert(f.apply([{path:'项目/示例/../wrong.md',ifMatch:'missing',body:'bad'}]).errors.length);
  const outside=join(f.root,'outside');mkdirSync(outside);const link=dirname(f.tp)+'/10-link';try{symlinkSync(outside,join(f.root,link),'dir');}catch(e){if(e.code==='EPERM')return;throw e;}
  assert(f.apply([{path:link+'/data.txt',ifMatch:'missing',body:'bad'}]).errors.length);assert(!existsSync(join(outside,'data.txt')));
});
test('explicit dependencies, capacity and pause/block triggers constrain readiness',t=>{
  const f=fixture(t);f.initialize();assert.deepEqual(f.apply([f.change(f.tp,{status:'planned'})]).errors,[]);assert.equal(f.read().projection.ready[0],'t1');
  assert(f.apply([f.change(f.tp,{depends_on:[{id:'t1',path:f.tp}]})]).errors.length);assert(f.apply([f.change(f.tp,{status:'active',blocker:'缺输入'})]).errors.length);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'active'})]).errors,[]);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'active',blocker:'缺输入',resume_condition:'收到输入',next_action:'请负责人提供输入'})]).errors,[]);assert(!f.read().projection.ready.length);
});
test('legacy management refuses migrated documents and CLI calls the same public governance service',t=>{
  const f=fixture(t);f.initialize();assert.equal(projectManagement({root:f.root,name:f.name}).errors[0].code,'PROJECT_MODEL_MIGRATED');
  const cli=runProjectCommand(['governance','read',f.name,'--json'],f.root);assert.equal(cli.exitCode,0);assert.equal(JSON.parse(cli.stdout).data.format,'documents');
});
test('recursive project ownership has no fixed depth and ancestor cycles are rejected',t=>{
  const f=fixture(t);f.initialize();const nodes=Array.from({length:24},(_,i)=>({id:'child_'+i,path:'项目/子项目'+i+'/project.md'}));
  const changes=[f.change(f.pp,{child_projects:[nodes[0]]})];
  for(const [i,r]of nodes.entries()){const m=defaultMetadata('project',r.id,'子项目'+i);m.parent_project=i?nodes[i-1]:{id:'p1',path:f.pp};m.child_projects=nodes[i+1]?[nodes[i+1]]:[];changes.push({path:r.path,ifMatch:'missing',metadata:m,body:'# 子项目\n独立方案按需完善。'});}
  assert.deepEqual(f.apply(changes).errors,[]);assert.equal(f.read().documents.filter(d=>d.metadata.kind==='project').length,25);
  assert(f.apply([f.change(f.pp,{parent_project:nodes.at(-1)}),f.change(nodes.at(-1).path,{child_projects:[{id:'p1',path:f.pp}]})]).errors.length);
});
test('guidance resumes its saved step; inspiration stays manual and tasks do not create empty context sets',t=>{
  const f=fixture(t),projectNote=dirname(f.pp)+'/灵感闪现.md',existing='已有的项目手记\n';
  writeFileSync(join(f.root,projectNote),existing);
  assert.deepEqual(f.initialize().errors,[]);
  assert.equal(readFileSync(join(f.root,projectNote),'utf8'),existing);
  const guidance={method:'competency.ksf.project-definition@0.2.0',step:'success',pending_questions:['什么结果算做完？']};
  assert.deepEqual(f.apply([f.change(f.pp,{guidance})]).errors,[]);assert.deepEqual(f.read().project.metadata.guidance,guidance);
  for(const owner of [f.mp,f.tp]){
    const path=dirname(owner)+'/灵感闪现.md',before=readFileSync(join(f.root,path));
    assert.equal(before.toString(),'# 灵感闪现\n');
    const text='随手想法\n';
    assert.deepEqual(f.apply([{path,ifMatch:hash(before),body:text}]).errors,[]);
    assert.equal(readFileSync(join(f.root,path),'utf8'),text);
  }
  const state=f.read();
  assert.equal(state.documents.filter(d=>d.metadata.kind==='task').length,1);
  assert.deepEqual(state.contextEntries,[]);
});
test('corrupted collections and unsafe context URLs produce diagnostics rather than overwrites or fallback',t=>{
  const f=fixture(t);f.initialize();assert(f.apply([f.change(f.tp,{context_refs:[{url:'javascript:alert(1)'}]})]).errors.length);
  const path=join(f.root,f.pp);writeFileSync(path,encodeDocument(readFileSync(path),{path:f.pp,metadata:{milestones:{bad:true}}}));const r=f.call();assert.deepEqual(r.errors,[]);assert.equal(r.data.format,'documents');assert.equal(r.data.valid,false);assert(r.data.errors.length);assert(r.data.project.body.includes('方案与约束'));
});
test('readiness needs completion criteria and direct execution checks blockers and capacity without counting itself twice',t=>{
  const f=fixture(t);f.initialize();
  assert.deepEqual(f.apply([f.change(f.tp,{criteria:[]})]).errors,[]);
  assert(!f.read().projection.ready.includes('t1'));
  assert(f.apply([f.change(f.tp,{status:'active',owner:null,blocker:'缺输入',resume_condition:'输入齐备',next_action:'取得输入'})]).errors.length);
  assert.deepEqual(f.apply([f.change(f.tp,{criteria:f.task.criteria,blocker:'尚未解除',resume_condition:'取得输入'})]).errors,[]);
  assert(f.apply([f.change(f.tp,{status:'active'})]).errors.length);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'active',blocker:null})]).errors,[]);
  assert.equal(f.read().projection.activeCount,1);
});
test('cross-project milestone prerequisites gate child starts, stale evidence and impossible completion cycles',t=>{
  const f=fixture(t);f.m.status='planned';f.initialize();
  const pp='项目/前置项目/project.md',mp='项目/前置项目/M1-前置/milestone.md';
  const p={...defaultMetadata('project','p2','前置项目'),milestones:[{id:'m2',path:mp}]};
  const m={...defaultMetadata('milestone','m2','前置'),project:{id:'p2',path:pp},criteria:[{id:'m2_done',text:'前置成果可验证'}]};
  assert.deepEqual(f.apply([f.change(pp,p,'# 前置项目'),f.change(mp,m,'# 前置阶段'),f.change(f.mp,{status:'planned',depends_on:[{id:'m2',path:mp}]})]).errors,[]);
  assert(f.apply([f.change(f.mp,{status:'active'})]).errors.length);
  // A manual inconsistent edit must not make its tasks available for execution.
  const path=join(f.root,f.mp);writeFileSync(path,encodeDocument(readFileSync(path),{metadata:{status:'active'}}));
  assert(!f.read().projection.ready.includes('t1'));assert(f.apply([f.change(f.tp,{status:'active'})]).errors.length);
  assert(f.apply([f.change(mp,{depends_on:[{id:'t1',path:f.tp}]})]).errors.length);
  const ev=dirname(f.tp)+'/10-前置证据.txt',text='实际前置结果',rp=dirname(mp)+'/复盘.md';
  const review={...defaultMetadata('review','r2','前置复盘'),subject:{id:'m2',path:mp},status:'completed',outcome:'passed',basis_digest:criteriaDigest(m),criterion_results:f.proof(m,ev,text).results};
  assert.deepEqual(f.apply([{path:ev,ifMatch:'missing',body:text},f.change(rp,review,'# 前置复盘'),f.change(mp,{status:'completed',next_action:null,review_ref:{id:'r2',path:rp}})]).errors,[]);
  assert(f.read().projection.ready.includes('t1'));
  writeFileSync(join(f.root,ev),'依据被修订');assert(!f.read().projection.ready.includes('t1'));
  assert(f.apply([f.change(f.tp,{status:'active'})]).errors.length);
});
test('malformed milestone prerequisites retain readable project diagnostics',t=>{
  const f=fixture(t);f.initialize();const path=join(f.root,f.mp);
  writeFileSync(path,encodeDocument(readFileSync(path),{path:f.mp,metadata:{depends_on:{broken:true}}}));
  const r=f.call();assert.deepEqual(r.errors,[]);assert.equal(r.data.format,'documents');assert.equal(r.data.valid,false);assert(r.data.project.body.includes('方案与约束'));
});
test('inspiration preserves arbitrary human Markdown bytes without interpreting YAML or creating tasks',t=>{
  const f=fixture(t);f.initialize();const path=dirname(f.mp)+'/灵感闪现.md',text='---\n这不是元数据: [未闭合\n---\n\n💡 原样保留我的想法。\n';
  assert.deepEqual(f.apply([{path,ifMatch:hash(readFileSync(join(f.root,path))),contentBase64:Buffer.from(text).toString('base64')}]).errors,[]);
  assert.equal(readFileSync(join(f.root,path),'utf8'),text);assert.equal(f.read().documents.filter(d=>d.metadata.kind==='task').length,1);
  const before=f.read().etag;assert(f.call('apply',{operationId:'stale-inspiration-save',ifMatch:before,changes:[{path,ifMatch:'missing',contentBase64:Buffer.from('覆盖').toString('base64')}]}).errors.length);
  assert.equal(readFileSync(join(f.root,path),'utf8'),text);
});

test('schema2 has one six-state set and rejects legacy state values without mutation',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);const state=f.read(),six=['planned','active','paused','review','completed','cancelled'];
  for(const kind of ['project','milestone','task'])assert.deepEqual(state.stateModel.states[kind],six);
  const bytes=readFileSync(join(f.root,f.tp));for(const status of ['backlog','ready','in_progress','blocked'])assert(f.apply([f.change(f.tp,{status})]).errors.length);
  assert.deepEqual(readFileSync(join(f.root,f.tp)),bytes);assert(state.projection.ready.includes('t1'));
});
test('active and review work retain capacity while blocked; explicit pause frees capacity and resumes the saved step',t=>{
  const f=fixture(t);f.initialize();assert.deepEqual(f.apply([f.change(f.tp,{status:'active'})]).errors,[]);
  assert.deepEqual(f.apply([f.change(f.tp,{blocker:'设备未到',resume_condition:'设备到位',next_action:'取得设备'})]).errors,[]);assert.equal(f.read().projection.activeCount,1);
  const t2={id:'t2',path:dirname(f.tp).replace('/T1-验证','/T2-其他')+'/task.md'},m=f.read().documents.find(d=>d.path===f.mp);
  assert.deepEqual(f.apply([f.change(f.mp,{tasks:[...m.metadata.tasks,t2]}),f.change(t2.path,{...f.task,id:'t2',name:'其他'},'# 其他')]).errors,[]);
  assert(f.apply([f.change(t2.path,{status:'active'})]).errors.length);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'paused',status_reason:'先推进独立工作',resume_condition:'设备到位后恢复'})]).errors,[]);
  assert.equal(f.read().documents.find(d=>d.path===f.tp).metadata.resume_status,'active');assert.equal(f.read().projection.activeCount,0);
  assert.deepEqual(f.apply([f.change(t2.path,{status:'active'})]).errors,[]);assert(f.apply([f.change(f.tp,{status:'active',blocker:null})]).errors.length);
  assert.deepEqual(f.apply([f.change(t2.path,{status:'cancelled',status_reason:'当前决定不再继续',next_action:null})]).errors,[]);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'active',blocker:null})]).errors,[]);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'review'})]).errors,[]);assert.equal(f.read().projection.activeCount,1);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'paused',status_reason:'等待评审时间'})]).errors,[]);
  assert(f.apply([f.change(f.tp,{status:'active'})]).errors.length);assert.deepEqual(f.apply([f.change(f.tp,{status:'review'})]).errors,[]);
});
test('review stages admit acceptance and evidence tasks but reject new delivery work',t=>{
  const f=fixture(t);f.initialize();assert.deepEqual(f.apply([f.change(f.mp,{status:'review'})]).errors,[]);
  assert(!f.read().projection.ready.includes('t1'));assert(f.apply([f.change(f.tp,{status:'active'})]).errors.length);
  assert.deepEqual(f.apply([f.change(f.tp,{work_type:'acceptance'})]).errors,[]);assert(f.read().projection.ready.includes('t1'));
  assert.deepEqual(f.apply([f.change(f.tp,{status:'active'})]).errors,[]);
  assert(f.apply([f.change(f.tp,{work_type:'delivery'})]).errors.length);
  assert.deepEqual(f.apply([f.change(f.mp,{status:'active'}),f.change(f.tp,{work_type:'delivery'})]).errors,[]);
});
test('paused ancestor projects prevent new work without falsifying child statuses',t=>{
  const f=fixture(t);f.initialize();assert.deepEqual(f.apply([f.change(f.pp,{status:'paused',status_reason:'暂停本范围',resume_condition:'明确恢复'})]).errors,[]);
  assert(!f.read().projection.ready.includes('t1'));assert.equal(f.read().documents.find(d=>d.path===f.tp).metadata.status,'planned');
  assert(f.apply([f.change(f.tp,{status:'active'})]).errors.length);assert.deepEqual(f.apply([f.change(f.pp,{status:'active'})]).errors,[]);assert(f.read().projection.ready.includes('t1'));
});
test('completion, rework and cancellation preserve evidence and require deliberate reopening',t=>{
  const f=fixture(t);f.initialize();const ev=dirname(f.tp)+'/10-研究结论.txt',text='假设被排除，也完成原研究目标';
  assert.deepEqual(f.apply([{path:ev,ifMatch:'missing',body:text},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,ev,text)})]).errors,[]);
  const proof=f.read().documents.find(d=>d.path===f.tp).metadata.verification;
  assert(f.apply([f.change(f.tp,{status:'active',next_action:'复核新信息'})]).errors.length);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'active',status_reason:'新事实需要复核',next_action:'复核新信息'})]).errors,[]);
  assert.deepEqual(f.read().documents.find(d=>d.path===f.tp).metadata.verification,proof);
  assert(f.apply([f.change(f.tp,{status:'planned'})]).errors.length);
  assert.deepEqual(f.apply([f.change(f.tp,{status:'cancelled',status_reason:'决定终止',next_action:null})]).errors,[]);
  assert(f.apply([f.change(f.tp,{status:'review'})]).errors.length);
});

test('schema1 stays readable and read-only; reviewed migration requires explicit blocked mapping and keeps source bytes',t=>{
  const f=fixture(t);f.initialize();const originals=[];
  for(const [file,patch]of [[f.pp,{}],[f.mp,{}],[f.tp,{status:'blocked',blocker:'缺输入',resume_condition:'取得输入'}]]){
    const full=join(f.root,file),bytes=encodeDocument(readFileSync(full),{metadata:{governance_schema:1,...patch}});writeFileSync(full,bytes);originals.push({path:file,bytes});
  }
  assert(f.read().valid);assert(f.read().readOnly);assert(f.apply([f.change(f.tp,{next_action:'不应覆盖'})]).errors.length);
  const mapping={evidence_task_id:'t1'},preview=f.call('migrate',{mapping},true);assert.deepEqual(preview.errors,[]);assert(preview.data.inventory.questions.some(q=>q.blocking));
  assert(f.call('migrate',{mapping,operationId:'upgrade-blocked-missing',approvalDigest:preview.data.approvalDigest}).errors.length);
  mapping.objects={t1:{status:'planned'}};const approved=f.call('migrate',{mapping},true);assert.deepEqual(approved.errors,[]);
  const result=f.call('migrate',{mapping,operationId:'upgrade-blocked-explicit',approvalDigest:approved.data.approvalDigest});assert.deepEqual(result.errors,[]);assert.equal(result.data.project.metadata.governance_schema,2);
  const task=f.read().documents.find(d=>d.path===f.tp);assert.equal(task.metadata.status,'planned');assert.equal(task.metadata.blocker,'缺输入');assert(!f.read().projection.ready.length);
  for(const x of approved.data.inventory.sources)assert.deepEqual(readFileSync(join(f.root,x.backup)),originals.find(o=>o.path===x.path).bytes);
  assert.equal(f.call('migrate',{mapping,operationId:'upgrade-blocked-explicit',approvalDigest:approved.data.approvalDigest}).data.alreadyMigrated,true);
  assert.deepEqual(f.call('recover',{operationId:'upgrade-blocked-explicit'}).errors,[]);for(const x of originals)assert.deepEqual(readFileSync(join(f.root,x.path)),x.bytes);
});


test('business definitions and templates are owned outside docs, and the lifecycle runs with no docs directory',t=>{
  const abilities=fileURLToPath(new URL('../../abilities/',import.meta.url));
  const dirs=['partners/project-manager','competencies/project-definition','competencies/project-planning','competencies/project-control','competencies/project-acceptance'];
  const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.md')){const text=readFileSync(p,'utf8');for(const match of text.matchAll(/\]\(([^)]+)\)/g)){const target=match[1].replace(/^<|>$/g,'').split('#')[0];if(!target||/^https?:/.test(target))continue;assert(!target.includes('/docs/'),'Business definition links to explanatory docs: '+p);assert(existsSync(join(dirname(p),target)),'Missing capability-owned resource: '+target);}}}};
  for(const dir of dirs)walk(join(abilities,dir));
  const templates=join(abilities,'partners/project-manager/templates');for(const name of ['project','milestone','task','milestone-review','project-review'])assert.deepEqual(validateMetadata(document('',name+'.md',readFileSync(join(templates,name+'.md')))),[]);
  const f=fixture(t);assert(!existsSync(join(f.root,'.agents/core/docs')));assert.deepEqual(f.initialize().errors,[]);
  const ev=dirname(f.tp)+'/10-结果.txt',text='独立于说明文档的真实程序样例';
  assert.deepEqual(f.apply([{path:ev,ifMatch:'missing',body:text},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,ev,text)})]).errors,[]);
  const review=(subject,path,id)=>{const m=f.read().documents.find(d=>d.path===subject).metadata,v=f.proof(m,ev,text);return f.change(path,{...defaultMetadata('review',id,'复盘'),subject:{id:m.id,path:subject},status:'completed',outcome:'passed',basis_digest:v.basis_digest,criterion_results:v.results},'# 复盘');};
  const mr=dirname(f.mp)+'/复盘.md',pr=dirname(f.pp)+'/项目复盘.md';
  assert.deepEqual(f.apply([review(f.mp,mr,'mr'),f.change(f.mp,{status:'completed',next_action:null,review_ref:{id:'mr',path:mr}})]).errors,[]);
  assert.deepEqual(f.apply([review(f.pp,pr,'pr'),f.change(f.pp,{status:'completed',next_action:null,review_ref:{id:'pr',path:pr}})]).errors,[]);assert(f.read().valid);assert(!existsSync(join(f.root,'.agents/core/docs')));
});
