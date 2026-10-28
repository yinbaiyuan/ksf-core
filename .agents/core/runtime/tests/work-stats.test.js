import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate } from 'node:timers/promises';
import { createWorkStats, workPeriods } from '../src/services/work-stats.js';
import { PROTOCOL, ARCHIVE, turnPath } from '../src/task-capture/storage.js';
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
  const f = fixture(t); f.put('a', 'live', new Date().toISOString(), [route(project('甲'))]);
  const server = await startWebServer({ root: f.root, port: 0, capture: false }); t.after(() => server.close());
  const path = server.url + 'api/work-stats?timeZone=Asia%2FShanghai'; const response = await fetch(path), data = (await response.json()).data;
  assert.equal(response.status, 200); assert.equal(data.today.counts.turns, 1); assert.equal(data.activity[0].turnId, 'live');
  assert.equal((await fetch(path, { method: 'HEAD' })).status, 200);
  for (const query of ['timeZone=bad', 'timeZone=', 'timeZone=UTC&timeZone=UTC', 'refresh=2', 'refresh=1&refresh=1']) assert.equal((await fetch(server.url + 'api/work-stats?' + query)).status, 400);
  assert.equal((await fetch(path, { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(path, { headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await fetch(path + '&refresh=1')).status, 200);
});
