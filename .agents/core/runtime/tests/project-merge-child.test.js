import test from 'node:test';
import assert from 'node:assert/strict';
import {join,dirname} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync} from 'node:fs';
import {fixture} from './helpers/governance-fixture.js';
import {defaultMetadata,hash,encodeDocument,criteriaDigest} from '../src/projects/governance/model.js';
import {projectGovernance} from '../src/services/project-governance.js';
import {locateProjectResource} from '../src/projects/governance/locations.js';
import {confirmationValid} from '../src/projects/governance/confirmation.js';
import {readGovernance} from '../src/projects/governance/store.js';
import {materialInventory} from '../src/projects/governance/reorganize.js';
import {taskExecution,executionStatus} from '../src/projects/task-execution.js';
import {runProjectGovernanceCommand} from '../src/commands/project-governance.js';
import {resolveExistingTarget,definitionContext} from '../src/routing/definitions.js';
import {bindCurrentWork,readCurrentWork} from '../src/services/work-context.js';

const content=xs=>xs.map(({stamp,...e})=>e);
function setup(t,{completed=false,numbered=false}={}){
 const f=fixture(t,'子项');assert.deepEqual(f.initialize().errors,[]);
 if(numbered){const stages=[{code:'B',name:'实施',purpose:'取得结果',exit_criteria:'可核验'}];const data={operationId:'merge-prior-numbering',actor:'测试',reason:'定义字母阶段',ifMatch:f.read().etag,milestones:[{id:'m1',task_stages:stages,tasks:[{id:'t1',code:'B1'}]}]};const p=f.call('renumber',data,true);assert.deepEqual(p.errors,[]);assert.deepEqual(f.call('renumber',{...data,ifMatch:p.data.ifMatch}).errors,[]);f.tp=f.read().documents.find(d=>d.metadata.id==='t1').path;}
 const pp='项目/父项/project.md',parent={...defaultMetadata('project','parent1','父项目'),status:'active',owner:'测试',next_action:'继续原有任务',criteria:[{id:'parent_done',text:'父级交付'}],goals:[{id:'parent_goal',title:'持续发展'}]};
 const m2='项目/子项/M2-后续/milestone.md',stage={...defaultMetadata('milestone','m2','后续'),project:{id:'p1',path:f.pp},goal_ids:['g1']};
 assert.deepEqual(f.apply([f.change(f.pp,{parent_project:{id:parent.id,path:pp},milestones:[...f.read().project.metadata.milestones,{id:'m2',path:m2}]}),{path:pp,ifMatch:'missing',metadata:{...parent,child_projects:[{id:'p1',path:f.pp}]},body:'# 父项目\n保留原有安排。\n'},{path:m2,ifMatch:'missing',metadata:stage,body:'# 待启动\n'}]).errors,[]);
 const raw=dirname(f.tp)+'/10-原始.bin',rawBytes=Buffer.alloc(3*1024*1024,147);writeFileSync(join(f.root,raw),rawBytes);
 const prose=dirname(f.mp)+'/M00-旧相对入口.md';writeFileSync(join(f.root,prose),'[后续](../M2-后续/milestone.md)\n[任务]('+dirname(f.tp).split('/').at(-1)+'/task.md)\n');
 mkdirSync(join(f.root,'项目/父项/M2-后续'),{recursive:true});writeFileSync(join(f.root,'项目/父项/M2-后续/milestone.md'),'别的阶段，不能误选');
 writeFileSync(join(f.root,'项目/子项/灵感闪现.md'),'原子项目手记\n');writeFileSync(join(f.root,'项目/父项/灵感闪现.md'),'父项目手记\n');
 const pack='项目/子项/成果/测试-v1.ksfapp';mkdirSync(dirname(join(f.root,pack)),{recursive:true});writeFileSync(join(f.root,pack),rawBytes);
 let rp,confirmation;
 if(completed){const ev=dirname(f.tp)+'/20-证据.md',text='已验证';rp=dirname(f.mp)+'/复盘.md';const review={...defaultMetadata('review','review1','阶段复盘'),status:'completed',outcome:'passed',subject:{id:'m1',path:f.mp},basis_digest:criteriaDigest(f.m),criterion_results:f.proof(f.m,ev,text).results};
  assert.deepEqual(f.apply([{path:ev,ifMatch:'missing',body:text},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,ev,text)})]).errors,[]);
  assert.deepEqual(f.confirm([f.change(f.mp,{status:'completed',next_action:null,review_ref:{id:'review1',path:rp}}),f.change(rp,review,'# 原验收\n实际阶段通过。\n')]).errors,[]);
  confirmation=f.read().documents.find(d=>d.path===rp).metadata.user_confirmation;
 }
 const call=(operation,data,dryRun=false,hooks={})=>projectGovernance({root:f.root,name:'父项',operation,data,dryRun},hooks);
 const data={operationId:'merge-child-operation',source:'子项',snapshotPath:'档案/项目历史资料/子项/合并前',materialDirectory:'资料/日常工作流',milestones:[{id:'m1',directory:'M5-交付'},{id:'m2',directory:'M6-后续'}]};
 const preview=call('merge-child',data,true);assert.deepEqual(preview.errors,[],JSON.stringify(preview));
 return {...f,ppParent:pp,m2,raw,rawBytes,prose,pack,rp,confirmation,merge:call,data:{...data,ifMatch:preview.data.ifMatch},preview};
}
test('merge preview is read-only; stable tasks, materials, stage states and notes survive; retries do not duplicate',t=>{
 const f=setup(t),before=content(materialInventory(join(f.root,'项目/子项'))),parentNote=readFileSync(join(f.root,'项目/父项/灵感闪现.md'));
 assert(!existsSync(join(f.root,'档案')));assert(!existsSync(join(f.root,'项目/父项/M5-交付')));
 const saved=f.merge('merge-child',f.data);assert.deepEqual(saved.errors,[],JSON.stringify(saved));assert(saved.data.valid);assert(!existsSync(join(f.root,'项目/子项')));
 assert.deepEqual(content(materialInventory(join(f.root,f.data.snapshotPath))),before);const state=f.merge('read').data;
 assert.equal(state.project.metadata.id,'parent1');assert.deepEqual(state.project.metadata.child_projects,[]);assert.equal(state.documents.find(d=>d.metadata.id==='t1').metadata.status,'planned');assert.equal(state.documents.find(d=>d.metadata.id==='m2').metadata.status,'planned');
 assert(readFileSync(join(f.root,'项目/父项/灵感闪现.md')).equals(parentNote));assert.equal(readFileSync(join(f.root,'项目/父项/资料/日常工作流/灵感闪现.md'),'utf8'),'原子项目手记\n');
 assert(locateProjectResource(f.root,{path:f.raw}).bytes.equals(f.rawBytes));assert(locateProjectResource(f.root,{path:f.pack}).bytes.equals(f.rawBytes));assert.equal(locateProjectResource(f.root,{path:f.pp,id:'p1',metadataOnly:true}).path,f.ppParent);
 assert(f.merge('merge-child',f.data).data.replayed);assert(f.merge('merge-child',{...f.data,materialDirectory:'资料/别的'}).errors.length);
});
test('native confirmation is inherited unchanged; business/evidence changes still invalidate it; protected history cannot be forged',t=>{
 const f=setup(t,{completed:true,numbered:true}),oldTask=readFileSync(join(f.root,f.tp)),oldReview=readFileSync(join(f.root,f.rp));
 assert.deepEqual(f.merge('merge-child',f.data).errors,[]);const state=readGovernance(f.root,'父项');assert.deepEqual(state.stale,[]);
 const m=state.graph.byId.get('m1'),r=state.graph.byId.get('review1');assert.deepEqual(r.metadata.user_confirmation,f.confirmation);assert(confirmationValid(m,r,state.graph));assert.equal(r.body,f.read().documents?.find(d=>d.metadata.id==='review1')?.body??r.body);
 assert(locateProjectResource(f.root,{path:f.tp,digest:hash(oldTask)}).bytes.equals(oldTask));assert(locateProjectResource(f.root,{path:f.rp,digest:hash(oldReview)}).bytes.equals(oldReview));
 const preNumbering='项目/子项/M1-交付/T1-验证/task.md';assert.equal(locateProjectResource(f.root,{path:preNumbering}).path,state.graph.byId.get('t1').path);
 const req={operationId:'cannot-forge-merge-history',ifMatch:state.etag,changes:[{path:f.ppParent,ifMatch:state.project.etag,metadata:{project_merge_history:[]}}]};assert.equal(f.merge('apply',req).errors[0].code,'PROJECT_MERGE_HISTORY');
 writeFileSync(join(f.root,dirname(state.graph.byId.get('t1').path),'20-证据.md'),'被修改');assert(readGovernance(f.root,'父项').stale.includes('m1'));
});
test('relative prose follows the original authoring base even when the parent has a conflicting M2',t=>{
 const f=setup(t);assert.deepEqual(f.merge('merge-child',f.data).errors,[]);const source=locateProjectResource(f.root,{path:f.prose}).path;
 assert.equal(locateProjectResource(f.root,{source,path:'../M2-后续/milestone.md'}).path,'项目/父项/M6-后续/milestone.md');
});
test('old chat bindings resolve the merged project and task without rewriting their stored facts',t=>{
 const f=setup(t),options={root:f.root,identity:{host:'codex',sessionId:'merge-resume-test'}},current={schemaVersion:1,goal:'接续原任务',status:'active',ownership:{state:'bound',target:{kind:'project',name:'子项',scope:'current'}},relatedTargets:[],executor:null,methods:[],files:[],taskRef:f.tp};
 bindCurrentWork({...options,current,ifMatch:'missing'});const before=readCurrentWork(options);assert.deepEqual(f.merge('merge-child',f.data).errors,[]);
 const after=readCurrentWork(options);assert.equal(after.etag,before.etag);assert.deepEqual(after.current,before.current);assert(!after.executionBlocked);assert(after.lifecycle.some(e=>e.code==='PROJECT_WORK_MERGED'));
 const actual=resolveExistingTarget(definitionContext(f.root),current.ownership.target);assert.equal(actual.name,'父项');assert.equal(actual.path,f.ppParent);assert.equal(after.execution.task.id,'t1');
});
test('stale material and parent baselines, occupied codes, unsafe paths and active child claims reject without mutation',t=>{
 const f=setup(t),request=structuredClone(f.data);writeFileSync(join(f.root,'项目/子项/新资料.txt'),'并发');assert.equal(f.merge('merge-child',request).errors[0].code,'PROJECT_MERGE_CONFLICT');
 assert.deepEqual(f.apply([f.change(f.tp,{status:'active'})]).errors,[]);
 const p=f.merge('merge-child',{...request,ifMatch:undefined},true);const current={...request,ifMatch:p.data.ifMatch};
 for(const directory of ['M2-已占用','../逃逸','M5-交付/下层']){const data={...current,milestones:[{id:'m1',directory},{id:'m2',directory:'M6-后续'}]};assert(f.merge('merge-child',data,true).errors.length);}
 const claim=taskExecution(f.root,{chatId:'another-chat',action:'acquire',taskRef:f.tp});assert(claim);assert.equal(f.merge('merge-child',current).errors[0].code,'PROJECT_EXECUTION_BUSY');assert(existsSync(join(f.root,f.pp)));assert(!existsSync(join(f.root,f.data.snapshotPath)));
});
test('parent edits between validation and writing reject without overwriting them',t=>{
 const f=setup(t),out=f.merge('merge-child',f.data,false,{beforeCheck:()=>writeFileSync(join(f.root,f.ppParent),Buffer.concat([readFileSync(join(f.root,f.ppParent)),Buffer.from('\n并发编辑\n')]))});assert.equal(out.errors[0].code,'PROJECT_MERGE_CONFLICT');assert(readFileSync(join(f.root,f.ppParent),'utf8').endsWith('并发编辑\n'));assert(existsSync(join(f.root,f.pp)));
});
test('parent dependencies relocate while another parent task and its execution claim stay byte-identical',t=>{
 const f=setup(t),mp='项目/父项/M3-并行/milestone.md',linked=dirname(mp)+'/T1-引用/task.md',busy=dirname(mp)+'/T2-并行/task.md',parent={id:'parent1',path:f.ppParent},stage={...defaultMetadata('milestone','parent_stage','并行'),status:'active',project:parent,next_action:'继续并行',criteria:[{id:'parent_stage_done',text:'完成并行结果'}],tasks:[{id:'linked_task',path:linked},{id:'busy_task',path:busy}]};
 const task=id=>({...defaultMetadata('task',id,id),project:parent,milestone:{id:stage.id,path:mp},owner:'测试',next_action:'继续任务',criteria:[{id:'done',text:'取得结果'}],commitment:'now'});
 let s=f.merge('read').data;assert.deepEqual(f.merge('apply',{operationId:'prepare-parent-references',ifMatch:s.etag,changes:[{path:f.ppParent,ifMatch:s.project.etag,metadata:{milestones:[{id:stage.id,path:mp}]}},{path:mp,ifMatch:'missing',metadata:stage,body:'# 保持原位\n'},{path:linked,ifMatch:'missing',metadata:{...task('linked_task'),depends_on:[{id:'m1',path:f.mp}]},body:'# 原引用正文\n'},{path:busy,ifMatch:'missing',metadata:{...task('busy_task'),status:'active'},body:'# 其他聊天正在执行\n'}]}).errors,[]);
 const before=readFileSync(join(f.root,busy)),claim=taskExecution(f.root,{chatId:'other-parent-chat',action:'acquire',taskRef:busy});
 const p=f.merge('merge-child',{...f.data,ifMatch:undefined},true);assert.deepEqual(p.errors,[]);assert.deepEqual(f.merge('merge-child',{...f.data,ifMatch:p.data.ifMatch}).errors,[]);
 s=f.merge('read').data;assert.equal(s.documents.find(d=>d.metadata.id==='linked_task').metadata.depends_on[0].path,'项目/父项/M5-交付/milestone.md');assert(readFileSync(join(f.root,busy)).equals(before));assert.equal(executionStatus(f.root,busy,'other-parent-chat').claim.token,claim.claim.token);
});
test('each interrupted publication boundary supports read-only recovery preview and exact rollback',async t=>{
 for(const phase of ['backed-up','material-written','document-written','validated','retired'])await t.test(phase,t=>{
  const f=setup(t,{completed:true}),before=content(materialInventory(join(f.root,'项目'))),out=f.merge('merge-child',f.data,false,{fault:at=>{if(at===phase)throw Error('controlled interruption');}});assert(out.errors.length);assert.equal(out.data.recoveryId,f.data.operationId);
  assert.deepEqual(f.merge('recover',{operationId:f.data.operationId},true).errors,[]);assert.deepEqual(f.merge('recover',{operationId:f.data.operationId}).errors,[]);
  assert.deepEqual(content(materialInventory(join(f.root,'项目'))),before);assert(f.read().valid);assert.deepEqual(f.read().stale,[]);
 });
});
test('recovery refuses later destination edits, preserving the source, backup and new content',t=>{
 const f=setup(t),out=f.merge('merge-child',f.data,false,{fault:at=>{if(at==='validated')throw Error('stop');}});assert(out.errors.length);const extra='项目/父项/M5-交付/新增.txt';writeFileSync(join(f.root,extra),'新成果');assert(f.merge('recover',{operationId:f.data.operationId}).errors.length);assert.equal(readFileSync(join(f.root,extra),'utf8'),'新成果');assert(existsSync(join(f.root,f.pp)));assert(existsSync(join(f.root,f.data.snapshotPath)));
});
test('CLI exposes preview and malformed requests return structured errors',t=>{
 const f=setup(t),out=runProjectGovernanceCommand(['merge-child','父项','--data',JSON.stringify({...f.data,ifMatch:undefined}),'--dry-run','--json'],f.root);assert.equal(out.exitCode,0);assert(JSON.parse(out.stdout).data.wouldChange);
 assert.equal(runProjectGovernanceCommand(['merge-child','父项','--data','{}','--json'],f.root).exitCode,1);
 symlinkSync('../父项',join(f.root,'项目/子项/外部'));assert(f.merge('merge-child',{...f.data,ifMatch:undefined},true).errors.length);
});
