import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync,mkdirSync,symlinkSync,readlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fixture} from './helpers/governance-fixture.js';
import {projectGovernance} from '../src/services/project-governance.js';
import {emptyProjectPlan} from '../src/services/project-management.js';
import {project} from '../src/services/projects.js';
import {defaultMetadata,hash,criteriaDigest} from '../src/projects/governance/model.js';
import {locateProjectResource} from '../src/projects/governance/locations.js';

test('numbered project and milestone bytes survive interrupted writes and archive round trips',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);
  const p=dirname(f.pp)+'/P00-项目依据.bin',m=dirname(f.mp)+'/M01-样本/原件.bin';
  const bytes=Buffer.from([255,0,64,177,10]);
  const changes=[p,m].map(path=>({path,ifMatch:'missing',contentBase64:bytes.toString('base64')}));
  const data={operationId:'flat-context-interrupt',ifMatch:f.read().etag,changes};
  const interrupted=projectGovernance({root:f.root,name:f.name,operation:'apply',data},{fault(phase,file){
    if(phase==='file-written'&&file.path===m)throw Error('controlled interruption');
  }});
  assert.equal(interrupted.data.recoveryId,data.operationId);
  assert.deepEqual(f.call('recover',{operationId:data.operationId},true).errors,[]);
  assert.deepEqual(f.call('recover',{operationId:data.operationId}).errors,[]);
  assert(!existsSync(join(f.root,p)));
  assert(!existsSync(join(f.root,dirname(m))));
  assert.deepEqual(f.apply([...changes,f.change(f.pp,{status:'paused',status_reason:'等待下一轮',resume_condition:'收到输入',next_action:'复核当前资料'})]).errors,[]);
  for(const operation of ['archive','restore']){
    const reason={reason:'隔离样例往返',actor:'测试'};
    const preview=project({root:f.root,name:f.name,operation,data:reason,dryRun:true});
    assert(preview.data.allowed,JSON.stringify(preview));
    const result=project({root:f.root,name:f.name,operation,data:{...reason,operationId:'flat-context-'+operation,ifMatch:preview.data.ifMatch}});
    assert.deepEqual(result.errors,[]);
    const prefix=operation==='archive'?'档案/':'';
    const scope=operation==='archive'?'archived':'current';
    const state=projectGovernance({root:f.root,name:f.name,scope}).data;
    assert(state.valid);
    assert(state.contextEntries.some(e=>e.path===prefix+p));
    const list=projectGovernance({root:f.root,name:f.name,scope,operation:'context-list',data:{path:prefix+dirname(m)}});
    assert.deepEqual(list.data.entries.map(e=>e.path),[prefix+m]);
    for(const path of [p,m])assert.deepEqual(readFileSync(join(f.root,prefix+path)),bytes);
    assert.deepEqual(locateProjectResource(f.root,{path:p}).bytes,bytes);
  }
});

function reorganization(t){
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);
  mkdirSync(join(f.root,'项目/示例/资料'),{recursive:true});writeFileSync(join(f.root,'项目/示例/资料/原始.bin'),Buffer.alloc(3*1024*1024,137));
  writeFileSync(join(f.root,'README.md'),'[历史](项目/示例/资料/原始.bin)\n');
  const childPath='项目/新一轮/project.md',stagePath='项目/新一轮/M1-真实工作/milestone.md';
  const child={...defaultMetadata('project','new-cycle','新一轮'),parent_project:{id:'p1',path:f.pp},milestones:[{id:'new-stage',path:stagePath}]};
  const stage={...defaultMetadata('milestone','new-stage','真实工作'),project:{id:child.id,path:childPath}};
  const snapshotPath='档案/项目历史资料/示例/2026-11-05重启前';
  const oldRoot=readFileSync(join(f.root,f.pp));
  const data={operationId:'reorganize-test-operation',ifMatch:f.read().etag,snapshotPath,newProjects:['新一轮'],changes:[f.change(f.pp,{milestones:[],focus_milestones:[],child_projects:[{id:child.id,path:childPath}]},'# 新一轮总项目\n'),{path:childPath,ifMatch:'missing',metadata:child,body:'# 新一轮\n'},{path:stagePath,ifMatch:'missing',metadata:stage,body:'# 真实工作\n'}],referenceChanges:[{path:'README.md',ifMatch:hash(readFileSync(join(f.root,'README.md'))),contentBase64:Buffer.from('[历史]('+snapshotPath+'/资料/原始.bin)\n').toString('base64')}]};
  return {...f,data,oldRoot,childPath,stagePath};
}

test('reorganization previews without writing, preserves all original bytes and identity, and replays safely',t=>{
  const f=reorganization(t),preview=f.call('reorganize',f.data,true);assert.deepEqual(preview.errors,[]);assert(preview.data.wouldChange);assert(!existsSync(join(f.root,'档案')));assert(!existsSync(join(f.root,f.childPath)));
  const result=f.call('reorganize',f.data);assert.deepEqual(result.errors,[]);assert.equal(result.data.inventory.bytes>3*1024*1024,true);
  assert.deepEqual(readFileSync(join(f.root,f.data.snapshotPath,'project.md')),f.oldRoot);
  assert.deepEqual(readFileSync(join(f.root,f.data.snapshotPath,'资料/原始.bin')),Buffer.alloc(3*1024*1024,137));
  assert(!existsSync(join(f.root,'项目/示例/资料')));assert.equal(f.read().project.metadata.id,'p1');assert(f.read().documents.some(d=>d.metadata.id==='new-cycle'));
  assert(readFileSync(join(f.root,'README.md'),'utf8').includes(f.data.snapshotPath));
  assert.equal(f.call('reorganize',f.data).data.replayed,true);
  assert(f.call('reorganize',{...f.data,newProjects:[]}).errors.length);
  assert.deepEqual(f.call('recover',{operationId:f.data.operationId},true).errors,[]);
  assert.deepEqual(f.call('recover',{operationId:f.data.operationId}).errors,[]);
  assert.deepEqual(readFileSync(join(f.root,f.pp)),f.oldRoot);assert(existsSync(join(f.root,f.tp)));assert(!existsSync(join(f.root,f.childPath)));
  assert.equal(readFileSync(join(f.root,'README.md'),'utf8'),'[历史](项目/示例/资料/原始.bin)\n');
});
test('reorganization faults at preparation, movement, publication and reference updates are conditionally recoverable',async t=>{
  for(const phase of ['prepared','moved','published','reference-written'])await t.test(phase,t=>{
    const f=reorganization(t),out=projectGovernance({root:f.root,name:f.name,operation:'reorganize',data:f.data},{fault:at=>{if(at===phase)throw Error('controlled interruption');}});
    assert.equal(out.errors.length,1);assert.equal(out.data.recoveryId,f.data.operationId);assert(f.call().errors.length);
    const recovered=f.call('recover',{operationId:f.data.operationId});assert.deepEqual(recovered.errors,[]);assert.deepEqual(readFileSync(join(f.root,f.pp)),f.oldRoot);assert(f.read().valid);assert(!existsSync(join(f.root,f.childPath)));
  });
});
test('reorganization recovery retains new business files and refuses overwriting concurrent original changes',t=>{
  const f=reorganization(t);assert.deepEqual(f.call('reorganize',f.data).errors,[]);
  const next=join(f.root,'项目/新一轮/未保存成果.txt');writeFileSync(next,'后续真实成果');
  assert(f.call('recover',{operationId:f.data.operationId}).errors.length);assert.equal(readFileSync(next,'utf8'),'后续真实成果');
});
test('reorganization rejects stale baselines, escaped archive targets and project identity replacement before mutation',t=>{
  const f=reorganization(t);
  for(const data of [{...f.data,ifMatch:'stale'},{...f.data,snapshotPath:'档案/项目/示例'},{...f.data,changes:[{...f.data.changes[0],metadata:{...f.data.changes[0].metadata,id:'replacement'}},...f.data.changes.slice(1)]}]){
    assert(f.call('reorganize',data).errors.length);assert(!existsSync(join(f.root,f.data.snapshotPath)));assert.deepEqual(readFileSync(join(f.root,f.pp)),f.oldRoot);
  }
  const r=projectGovernance({root:f.root,name:f.name,operation:'reorganize',data:f.data},{beforeCheck:()=>writeFileSync(join(f.root,'项目/示例/资料/原始.bin'),'并发修改')});
  assert(r.errors.length);assert(!existsSync(join(f.root,f.data.snapshotPath)));assert.equal(readFileSync(join(f.root,'项目/示例/资料/原始.bin'),'utf8'),'并发修改');
});
test('reorganization keeps material symlinks as opaque links without following external targets',{skip:process.platform==='win32'},t=>{
  const f=reorganization(t);writeFileSync(join(f.root,'external.txt'),'保持原样');symlinkSync('../../../external.txt',join(f.root,'项目/示例/资料/外部链接'));
  const result=f.call('reorganize',f.data);assert.deepEqual(result.errors,[]);assert.equal(result.data.inventory.links,1);assert.equal(readlinkSync(join(f.root,f.data.snapshotPath,'资料/外部链接')),'../../../external.txt');assert.equal(readFileSync(join(f.root,'external.txt'),'utf8'),'保持原样');
});
test('reorganization recovery rejects tampered journals and additions to the historical snapshot',t=>{
  const f=reorganization(t);assert.deepEqual(f.call('reorganize',f.data).errors,[]);
  const path=join(f.root,'.agents/runtime-data/projects/governance/operations',f.data.operationId+'.json'),original=readFileSync(path),r=JSON.parse(original);
  r.files[0].path='../outside';writeFileSync(path,JSON.stringify(r));
  assert(f.call('recover',{operationId:f.data.operationId}).errors.length);writeFileSync(path,original);
  const next=join(f.root,f.data.snapshotPath,'后来新增.txt');writeFileSync(next,'保持');
  assert(f.call('recover',{operationId:f.data.operationId}).errors.length);assert.equal(readFileSync(next,'utf8'),'保持');
});

test('interrupted multi-file writes block reads and conditional recovery restores every original',t=>{
  const f=fixture(t);f.initialize();const old=readFileSync(join(f.root,f.tp)),state=f.read(),data={operationId:'interrupted-operation',ifMatch:state.etag,changes:[f.change(f.tp,{next_action:'第二步'}),{path:dirname(f.tp)+'/10-临时结果.txt',ifMatch:'missing',body:'新结果'}]};let writes=0;
  const result=projectGovernance({root:f.root,name:f.name,operation:'apply',data},{fault:phase=>{if(phase==='file-written'&&++writes===1)throw Error('controlled interruption');}});assert(result.errors.length);assert.equal(result.data.recoveryId,data.operationId);assert(f.call().errors.length);
  assert.equal(f.call('recover',{operationId:data.operationId},true).data.wouldChange,true);assert.equal(f.call('recover',{operationId:data.operationId}).data.changed,true);assert.deepEqual(readFileSync(join(f.root,f.tp)),old);assert(!existsSync(join(f.root,dirname(f.tp)+'/10-临时结果.txt')));assert.equal(f.call().errors.length,0);
});
test('recovery refuses subsequent user edits without overwriting any file',t=>{
  const f=fixture(t);f.initialize();const data={operationId:'recover-conflict-op',ifMatch:f.read().etag,changes:[f.change(f.tp,{next_action:'改动'})]};
  projectGovernance({root:f.root,name:f.name,operation:'apply',data},{fault:phase=>{if(phase==='file-written')throw Error('stop');}});writeFileSync(join(f.root,f.tp),readFileSync(join(f.root,f.tp),'utf8')+'\n用户后续内容');
  assert(f.call('recover',{operationId:data.operationId}).errors.length);assert(readFileSync(join(f.root,f.tp),'utf8').includes('用户后续内容'));
});
test('migration preview is read-only, reviewed mapping activates documents, old sources remain byte-identical',t=>{
  const f=fixture(t),plan=emptyProjectPlan();plan.goals=[{id:'g',title:'目标',successCriteria:'得到结果'}];plan.stages=[{id:'s',title:'阶段',goalIds:['g'],description:'目标',criteria:[],state:'active'}];plan.currentStageId='s';
  const task=(id,state)=>({id,title:id,goalIds:['g'],stageId:'s',description:'结果',state,commitment:'candidate',priority:'normal',priorityReason:'',owner:'',dueDate:'',dependsOn:[],blocker:'',nextAction:'验证',acceptance:[],links:[],source:null});plan.items=[task('open','planned'),task('done','completed')];
  const source=JSON.stringify({schemaVersion:1,revision:2,updatedAt:new Date().toISOString(),plan}),old=readFileSync(join(f.root,f.pp));writeFileSync(join(f.root,'项目/示例/项目管理.json'),source);
  const preview=f.call('migrate');assert.equal(preview.errors.length,0);assert.equal(preview.data.inventory.currentItems.length,1);assert.equal(preview.data.inventory.historyItems.length,1);assert(preview.data.inventory.questions.length);assert(!existsSync(join(f.root,'项目/示例/里程碑')));assert(!existsSync(join(f.root,'.agents')));
  const data={operationId:'migrate-example-operation',approvalDigest:preview.data.approvalDigest};const migrated=f.call('migrate',data);assert.deepEqual(migrated.errors,[]);assert.equal(migrated.data.format,'documents');assert.equal(readFileSync(join(f.root,'项目/示例/项目管理.json'),'utf8'),source);assert.equal(f.read().project.metadata.mode,'ongoing');
  const backup=f.read().project.metadata.migration.card_backup;assert.deepEqual(readFileSync(join(f.root,backup)),old);assert.equal(f.call('migrate',data).data.alreadyMigrated,true);
  assert.equal(f.call('recover',{operationId:data.operationId}).data.changed,true);assert.deepEqual(readFileSync(join(f.root,f.pp)),old);assert.equal(readFileSync(join(f.root,'项目/示例/项目管理.json'),'utf8'),source);
});
test('changed migration source invalidates the approval digest',t=>{
  const f=fixture(t),plan=emptyProjectPlan();plan.goals=[{id:'g',title:'目标',successCriteria:'结果'}];plan.stages=[{id:'s',title:'阶段',goalIds:['g'],description:'',criteria:[],state:'planned'}];plan.items=[{id:'a',title:'a',stageId:'s',state:'planned',goalIds:['g'],commitment:'candidate',priority:'normal',owner:'',nextAction:'待明确',blocker:'',dependsOn:[],acceptance:[]}];const p=join(f.root,'项目/示例/项目管理.json');writeFileSync(p,JSON.stringify({schemaVersion:1,revision:1,updatedAt:new Date().toISOString(),plan}));
  const before=f.call('migrate').data;plan.items[0].title='修改';writeFileSync(p,JSON.stringify({schemaVersion:1,revision:2,updatedAt:new Date().toISOString(),plan}));assert(f.call('migrate',{operationId:'changed-migration-op',approvalDigest:before.approvalDigest}).errors.length);assert(!existsSync(join(f.root,'项目/示例/里程碑')));
});
let transitionCount=0;
function paused(f){const out=f.apply([f.change(f.pp,{status:'paused',status_reason:'暂时封存',resume_condition:'有下一阶段输入',next_action:'恢复前核对原目标'})]);assert.deepEqual(out.errors,[]);}
function transitionRequest(f,operation='archive',extra={}){
 const scope=operation==='archive'?'项目':'档案/项目',data={reason:'隔离验收',actor:'测试操作者',targets:[{id:f.p.id,path:scope+'/'+f.name+'/project.md'}],...extra};
 const preview=project({root:f.root,name:f.name,operation,data,dryRun:true});
 return {preview,data:{...data,operationId:'lifecycle-test-'+(++transitionCount),ifMatch:preview.data.ifMatch}};
}
function transition(f,operation='archive',extra={},hooks={}){const p=transitionRequest(f,operation,extra);assert(p.preview.data.allowed,JSON.stringify(p.preview.data.blockers));return project({root:f.root,name:f.name,operation,data:p.data},hooks);}
test('archive/restore preserve paused state, bytes and evidence; preview is nonmutating and replay is conditional',t=>{
 const f=fixture(t);f.initialize();const ev=f.tp.slice(0,-7)+'10-证据.txt';f.apply([{path:ev,ifMatch:'missing',body:'证据'},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,ev,'证据')})]);paused(f);
 const original=readFileSync(join(f.root,f.tp)),p=transitionRequest(f);assert(p.preview.data.allowed);assert(!existsSync(join(f.root,'档案')));
 const archived=project({root:f.root,name:f.name,operation:'archive',data:p.data});assert.equal(archived.errors.length,0);assert(!existsSync(join(f.root,f.pp)));
 const read=projectGovernance({root:f.root,name:f.name,scope:'archived'});assert.deepEqual(read.errors,[]);assert(read.data.valid);assert.equal(read.data.project.metadata.status,'paused');assert(read.data.readOnly);assert.equal(read.data.stale.length,0);
 assert(project({root:f.root,name:f.name,operation:'archive',data:p.data}).data.replayed);
 assert.equal(locateProjectResource(f.root,{path:ev}).bytes.toString(),'证据');assert(f.call('apply',{operationId:'cannot-edit-archive',ifMatch:read.data.etag,changes:[]}).errors.length);
 assert.equal(transition(f,'restore').errors.length,0);assert.equal(f.read().project.metadata.status,'paused');assert.equal(f.read().stale.length,0);assert.equal(readFileSync(join(f.root,ev),'utf8'),'证据');assert.equal(original.toString().split('---').at(-1),readFileSync(join(f.root,f.tp),'utf8').split('---').at(-1));
 assert(!existsSync(join(f.root,'.agents/core/docs')));
});
test('in-progress archive, missing closure and stale previews are rejected without moving files',t=>{
 const f=fixture(t);f.initialize();assert(transitionRequest(f).preview.data.blockers.some(x=>x.code==='PROJECT_ARCHIVE_STATE'));
 assert.throws(()=>project({root:f.root,name:f.name,operation:'archive',reason:'x'}),{code:'PROJECT_TRANSITION_PREVIEW_REQUIRED'});assert(existsSync(join(f.root,f.pp)));
 paused(f);const p=transitionRequest(f);writeFileSync(join(f.root,'项目/示例/新增.txt'),'并发材料');assert.throws(()=>project({root:f.root,name:f.name,operation:'archive',data:p.data}),{code:'PROJECT_GOVERNANCE_CONFLICT'});assert(!existsSync(join(f.root,'档案/项目/示例')));
 f.apply([f.change(f.pp,{status:'cancelled',status_reason:'停止',resume_status:null})]);assert(transitionRequest(f).preview.data.blockers.some(x=>x.code==='PROJECT_ARCHIVE_CLOSURE'));
});
test('explicit parent-child batch preserves both links and rejects an omitted unfinished child',t=>{
 const f=fixture(t);f.initialize();const path='项目/子项目/project.md',child={...defaultMetadata('project','c1','子项目'),status:'paused',owner:'Agent',next_action:'恢复核对',status_reason:'以后继续',resume_status:'planned',resume_condition:'有新输入',parent_project:{id:'p1',path:f.pp},criteria:[{id:'c',text:'结果'}]};
 assert.deepEqual(f.apply([f.change(f.pp,{child_projects:[{id:'c1',path}]}),{path,ifMatch:'missing',metadata:child,body:'# 子项目\n保留当前判断。'}]).errors,[]);paused(f);
 assert(transitionRequest(f).preview.data.blockers.some(x=>x.code==='PROJECT_ARCHIVE_CHILD'));
 const targets=[{id:'p1',path:f.pp},{id:'c1',path}];assert.equal(transition(f,'archive',{targets}).errors.length,0);
 const childRead=projectGovernance({root:f.root,name:'子项目',scope:'archived'}).data;assert.equal(childRead.project.metadata.parent_project.path,'档案/项目/示例/project.md');assert.equal(childRead.project.metadata.parent_project.id,'p1');assert(childRead.valid);
 assert.equal(transition(f,'restore',{targets:targets.map(t=>({...t,path:t.path.replace('项目/','档案/项目/')}))}).errors.length,0);assert(f.read().valid);assert.equal(f.read().project.metadata.status,'paused');
});
test('completed archive pins relocated Markdown evidence; real later edits still invalidate acceptance',t=>{
 const f=fixture(t);f.initialize();const ev=f.tp.slice(0,-7)+'10-结果.txt';f.apply([{path:ev,ifMatch:'missing',body:'结果'},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,ev,'结果')})]);
 const taskBytes=readFileSync(join(f.root,f.tp)),mr=dirname(f.mp)+'/复盘.md',pr=dirname(f.pp)+'/项目复盘.md';
 const review=(id,subject,path,evidence)=>({...defaultMetadata('review',id,'验收复盘'),status:'completed',outcome:'passed',subject:{id:subject.id,path},basis_digest:criteriaDigest(subject),criterion_results:f.proof(subject,evidence.path,evidence.bytes).results});
 const mReview=review('mr',f.m,f.mp,{path:f.tp,bytes:taskBytes}),pReview=review('pr',f.p,f.pp,{path:f.tp,bytes:taskBytes});
 assert.deepEqual(f.apply([{path:mr,ifMatch:'missing',metadata:mReview,body:'# 阶段复盘'},{path:pr,ifMatch:'missing',metadata:pReview,body:'# 项目复盘'},f.change(f.mp,{status:'completed',review_ref:{id:'mr',path:mr},next_action:null}),f.change(f.pp,{status:'completed',review_ref:{id:'pr',path:pr},next_action:null})]).errors,[]);
 const pp='项目/依赖项目/project.md',mp='项目/依赖项目/M1-继续/milestone.md',tp='项目/依赖项目/M1-继续/T1-采用/task.md';
 const p2={...defaultMetadata('project','p2','依赖项目'),status:'active',owner:'Agent',next_action:'采用前置结果',criteria:[{id:'c',text:'采用有效结果'}],milestones:[{id:'m2',path:mp}]},m2={...defaultMetadata('milestone','m2','继续'),status:'active',project:{id:'p2',path:pp},criteria:[{id:'c',text:'阶段结果'}],tasks:[{id:'t2',path:tp}]},t2={...defaultMetadata('task','t2','采用'),owner:'Agent',next_action:'采用已有结果',commitment:'next',project:{id:'p2',path:pp},milestone:{id:'m2',path:mp},criteria:[{id:'c',text:'结果'}],depends_on:[{id:'t1',path:f.tp}]};
 assert.deepEqual(f.apply([[pp,p2],[mp,m2],[tp,t2]].map(([path,metadata])=>({path,ifMatch:'missing',metadata,body:'# 依赖工作'}))).errors,[]);
 transition(f);const ar=projectGovernance({root:f.root,name:f.name,scope:'archived'}).data;assert.deepEqual(ar.stale,[]);assert(projectGovernance({root:f.root,name:'依赖项目'}).data.projection.ready.includes('t2'));const found=locateProjectResource(f.root,{path:f.tp,digest:hash(taskBytes)});assert(found.historical);assert(found.bytes.equals(taskBytes));
 transition(f,'restore');assert.deepEqual(f.read().stale,[]);writeFileSync(join(f.root,f.tp),readFileSync(join(f.root,f.tp),'utf8')+'\n人为改变结果');assert(f.read().stale.includes('p1'));
});
test('cancelled closure can archive without fabricating passed criteria',t=>{
 const f=fixture(t);f.initialize();const path='项目/示例/项目复盘.md',review={...defaultMetadata('review','cancel_review','停止复盘'),status:'completed',outcome:'cancelled',subject:{id:'p1',path:f.pp}};
 assert.deepEqual(f.apply([f.change(f.pp,{status:'cancelled',status_reason:'方向改变',review_ref:{id:review.id,path}}),{path,ifMatch:'missing',metadata:review,body:'# 停止\n已有调研结果保留，后续不继续，无对外承诺。'}]).errors,[]);transition(f);const ar=projectGovernance({root:f.root,name:f.name,scope:'archived'}).data;assert.equal(ar.project.metadata.status,'cancelled');assert.equal(ar.documents.find(d=>d.metadata.id==='cancel_review').metadata.outcome,'cancelled');
});
test('interrupted archive at every publication phase rolls back exact bytes and protects later edits',async t=>{
 for(const phase of ['prepared','moved','reference-written','completed'])await t.test(phase,t=>{
  const f=fixture(t);f.initialize();paused(f);const before=readFileSync(join(f.root,f.pp));let id;
  try{transition(f,'archive',{}, {fault:at=>{if(at===phase)throw Error('controlled');}});}catch(e){id=e.details.recoveryId;}
  assert(id);assert(f.call().errors.length);assert.equal(f.call('recover',{operationId:id},true).errors.length,0);assert.equal(f.call('recover',{operationId:id}).errors.length,0);assert(readFileSync(join(f.root,f.pp)).equals(before));
 });
 const f=fixture(t);f.initialize();paused(f);let id;try{transition(f,'archive',{}, {fault:at=>{if(at==='reference-written')throw Error('controlled');}});}catch(e){id=e.details.recoveryId;}
 writeFileSync(join(f.root,'档案/项目/示例/新内容.txt'),'人工新内容');const r=f.call('recover',{operationId:id});assert(r.errors.length);assert.equal(readFileSync(join(f.root,'档案/项目/示例/新内容.txt'),'utf8'),'人工新内容');
});

test('restoring only a child never bypasses an archived ancestor execution guard',t=>{
 const f=fixture(t);f.initialize();const ap='档案/项目/祖先/project.md',a={...defaultMetadata('project','ancestor','祖先'),status:'paused',status_reason:'封存',resume_status:'active',resume_condition:'恢复后核对',next_action:'恢复',criteria:[{id:'c',text:'结果'}],child_projects:[{id:'p1',path:f.pp}]};mkdirSync(join(f.root,'档案/项目/祖先'),{recursive:true});writeFileSync(join(f.root,ap),'---\n'+JSON.stringify(a)+'\n---\n# 历史封存现场');
 assert.deepEqual(f.apply([f.change(f.pp,{parent_project:{id:'ancestor',path:ap}})]).errors,[]);assert(!f.read().projection.ready.includes('t1'));assert(f.read().projection.readiness.find(x=>x.id==='t1').reasons.some(r=>r.includes('已归档')));assert(f.apply([f.change(f.tp,{status:'active'})]).errors.length);
});
