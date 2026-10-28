import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { routingFixture } from './helpers/routing-fixture.js';
import { enableChat, registerChatTurn, readChat, mutateChat, readChatContext } from '../src/services/chat.js';
import { taskHook } from '../src/services/tasks.js';
import { runChatCommand } from '../src/commands/chat.js';
import { CONFIG, DIRECTORY } from '../src/chat-state/storage.js';
import { MAX_CONTEXT_BYTES, MAX_CONTEXT_ABILITIES, MAX_CONTEXT_SCAN, formatChatContext } from '../src/chat-state/context.js';

function fixture(t, enabled = true) {
  const f = routingFixture(t), identity = { host: 'codex', sessionId: randomUUID() };
  const options = { root: f.root, identity }, env = { CODEX_THREAD_ID: identity.sessionId };
  if (enabled) enableChat({ root: f.root, at: '2026-01-01T00:00:00Z' });
  const source = join(f.root, 'host.jsonl');
  writeFileSync(source, JSON.stringify({ type: 'session_meta', payload: { id: identity.sessionId, cwd: f.root } }) + '\n');
  return { ...f, options, identity, env, source,
    start: turnId => registerChatTurn({ ...options, turnId }),
    use: (objectId, turnId) => mutateChat({ ...options, objectId, turnId, operation: 'use' }),
    read: objectId => readChat({ ...options, objectId }),
    write: (values, objectId) => mutateChat({ ...options, objectId, operation: 'write', values, ifMatch: readChat({ ...options, objectId }).etag }),
    context: () => readChatContext(options),
    hook: turnId => taskHook({ root: f.root, input: { session_id: identity.sessionId, turn_id: turnId, hook_event_name: 'UserPromptSubmit', transcript_path: source } }),
  };
}
function files(root) {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => {
    const path = join(e.parentPath, e.name); return [path.slice(root.length), readFileSync(path, 'utf8')];
  }));
}
function injected(output) {
  const text = output.hookSpecificOutput.additionalContext;
  return JSON.parse(text.slice(text.indexOf('KSF_CHAT_STATE_V1')).split('\n')[1]);
}
test('context preview is read-only, preserves missing identity and never invents a turn', async t => {
  const f = fixture(t, false), before = files(f.root), state = f.context();
  assert.equal(state.system.chatTurnNumber, null); assert.equal(state.shared.state, 'missing');
  assert.deepEqual(state.abilities, []); assert.equal(state.complete, true);
  assert.deepEqual(files(f.root), before);
  assert.throws(() => readChatContext({ root: f.root, env: {} }), { code: 'CHAT_IDENTITY_REQUIRED' });
  const result = await runChatCommand(['context', '--json'], f.root, { env: f.env });
  assert.equal(result.exitCode, 0); assert.deepEqual(JSON.parse(result.stdout).data, state);
  assert.equal((await runChatCommand(['context', '--object', 'partner.test.a', '--json'], f.root, { env: f.env })).exitCode, 2);
});
test('native Hook injects public and continuing ability values and versions without adopting them', async t => {
  const f = fixture(t), id = 'partner.test.research', key = `动态_${randomUUID()}`;
  await f.hook('one'); f.use(id, 'one');
  const saved = f.write({ [key]: { nested: [null, true, 42] }, nil: null }, id);
  const shared = f.write({ [key]: 'public' });
  const output = await f.hook('two'), before = files(f.root), state = injected(output);
  assert.equal(state.system.chatTurnNumber, 2); assert.equal(state.system.turnId, 'two');
  assert.equal(state.shared.values[key], 'public'); assert.equal(state.shared.version.etag, shared.etag);
  const ability = state.abilities.find(a => a.objectId === id);
  assert.deepEqual(ability.values, saved.values); assert.equal(ability.version.etag, saved.etag);
  assert.equal(ability.version.revision, saved.revision); assert.equal(ability.version.schemaVersion, 1);
  assert.equal(ability.runId, saved.system.runId); assert.equal(ability.abilityTurnNumber, 1);
  assert.equal(ability.participatedInCurrentTurn, false); assert.equal(state.complete, true);
  assert.equal(state.byteLength, Buffer.byteLength(formatChatContext(state)));
  f.context(); await f.hook('two'); assert.deepEqual(files(f.root), before);
  assert.equal(f.read(id).system.abilityTurnNumber, 1);
  const adopted = f.use(id, 'two'); assert.equal(adopted.system.abilityTurnNumber, 2);
  assert.throws(() => mutateChat({ ...f.options, objectId: id, operation: 'write', values: { x: 1 }, ifMatch: ability.version.etag }), { code: 'CHAT_CONFLICT' });
});
test('continuation follows the latest actual participating set and survives turns without adoption', t => {
  const f = fixture(t), a = 'partner.test.a', b = 'competency.test.b', c = 'cooperation.test.c', candidate = 'data-package.test.unused';
  f.start('one'); f.use(a, 'one'); f.use(b, 'one'); f.write({ candidateOnly: true }, candidate);
  f.start('two'); f.use(c, 'two');
  assert.deepEqual(f.context().abilities.map(s => s.objectId), [b, a, c].sort((x, y) => x.localeCompare(y)));
  f.start('three'); assert.deepEqual(f.context().abilities.map(s => s.objectId), [c]);
  f.start('four'); assert.deepEqual(f.context().abilities.map(s => s.objectId), [c]);
  assert.equal(f.context().selection.lastParticipatingTurnId, 'two');
  assert.equal(f.read(a).system.abilityTurnNumber, 1); assert.equal(f.read(candidate).system.abilityTurnNumber, 0);
  const other = readChatContext({ root: f.root, identity: { host: 'codex', sessionId: randomUUID() } });
  assert.deepEqual(other.abilities, []); assert.deepEqual(other.shared.values, {});
});
test('context preserves literal arbitrary keys, null and prototypes as data', t => {
  const f = fixture(t), id = 'data-package.test.dynamic'; f.start('one'); f.use(id, 'one');
  const values = JSON.parse('{"__proto__":{"safe":true},"constructor":false,"a.b":null,"toString":[1]}');
  f.write(values, id); f.start('two');
  const state = f.context().abilities[0];
  assert.deepEqual(state.values, values); assert.equal(state.valuesComplete, true);
  assert.equal(Object.hasOwn(state.values, '__proto__'), true); assert.equal({}.safe, undefined);
});
test('UTF-8 budget omits whole fields explicitly, preserves versions and leaves storage intact', async t => {
  const f = fixture(t), id = 'partner.test.budget'; f.start('one'); f.use(id, 'one');
  const key = `任意_${randomUUID()}`, values = { [key]: { huge: '界'.repeat(200000) }, nil: null, tiny: [1, true] };
  for (let i = 0; i < 100; i++) values[`更多_${i}`] = '汉'.repeat(200);
  const saved = f.write(values, id); f.write({ sharedSmall: '保留' });
  const output = await f.hook('two'), before = files(f.root), state = injected(output), ability = state.abilities[0];
  assert.ok(state.byteLength <= MAX_CONTEXT_BYTES); assert.ok(Buffer.byteLength(output.hookSpecificOutput.additionalContext) <= 16 * 1024);
  assert.equal(state.byteLength, Buffer.byteLength(formatChatContext(state)));
  assert.equal(state.complete, false); assert.equal(ability.valuesComplete, false);
  assert.ok(ability.omittedFieldCount > 0); assert.equal(Object.hasOwn(ability.values, key), false);
  assert.equal(ability.values.nil, null); assert.deepEqual(ability.values.tiny, [1, true]);
  assert.equal(ability.version.etag, saved.etag); assert.equal(state.shared.values.sharedSmall, '保留');
  assert.equal(ability.omittedFieldCount, Object.keys(values).length - Object.keys(ability.values).length);
  assert.deepEqual(f.read(id).values, values); assert.deepEqual(files(f.root), before);
});
test('ability count budget reports omitted scopes without changing participation', t => {
  const f = fixture(t); f.start('one');
  for (let i = 0; i < MAX_CONTEXT_ABILITIES + 5; i++) f.use(`partner.test.ability-${i}`, 'one');
  f.start('two'); const before = files(f.root), state = f.context();
  assert.equal(state.abilities.length, MAX_CONTEXT_ABILITIES); assert.equal(state.omittedAbilityCount, 5);
  assert.equal(state.complete, false); assert.ok(state.byteLength <= MAX_CONTEXT_BYTES);
  assert.ok(state.abilities.every(a => a.abilityTurnNumber === 1 && !a.participatedInCurrentTurn));
  assert.deepEqual(files(f.root), before);
});
test('damaged ability state is explicit and does not hide valid public or ability values', t => {
  const f = fixture(t), good = 'partner.test.good', bad = 'partner.test.bad'; f.start('one');
  f.use(good, 'one'); f.use(bad, 'one'); f.write({ kept: true }, good); f.write({ public: 1 });
  const target = join(f.root, f.read(bad).path); writeFileSync(target, '{broken'); f.start('two');
  const before = files(f.root), state = f.context();
  assert.equal(state.shared.values.public, 1); assert.equal(state.abilities[0].values.kept, true);
  assert.equal(state.complete, false); assert.equal(state.selection.complete, false);
  assert.equal(state.issues[0].code, 'CHAT_DATA_INVALID'); assert.deepEqual(files(f.root), before);
  writeFileSync(target, JSON.stringify({ schemaVersion: 999, objectId: bad }));
  assert.equal(f.context().issues[0].code, 'CHAT_VERSION_UNSUPPORTED');
  rmSync(target); symlinkSync(join(f.root, CONFIG), target);
  assert.equal(f.context().issues[0].code, 'USER_DATA_PATH_INVALID');
});
test('invalid participation and discovery capacity return gaps, not fabricated continuation', t => {
  const f = fixture(t), id = 'partner.test.invalid'; f.start('one'); f.use(id, 'one');
  const target = join(f.root, f.read(id).path), doc = JSON.parse(readFileSync(target, 'utf8'));
  doc.turnIds = ['unregistered']; writeFileSync(target, JSON.stringify(doc)); f.start('two');
  assert.equal(f.context().issues[0].code, 'CHAT_DATA_INVALID'); assert.deepEqual(f.context().abilities, []);
  const dir = join(f.root, DIRECTORY, f.read().system.chatId, 'abilities');
  for (let i = 0; i < MAX_CONTEXT_SCAN; i++) writeFileSync(join(dir, `unrelated-${i}`), 'x');
  const state = f.context(); assert.equal(state.complete, false);
  assert.equal(state.issues[0].code, 'CHAT_CONTEXT_CAPACITY'); assert.deepEqual(state.abilities, []);
});
test('broken public state does not erase native count or stop the Hook dispatcher', async t => {
  const f = fixture(t); await f.hook('one'); f.write({ x: 1 });
  writeFileSync(join(f.root, f.read().path), '{broken');
  const output = (await f.hook('two')).hookSpecificOutput.additionalContext;
  assert.match(output, /chatTurnNumber=2/); assert.match(output, /KSF chat state unavailable: CHAT_DATA_INVALID/);
  assert.doesNotMatch(output, /KSF chat tracking unavailable/);
});
test('unusually long capability identifiers cannot escape the metadata or issue budget', t => {
  const f = fixture(t), id = 'partner.test.' + 'a'.repeat(MAX_CONTEXT_BYTES * 2);
  f.start('one'); f.use(id, 'one'); f.start('two');
  const state = f.context(); assert.ok(state.byteLength <= MAX_CONTEXT_BYTES);
  assert.equal(state.omittedAbilityCount, 1); assert.equal(state.complete, false);
  const target = join(f.root, f.read(id).path), doc = JSON.parse(readFileSync(target, 'utf8'));
  doc.turnIds = ['unknown']; writeFileSync(target, JSON.stringify(doc));
  const damaged = f.context(); assert.ok(damaged.byteLength <= MAX_CONTEXT_BYTES);
  assert.equal(damaged.issues[0].objectIdOmitted, true);
});
