import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {fixture} from './helpers/governance-fixture.js';
import {projectGovernance} from '../src/services/project-governance.js';
import {runProjectGovernanceCommand} from '../src/commands/project-governance.js';
import {inventory} from '../src/services/project-transitions.js';
const stages=['A','B','C','Z'].map(code=>({code,name:code+'阶段',purpose:'形成明确结果',exit_criteria:'当前结果足以继续'}));
function setup(t){
 const f=fixture(t);f.tp=f.tp.replace('/T1-','/B1-');f.task.task_code='B1';f.m.task_stages=stages;f.m.tasks=[{id:'t1',path:f.tp}];
 assert.deepEqual(f.apply([f.change(f.pp,f.p,'# 项目\n'),f.change(f.mp,f.m,'# 当前里程碑\n'),{path:f.tp,ifMatch:'missing',metadata:f.task,body:'# 已有任务\n'}]).errors,[]);return f;
}
let count=0;
const dataFor=f=>({operationId:'create-task-test-'+(++count),milestone:{id:'m1',path:f.mp},stage:'B',name:'验证自动建档',owner:'Agent',criteria:[{id:'done',text:'取得可验证结果'}],next_action:'核对实际输入',goal_ids:['g1']});
function request(f,patch={}){const data={...dataFor(f),...patch},preview=f.call('create-task',data,true);assert.deepEqual(preview.errors,[]);return {preview,data:{...data,ifMatch:preview.data.ifMatch}};}
const preserved=entries=>entries.map(({ino,dev,...e})=>e);
test('new letter task preview is read-only; commit creates task.md and its personal note with both ownership/index links',t=>{
 const f=setup(t),before=inventory(f.root),r=request(f);assert.deepEqual(inventory(f.root),before);assert.equal(r.preview.data.task.code,'B2');assert.equal(r.preview.data.numberReserved,false);
 const out=f.call('create-task',r.data);assert.deepEqual(out.errors,[]);assert.equal(out.data.task.code,'B2');const d=out.data.documents.find(d=>d.metadata.id===out.data.task.id),m=out.data.documents.find(d=>d.path===f.mp);assert.equal(d.metadata.status,'planned');assert.equal(d.metadata.commitment,'candidate');assert.equal(d.metadata.task_code,'B2');assert.deepEqual(d.metadata.milestone,{id:'m1',path:f.mp});assert(m.metadata.tasks.some(r=>r.id===d.metadata.id&&r.path===d.path));assert.equal(m.metadata.task_counters.B,2);assert.deepEqual(readdirSync(join(f.root,dirname(d.path))).sort(),['task.md','灵感闪现.md']);assert(!existsSync(join(f.root,'.agents/core/docs')));
});
test('cancelled numbers, detached/deleted directories and later renumbering never lower the allocation',t=>{
 const f=setup(t),r=request(f),created=f.call('create-task',r.data).data.task;assert.deepEqual(f.apply([f.change(created.path,{status:'cancelled',status_reason:'不再需要',next_action:null})]).errors,[]);
 const m=f.read().documents.find(d=>d.path===f.mp),map={operationId:'create-renumber-cancelled',ifMatch:f.read().etag,actor:'测试',reason:'调整任务阶段',milestones:[{id:'m1',task_stages:stages,tasks:m.metadata.tasks.map(t=>({id:t.id,code:t.id===created.id?'C1':'B1'}))}]},p=f.call('renumber',map,true);assert.deepEqual(p.errors,[]);assert.deepEqual(f.call('renumber',{...map,ifMatch:p.data.ifMatch}).errors,[]);
 const again=f.call('create-task',r.data);assert(again.data.replayed);assert.equal(again.data.task.code,'C1');assert.equal(f.call('create-task',request(f).data).data.task.code,'B3');
 const current=f.read(),task=current.documents.find(d=>d.metadata.id===created.id),stage=current.documents.find(d=>d.path===f.mp);assert.deepEqual(f.apply([f.change(f.mp,{tasks:stage.metadata.tasks.filter(r=>r.id!==created.id)})]).errors,[]);rmSync(join(f.root,dirname(task.path)),{recursive:true});assert.equal(f.call('create-task',request(f,{stage:'C'}).data).data.task.code,'C2');
 assert(f.apply([f.change(f.mp,{task_counters:{B:0,C:0}})]).errors.length);
});
test('unindexed occupied directory numbers are skipped without overwriting their contents',t=>{
 const f=setup(t),path=dirname(f.mp)+'/B8-人工保留';mkdirSync(join(f.root,path));writeFileSync(join(f.root,path,'原文.txt'),'保留');const r=request(f);assert.equal(r.preview.data.task.code,'B9');assert.deepEqual(f.call('create-task',r.data).errors,[]);assert.equal(readFileSync(join(f.root,path,'原文.txt'),'utf8'),'保留');
});
test('M10 context packages coexist with M10 task and cannot be taken over by auto creation',t=>{
 const f=setup(t),parent=dirname(f.mp),scope={code:'M',name:'共用样本检查',purpose:'检查任务取号',exit_criteria:'文件归属正确'};
 assert.deepEqual(f.apply([f.change(f.mp,{task_stages:[...stages,scope]})]).errors,[]);
 const old=parent+'/M9-历史任务';mkdirSync(join(f.root,old));writeFileSync(join(f.root,old,'task.md'),'# 预留任务');
 const pack=parent+'/M10-共用样本',sample=pack+'/00-原文.txt';
 assert.deepEqual(f.apply([{path:sample,ifMatch:'missing',body:'原文'}]).errors,[]);
 const conflict=f.call('create-task',{...dataFor(f),stage:'M',name:'共用样本'},true);
 assert(conflict.errors.some(e=>e.code==='PROJECT_TASK_CREATE_COLLISION'));
 const r=request(f,{stage:'M',name:'验证样本'});
 assert.equal(r.preview.data.task.code,'M10');
 const out=f.call('create-task',r.data);
 assert.deepEqual(out.errors,[]);
 assert.equal(out.data.task.path,parent+'/M10-验证样本/task.md');
 assert.deepEqual(out.data.contextEntries.filter(e=>e.owner.kind==='milestone').map(e=>e.path),[pack]);
 assert.equal(readFileSync(join(f.root,sample),'utf8'),'原文');
 assert(f.apply([{path:parent+'/M10-验证样本/无编号.md',ifMatch:'missing',body:'非法归属'}]).errors.length);
});
test('two previews may propose the same code; append commits allocate fresh codes and preserve body edits',t=>{
 const f=setup(t),a=request(f),b=request(f,{name:'另一项工作'});assert.equal(a.preview.data.task.code,b.preview.data.task.code);const one=f.call('create-task',a.data),two=f.call('create-task',b.data);assert.deepEqual(one.errors,[]);assert.deepEqual(two.errors,[]);assert.equal(one.data.task.code,'B2');assert.equal(two.data.task.code,'B3');assert.equal(f.read().documents.filter(d=>d.metadata.kind==='task').length,3);
});
test('operation replay returns the same current stable ID after progress changes; changed requests cannot reuse it',t=>{
 const f=setup(t),r=request(f),one=f.call('create-task',r.data).data.task;f.apply([f.change(one.path,{status:'active',next_action:'真实推进中',commitment:'now'})]);const two=f.call('create-task',r.data);assert.deepEqual(two.errors,[]);assert(two.data.replayed);assert.equal(two.data.task.id,one.id);assert.equal(two.data.documents.find(d=>d.metadata.id===one.id).metadata.status,'active');assert(f.call('create-task',{...r.data,name:'不同目标'}).errors.some(e=>e.code==='PROJECT_GOVERNANCE_OPERATION_CONFLICT'));
});
test('changed stage meaning rejects the old preview; caller cannot inject IDs, codes, paths or active status',t=>{
 const f=setup(t),r=request(f);f.apply([f.change(f.mp,{task_stages:stages.map(s=>s.code==='B'?{...s,purpose:'改变目标'}:s)})]);assert(f.call('create-task',r.data).errors.some(e=>e.code==='PROJECT_GOVERNANCE_CONFLICT'));
 for(const extra of [{task_code:'B1'},{id:'owned'},{path:'../escape'},{status:'active'},{stage:undefined},{stage:'a'},{stage:'D'},{name:'../escape'},{name:'a:b'}])assert(f.call('create-task',{...dataFor(f),...extra},true).errors.length);assert.equal(f.read().documents.filter(d=>d.metadata.kind==='task').length,1);
});
test('new endpoint does not adapt old JSON, old T milestones or archived projects',t=>{
 const old=fixture(t);assert(old.call('create-task',{...dataFor(old)},true).errors.some(e=>e.code==='PROJECT_GOVERNANCE_UPGRADE_REQUIRED'));old.initialize();assert(old.call('create-task',dataFor(old),true).errors.some(e=>e.code==='PROJECT_TASK_CREATE_STAGE'));assert(!existsSync(join(old.root,dirname(old.tp).replace('T1-','B1-'))));
 const f=setup(t);const out=projectGovernance({root:f.root,name:f.name,scope:'archived',operation:'create-task',data:dataFor(f),dryRun:true});assert(out.errors.some(e=>e.code==='PROJECT_GOVERNANCE_ARCHIVED'));
});
test('interrupted creation uses common recovery and restores task, index and counter at each boundary',async t=>{
 for(const boundary of ['prepared','first-file','second-file','note-written','completed'])await t.test(boundary,t=>{
  const f=setup(t),r=request(f),before=preserved(inventory(join(f.root,'项目')));let writes=0;const out=projectGovernance({root:f.root,name:f.name,operation:'create-task',data:r.data},{fault:(phase,file)=>{if(phase==='file-written')writes++;if(phase===boundary||boundary==='first-file'&&writes===1||boundary==='second-file'&&writes===2||boundary==='note-written'&&phase==='file-written'&&file.path.endsWith('/灵感闪现.md'))throw Error('controlled interruption');}});assert(out.errors.length);assert.equal(out.data.recoveryId,r.data.operationId);assert(f.call().errors.length);assert.deepEqual(f.call('recover',{operationId:r.data.operationId},true).errors,[]);assert.deepEqual(f.call('recover',{operationId:r.data.operationId}).errors,[]);assert.deepEqual(preserved(inventory(join(f.root,'项目'))),before);assert(f.read().valid);
 });
});
test('later edits are preserved during recovery and no duplicate is created after a rolled back operation',t=>{
 const f=setup(t),r=request(f);const out=projectGovernance({root:f.root,name:f.name,operation:'create-task',data:r.data},{fault:phase=>{if(phase==='file-written')throw Error('stop');}});assert(out.errors.length);const path=join(f.root,r.preview.data.task.path);writeFileSync(path,readFileSync(path,'utf8')+'\n后续用户内容');assert(f.call('recover',{operationId:r.data.operationId}).errors.length);assert(readFileSync(path,'utf8').includes('后续用户内容'));
});
test('CLI create-task previews and writes through the same service with explicit from-file input',async t=>{
 const f=setup(t),data=dataFor(f),input=join(f.root,'request.json');writeFileSync(input,JSON.stringify(data));const run=args=>JSON.parse(runProjectGovernanceCommand(['create-task',f.name,'--from','request.json',...args,'--json'],f.root).stdout),p=run(['--dry-run']);assert(p.ok);writeFileSync(input,JSON.stringify({...data,ifMatch:p.data.ifMatch}));const out=run([]);assert(out.ok);assert.equal(out.data.task.code,'B2');assert(run([]).data.replayed);assert(runProjectGovernanceCommand(['create-task','--help'],f.root).stdout.includes('preview'));
});
async function concurrent(f,requests){
 const runner=join(f.root,'concurrent.mjs'),moduleURL=new URL('../src/commands/project-governance.js',import.meta.url).href;writeFileSync(runner,`import {runProjectGovernanceCommand} from ${JSON.stringify(moduleURL)};process.stdout.write('READY\\n');process.stdin.once('data',()=>{const result=runProjectGovernanceCommand(['create-task',process.argv[2],'--data',process.argv[3],'--json'],process.argv[4]);process.stdout.write(result.stdout);process.exitCode=result.exitCode;});`);
 const workers=requests.map(data=>{const child=spawn(process.execPath,[runner,f.name,JSON.stringify(data),f.root],{stdio:['pipe','pipe','pipe']}),row={child,text:'',errors:''};row.ready=new Promise((resolve,reject)=>{child.stdout.on('data',b=>{row.text+=b;if(row.text.startsWith('READY\n'))resolve();});child.once('error',reject);});row.done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{try{const result=JSON.parse(row.text.slice('READY\n'.length));if(code!==0)throw Error(JSON.stringify(result)+row.errors);resolve(result);}catch(e){reject(e);}});});child.stderr.on('data',b=>row.errors+=b);return row;});
 await Promise.all(workers.map(w=>w.ready));for(const w of workers)w.child.stdin.end('go\n');return Promise.all(workers.map(w=>w.done));
}
test('six concurrent CLI processes allocate distinct codes and retain every index entry',async t=>{
 const f=setup(t),requests=Array.from({length:6},(_,i)=>request(f,{name:'并发工作'+i}).data),results=await concurrent(f,requests);assert.deepEqual(results.map(r=>r.data.task.code).sort(),['B2','B3','B4','B5','B6','B7']);assert.equal(new Set(results.map(r=>r.data.task.id)).size,6);assert.equal(f.read().documents.filter(d=>d.metadata.kind==='task').length,7);assert.equal(f.read().documents.find(d=>d.path===f.mp).metadata.task_counters.B,7);assert(f.read().valid);
});
test('concurrent retries of one CLI operation produce exactly one task',async t=>{
 const f=setup(t),r=request(f),results=await concurrent(f,[r.data,r.data,r.data]);assert.equal(new Set(results.map(r=>r.data.task.id)).size,1);assert.equal(results.filter(r=>r.data.changed).length,1);assert.equal(f.read().documents.filter(d=>d.metadata.kind==='task').length,2);
});

test('new task index remains naturally grouped and no sibling stage is implicitly started',t=>{
 const f=setup(t),z=f.call('create-task',request(f,{stage:'Z',work_type:'acceptance'}).data),a=f.call('create-task',request(f,{stage:'A'}).data);assert.deepEqual(z.errors,[]);assert.deepEqual(a.errors,[]);const state=f.read(),m=state.documents.find(d=>d.path===f.mp);assert.deepEqual(m.metadata.tasks.map(r=>state.documents.find(d=>d.metadata.id===r.id).metadata.task_code),['A1','B1','Z1']);assert(state.documents.filter(d=>d.metadata.kind==='task').every(d=>d.metadata.status==='planned'));
});
test('an occupied folder appearing after allocation is preserved and rejected before publication',t=>{
 const f=setup(t),r=request(f),folder=join(f.root,dirname(r.preview.data.task.path));const out=projectGovernance({root:f.root,name:f.name,operation:'create-task',data:r.data},{beforeCheck:()=>{mkdirSync(folder);writeFileSync(join(folder,'用户资料.txt'),'后续内容');}});assert(out.errors.some(e=>e.code==='PROJECT_GOVERNANCE_CONFLICT'));assert.equal(readFileSync(join(folder,'用户资料.txt'),'utf8'),'后续内容');assert(!existsSync(join(folder,'task.md')));assert.equal(f.read().documents.filter(d=>d.metadata.kind==='task').length,1);
});
