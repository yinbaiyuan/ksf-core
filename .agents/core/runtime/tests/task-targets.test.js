import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { taskTargetFixture, addKnowledgeUnit, targetReport } from './helpers/task-target-fixture.js';
import { routingFixture } from './helpers/routing-fixture.js';
import { validateReport, ROUTE_DIRECTORY } from '../src/routing/schema.js';
import { definitionContext, resolveReport } from '../src/routing/definitions.js';
import { mutateRoute, readRoute } from '../src/services/routes.js';
import { listTaskTargets, listTaskProjects, listTasks, readTask, enableCapture, declareTask, syncTasks } from '../src/services/tasks.js';
import { turnPath } from '../src/task-capture/storage.js';
import { runTaskCommand } from '../src/commands/tasks.js';
import { startWebServer } from '../src/services/web.js';

test('project and knowledge ownership share history without creating reference memberships or rewriting archives', t => {
  const f = taskTargetFixture(t), file = join(f.root, turnPath(f.taskId, 'one')), bytes = readFileSync(file);
  const catalog = listTaskTargets({ root: f.root });
  const knowledge = catalog.targets.find(t => t.key === f.knowledgeKey);
  assert.equal(knowledge.kind, 'knowledge'); assert.equal(knowledge.chatCount, 1); assert.equal(knowledge.turnCount, 2);
  assert.equal(catalog.targets.some(t => t.key === `knowledge:${f.relatedKnowledge.path}`), false);
  assert.equal(catalog.targets.find(t => t.key === 'state:none').label, '无归属');
  assert.equal(catalog.targets.find(t => t.key === 'state:none').turnCount, 1);
  const list = listTasks({ root: f.root, target: f.knowledgeKey });
  assert.equal(list.total, 1); assert.equal(list.records[0].targetContext.latestTurnId, 'switch');
  assert.equal(list.records[0].targetContext.latestReported.eventId, 'switch-1');
  const detail = readTask({ root: f.root, taskId: f.taskId, target: f.knowledgeKey });
  assert.equal(detail.total, 11); assert.equal(detail.turns.find(t => t.turnId === 'related-only').targetRelation.kind, 'related');
  const switched = detail.turns.find(t => t.turnId === 'switch').targetHistory;
  assert.equal(switched.switched, true); assert.deepEqual(switched.sequence.map(t => t.key), [f.key('A'), f.knowledgeKey, f.key('A')]);
  assert.equal(detail.turns.find(t => t.turnId === 'knowledge').targetRelation.label, '本知识单元');
  assert.equal(listTaskProjects({ root: f.root }).projects.find(p => p.key === 'state:none').turnCount, 1);
  assert.equal(listTasks({ root: f.root, project: 'state:none', projectMatch: 'history' }).total, 1);
  assert.deepEqual(readFileSync(file), bytes); assert.equal(JSON.parse(bytes).routes[0].snapshot.ownership, undefined);
});
test('same-name projects and knowledge units, and different exact entries, keep separate identities', t => {
  const f = taskTargetFixture(t), name = '认知-业务公式'; f.addProject(name);
  f.save('same-name-project',12,[f.snapshot({kind:'project',name,scope:'current'})]);
  const otherEntry = addKnowledgeUnit(f.root,name,'other.md'); f.save('other-entry',13,[f.snapshot(otherEntry)]);
  const targets = listTaskTargets({root:f.root}).targets;
  const keys = targets.filter(t=>t.label===name).map(t=>t.key);
  assert.equal(keys.length,3); assert.equal(new Set(keys).size,3);
  assert.ok(keys.includes(`current:${name}`)); assert.ok(keys.includes(f.knowledgeKey)); assert.ok(keys.includes(`knowledge:${otherEntry.path}`));
});
test('knowledge units inside categories use topic names and preserve flat names and exact identities', t => {
  const f = taskTargetFixture(t);
  const nested = addKnowledgeUnit(f.root, '技术/示例主题', 'overview.md');
  const otherCategory = addKnowledgeUnit(f.root, '个人/示例主题');
  assert.equal(f.snapshot(f.knowledge).ownership.target.name, '认知-业务公式');
  f.save('nested-topic', 12, [f.snapshot(nested, [otherCategory])]);
  f.save('other-category-topic', 13, [f.snapshot(otherCategory)]);
  const catalog = listTaskTargets({ root: f.root });
  assert.deepEqual(catalog.errors, []);
  const first = catalog.targets.find(target => target.key === `knowledge:${nested.path}`);
  const second = catalog.targets.find(target => target.key === `knowledge:${otherCategory.path}`);
  assert.equal(first.label, '示例主题');
  assert.equal(second.label, '示例主题');
  assert.equal(first.target.name, '示例主题');
  assert.equal(first.target.path, nested.path);
  assert.notEqual(first.key, second.key);
  assert.equal(listTasks({ root: f.root, target: first.key }).total, 1);
});
test('damaged ownership is reported as a gap and is never rewritten or guessed', t => {
  const f = taskTargetFixture(t), path = join(f.root,turnPath(f.taskId,'knowledge'));
  const invalid = JSON.parse(readFileSync(path)); invalid.routes[0].snapshot.ownership.state='future-unknown';
  const bytes=JSON.stringify(invalid);writeFileSync(path,bytes);
  const catalog=listTaskTargets({root:f.root});assert.equal(catalog.errors.length,1);assert.equal(catalog.errors[0].turnId,'knowledge');
  assert.equal(catalog.targets.find(t=>t.key===f.knowledgeKey).turnCount,1);assert.equal(readFileSync(path,'utf8'),bytes);
});
test('exact knowledge entries preserve custom filenames, reject mixed reports, ambiguous duplicates and unsafe paths', t => {
  const f = routingFixture(t), k = addKnowledgeUnit(f.root, '自定义-业务公式', 'overview.md');
  const report = targetReport(k); validateReport(report);
  assert.equal(resolveReport(definitionContext(f.root), report).ownership.target.path, k.path);
  for (const value of [
    { ...report, project: { state: 'none' } }, { ...report, references: [] }, { ...report, relatedTargets: [k] },
    targetReport({ kind: 'knowledge', path: '知识/../USER.md' }), targetReport({ kind: 'knowledge', path: '/tmp/file.md' }),
  ]) assert.throws(() => validateReport(value), { code: 'INVALID_ARGUMENTS' });
  mkdirSync(join(f.root, '知识/rules')); writeFileSync(join(f.root, '知识/rules/认知.md'), '# 规则');
  writeFileSync(join(f.root, '知识/knowledge.md'), readFileSync(join(f.root, '知识/knowledge.md'), 'utf8') + '\n[规则](rules/认知.md)\n');
  for (const path of ['知识/rules/认知.md', '知识/自定义-业务公式/unlisted.md']) assert.throws(() => resolveReport(definitionContext(f.root), targetReport({ kind: 'knowledge', path })), { code: 'ROUTE_KNOWLEDGE_ENTRY_REQUIRED' });
  renameSync(join(f.root, k.path), join(f.root, k.path + '.original')); symlinkSync(join(f.root, k.path + '.original'), join(f.root, k.path));
  assert.throws(() => resolveReport(definitionContext(f.root), report), { code: 'ROUTE_PATH_INVALID' });
});
test('knowledge route records retain the historical path when an entry moves and do not bind a same-name replacement', t => {
  const f = routingFixture(t), k = addKnowledgeUnit(f.root);
  const record = mutateRoute({ root: f.root, operation: 'start', ifMatch: 'missing', env: {}, input: { identity: f.identity, eventId: 'knowledge', report: targetReport(k) } }).record;
  assert.equal(record.current.project.state, 'none'); assert.equal(record.current.ownership.target.kind, 'knowledge');
  const file = join(f.root, ROUTE_DIRECTORY, `${record.sessionKey}.json`), before = readFileSync(file);
  renameSync(join(f.root, k.path), join(f.root, '知识/认知-业务公式/new-entry.md'));
  writeFileSync(join(f.root, '知识/knowledge.md'), '# 知识\n[同名](认知-业务公式/new-entry.md)\n');
  const current = readRoute({ root: f.root, key: record.sessionKey }).record.current;
  assert.equal(current.ownership.target.path, k.path); assert.equal(current.ownership.target.freshness, 'unavailable');
  assert.deepEqual(readFileSync(file), before);
});
test('a valid long unit name remains readable after normalization and persistence', t => {
  const f = routingFixture(t), k = addKnowledgeUnit(f.root, 'a'.repeat(201), 'entry.md');
  const value = mutateRoute({ root: f.root, operation: 'start', ifMatch: 'missing', env: {}, input: { identity: f.identity, eventId: 'long-unit', report: targetReport(k) } }).record;
  assert.equal(readRoute({ root: f.root, key: value.sessionKey }).record.current.ownership.target.name, 'a'.repeat(201));
});
test('target search filters before pagination and CLI accepts the same exact context', async t => {
  const f = taskTargetFixture(t), otherId = 'b'.repeat(64);
  f.save('other', 12, [f.snapshot(f.knowledge, [], '另一聊天')], { id: otherId });
  const a = listTasks({ root: f.root, target: f.knowledgeKey, limit: 1 }), b = listTasks({ root: f.root, target: f.knowledgeKey, limit: 1, offset: 1 });
  assert.equal(a.total, 2); assert.equal(a.nextOffset, 1); assert.notEqual(a.records[0].taskId, b.records[0].taskId);
  assert.equal(listTasks({ root: f.root, target: `knowledge:${f.relatedKnowledge.path}` }).total, 0);
  assert.equal(listTasks({ root: f.root, target: f.knowledgeKey, q: '关联知识', limit: 1 }).total, 1);
  for (const args of [['list','--target',f.knowledgeKey,'--json'], ['read','--task',f.taskId,'--target',f.knowledgeKey,'--json']]) {
    const result = await runTaskCommand(args, f.root); assert.equal(result.exitCode, 0); assert.equal(JSON.parse(result.stdout).ok, true);
  }
  assert.throws(() => listTasks({ root: f.root, target: f.knowledgeKey, project: f.key('A') }), { code: 'INVALID_ARGUMENTS' });
});
test('signed knowledge declarations archive ordinary discussion independently of file modification', async t => {
  const f = routingFixture(t), k = addKnowledgeUnit(f.root), source = join(f.root, 'host/sessions/rollout-test.jsonl');
  mkdirSync(join(f.root, 'host/sessions'), { recursive: true }); enableCapture({ root: f.root, at: '2026-01-01T00:00:00Z' });
  const before = readFileSync(join(f.root, k.path)), env = { CODEX_THREAD_ID: 'knowledge-chat', CODEX_HOME: join(f.root, 'host') };
  const receipt = declareTask({ root: f.root, env, input: { turnId: 'knowledge', eventId: 'selected', policy: 'capture', reason: '本轮目的是讨论知识，尚未保存正文。', report: targetReport(k) } });
  const rows = [
    { type:'session_meta', payload:{ id:env.CODEX_THREAD_ID,cwd:f.root } },
    { type:'event_msg', timestamp:'2026-01-02T00:00:00Z', payload:{ type:'task_started',turn_id:'knowledge' } },
    { type:'response_item', timestamp:'2026-01-02T00:00:01Z', payload:{ type:'message',id:'u',role:'user',content:[{type:'input_text',text:'只讨论业务公式，不保存知识文件。'}] } },
    { type:'response_item', payload:{ type:'function_call_output',output:JSON.stringify(receipt) } },
  ];
  writeFileSync(source, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  assert.deepEqual((await syncTasks({ root:f.root,env })).errors, []);
  const task = listTasks({ root:f.root,target:`knowledge:${k.path}` }).records[0];
  const turn = readTask({ root:f.root,taskId:task.taskId,turnId:'knowledge' }).turn;
  assert.equal(turn.messages.length,1); assert.equal(turn.routes[0].snapshot.ownership.target.path,k.path);
  assert.equal(listTaskProjects({ root:f.root }).projects.length,0); assert.equal(listTasks({ root:f.root,project:'state:none' }).total,0);
  assert.deepEqual(readFileSync(join(f.root,k.path)),before);
});
test('target HTTP endpoints keep read-only local boundaries and expose full round history', async t => {
  let server;
  t.after(() => server?.close());

  const f = taskTargetFixture(t);server = await startWebServer({ root:f.root,port:0,capture:false });
  const call = (path, headers = {}, method = 'GET') => new Promise((resolve,reject) => {
    const req = request({hostname:server.host,port:server.port,path,headers,method}, res => {const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end();
  });
  assert.equal((await call('/api/task-targets')).body.data.targets.some(t=>t.key===f.knowledgeKey),true);
  const path=`/api/tasks/${f.taskId}?target=${encodeURIComponent(f.knowledgeKey)}`;
  assert.equal((await call(path)).body.data.targetContext.latestTurnId,'switch');
  assert.equal((await call(`/api/tasks/${f.taskId}/turns/knowledge?target=${encodeURIComponent(f.knowledgeKey)}`)).body.data.turn.targetRelation.kind,'primary');
  for(const url of ['/api/task-targets',path]) {
    assert.equal((await call(url,{Host:'evil.example'})).status,403); assert.equal((await call(url,{Origin:'https://evil.example'})).status,403); assert.equal((await call(url,{},'POST')).status,405);
  }
  for(const query of ['target=a&target=b','target=a&project=b']) assert.equal((await call('/api/tasks?'+query)).status,400);
});
