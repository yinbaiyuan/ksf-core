import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, rmdirSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync, chmodSync, symlinkSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { recordDefinition } from '../src/user-data/records.js';
import { types, protectedPaths } from '../src/objects/schema.js';
import { readUserData, checkUserData, writeUserData, removeUserData, listUserData } from '../src/services/user-data.js';
import { parseUserDataArgs, runUserDataCommand } from '../src/commands/user-data.js';

function fixture(t, objectId = 'partner.test.settings') {
  const root = mkdtempSync(join(tmpdir(), 'ksf object settings 测试 '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const read = id => readUserData({ root, objectId: id ?? objectId });
  const write = (values, extra = {}) => writeUserData({ root, objectId, ifMatch: read().etag, values, ...extra });
  const remove = (extra = {}) => removeUserData({ root, objectId, ifMatch: read().etag, ...extra });
  return { root, objectId, path: join(root, recordDefinition(undefined, objectId).path), read, write, remove };
}

test('missing reads, checks, lists, removals and previews create no directories or locks', t => {
  const f = fixture(t); assert.equal(f.read().state, 'missing');
  assert.equal(checkUserData({ root: f.root, objectId: f.objectId }).valid, null);
  assert.deepEqual(listUserData({ root: f.root, objects: true }), { complete: true, entries: [], errors: [] });
  assert.equal(f.remove().changed, false); assert.equal(f.remove({ fields: ['x'] }).changed, false);
  assert.equal(f.write({ language: '中文' }, { dryRun: true }).revision, 1);
  assert.deepEqual(readdirSync(f.root), []);
});
for (const objectId of [...Object.keys(types).map(type => `${type}.测试.对象`), ...Object.keys(protectedPaths)]) test(`${objectId}: data requires no installed object or custom schema`, t => {
  const f = fixture(t, objectId); f.write({ nested: { language: '中文' }, flags: [null, true] });
  const data = f.read(), document = JSON.parse(readFileSync(f.path));
  assert.equal(data.objectId, objectId); assert.equal(data.revision, 1);
  assert.equal(document.object_id, objectId); assert.equal(document.schema_version, 1);
  assert.equal(Object.hasOwn(document, 'namespace'), false); assert.equal(Object.hasOwn(document, 'version'), false);
  assert.match(f.path, /abilities\/[a-f0-9]{64}\.json$/); assert.equal(statSync(f.path).mode & 0o777, 0o600);
  assert.equal(listUserData({ root: f.root }).complete, true);
});

test('merge, null, no-op bytes, permissions, literal key removal and full reset preserve their contracts', t => {
  const f = fixture(t); f.write(JSON.parse('{"nested":{"a":1,"b":2},"a.b":2,"keep":null,"__proto__":{"polluted":true},"":3}'));
  f.write({ nested: { a: 3 } }); assert.deepEqual(f.read().values.nested, { a: 3 });
  const bytes = readFileSync(f.path), ino = statSync(f.path).ino, etag = f.read().etag;
  assert.equal(f.write({}).changed, false); assert.equal(f.write({ keep: null }).changed, false);
  assert.deepEqual(readFileSync(f.path), bytes); assert.equal(statSync(f.path).ino, ino); assert.equal(f.read().etag, etag);
  const preview = f.remove({ fields: ['a.b', 'missing'], dryRun: true });
  assert.equal(preview.changed, false); assert.equal(preview.wouldChange, true); assert.deepEqual(preview.missingFields, ['missing']);
  assert.deepEqual(readFileSync(f.path), bytes);
  f.remove({ fields: ['a.b', '__proto__', '', 'a.b'] }); assert.equal({}.polluted, undefined);
  assert.deepEqual(f.read().values, { keep: null, nested: { a: 3 } });
  assert.equal(f.remove({ fields: ['missing'] }).changed, false); assert.equal(f.read().revision, 3);
  chmodSync(f.path, 0o640); f.write({ extra: 1 }); assert.equal(statSync(f.path).mode & 0o777, 0o640);
  f.remove({ fields: ['keep', 'nested', 'extra'] }); assert.equal(f.read().state, 'present'); assert.deepEqual(f.read().values, {});
  assert.equal(f.remove().changed, true); assert.equal(f.read().state, 'missing');
});

test('etag and lock conflicts preserve current data; unrelated object writers use separate locks', t => {
  const f = fixture(t), first = f.write({ value: 1 }); f.write({ value: 2 }); const bytes = readFileSync(f.path);
  for (const ifMatch of [undefined, 'missing', first.etag]) {
    const code = ifMatch === undefined ? 'INVALID_ARGUMENTS' : 'USER_DATA_CONFLICT';
    assert.throws(() => f.write({ value: 0 }, { ifMatch }), { code }); assert.throws(() => f.remove({ ifMatch }), { code });
  }
  assert.deepEqual(readFileSync(f.path), bytes);
  f.write({ value: 3 }, { beforePublish() {
    assert.throws(() => f.write({ value: 0 }), { code: 'USER_DATA_LOCKED' });
    writeUserData({ root: f.root, objectId: 'partner.test.other', ifMatch: 'missing', values: { independent: true } });
  } });
  assert.equal(f.read('partner.test.other').values.independent, true);
  const external = { schema_version: 1, object_id: f.objectId, revision: 4, values: { concurrent: true } };
  assert.throws(() => f.write({ value: 0 }, { beforePublish() { writeFileSync(f.path, JSON.stringify(external)); } }), { code: 'USER_DATA_CONFLICT' });
  assert.deepEqual(f.read().values, { concurrent: true });
  assert.ok(readdirSync(dirname(f.path)).every(name => name.endsWith('.json')));
  assert.deepEqual(readdirSync(join(f.root, '.agents/runtime-data/user-data/abilities')), []);
});

test('long Chinese and case-sensitive IDs remain distinct, portable and absent from list values', t => {
  const f = fixture(t, `competency.中文.${'长'.repeat(500)}`); f.write({ language: '中文' });
  for (const objectId of ['partner.test.Case', 'partner.test.case']) writeUserData({ root: f.root, objectId, ifMatch: 'missing', values: { objectId } });
  const list = listUserData({ root: f.root, objects: true }); assert.equal(list.complete, true); assert.equal(list.entries.length, 3);
  assert.ok(list.entries.every(row => !Object.hasOwn(row, 'values')));
  const second = fixture(t); cpSync(join(f.root, '.agents/user-data'), join(second.root, '.agents/user-data'), { recursive: true });
  assert.deepEqual(readUserData({ root: second.root, objectId: f.objectId }).values, f.read().values);
  assert.equal(existsSync(join(second.root, '.agents/runtime-data')), false);
});

test('invalid files and unknown versions are preserved; list keeps valid entries and reports bad names or identities', t => {
  const f = fixture(t); f.write({ ok: true }); const base = JSON.parse(readFileSync(f.path));
  for (const [value, code] of [
    ['{broken', 'USER_DATA_INVALID'], [JSON.stringify({ ...base, schema_version: 2 }), 'USER_DATA_VERSION_UNSUPPORTED'],
    [JSON.stringify({ ...base, object_id: 'partner.test.wrong' }), 'USER_DATA_INVALID'],
    [JSON.stringify({ ...base, revision: 0 }), 'USER_DATA_INVALID'], [JSON.stringify({ ...base, values: [] }), 'USER_DATA_INVALID'],
    [JSON.stringify({ ...base, values: { x: 9007199254740992 } }), 'USER_DATA_INVALID'], ['x'.repeat(1024 * 1024 + 1), 'USER_DATA_INVALID'],
  ]) {
    writeFileSync(f.path, value);
    for (const action of [() => f.read(), () => f.write({}, { ifMatch: 'missing' }), () => f.remove({ ifMatch: 'missing' })]) assert.throws(action, { code });
    assert.equal(readFileSync(f.path, 'utf8'), value);
  }
  writeFileSync(f.path, JSON.stringify(base)); writeFileSync(join(dirname(f.path), '0'.repeat(64) + '.json'), JSON.stringify(base));
  writeFileSync(join(dirname(f.path), 'sync-conflict.json'), 'PRIVATE_VALUE');
  const list = listUserData({ root: f.root, objects: true }); assert.equal(list.complete, false);
  assert.equal(list.entries.filter(row => row.state === 'present').length, 1); assert.equal(list.errors.length, 2);
  assert.ok(!JSON.stringify(list).includes('PRIVATE_VALUE')); assert.equal(listUserData({ root: f.root }).complete, true);
});

test('symlinks, invalid selectors and invalid or oversized input cannot overwrite files', t => {
  const f = fixture(t), outside = join(f.root, 'outside.json'); writeFileSync(outside, 'keep');
  mkdirSync(dirname(f.path), { recursive: true }); symlinkSync(outside, f.path);
  assert.throws(() => f.read(), { code: 'USER_DATA_PATH_INVALID' }); assert.equal(readFileSync(outside, 'utf8'), 'keep');
  rmSync(f.path); rmdirSync(dirname(f.path)); symlinkSync(f.root, dirname(f.path));
  assert.throws(() => f.write({}), { code: 'USER_DATA_PATH_INVALID' }); assert.equal(listUserData({ root: f.root }).complete, false);
  for (const objectId of ['../../x', 'partner.test.x@0.1.0', 'project.test.x', '']) assert.throws(() => readUserData({ root: f.root, objectId }), { code: 'INVALID_ARGUMENTS' });
  assert.throws(() => readUserData({ root: f.root, namespace: 'settings', objectId: f.objectId }), { code: 'INVALID_ARGUMENTS' });
  rmSync(dirname(f.path));
  for (const values of [[], null, { x: NaN }, { x: Infinity }, { x: new Date() }, { x: undefined }, { x: 2n }, { huge: 'a'.repeat(1024 * 1024) }]) {
    for (const dryRun of [true, false]) assert.throws(() => f.write(values, { dryRun }), { code: 'USER_DATA_INVALID' });
  }
  assert.equal(existsSync(f.path), false);
});

test('CLI selectors and field removal coexist with old namespace arguments and JSON envelopes', t => {
  const f = fixture(t), call = args => runUserDataCommand(args.concat('--json'), f.root);
  for (const args of [
    ['read', 'settings', '--object', f.objectId], ['read', '--object', f.objectId + '@0.1.0'], ['list', '--object', f.objectId], ['read', '--objects'],
    ['remove', 'settings', '--fields', 'x', '--if-match', 'missing'], ['remove', '--object', f.objectId, '--fields', '--if-match', 'missing'],
    ['write', '--object', f.objectId, '--data', '{}'], ['read', '--object', f.objectId, '--object', f.objectId],
  ]) assert.equal(call(args).exitCode, 2, args.join(' '));
  const written = call(['write', '--object', f.objectId, '--data', '{"a":1,"b":null}', '--if-match', 'missing']);
  assert.equal(written.exitCode, 0); const etag = JSON.parse(written.stdout).data.etag;
  assert.equal(call(['remove', '--object', f.objectId, '--fields=a', '--if-match', etag]).exitCode, 0);
  const list = JSON.parse(call(['list', '--objects']).stdout); assert.equal(list.command, 'user-data');
  assert.equal(list.data.entries[0].objectId, f.objectId); assert.ok(!Object.hasOwn(list.data.entries[0], 'values'));
  assert.deepEqual(parseUserDataArgs(['read', 'identity']), { operation: 'read', namespace: 'identity' });
});

test('fresh JavaScript CLI processes read the saved record from another cwd', t => {
  const f = fixture(t), runtime = join(f.root, '.agents/core/runtime');
  cpSync(new URL('../src/', import.meta.url), join(runtime, 'src'), { recursive: true }); writeFileSync(join(runtime, 'package.json'), '{"type":"module"}');
  const call = args => {
    const result = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), 'user-data', ...args, '--json'], { cwd: tmpdir(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout); return JSON.parse(result.stdout).data;
  };
  call(['write', '--object', f.objectId, '--data', '{"preferred_language":"中文"}', '--if-match', 'missing']);
  const first = call(['read', '--object', f.objectId]); assert.deepEqual(call(['read', '--object', f.objectId]), first);
  assert.equal(first.values.preferred_language, '中文');
});
