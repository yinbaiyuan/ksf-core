import {gitBinary} from './helpers/platform.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { routingFixture } from './helpers/routing-fixture.js';
import { addKnowledgeUnit, targetReport } from './helpers/task-target-fixture.js';
import { enableCapture, declareTask, syncTasks, listTaskTargets, listTasks, readTask, listTaskProjects } from '../src/services/tasks.js';
import { definitionContext, resolveReport } from '../src/routing/definitions.js';
import { targetKey } from '../src/routing/target-identity.js';
import { targetRegistry } from '../src/routing/target-registry.js';
import { validateReport } from '../src/routing/schema.js';
import { mutateRoute, readRoute } from '../src/services/routes.js';
import { writeUserData } from '../src/services/user-data.js';
import { runTaskCommand } from '../src/commands/tasks.js';
import { withTargetLock } from '../src/routing/target-registry.js';
import { locked } from '../src/task-capture/storage.js';
import { turnPath } from '../src/task-capture/storage.js';
import { spawnSync } from 'node:child_process';
import { abilitySource } from '../src/services/sources.js';
function fixture(t) {
  const f = routingFixture(t); enableCapture({ root: f.root, at: '2026-01-01T00:00:00Z' });
  const host = join(f.root,'host'); mkdirSync(join(host,'sessions'),{recursive:true}); let clock = 0;
  const identity = id => ({ CODEX_THREAD_ID:id, CODEX_HOME:host });
  const declare = (session,turn,report,{eventId='route',bindings,policy='capture',reason='明确目标，验收示例'}={}) => declareTask({root:f.root,env:identity(session),input:{turnId:turn,eventId,policy,reason,...(report?{report}:{}),...(bindings?{targetBindings:bindings}:{})}});
  const append = (session,turn,receipt,text='[验收示例] 按主要目标处理本轮') => {
    const file=join(host,'sessions',`${session}.jsonl`), at=new Date(Date.UTC(2026,0,2,0,++clock)).toISOString();
    const rows=existsSync(file)?readFileSync(file,'utf8'):' ';
    const values=[...(!rows.trim()?[{type:'session_meta',payload:{id:session,cwd:f.root}}]:[]),
      {type:'event_msg',timestamp:at,payload:{type:'task_started',turn_id:turn}},
      {type:'response_item',timestamp:at,payload:{type:'message',id:`${turn}-u`,role:'user',content:[{type:'input_text',text}]}},
      {type:'response_item',timestamp:at,payload:{type:'function_call_output',output:JSON.stringify(receipt)}},
      {type:'response_item',timestamp:at,payload:{type:'message',id:`${turn}-a`,role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'[验收示例] 已核对目标。'}]}},
      {type:'event_msg',timestamp:at,payload:{type:'task_complete',turn_id:turn}}];
    writeFileSync(file,(rows.trim()?rows:'')+values.map(v=>JSON.stringify(v)).join('\n')+'\n');return file;
  };
  const capture = async (session,turn,receipt,text) => {const path=append(session,turn,receipt,text);const result=await syncTasks({root:f.root,env:identity(session),transcriptPath:path,force:true});assert.deepEqual(result.errors,[]);return readTask({root:f.root,taskId:receipt.declaration.taskId,turnId:turn}).turn;};
  return {...f,identity,declare,append,capture};
}
const inventory = root => readdirSync(root).sort().flatMap(name=>{const p=join(root,name);return statSync(p).isDirectory()?inventory(p).map(n=>`${name}/${n}`):[name+':'+readFileSync(p).toString('base64')];});
test('ability targets pin actual source and definition without becoming adopted abilities; archives accept files and units', t=>{
  const f=fixture(t);f.add();mkdirSync(join(f.root,'档案/企业/示例企业'),{recursive:true});writeFileSync(join(f.root,'档案/企业/示例企业/合同.pdf'),'fixture');
  const a=resolveReport(definitionContext(f.root),targetReport({kind:'ability',ref:'partner.test.method',source:'user'}));
  assert.equal(a.ownership.target.id,'partner.test.method');assert.equal(a.ownership.target.version,'0.1.0');assert.equal(a.abilities.length,0);
  const firstKey=targetKey(a.ownership.target), path=f.add();writeFileSync(path,readFileSync(path,'utf8').replace('version: 0.1.0','version: 0.2.0'));
  const b=resolveReport(definitionContext(f.root),targetReport({kind:'ability',ref:'partner.test.method',source:'user'}));assert.equal(targetKey(b.ownership.target),firstKey);assert.equal(b.ownership.target.version,'0.2.0');
  for(const [path,type] of [['档案/企业/示例企业','directory'],['档案/企业/示例企业/合同.pdf','file']])assert.equal(resolveReport(definitionContext(f.root),targetReport({kind:'archive',path})).ownership.target.entryType,type);
  for(const target of [{kind:'inbox',path:'@收件箱/a.md'},{kind:'system',name:'ksf-core'},{kind:'archive',path:'档案/../USER.md'},{kind:'archive',path:'/tmp/a'}])assert.throws(()=>validateReport(targetReport(target)));
  symlinkSync(join(f.root,'档案/企业/示例企业'),join(f.root,'档案/链接'));assert.throws(()=>resolveReport(definitionContext(f.root),targetReport({kind:'archive',path:'档案/链接/合同.pdf'})),{code:'ROUTE_PATH_INVALID'});
});
test('same-name ability targets remain separate by actual source and missing sources never fall back', t=>{
  const f=routingFixture(t), source=routingFixture(t), id='partner.test.method';
  f.add(id,'user');f.add(id,'system');const linked=source.add(id);
  writeFileSync(linked,readFileSync(linked,'utf8').replace('user_revision: 1\n',''));
  assert.equal(spawnSync(gitBinary,['init','--template=','--initial-branch=main',source.root]).status,0);
  abilitySource({root:f.root,operation:'init',target:source.root,id:'linked',name:'Linked'});
  abilitySource({root:f.root,operation:'link',target:source.root});
  const goals=['user','system','linked'].map(source=>resolveReport(definitionContext(f.root),targetReport({kind:'ability',ref:id,source})).ownership.target);
  assert.equal(new Set(goals.map(targetKey)).size,3);assert.deepEqual(goals.map(g=>g.source),['user','system','linked']);
  assert.equal(resolveReport(definitionContext(f.root),targetReport({kind:'ability',ref:id,source:'effective'})).ownership.target.source,'user');
  const record=mutateRoute({root:f.root,operation:'start',ifMatch:'missing',env:{},input:{identity:f.identity,eventId:'linked',report:targetReport({kind:'ability',ref:id,source:'linked'})}}).record;
  rmSync(linked);const old=readRoute({root:f.root,key:record.sessionKey}).record.current.ownership.target;
  assert.equal(old.source,'linked');assert.equal(old.freshness,'unavailable');assert.equal(targetKey(old),targetKey(goals[2]));
});
test('read-only planned declaration is deterministic and creates no files; collector alone registers the stable identity', async t=>{
  const f=fixture(t), report=targetReport({kind:'ability',lifecycle:'planned',name:'[验收示例] 新能力'}), before=inventory(f.root);
  const d=f.declare('one','one',report), again=f.declare('one','one',report), id=d.declaration.snapshot.ownership.target.targetId;
  assert.equal(again.declaration.snapshot.ownership.target.targetId,id);assert.deepEqual(inventory(f.root),before);assert.equal(targetRegistry(f.root).records.size,0);
  const turn=await f.capture('one','one',d);assert.equal(turn.targetFacts.length,1);assert.equal(targetRegistry(f.root).records.get(id).lifecycle,'planned');
  assert.equal(listTaskTargets({root:f.root}).targets[0].key,`target:${id}`);assert.equal(listTaskTargets({root:f.root}).targets[0].lifecycle,'planned');assert.equal(listTaskProjects({root:f.root}).projects.length,0);
  assert.equal(f.declare('one','one',report).receipt,d.receipt);
});
test('a planned target is reused across chats and explicit binding preserves identity, counts, and historical snapshots', async t=>{
  const f=fixture(t), d=f.declare('one','create',targetReport({kind:'ability',lifecycle:'planned',name:'[验收示例] 新能力'}));await f.capture('one','create',d);
  const id=d.declaration.snapshot.ownership.target.targetId, key=`target:${id}`, oldFile=join(f.root,turnPath(d.declaration.taskId,'create')), old=readFileSync(oldFile);
  await f.capture('two','continue',f.declare('two','continue',targetReport({kind:'ability',targetId:id})));
  f.add();const bindings=[{targetId:id,ifMatch:1,target:{kind:'ability',ref:'partner.test.method@0.1.0',source:'user'}}];
  const bound=f.declare('two','bind',targetReport({kind:'ability',targetId:id}),{bindings});await f.capture('two','bind',bound);
  assert.equal(bound.declaration.snapshot.ownership.target.targetId,id);assert.equal(bound.declaration.snapshot.ownership.target.targetVersion,2);
  const catalog=listTaskTargets({root:f.root});assert.equal(catalog.targets.length,1);assert.equal(catalog.targets[0].chatCount,2);assert.equal(catalog.targets[0].turnCount,3);assert.equal(catalog.targets[0].lifecycle,'existing');
  assert.equal(listTasks({root:f.root,target:key}).total,2);assert.deepEqual(readFileSync(oldFile),old);
  const historic=readTask({root:f.root,taskId:d.declaration.taskId,turnId:'create'}).turn.routes[0].snapshot.ownership.target;
  assert.equal(historic.lifecycle,'planned');assert.equal(historic.path,undefined);assert.equal(historic.currentBinding.targetVersion,2);
  assert.equal(f.declare('two','bind',targetReport({kind:'ability',targetId:id}),{bindings}).receipt,bound.receipt);
  assert.equal(listTasks({root:f.root,target:'ability:user:partner.test.method'}).total,2);
  const future=f.declare('three','future',targetReport({kind:'ability',ref:'partner.test.method',source:'user'}));assert.equal(future.declaration.snapshot.ownership.target.targetId,id);
  assert.throws(()=>f.declare('two','wrong-replay',targetReport({kind:'ability',targetId:id}),{bindings}),{code:'TARGET_CONFLICT'});
  assert.throws(()=>f.declare('two','bind',targetReport({kind:'ability',targetId:id},[],'changed'),{bindings}),{code:'TASK_DECLARATION_CONFLICT'});
});
test('concurrent signed bindings are checked at capture, only one is accepted, and replay recovers without duplicate facts', async t=>{
  const f=fixture(t), initial=f.declare('one','initial',targetReport({kind:'knowledge',lifecycle:'planned',name:'[验收示例] 新知识'}));await f.capture('one','initial',initial);
  const id=initial.declaration.snapshot.ownership.target.targetId,k1=addKnowledgeUnit(f.root,'验收示例-A'),k2=addKnowledgeUnit(f.root,'验收示例-B');
  const a=f.declare('two','a',targetReport({kind:'knowledge',targetId:id}),{bindings:[{targetId:id,ifMatch:1,target:k1}]}), b=f.declare('three','b',targetReport({kind:'knowledge',targetId:id}),{bindings:[{targetId:id,ifMatch:1,target:k2}]});
  const paths=[f.append('two','a',a),f.append('three','b',b)];await Promise.all(paths.map(transcriptPath=>syncTasks({root:f.root,env:f.identity('one'),transcriptPath,force:true})));
  const turns=[readTask({root:f.root,taskId:a.declaration.taskId,turnId:'a'}).turn,readTask({root:f.root,taskId:b.declaration.taskId,turnId:'b'}).turn];
  assert.equal(turns.filter(v=>v.routes.length).length,1);assert.equal(turns.filter(v=>v.issues.some(i=>i.code==='TARGET_CONFLICT')).length,1);assert.equal(targetRegistry(f.root).records.get(id).targetVersion,2);
  for(const transcriptPath of paths)await syncTasks({root:f.root,env:f.identity('one'),transcriptPath,force:true});
  assert.equal([...targetRegistry(f.root).events.values()].filter(f=>f.updates.some(u=>u.target.targetVersion===2)).length,1);
});
test('same-name planned targets stay distinct, related-only targets do not gain membership, and exclusion erases their facts', async t=>{
  const f=fixture(t), planned={kind:'archive',lifecycle:'planned',name:'[验收示例] 合同档案'};
  const a=f.declare('one','one',targetReport(planned)),b=f.declare('two','two',targetReport(planned));await f.capture('one','one',a);await f.capture('two','two',b);
  assert.notEqual(a.declaration.snapshot.ownership.target.targetId,b.declaration.snapshot.ownership.target.targetId);assert.equal(listTaskTargets({root:f.root}).targets.length,2);
  const id=a.declaration.snapshot.ownership.target.targetId;
  f.addProject('示例项目');const related=f.declare('three','related',targetReport({kind:'project',name:'示例项目',scope:'current'},[{kind:'archive',targetId:id}]));await f.capture('three','related',related);
  assert.equal(listTasks({root:f.root,target:`target:${id}`}).total,1);
  const excluded=f.declare('one','one',undefined,{eventId:'exclude',policy:'exclude'});await f.capture('one','one',excluded,'本轮不记录对话');
  const turn=readTask({root:f.root,taskId:a.declaration.taskId,turnId:'one'}).turn;assert.equal(turn.targetFacts.length,0);assert.equal(turn.messages.length,0);assert.equal(targetRegistry(f.root).records.has(id),true); // Later explicitly allowed association retains its own target evidence.
  assert.equal(listTasks({root:f.root,target:`target:${id}`}).total,0);
});
test('all four planned kinds bind through their native validators; unavailable sources preserve binding history', async t=>{
  const f=fixture(t);f.addProject('示例项目');f.add();const knowledge=addKnowledgeUnit(f.root,'验收示例-知识');mkdirSync(join(f.root,'档案/企业/验收示例'),{recursive:true});
  for(const [kind,target] of [['project',{kind:'project',name:'示例项目',scope:'current'}],['knowledge',knowledge],['ability',{kind:'ability',ref:'partner.test.method',source:'user'}],['archive',{kind:'archive',path:'档案/企业/验收示例'}]]) {
    const d=f.declare(kind,'create',targetReport({kind,lifecycle:'planned',name:`[验收示例] ${kind}`}));await f.capture(kind,'create',d);
    const id=d.declaration.snapshot.ownership.target.targetId, bound=f.declare(kind,'bind',targetReport({kind,targetId:id}),{bindings:[{targetId:id,ifMatch:1,target}]});await f.capture(kind,'bind',bound);
    assert.equal(targetRegistry(f.root).records.get(id).lifecycle,'existing');
  }
  assert.deepEqual(new Set(listTaskTargets({root:f.root}).targets.map(t=>t.kind)),new Set(['project','knowledge','ability','archive']));
  const archive=listTaskTargets({root:f.root}).targets.find(t=>t.kind==='archive');rmSync(join(f.root,'档案/企业/验收示例'),{recursive:true});
  const current=listTaskTargets({root:f.root}).targets.find(t=>t.key===archive.key);assert.equal(current.target.path,archive.target.path);assert.equal(current.target.freshness,'unavailable');
  const cli=await runTaskCommand(['targets','--json'],f.root);assert.equal(cli.exitCode,0);assert.equal(JSON.parse(cli.stdout).data.targets.length,4);
});
test('standalone route records retain target facts beyond snapshot truncation and reject stale bindings', t=>{
  const f=routingFixture(t), target={kind:'archive',lifecycle:'planned',name:'[验收示例] 待建档案'};
  const first=mutateRoute({root:f.root,operation:'start',ifMatch:'missing',env:{},input:{identity:f.identity,eventId:'planned',report:targetReport(target)}}).record;
  const id=first.current.ownership.target.targetId;mkdirSync(join(f.root,'档案/企业/示例'),{recursive:true});
  const input={identity:f.identity,eventId:'bind',roundId:first.roundId,report:targetReport({kind:'archive',targetId:id}),targetBindings:[{targetId:id,ifMatch:1,target:{kind:'archive',path:'档案/企业/示例'}}]};
  const bound=mutateRoute({root:f.root,operation:'write',ifMatch:1,env:{},input});assert.equal(bound.record.current.ownership.target.targetId,id);
  assert.equal(mutateRoute({root:f.root,operation:'write',ifMatch:1,env:{},input}).replayed,true);
  let record=bound.record;for(let i=0;i<51;i++)record=mutateRoute({root:f.root,operation:'write',ifMatch:record.revision,env:{},input:{identity:f.identity,eventId:`state-${i}`,roundId:record.roundId,report:targetReport({kind:'archive',targetId:id})}}).record;
  assert.equal(record.history.length,50);assert.equal(targetRegistry(f.root).records.get(id).targetVersion,2);assert.equal(readRoute({root:f.root,key:record.sessionKey}).record.current.ownership.target.targetId,id);
});

test('disabled routing and explicit exclusions register no target facts, even for a receipt emitted before disabling', async t => {
  const f=fixture(t), report=targetReport({kind:'ability',lifecycle:'planned',name:'[验收示例] 暂不登记'}), queued=f.declare('one','queued',report);
  writeUserData({root:f.root,namespace:'settings',values:{routing:{enabled:false}},ifMatch:'missing'});
  const disabled=f.declare('two','disabled',report);assert.equal(disabled.declaration.snapshot,null);assert.equal(disabled.declaration.targetChanges,undefined);
  await f.capture('one','queued',queued);await f.capture('two','disabled',disabled);
  assert.equal(targetRegistry(f.root).records.size,0);assert.equal(existsSync(join(f.root,'.agents/runtime-data/task-targets')),false);
  const excluded=f.declare('three','excluded',report,{policy:'exclude'});await f.capture('three','excluded',excluded,'本轮不记录对话');assert.equal(targetRegistry(f.root).records.size,0);
});
test('target facts and aliases rebuild without an index; dead locks recover, corrupt facts surface gaps', async t => {
  const f=fixture(t), receipt=f.declare('one','create',targetReport({kind:'archive',lifecycle:'planned',name:'[验收示例] 新档案'}));
  const lock=join(f.root,'.agents/runtime-data/task-targets/registry.lock');mkdirSync(join(f.root,'.agents/runtime-data/task-targets'),{recursive:true});writeFileSync(lock,JSON.stringify({pid:2147483647}));
  await f.capture('one','create',receipt);assert.equal(existsSync(lock),false);rmSync(join(f.root,'.agents/runtime-data/task-targets'),{recursive:true});
  const id=receipt.declaration.snapshot.ownership.target.targetId;assert.equal(targetRegistry(f.root).records.get(id).lifecycle,'planned');
  const file=join(f.root,turnPath(receipt.declaration.taskId,'create')), v=JSON.parse(readFileSync(file));v.targetFacts[0].updates[0].target.targetVersion=99;const bytes=JSON.stringify(v);writeFileSync(file,bytes);
  assert.ok(listTaskTargets({root:f.root}).errors.length);assert.equal(readFileSync(file,'utf8'),bytes);
});

test('an unflushed or unknown lock owner is treated as contention and is never removed', t => {
  const f=fixture(t), global=join(f.root,'.agents/runtime-data/task-targets/registry.lock');mkdirSync(join(f.root,'.agents/runtime-data/task-targets'),{recursive:true});writeFileSync(global,'');
  assert.throws(()=>withTargetLock(f.root,()=>assert.fail('must not run')),{code:'TARGET_LOCKED'});assert.equal(readFileSync(global,'utf8'),'');
  const taskId='a'.repeat(64), local=join(f.root,`.agents/runtime-data/task-capture/locks/${taskId}.lock`);writeFileSync(local,'');
  assert.throws(()=>locked(f.root,taskId,()=>assert.fail('must not run')),{code:'TASK_LOCKED'});assert.equal(readFileSync(local,'utf8'),'');
});
