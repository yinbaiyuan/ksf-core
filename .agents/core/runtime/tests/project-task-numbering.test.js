import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fixture} from './helpers/governance-fixture.js';
import {hash} from '../src/projects/governance/model.js';
import {locateProjectResource} from '../src/projects/governance/locations.js';
import {project} from '../src/services/projects.js';
import {projectGovernance} from '../src/services/project-governance.js';
import {taskCode,nextTaskCode} from '../src/projects/governance/task-codes.js';
import {inventory} from '../src/services/project-transitions.js';
const preserved=entries=>entries.map(({ino,dev,...entry})=>entry);
const stages=[{code:'B',name:'实施',purpose:'取得可检查结果',exit_criteria:'可以验收'},{code:'A',name:'准备',purpose:'细化输入',exit_criteria:'可执行'},{code:'Z',name:'验收复盘',purpose:'核对交付',exit_criteria:'本层结论明确'}];
function setup(t){const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);return f;}
let count=0;
function request(f,code='B1'){
 const data={operationId:'renumber-test-'+(++count),ifMatch:f.read().etag,actor:'测试',reason:'字母阶段',milestones:[{id:'m1',task_stages:stages,tasks:[{id:'t1',code}]}]};
 const preview=f.call('renumber',data,true);assert.deepEqual(preview.errors,[]);return {preview,data:{...data,ifMatch:preview.data.ifMatch}};
}
test('numbering preview writes nothing; commit preserves ID, state, body, context bytes and old links',t=>{
 const f=setup(t),ev=dirname(f.tp)+'/10-数据.bin',text=Buffer.from([0,255,31,137]);writeFileSync(join(f.root,ev),text);
 const oldBody=f.read().documents.find(d=>d.path===f.tp).body,old=readFileSync(join(f.root,f.tp)),before=inventory(join(f.root,'项目')),r=request(f);
 assert.deepEqual(inventory(join(f.root,'项目')),before);const done=f.call('renumber',r.data);assert.deepEqual(done.errors,[]);assert(done.data.valid);const task=done.data.documents.find(d=>d.metadata.id==='t1');assert.equal(task.metadata.task_code,'B1');assert.equal(task.metadata.status,'planned');assert.equal(task.body,oldBody);assert(!existsSync(join(f.root,f.tp)));
 assert(locateProjectResource(f.root,{path:ev}).bytes.equals(text));assert.equal(locateProjectResource(f.root,{path:'10-数据.bin',source:task.path}).bytes.toString('hex'),text.toString('hex'));assert(locateProjectResource(f.root,{path:f.tp,digest:hash(old)}).bytes.equals(old));assert.equal(f.call('renumber',r.data).data.replayed,true);assert(!existsSync(join(f.root,'.agents/core/docs')));
});
test('numbering preserves verification and invalidates genuinely changed evidence',t=>{
 const f=setup(t),ev=dirname(f.tp)+'/10-证据.txt';f.apply([{path:ev,ifMatch:'missing',body:'结果'},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,ev,'结果')})]);const old=readFileSync(join(f.root,f.tp));const r=request(f);assert.deepEqual(f.call('renumber',r.data).errors,[]);assert.deepEqual(f.read().stale,[]);assert(locateProjectResource(f.root,{path:f.tp,digest:hash(old)}).historical);writeFileSync(join(f.root,locateProjectResource(f.root,{path:ev}).path),'真实改动');assert(f.read().stale.includes('t1'));
});
test('duplicate, missing, zero, lowercase or undefined stage mappings reject before mutation',t=>{
 const f=setup(t),r=request(f),old=readFileSync(join(f.root,f.pp));for(const code of ['A0','a1','B01','AA1','C1','Z','T1']){const data={...r.data,operationId:'invalid-'+(++count),ifMatch:f.read().etag,milestones:[{...r.data.milestones[0],tasks:[{id:'t1',code}]}]};assert(f.call('renumber',data,true).errors.length);assert(readFileSync(join(f.root,f.pp)).equals(old));}assert(f.call('renumber',{...r.data,milestones:[{...r.data.milestones[0],tasks:[]}]}).errors.length);
});
test('task codes remain unique and match folders; stable IDs cannot be edited',t=>{
 const f=setup(t),r=request(f);f.call('renumber',r.data);const task=f.read().documents.find(d=>d.metadata.id==='t1');assert(f.apply([f.change(task.path,{task_code:'B2'})]).errors.length);assert(f.apply([f.change(task.path,{id:'replacement'})]).errors.length);assert(f.apply([f.change(f.mp,{task_stages:[stages[0],stages[0]]})]).errors.length);assert(f.apply([f.change(f.pp,{task_numbering_history:[]})]).errors.length);
});
test('letters impose no implicit dependency; Z follows ordinary status/type readiness',t=>{
 const f=setup(t),r=request(f,'Z1');f.call('renumber',r.data);const task=f.read().documents.find(d=>d.metadata.id==='t1');assert(f.read().projection.ready.includes('t1'));assert.deepEqual(f.apply([f.change(task.path,{work_type:'acceptance'}),f.change(f.mp,{status:'review'})]).errors,[]);assert(f.read().projection.ready.includes('t1'));assert.deepEqual(f.apply([f.change(task.path,{status:'active'})]).errors,[]);
});
test('new-stage paths support raw numbered contexts and ignore numbering gaps or cancelled tasks',t=>{
 const f=setup(t),r=request(f);f.call('renumber',r.data);const task=f.read().documents.find(d=>d.metadata.id==='t1'),path=dirname(task.path)+'/20-输入.json',bytes=Buffer.from('💡 原始信息\n');assert.deepEqual(f.apply([{path,ifMatch:'missing',contentBase64:bytes.toString('base64')}]).errors,[]);assert(readFileSync(join(f.root,path)).equals(bytes));assert.equal(nextTaskCode('B',[{metadata:{task_code:'B1'}},{metadata:{task_code:'B8',status:'cancelled'}}]),'B9');assert(!taskCode('Z01'));
});
test('stale previews and destination collisions preserve all existing files',t=>{
 const f=setup(t),r=request(f);writeFileSync(join(f.root,dirname(f.tp),'10-新文件.txt'),'并发内容');assert(f.call('renumber',r.data).errors.length);assert(existsSync(join(f.root,f.tp)));const latest=request(f);mkdirSync(join(f.root,dirname(f.tp).replace('T1-','B1-')));assert(f.call('renumber',latest.data).errors.length);assert(existsSync(join(f.root,f.tp)));
});
test('interrupted renumbering recovers exact bytes at every publication boundary',async t=>{
 for(const phase of ['prepared','moved','reference-written','completed'])await t.test(phase,t=>{const f=setup(t),old=preserved(inventory(join(f.root,'项目'))),r=request(f),out=projectGovernance({root:f.root,name:f.name,operation:'renumber',data:r.data},{fault:at=>{if(at===phase)throw Error('controlled interruption');}});assert(out.errors.length);assert.equal(out.data.recoveryId,r.data.operationId);assert(f.call().errors.length);assert.deepEqual(f.call('recover',{operationId:r.data.operationId},true).errors,[]);assert.deepEqual(f.call('recover',{operationId:r.data.operationId}).errors,[]);assert.deepEqual(preserved(inventory(join(f.root,'项目'))),old);assert(f.read().valid);});
});
test('recovery refuses later user edits or additions and keeps both locations intact',t=>{
 const f=setup(t),r=request(f);f.call('renumber',r.data);const task=f.read().documents.find(d=>d.metadata.id==='t1'),extra=join(f.root,dirname(task.path),'20-用户新增.txt');writeFileSync(extra,'后续成果');assert(f.call('recover',{operationId:r.data.operationId}).errors.length);assert.equal(readFileSync(extra,'utf8'),'后续成果');assert(!existsSync(join(f.root,f.tp)));
});
test('renumbering and archive/restore compose old source links and history evidence',t=>{
 const f=setup(t),old=readFileSync(join(f.root,f.tp)),ev=dirname(f.tp)+'/10-原文.md';writeFileSync(join(f.root,ev),'[任务](task.md)');const r=request(f);assert.deepEqual(f.call('renumber',r.data).errors,[]);f.apply([f.change(f.pp,{status:'paused',status_reason:'稍后继续',resume_condition:'有输入',next_action:'核对现状'})]);
 for(const operation of ['archive','restore']){const q={reason:'隔离验证',actor:'测试'},preview=project({root:f.root,name:f.name,operation,data:q,dryRun:true});assert(preview.data.allowed,JSON.stringify(preview));const out=project({root:f.root,name:f.name,operation,data:{...q,operationId:'numbering-'+operation+'-'+(++count),ifMatch:preview.data.ifMatch}});assert.deepEqual(out.errors,[]);assert(locateProjectResource(f.root,{path:f.tp,digest:hash(old)}).bytes.equals(old));const source=locateProjectResource(f.root,{path:ev}).path;assert.equal(locateProjectResource(f.root,{path:'task.md',source}).path,locateProjectResource(f.root,{path:f.tp}).path);}
});
