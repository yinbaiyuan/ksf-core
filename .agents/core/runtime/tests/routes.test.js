import {platform} from '../src/platform/index.js';
import {gitBinary} from './helpers/platform.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, symlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { mutateRoute, readRoute, listRoutes } from '../src/services/routes.js';
import { runRouteCommand } from '../src/commands/routes.js';
import { writeUserData, readUserData } from '../src/services/user-data.js';
import { abilitySource } from '../src/services/sources.js';
import { routingFixture } from './helpers/routing-fixture.js';
import { ROUTE_DIRECTORY } from '../src/routing/schema.js';

const recordFile = (f, record) => join(f.root, ROUTE_DIRECTORY, `${record.sessionKey}.json`);
const update = (f, record, eventId, overrides = {}, hooks) => mutateRoute({ root: f.root, operation: 'write',
  input: { identity: f.identity, eventId, roundId: record.roundId, report: f.report(overrides) }, ifMatch: record.revision, env: {} }, hooks);

test('read/list, suppression and disabled settings do not create routing state', t => {
  const f = routingFixture(t);
  assert.equal(readRoute({ root: f.root, identity: f.identity, env: {} }).state, 'missing');
  assert.deepEqual(listRoutes({ root: f.root }).records, []);
  const request = { root: f.root, operation: 'start', input: { eventId: 's', report: f.report() }, ifMatch: 'missing', env: {} };
  assert.equal(mutateRoute({ ...request, noSave: true }).reason, 'no-save');
  assert.equal(mutateRoute({ ...request, env: { KSF_ROUTE_NO_SAVE: '1' } }).reason, 'no-save');
  assert.equal(existsSync(join(f.root, '.agents/runtime-data')), false);
  writeUserData({ root: f.root, namespace: 'settings', values: { routing: { enabled: false } }, ifMatch: 'missing' });
  assert.equal(mutateRoute(request).reason, 'disabled');
  assert.equal(listRoutes({ root: f.root }).enabled, false);
  assert.equal(existsSync(join(f.root, ROUTE_DIRECTORY)), false);
});

test('native identity is required, host/session and workspace identities are isolated and private', t => {
  const f = routingFixture(t), g = routingFixture(t);
  assert.throws(() => readRoute({ root: f.root, env: {} }), { code: 'ROUTE_IDENTITY_REQUIRED' });
  assert.throws(() => mutateRoute({ root: f.root, operation: 'start', input: { eventId: 's', report: f.report() }, ifMatch: 'missing', env: {} }), { code: 'ROUTE_IDENTITY_REQUIRED' });
  assert.equal(existsSync(join(f.root, ROUTE_DIRECTORY)), false);
  const a = f.start().record, b = f.start({}, { ...f.identity, host: 'other' }).record, c = g.start().record;
  assert.notEqual(a.sessionKey, b.sessionKey); assert.notEqual(a.sessionKey, c.sessionKey);
  const raw = readFileSync(recordFile(f, a), 'utf8');
  assert.ok(!raw.includes(f.identity.sessionId));
  if(platform.supportsPosixModes)assert.equal(statSync(recordFile(f, a)).mode & 0o777, 0o600);
  if(platform.supportsPosixModes)assert.equal(statSync(join(f.root, ROUTE_DIRECTORY, 'identity.key')).mode & 0o777, 0o600);
  assert.equal(readRoute({ root: f.root, env: { CODEX_THREAD_ID: f.identity.sessionId } }).state, 'missing');
  assert.equal(listRoutes({ root: f.root, limit: 1 }).nextOffset, 1);
  assert.equal(listRoutes({ root: f.root, limit: 1, offset: 1 }).records.length, 1);
});

test('project assignment, references, no project and unresolved are explicit full snapshots', t => {
  const f = routingFixture(t);
  f.addProject('项目甲'); f.addProject('项目乙');
  let record = f.start({ project: { state: 'bound', primary: { name: '项目甲', scope: 'current' } }, references: [{ name: '项目乙', scope: 'current' }] }).record;
  assert.equal(record.current.project.primary.path, '项目/项目甲/project.md');
  record = update(f, record, 'switch', { project: { state: 'bound', primary: { name: '项目乙', scope: 'current' } } }).record;
  assert.equal(record.current.project.primary.name, '项目乙'); assert.deepEqual(record.current.references, []);
  record = update(f, record, 'unknown', { project: { state: 'unresolved' } }).record;
  assert.equal(record.current.project.state, 'unresolved');
  assert.equal(record.history[0].snapshot.project.primary.name, '项目甲');
  assert.throws(() => update(f, record, 'missing-project', { project: { state: 'bound', primary: { name: '不存在', scope: 'current' } } }));
  rmSync(join(f.root, '项目/项目甲'), { recursive: true });
  const key = record.sessionKey;
  record = update(f, record, 'none').record;
  assert.equal(readRoute({ root: f.root, key }).record.current.project.state, 'none');
  rmSync(join(f.root, '项目/项目乙'), { recursive: true });
  const g = routingFixture(t); g.addProject('删除入口');
  const bound = g.start({ project: { state: 'bound', primary: { name: '删除入口', scope: 'current' } } }).record;
  rmSync(join(g.root, '项目/删除入口'), { recursive: true });
  assert.equal(readRoute({ root: g.root, key: bound.sessionKey }).record.current.project.primary.freshness, 'unavailable');
});

test('all four types, exact definitions, stages, fixed entries and changed sources are represented', t => {
  const f = routingFixture(t);
  for (const type of ['cooperation', 'partner', 'competency', 'data-package']) f.add(`${type}.test.method`);
  f.add('partner.ksf.runtime', 'system');
  const abilities = ['cooperation', 'partner', 'competency', 'data-package'].map((type, i) => f.ability(`${type}.test.method`, 'effective', i === 0 ? 'selected' : i === 1 ? 'read' : 'adopted'));
  abilities.push(f.ability('partner.ksf.runtime', 'system'));
  const record = f.start({ abilities }).record;
  assert.equal(record.current.abilities.length, 5); assert.equal(record.current.abilities.at(-1).fixed, true);
  assert.ok(record.current.abilities.every(a => a.freshness === 'current'));
  const definition = join(f.root, record.current.abilities[0].path);
  writeFileSync(definition, readFileSync(definition, 'utf8') + '\nChanged\n');
  const changed = readRoute({ root: f.root, key: record.sessionKey }).record;
  assert.equal(changed.current.abilities[0].freshness, 'changed');
  assert.equal(changed.current.abilities[0].definitionDigest, record.current.abilities[0].definitionDigest);
  assert.throws(() => update(f, record, 'stale-definition', { abilities }), { code: 'ROUTE_DEFINITION_CHANGED' });
  assert.equal(f.start({ abilities }).replayed, true);
});

test('system and linked sources use the existing resolver and source changes do not reassign project', t => {
  const f = routingFixture(t), source = routingFixture(t);
  f.addProject('项目甲');
  f.add('partner.test.system', 'system');
  const linked = source.add('competency.test.linked');
  writeFileSync(linked, readFileSync(linked, 'utf8').replace('user_revision: 1\n', ''));
  // Local declaration/association uses the actual source service, no copied definitions.
  assert.equal(spawnSync(gitBinary, ['init', '--template=', '--initial-branch=main', source.root]).status, 0);
  abilitySource({ root: f.root, operation: 'init', target: source.root, id: 'linked', name: 'Linked' });
  abilitySource({ root: f.root, operation: 'link', target: source.root });
  const record = f.start({ project: { state: 'bound', primary: { name: '项目甲', scope: 'current' } },
    abilities: [f.ability('partner.test.system'), f.ability('competency.test.linked', 'linked')] }).record;
  assert.deepEqual(record.current.abilities.map(a => a.source), ['system', 'linked']);
  f.add('partner.test.system', 'user');
  const view = readRoute({ root: f.root, key: record.sessionKey }).record;
  assert.equal(view.current.abilities[0].effectiveChanged, true);
  assert.equal(view.current.abilities[0].source, 'system'); assert.equal(view.current.project.primary.name, '项目甲');
  assert.equal(view.current.project.primary.freshness, 'current');
});

test('events replay without writes, changed payloads conflict and old rounds cannot overwrite newer rounds', t => {
  const f = routingFixture(t), started = f.start(), first = started.record;
  const path = recordFile(f, first), initial = readFileSync(path);
  assert.equal(f.start().replayed, true); assert.deepEqual(readFileSync(path), initial);
  assert.throws(() => f.start({ summary: '不同内容' }), { code: 'ROUTE_EVENT_CONFLICT' });
  const next = mutateRoute({ root: f.root, operation: 'start', input: { identity: f.identity, eventId: 'round-2', report: f.report() }, ifMatch: first.revision }).record;
  assert.notEqual(first.roundId, next.roundId);
  assert.throws(() => update(f, first, 'late'), { code: 'ROUTE_CONFLICT' });
  assert.throws(() => update(f, { ...first, revision: next.revision }, 'late-with-new-revision'), { code: 'ROUTE_ROUND_CONFLICT' });
  assert.equal(f.start().accepted.roundId, first.roundId);
  assert.equal(readRoute({ root: f.root, key: next.sessionKey }).record.revision, next.revision);
});

test('history keeps 50 explicit changes, truncation is visible and old event receipts stay idempotent', t => {
  const f = routingFixture(t); let record = f.start().record;
  for (let i = 0; i < 53; i++) record = update(f, record, `event-${i}`, { summary: `更新 ${i}` }).record;
  assert.equal(record.revision, 54); assert.equal(record.history.length, 50); assert.equal(record.historyDropped, 4);
  assert.equal(record.history[0].revision, 5); assert.equal(f.start().replayed, true);
  const view = listRoutes({ root: f.root }); assert.equal(view.records[0].history, undefined);
});

test('interrupted staging and changing definitions preserve the last complete record and clean owned locks', t => {
  const f = routingFixture(t), definition = f.add(), abilities = [f.ability('partner.test.method')];
  const record = f.start({ abilities }).record, path = recordFile(f, record), bytes = readFileSync(path);
  assert.throws(() => update(f, record, 'interrupt', { abilities }, { beforePublish() { throw new Error('interrupt'); } }), /interrupt/);
  assert.deepEqual(readFileSync(path), bytes);
  assert.throws(() => update(f, record, 'definition-race', { abilities }, { beforePublish() { writeFileSync(definition, readFileSync(definition, 'utf8') + 'Changed\n'); } }), { code: 'ROUTE_DEFINITION_CHANGED' });
  assert.deepEqual(readFileSync(path), bytes);
  assert.equal(readdirSync(join(f.root, ROUTE_DIRECTORY)).some(name => name.endsWith('.tmp') || name.endsWith('.lock')), false);
  writeFileSync(join(f.root, ROUTE_DIRECTORY, `${record.sessionKey}.lock`), 'stale');
  assert.throws(() => update(f, record, 'locked'), { code: 'ROUTE_LOCKED' });
});

test('invalid input, damaged/unknown records and symlink paths are preserved and never treated as empty', t => {
  const f = routingFixture(t);
  assert.throws(() => f.start({ abilities: [{ ref: 'partner.test.missing@0.1.0', source: 'user', stage: 'read' }] }), { code: 'INVALID_ARGUMENTS' });
  assert.equal(existsSync(join(f.root, ROUTE_DIRECTORY)), false);
  const record = f.start().record, path = recordFile(f, record), bytes = readFileSync(path);
  for (const raw of ['{', JSON.stringify({ protocol: 'future-v2' }), JSON.stringify({ ...JSON.parse(bytes), current: {} })]) {
    writeFileSync(path, raw);
    assert.throws(() => readRoute({ root: f.root, key: record.sessionKey }));
    assert.equal(listRoutes({ root: f.root }).complete, false);
    assert.throws(() => update(f, record, 'broken'));
    assert.equal(readFileSync(path, 'utf8'), raw);
  }
  writeFileSync(path, bytes); rmSync(path); symlinkSync(join(f.root, 'USER.md'), path);
  assert.throws(() => readRoute({ root: f.root, key: record.sessionKey }), { code: 'ROUTE_PATH_INVALID' });
  const g = routingFixture(t), external = join(g.root, 'external'); mkdirSync(external);
  mkdirSync(join(g.root, '.agents/runtime-data')); symlinkSync(external, join(g.root, '.agents/runtime-data/routing'));
  assert.throws(() => g.start(), { code: 'ROUTE_PATH_INVALID' }); assert.deepEqual(readdirSync(external), []);
});

test('lost identity keys and exhausted event capacity cannot silently create a new identity or discard receipts', t => {
  const f = routingFixture(t), record = f.start().record, path = recordFile(f, record);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  doc.revision = 4096;
  doc.events = Array.from({ length: 4096 }, (_, i) => ({ ...doc.events[0], id: `event-${i}`, revision: i + 1 }));
  doc.history = Array.from({ length: 50 }, (_, i) => ({ ...doc.history[0], revision: 4047 + i, eventId: `event-${4046 + i}` }));
  doc.historyDropped = 4046;
  writeFileSync(path, JSON.stringify(doc));
  const bytes = readFileSync(path);
  assert.throws(() => update(f, { ...record, revision: 4096 }, 'over-capacity'), { code: 'ROUTE_CAPACITY' });
  assert.deepEqual(readFileSync(path), bytes);
  rmSync(join(f.root, ROUTE_DIRECTORY, 'identity.key'));
  assert.throws(() => f.start(), { code: 'ROUTE_KEY_INVALID' });
  assert.equal(existsSync(join(f.root, ROUTE_DIRECTORY, 'identity.key')), false);
});

test('CLI handles private bounded input, revision errors, env identity and zero-save mode', async t => {
  const f = routingFixture(t), args = ['start', '--from', '-', '--if-match', 'missing', '--json'];
  const stdin = { eventId: 'cli', report: f.report() };
  const run = (a, options = {}) => runRouteCommand(a, f.root, { env: { CODEX_THREAD_ID: 'private-env-id' }, ...options });
  const noSave = await run([...args, '--no-save'], { stdin }); assert.equal(JSON.parse(noSave.stdout).data.reason, 'no-save');
  assert.equal(existsSync(join(f.root, ROUTE_DIRECTORY)), false);
  const result = await run(args, { stdin }); assert.equal(result.exitCode, 0, result.stdout);
  const record = JSON.parse(result.stdout).data.record;
  assert.equal(JSON.parse((await run(['read', '--json'])).stdout).data.record.sessionKey, record.sessionKey);
  for (const args of [['start', '--json'], ['write', '--from', '-', '--if-match', 'missing', '--json'], ['list', '--limit', '0', '--json'], ['list', '--offset', '-1', '--json'], ['read', '--session', '../x', '--json'], ['list', '--json', '--json'], ['read', '--from', '-', '--session', record.sessionKey, '--json']]) {
    assert.equal((await run(args, { stdin })).exitCode, 2, args.join(' '));
  }
  const etag = readUserData({ root: f.root, namespace: 'settings' }).etag;
  assert.throws(() => writeUserData({ root: f.root, namespace: 'settings', values: { routing: { enabled: 'yes' } }, ifMatch: etag }), { code: 'USER_DATA_INVALID' });
});

test('real independent CLI writers serialize conflicting revisions through the same store', async t => {
  const f = routingFixture(t), record = f.start().record;
  const modulePath = fileURLToPath(new URL('../src/commands/routes.js', import.meta.url));
  const worker = (eventId) => {
    const input = { identity: f.identity, eventId, roundId: record.roundId, report: f.report() };
    const script = `import {runRouteCommand} from ${JSON.stringify(pathToFileURL(modulePath).href)}; const r=await runRouteCommand(['write','--from','-','--if-match','1','--json'],${JSON.stringify(f.root)});process.stdout.write(r.stdout);process.exitCode=r.exitCode;`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', data => { out += data; }); child.stdin.end(JSON.stringify(input));
    return once(child, 'exit').then(([code]) => ({ code, value: JSON.parse(out) }));
  };
  const results = await Promise.all([worker('writer-a'), worker('writer-b')]);
  assert.equal(results.filter(r => r.code === 0).length, 1);
  assert.ok(['ROUTE_LOCKED', 'ROUTE_CONFLICT'].includes(results.find(r => r.code !== 0).value.errors[0].code));
  assert.equal(readRoute({ root: f.root, key: record.sessionKey }).record.revision, 2);
});

test('real stdin rejects oversized and invalid UTF-8/JSON input before creating a routing store', t => {
  const f = routingFixture(t);
  const modulePath = fileURLToPath(new URL('../src/commands/routes.js', import.meta.url));
  const script = `import {runRouteCommand} from ${JSON.stringify(pathToFileURL(modulePath).href)};const r=await runRouteCommand(['start','--from','-','--if-match','missing','--json'],${JSON.stringify(f.root)});process.stdout.write(r.stdout);process.exitCode=r.exitCode;`;
  for (const input of [Buffer.alloc(65537, 32), Buffer.from([255]), Buffer.from('{')]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', input });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'INVALID_ARGUMENTS');
  }
  assert.equal(existsSync(join(f.root, ROUTE_DIRECTORY)), false);
});

test('real CLI waits for fragmented valid stdin and accepts it without EAGAIN or raw identity output', async t => {
  const f = routingFixture(t), modulePath = fileURLToPath(new URL('../src/commands/routes.js', import.meta.url));
  const script = `import {runRouteCommand} from ${JSON.stringify(pathToFileURL(modulePath).href)};const r=await runRouteCommand(['start','--from','-','--if-match','missing','--json'],${JSON.stringify(f.root)});process.stdout.write(r.stdout);process.exitCode=r.exitCode;`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  const payload = JSON.stringify({ identity: f.identity, eventId: 'fragmented', report: f.report() });
  let output = ''; child.stdout.on('data', data => { output += data; });
  const exited = once(child, 'exit');
  child.stdin.write(payload.slice(0, 50));
  await new Promise(resolve => setTimeout(resolve, 25));
  child.stdin.end(payload.slice(50));
  assert.equal((await exited)[0], 0, output);
  assert.equal(JSON.parse(output).data.record.revision, 1);
  assert.ok(!output.includes(f.identity.sessionId));
});
