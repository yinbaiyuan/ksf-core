import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate } from 'node:timers/promises';
import { createWorkStats, workPeriods } from '../src/services/work-stats.js';
import { createTaskActivitySource } from '../src/services/task-activity.js';
import { bindCurrentWork } from '../src/services/work-context.js';
import { runTaskCommand } from '../src/commands/tasks.js';
import { PROTOCOL, ARCHIVE, CAPTURE, turnPath } from '../src/task-capture/storage.js';
import { projectProjection } from '../src/routing/targets.js';
import { startWebServer } from '../src/services/web.js';

const ids = { a: 'a'.repeat(64), b: 'b'.repeat(64), c: 'c'.repeat(64), d: 'd'.repeat(64) };
const project = name => ({ kind: 'project', name, scope: 'current', path: `项目/${name}/project.md` });
const knowledge = path => ({ kind: 'knowledge', name: '同名知识', path: `知识/${path}/cognition.md` });
function ability(id = 'partner.test.one', extra = {}) {
  return { kind: 'ability', id, ref: `${id}@0.1.0`, name: '同名能力', source: 'user', version: '0.1.0', path: `能力/搭档/${id}/partner.md`, definitionDigest: 'f'.repeat(64), ...extra };
}
function route(target, index = 0, related = []) {
  const ownership = target ? { state: 'bound', target } : { state: 'none' };
  return { eventId: `event-${index}`, at: '2026-10-28T00:00:00Z', snapshot: { summary: '可见工作标题', status: 'working', ownership, relatedTargets: related, ...projectProjection(ownership, related), abilities: [{ name: '仅采用能力，不计入', stage: 'adopted' }] } };
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf-work-stats-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const save = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(value)); };
  const put = (task, turnId, at = '2026-10-28T01:00:00Z', routes = [], extra = {}) => {
    const taskId = ids[task];
    save(`${ARCHIVE}/${taskId}/task.json`, { protocol: PROTOCOL, taskId, title: `聊天 ${task}`, createdAt: '2026-10-01T00:00:00Z' });
    const turn = { protocol: PROTOCOL, taskId, turnId, startedAt: at, updatedAt: at, status: 'completed', policy: 'capture', revision: 1, routes, declarations: [], issues: [],
      messages: [{ id: 'u', role: 'user', content: [{ type: 'input_text', text: '工作标题\n正文不能进入完整响应' }], revisions: [] }, { id: 'answer', role: 'assistant', content: [{ type: 'output_text', text: '回答正文与工具证据必须省略' }], revisions: [] }], ...extra };
    save(turnPath(taskId, turnId), turn); return turn;
  };
  return { root, save, put };
}

test('work periods use calendar midnight and Monday in IANA zones, including DST and non-hour offsets', () => {
  const zone = 'Asia/Shanghai', result = workPeriods(Date.parse('2026-10-28T12:00:00+08:00'), zone);
  assert.equal(result.today.startAt, '2026-10-27T16:00:00.000Z'); assert.equal(result.week.startAt, '2026-10-25T16:00:00.000Z'); assert.equal(result.week.endDate, '2026-11-01');
  for (const [at, hours] of [['2026-03-08T15:00:00Z', 23], ['2026-11-01T15:00:00Z', 25]]) {
    const { today } = workPeriods(Date.parse(at), 'America/New_York'); assert.equal((Date.parse(today.endAt) - Date.parse(today.startAt)) / 3600000, hours);
  }
  assert.equal(workPeriods(Date.parse('2026-10-26T02:00:00Z'), 'Asia/Kathmandu').today.startAt, '2026-10-25T18:15:00.000Z');
  assert.equal(workPeriods(Date.parse('2026-10-25T12:00:00Z'), 'Pacific/Auckland').week.startDate, '2026-10-26');
  for (const value of ['', '../bad', 'not/a-zone']) assert.throws(() => workPeriods(Date.now(), value), error => error.code === 'INVALID_ARGUMENTS');
});

test('project activity counts local dates and explicit relations once, while preserving capture exclusions', async t => {
  const f = fixture(t);
  const target = project('本项目');
  const related = route(project('别的项目'), 0, [target]);
  const primary = route(target, 1);
  f.save(`${CAPTURE}/config.json`, { protocol: PROTOCOL, activatedAt: '2026-09-01T00:00:00Z', enabled: false });
  const answered = (userAt, answerAt, extra = {}) => ({
    messages: [
      { id: 'user', role: 'user', at: userAt, content: [{ type: 'input_text', text: '测试' }], revisions: [] },
      { id: 'final', role: 'assistant', phase: 'final_answer', sourceAt: answerAt,
        content: [{ type: 'output_text', text: '最终回答' }], revisions: [] }
    ], ...extra
  });
  f.put('a', 'before-window', '2026-09-28T15:59:59Z', [primary], answered('2026-09-28T16:00:01Z', '2026-09-28T16:00:04Z'));
  f.put('a', 'first-day', '2026-09-28T16:00:00Z', [related]);
  f.put('a', 'before-midnight', '2026-10-27T15:59:59Z', [related, primary, related], answered('2026-10-27T15:59:59.500Z', '2026-10-27T16:00:08.500Z', {
    completedAt: '2026-10-27T16:00:10Z', updatedAt: '2026-10-28T02:00:00Z'
  }));
  f.put('a', 'at-midnight', '2026-10-27T16:00:00Z', [primary], answered('2026-10-27T16:00:01Z', '2026-10-27T15:59:59Z'));
  f.put('a', 'text-only', '2026-10-28T01:00:00Z', []);
  f.put('a', 'other-project', '2026-10-28T01:00:00Z', [route(project('本项目-子项目'))], answered('2026-10-28T01:00:00Z', '2026-10-28T01:10:00Z'));
  f.put('a', 'archived-scope', '2026-10-28T01:00:00Z', [route({ ...target, scope: 'archived', path: '档案/项目/本项目/project.md' })]);
  f.put('a', 'future', '2026-10-28T06:00:00Z', [primary]);
  f.put('b', 'held', undefined, [primary], answered('2026-10-28T01:00:00Z', '2026-10-28T01:10:00Z', { capturePolicyHeld: true }));
  f.put('b', 'excluded', undefined, [], { policy: 'exclude', status: 'excluded', messages: [] });
  f.put('b', 'broken', undefined, [primary]);
  writeFileSync(join(f.root, turnPath(ids.b, 'broken')), '{');
  const source = createTaskActivitySource(f.root, { now: () => Date.parse('2026-10-28T04:00:00Z') });
  const result = await source.readProject({ name: '本项目', scope: 'current', timeZone: 'Asia/Shanghai' });
  assert.equal(result.days.length, 30);
  assert.deepEqual(result.days[0], { date: '2026-09-29', count: 1 });
  assert.deepEqual(result.days.slice(-2), [{ date: '2026-10-27', count: 1 }, { date: '2026-10-28', count: 1 }]);
  assert.equal(result.total, 3);
  assert.deepEqual(result.duration, { totalMs: 12_000, measuredTurns: 2, unmeasuredTurns: 2 });
  assert.equal(result.captureEnabled, false);
  assert.equal(result.partial, true);
  assert.deepEqual(Object.keys(result).sort(), ['captureEnabled','days','duration','partial','timeZone','total']);
  assert.equal((await source.read()).activity.some(row => Object.hasOwn(row, 'projectKeys') || Object.hasOwn(row, 'answeredAt')), false);
  await assert.rejects(source.readProject({ name: '本项目', scope: 'current', timeZone: 'invalid' }), { code: 'INVALID_ARGUMENTS' });
});

test('project cards use archived work arrangements without turning them into chat ownership', async t => {
  const f = fixture(t), target = project('日用子项目'), other = project('另一个项目');
  const arrangement = { relatedProjects: [project('仅关联')], executor: null, methods: [] };
  const facts = extra => ({ routeFacts: { abilityIds: [], workChanges: [], ...extra } });
  const opening = (turnId, revision, at, selected = target) => ({ turnId, revision, at,
    project: selected, projectChanged: true, arrangement });
  const answered = at => ({ messages: [
    { id: 'u', role: 'user', at, content: [{ type: 'input_text', text: '已收到' }], revisions: [] },
    { id: 'a', role: 'assistant', phase: 'final_answer', sourceAt: new Date(Date.parse(at) + 6_000).toISOString(),
      content: [{ type: 'output_text', text: '已交付' }], revisions: [] },
  ] });
  const at = '2026-10-28T01:00:00Z';
  f.put('a', 'a-open', at, [], { ...facts({ workChanges: [opening('a-open', 1, at), opening('a-open', 2, at)] }), ...answered(at) });
  f.put('a', 'b-continue', '2026-10-28T02:00:00Z', [], { ...facts({ startingArrangementRevision: 2 }), ...answered('2026-10-28T02:00:00Z') });
  f.put('a', 'c-start', '2026-10-28T03:00:00Z', [], facts({ startingProject: { name: target.name, scope: target.scope } }));
  f.put('a', 'd-explicit', '2026-10-28T04:00:00Z', [route(other)], facts({ startingArrangementRevision: 2 }));
  f.put('b', 'foreign-pointer', '2026-10-28T03:00:00Z', [], facts({ startingArrangementRevision: 2 }));
  f.put('b', 'held', at, [], { ...facts({ workChanges: [opening('held', 3, at)] }), capturePolicyHeld: true });
  f.put('b', 'private-pointer', '2026-10-28T03:00:00Z', [], facts({ startingArrangementRevision: 3 }));
  f.put('c', 'no-evidence', '2026-10-28T03:00:00Z', [], facts({ abilityIds: ['partner.test.one'] }));

  const source = createTaskActivitySource(f.root, { now: () => Date.parse('2026-10-28T05:00:00Z') });
  const readProject = name => source.readProject({ name, scope: 'current', timeZone: 'Asia/Shanghai' });
  const result = await readProject(target.name);
  assert.equal(result.total, 3);
  assert.equal(result.days.at(-1).count, 3);
  assert.deepEqual(result.duration, { totalMs: 12_000, measuredTurns: 2, unmeasuredTurns: 1 });
  assert.equal(result.partial, false);
  assert.equal((await readProject(other.name)).total, 1);
  assert.equal((await readProject('仅关联')).total, 0);
  const { activity } = await source.read();
  assert.deepEqual(activity.find(row => row.turnId === 'b-continue').primaryTargets, []);
  assert.equal(activity.some(row => ['arrangements', 'openingRevision', 'startingProject'].some(key => Object.hasOwn(row, key))), false);
});

test('counts active chats and native turns, primary history and stable identities without leaking bodies or adopted abilities', async t => {
  const f = fixture(t), at = Date.parse('2026-10-28T12:00:00+08:00');
  f.put('a', 'old', '2026-10-25T23:59:59+08:00', [route(project('旧项目'))]);
  f.put('a', 'monday', '2026-10-26T09:00:00+08:00', [route(project('甲')), route(project('乙'), 1), route(project('甲'), 2)]);
  f.put('a', 'knowledge-one', '2026-10-28T00:00:00+08:00', [route(knowledge('一'), 0, [project('仅关联')])]);
  f.put('a', 'knowledge-two', '2026-10-28T02:00:00+08:00', [route(knowledge('二'))], { status: 'interrupted' });
  const targetId = 'e'.repeat(64);
  f.put('b', 'planned', '2026-10-28T03:00:00+08:00', [route({ kind: 'ability', name: '待创建能力', lifecycle: 'planned', targetId, targetVersion: 1 }), route(ability('partner.test.one', { lifecycle: 'existing', targetId, targetVersion: 2 }), 1)]);
  f.put('b', 'different-identity', '2026-10-28T04:00:00+08:00', [route(ability('partner.test.two'))]);
  f.put('c', 'unreported', '2026-10-28T05:00:00+08:00', [], { status: 'pending' });
  f.put('d', 'exclude', undefined, [], { policy: 'exclude', status: 'excluded', messages: [] });
  f.put('d', 'held', undefined, [], { policy: 'pending', status: 'pending', messages: [] });
  f.put('d', 'empty', undefined, [], { messages: [] });
  f.put('d', 'held-with-body', undefined, [], { capturePolicyHeld: true });
  f.put('d', 'future', '2026-10-29T04:00:00+08:00', [route(project('未来'))]);
  const stats = await createWorkStats(f.root, { now: () => at }).read({ timeZone: 'Asia/Shanghai' });
  assert.deepEqual(stats.errors, []);
  assert.deepEqual(stats.today.counts, { tasks: 3, turns: 5, projects: 0, knowledge: 2, abilities: 2 });
  assert.deepEqual(stats.week.counts, { tasks: 3, turns: 6, projects: 2, knowledge: 2, abilities: 2 });
  assert.equal(stats.activity.filter(row => row.turnId === 'planned')[0].primaryTargets.length, 1);
  assert.equal(stats.activity.filter(row => row.turnId === 'monday')[0].primaryTargets.length, 2);
  assert.doesNotMatch(JSON.stringify(stats), /正文|工具证据|仅采用能力|仅关联/);
  assert.ok(stats.activity.every(row => row.startedAt.endsWith('Z')));
});

test('task CLI counts and pages the same captured turns by work project and ability participation', async t => {
  const f = fixture(t), name = 'CLI 项目', objectId = 'partner.test.one';
  const target = project(name), adopted = { ...ability(objectId), stage: 'adopted' };
  const use = (project, abilityIds = [objectId]) => ({ routeFacts: {
    startingProject: { name: project.name, scope: project.scope }, workChanges: [], abilityIds,
  } });
  const env = { CODEX_THREAD_ID: 'project-query-test' };
  const run = async (...args) => {
    const result = await runTaskCommand([...args, '--json'], f.root, { env });
    return { ...JSON.parse(result.stdout), exitCode: result.exitCode };
  };
  assert.equal((await run('stats')).errors[0].code, 'TASK_CURRENT_PROJECT_REQUIRED');
  mkdirSync(dirname(join(f.root, target.path)), { recursive: true });
  writeFileSync(join(f.root, target.path), '---\nname: CLI 项目\nstatus: active\n---\n# CLI 项目\n');
  bindCurrentWork({ root: f.root, env, ifMatch: 'missing', current: {
    schemaVersion: 1, goal: '统计验证', status: 'active', ownership: { state: 'bound', target: { kind: 'project', name, scope: 'current' } },
    executor: null, methods: [], files: [], taskRef: null,
  } });
  const legacy = route(target);
  legacy.snapshot.abilities = [adopted];
  const reviewed = route(ability(objectId));
  reviewed.snapshot.abilities = [{ ...adopted, stage: 'read' }];
  f.put('a', 'project-only', '2026-10-28T01:00:00Z', [], use(target, []));
  f.put('a', 'adopted', '2026-10-28T02:00:00Z', [legacy]);
  f.put('a', 'both-sources', '2026-10-28T03:00:00Z', [legacy], use(target));
  f.put('b', 'ability-only', '2026-10-28T04:00:00Z', [], use(project('另一个项目')));
  f.put('b', 'reviewed', '2026-10-28T05:00:00Z', [reviewed]);
  f.put('c', 'held', '2026-10-28T06:00:00Z', [], { ...use(target), chatPolicyHeld: true });

  const byProject = await run('stats', '--time-zone', 'Asia/Shanghai');
  assert.equal(byProject.exitCode, 0);
  assert.equal(byProject.data.turnCount, 3);
  assert.equal(byProject.data.chatCount, 1);
  assert.equal((await run('stats', '--ability', objectId)).data.turnCount, 3);
  const both = await run('stats', '--current-project', '--ability', objectId);
  assert.equal(both.data.turnCount, 2);

  const selectors = ['--project', `current:${name}`, '--ability', objectId];
  const summary = await run('turns', ...selectors, '--limit', '1');
  assert.equal(summary.data.total, 2);
  assert.equal(summary.data.nextOffset, 1);
  assert.equal(summary.data.turns[0].turnId, 'both-sources');
  assert.doesNotMatch(JSON.stringify(summary), /正文不能进入|回答正文|"messages"/);
  const full = await run('turns', ...selectors, '--offset', '1', '--with-messages');
  assert.equal(full.exitCode, 0);
  assert.equal(full.data.nextOffset, null);
  assert.equal(full.data.turns[0].turnId, 'adopted');
  assert.equal(full.data.turns[0].turn.messages.length, 2);
  assert.equal(full.data.turns[0].turn.routes.length, 1);
  assert.equal((await run('stats', '--ability', `${objectId}@0.1.0`)).exitCode, 2);
});

test('incremental cache reads changed files only, shares concurrent computation and never writes archive data', async t => {
  const f = fixture(t); let clock = Date.parse('2026-10-28T12:00:00+08:00'); const reads = [];
  const turn = f.put('a', 'one', undefined, [route(project('甲'))]);
  const path = turnPath(ids.a, 'one'), original = readFileSync(join(f.root, path));
  const service = createWorkStats(f.root, { now: () => clock, onRead: path => reads.push(path) });
  const [first, repeated] = await Promise.all([service.read(), service.read()]); assert.equal(first, repeated); assert.equal(reads.length, 2);
  assert.deepEqual(readFileSync(join(f.root, path)), original); assert.deepEqual(readdirSync(f.root), ['档案']);
  clock += 15001; await service.read(); assert.equal(reads.length, 2);
  f.save(path, { ...turn, revision: 2, routes: [route(project('乙'))] }); clock += 15001;
  const changed = await service.read(); assert.equal(reads.length, 3); assert.equal(changed.week.counts.projects, 1); assert.equal(changed.activity[0].primaryTargets[0].label, '乙');
  f.save(`${ARCHIVE}/${ids.a}/task.json`, { protocol: PROTOCOL, taskId: ids.a, title: '新标题' });
  assert.equal((await service.read({ refresh: true })).activity[0].taskTitle, '新标题'); assert.equal(reads.length, 4);
  rmSync(join(f.root, path)); assert.equal((await service.read({ refresh: true })).week.counts.turns, 0);
});

test('crossing midnight and Monday resets ranges within the cache TTL; overnight updates remain on their start day', async t => {
  const f = fixture(t); let clock = Date.parse('2026-10-25T23:59:59+08:00');
  f.put('a', 'overnight', '2026-10-25T23:58:00+08:00', [route(project('甲'))], { updatedAt: '2026-10-26T06:00:00+08:00' });
  const service = createWorkStats(f.root, { now: () => clock }); const sunday = await service.read({ timeZone: 'Asia/Shanghai' }); assert.equal(sunday.today.counts.turns, 1);
  clock += 2000; const monday = await service.read({ timeZone: 'Asia/Shanghai' }); assert.equal(monday.today.counts.turns, 0); assert.equal(monday.week.counts.turns, 0); assert.equal(monday.week.startDate, '2026-10-26');
});

test('bad JSON and symlinks are isolated, repaired records recover, and valid records remain countable', async t => {
  const f = fixture(t); const good = f.put('a', 'good'); const bad = f.put('b', 'bad');
  writeFileSync(join(f.root, turnPath(ids.b, 'bad')), '{');
  const link = join(f.root, turnPath(ids.a, 'link')); symlinkSync(join(f.root, turnPath(ids.a, 'good')), link);
  let reads = 0;
  const service = createWorkStats(f.root, { now: () => Date.parse('2026-10-28T12:00:00+08:00'), onRead: () => reads++ }); let result = await service.read();
  assert.equal(result.week.counts.turns, 1); assert.equal(result.errors.length, 2); assert.ok(result.errors.every(error => error.taskId));
  const firstReads = reads; await service.read({ refresh: true }); assert.equal(reads, firstReads, 'unchanged damaged JSON must not be parsed repeatedly');
  f.save(turnPath(ids.b, 'bad'), bad); rmSync(link); result = await service.read({ refresh: true }); assert.equal(result.errors.length, 0); assert.equal(result.week.counts.turns, 2);
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, turnPath(ids.a, 'good')))), good);
});

test('archive projection yields between batches instead of monopolizing the event loop', async t => {
  const f = fixture(t); for (let i = 0; i < 40; i++) f.put('a', `turn-${i}`);
  let finished = false, reads = 0;
  const service = createWorkStats(f.root, { now: () => Date.parse('2026-10-28T12:00:00+08:00'), onRead: () => reads++ });
  const first = service.read().then(value => { finished = true; return value; }), second = service.read();
  await setImmediate(); assert.equal(finished, false);
  const [a, b] = await Promise.all([first, second]); assert.equal(a, b); assert.equal(reads, 41); assert.equal(a.week.counts.turns, 40);
});

test('HTTP work statistics are guarded read-only routes with validated time zones and live archive data', async t => {
  let server;
  t.after(() => server?.close());

  const f = fixture(t); f.put('a', 'live', new Date().toISOString(), [route(project('甲'))]);
  server = await startWebServer({ root: f.root, port: 0, capture: false });
  const path = server.url + 'api/work-stats?timeZone=Asia%2FShanghai'; const response = await fetch(path), data = (await response.json()).data;
  assert.equal(response.status, 200); assert.equal(data.today.counts.turns, 1); assert.equal(data.activity[0].turnId, 'live');
  assert.equal((await fetch(path, { method: 'HEAD' })).status, 200);
  for (const query of ['timeZone=bad', 'timeZone=', 'timeZone=UTC&timeZone=UTC', 'refresh=2', 'refresh=1&refresh=1']) assert.equal((await fetch(server.url + 'api/work-stats?' + query)).status, 400);
  assert.equal((await fetch(path, { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(path, { headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await fetch(path + '&refresh=1')).status, 200);
});
