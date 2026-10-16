import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { readUserData, writeUserData, removeUserData, checkUserData, listUserData } from '../src/services/user-data.js';
import { runUserDataCommand } from '../src/commands/user-data.js';
import { configuration } from '../src/distribution/common.js';

const runtime = fileURLToPath(new URL('../', import.meta.url));
const defaults = { schema_version: 1, core_repository: 'example/core', core_branch: 'main', template_repository: 'example/workspace', release_source: 'https://example.invalid/index.json', index_asset: 'ksf-core-release.json', check_interval_seconds: 86400, request_timeout_seconds: 10 };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ksf user data 中文 '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
  const read = () => readUserData({ root, namespace: 'settings' });
  const write = (values, extra = {}) => writeUserData({ root, namespace: 'settings', values, ifMatch: read().etag, ...extra });
  return { root, put, read, write };
}
test('reads, checks and listing an unconfigured workspace create no user data or local state', t => {
  const f = fixture(t), before = readdirSync(f.root);
  assert.equal(f.read().etag, 'missing'); assert.deepEqual(f.read().values, {});
  assert.equal(checkUserData({ root: f.root, namespace: 'settings' }).valid, null);
  const list = listUserData({ root: f.root }); assert.equal(list.complete, true); assert.equal(list.entries[0].state, 'missing');
  assert.deepEqual(readdirSync(f.root), before);
});
test('write uses a versioned envelope, merges top-level fields and replaces each supplied value', t => {
  const f = fixture(t);
  const first = f.write({ updates: { check_interval_seconds: 3600, request_timeout_seconds: 20 } });
  assert.equal(first.changed, true); assert.equal(first.revision, 1);
  assert.match(first.etag, /^[a-f0-9]{64}$/);
  const document = JSON.parse(readFileSync(join(f.root, '.agents/user-data/settings.json')));
  assert.equal(document.schema_version, 1); assert.equal(document.namespace, 'settings');
  const next = f.write({ updates: { request_timeout_seconds: 5 } });
  assert.equal(next.revision, 2); assert.deepEqual(f.read().values, { updates: { request_timeout_seconds: 5 } });
  assert.equal(existsSync(join(f.root, '.agents/user-data/.gitignore')), false);
  assert.equal(existsSync(join(f.root, '.agents/user-data/settings.lock')), false);
  assert.equal(existsSync(join(f.root, '.agents/runtime-data/user-data/settings.lock')), false);
});
test('no-op writes preserve bytes and revision; removing only settings resets its override', t => {
  const f = fixture(t); f.write({ updates: { request_timeout_seconds: 20 } });
  const before = readFileSync(join(f.root, '.agents/user-data/settings.json'));
  assert.equal(f.write({}).changed, false); assert.equal(f.read().revision, 1);
  assert.deepEqual(readFileSync(join(f.root, '.agents/user-data/settings.json')), before);
  f.put('项目/project.md', 'user work');
  const result = removeUserData({ root: f.root, namespace: 'settings', ifMatch: f.read().etag });
  assert.equal(result.changed, true); assert.equal(f.read().state, 'missing');
  assert.equal(readFileSync(join(f.root, '项目/project.md'), 'utf8'), 'user work');
});
test('dry-run and missing removal create neither portable files nor local locks', t => {
  const f = fixture(t);
  assert.equal(f.write({ updates: { request_timeout_seconds: 20 } }, { dryRun: true }).wouldChange, true);
  assert.equal(removeUserData({ root: f.root, namespace: 'settings', ifMatch: 'missing' }).changed, false);
  assert.deepEqual(readdirSync(f.root), []);
});
for (const values of [{ tasks: {} }, { notes: 'work' }, { updates: { automatic: true } }, { updates: { request_timeout_seconds: 0 } }, { updates: { check_interval_seconds: 59 } }, { updates: { request_timeout_seconds: 61 } }, null, []]) {
  test(`unregistered work content and invalid settings are rejected: ${JSON.stringify(values)}`, t => {
    const f = fixture(t);
    assert.throws(() => f.write(values), { code: 'USER_DATA_INVALID' });
    assert.deepEqual(readdirSync(f.root), []);
  });
}
test('arbitrary namespaces and path traversal never create target paths', t => {
  const f = fixture(t);
  for (const namespace of ['tasks', '../outside', 'settings.json', 'CON']) assert.throws(() => writeUserData({ root: f.root, namespace, values: {}, ifMatch: 'missing' }), { code: 'USER_DATA_NAMESPACE_UNKNOWN' });
  assert.deepEqual(readdirSync(f.root), []);
});
test('unknown versions and malformed JSON remain unchanged on read, check, write and remove', t => {
  const f = fixture(t);
  for (const bytes of ['<<<<<<< sync conflict\n', JSON.stringify({ schema_version: 2, namespace: 'settings', revision: 1, values: {} })]) {
    f.put('.agents/user-data/settings.json', bytes);
    const expected = bytes.startsWith('{') ? 'USER_DATA_VERSION_UNSUPPORTED' : 'USER_DATA_INVALID';
    for (const action of [f.read, () => checkUserData({ root: f.root, namespace: 'settings' }), () => f.write({}), () => removeUserData({ root: f.root, namespace: 'settings', ifMatch: 'missing' })]) assert.throws(action, { code: expected });
    assert.equal(readFileSync(join(f.root, '.agents/user-data/settings.json'), 'utf8'), bytes);
    assert.equal(listUserData({ root: f.root }).complete, false);
  }
});
test('stale etags and edits during publication preserve the current file', t => {
  const f = fixture(t); f.write({ updates: { request_timeout_seconds: 20 } });
  const etag = f.read().etag; f.write({ updates: { request_timeout_seconds: 21 } });
  assert.throws(() => f.write({ updates: {} }, { ifMatch: etag }), { code: 'USER_DATA_CONFLICT' });
  const concurrent = JSON.stringify({ schema_version: 1, namespace: 'settings', revision: 3, values: { updates: { request_timeout_seconds: 30 } } });
  assert.throws(() => f.write({ updates: {} }, { beforePublish: () => f.put('.agents/user-data/settings.json', concurrent) }), { code: 'USER_DATA_CONFLICT' });
  assert.equal(readFileSync(join(f.root, '.agents/user-data/settings.json'), 'utf8'), concurrent);
  assert.deepEqual(readdirSync(join(f.root, '.agents/user-data')), ['settings.json']);
  assert.equal(existsSync(join(f.root, '.agents/runtime-data/user-data/settings.lock')), false);
});
test('a local writer lock prevents a second writer while another namespace file remains untouched', t => {
  const f = fixture(t); f.write({ updates: { request_timeout_seconds: 20 } });
  f.put('.agents/runtime-data/user-data/settings.lock', 'active writer');
  assert.throws(() => f.write({ updates: {} }), { code: 'USER_DATA_LOCKED' });
  assert.equal(readFileSync(join(f.root, '.agents/runtime-data/user-data/settings.lock'), 'utf8'), 'active writer');
  assert.equal(f.read().values.updates.request_timeout_seconds, 20);
});
test('simultaneous first writers publish one settings version and preserve its data', async t => {
  const f = fixture(t), module = new URL('../src/services/user-data.js', import.meta.url).href;
  const writes = Array.from({ length: 6 }, (_, index) => new Promise((resolve, reject) => {
    const code = `import { writeUserData } from ${JSON.stringify(module)};
      try { writeUserData({root:process.argv[1], namespace:'settings', values:{updates:{request_timeout_seconds:${index + 1}}}, ifMatch:'missing'}); }
      catch(error) { process.stderr.write(error.code ?? error.message); process.exitCode=1; }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, f.root]);
    let stderr = '';
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stderr }));
  }));
  const outcomes = await Promise.all(writes);
  assert.equal(outcomes.filter(item => item.status === 0).length, 1);
  for (const item of outcomes.filter(item => item.status !== 0)) assert.match(item.stderr, /^USER_DATA_(CONFLICT|LOCKED)$/);
  assert.equal(f.read().revision, 1);
  assert.deepEqual(readdirSync(join(f.root, '.agents/user-data')), ['settings.json']);
  assert.equal(existsSync(join(f.root, '.agents/runtime-data/user-data/settings.lock')), false);
});
test('copying only portable user-data to another device keeps settings and needs no old locks or paths', t => {
  const first = fixture(t), second = fixture(t);
  first.write({ updates: { check_interval_seconds: 600 } });
  first.put('.agents/runtime-data/user-data/settings.lock', 'old device lock');
  cpSync(join(first.root, '.agents/user-data'), join(second.root, '.agents/user-data'), { recursive: true });
  assert.equal(second.read().etag, first.read().etag);
  assert.equal(existsSync(join(second.root, '.agents/runtime-data')), false);
  assert.equal(second.write({ updates: { check_interval_seconds: 1200 } }).revision, 2);
  assert.equal(first.read().values.updates.check_interval_seconds, 600);
});
test('symlinks including broken links are rejected without touching their targets', t => {
  const f = fixture(t); f.put('outside.json', 'preserve target'); mkdirSync(join(f.root, '.agents/user-data'), { recursive: true });
  for (const target of ['outside.json', 'missing.json']) {
    const link = join(f.root, '.agents/user-data/settings.json');
    try { symlinkSync(join(f.root, target), link); }
    catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('OS account cannot create symlinks.'); return; } throw error; }
    assert.throws(f.read, { code: 'USER_DATA_PATH_INVALID' }); rmSync(link);
  }
  assert.equal(readFileSync(join(f.root, 'outside.json'), 'utf8'), 'preserve target');
});
test('a linked user-data directory cannot redirect a write into another location', t => {
  const f = fixture(t); mkdirSync(join(f.root, '.agents')); mkdirSync(join(f.root, 'outside'));
  try { symlinkSync(join(f.root, 'outside'), join(f.root, '.agents/user-data'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('OS account cannot create directory links.'); return; } throw error; }
  assert.throws(() => f.write({ updates: { request_timeout_seconds: 20 } }), { code: 'USER_DATA_PATH_INVALID' });
  assert.deepEqual(readdirSync(join(f.root, 'outside')), []);
});
test('list exposes unknown and sync-conflict entries without deleting or selecting them', t => {
  const f = fixture(t); f.write({ updates: {} }); f.put('.agents/user-data/settings (conflict).json', 'conflicting copy');
  const listed = listUserData({ root: f.root });
  assert.equal(listed.complete, false); assert.equal(listed.errors[0].code, 'USER_DATA_UNKNOWN_ENTRY');
  assert.equal(readFileSync(join(f.root, '.agents/user-data/settings (conflict).json'), 'utf8'), 'conflicting copy');
});
test('settings affect explicit system configuration; Core build defaults and source bytes stay unchanged', t => {
  const f = fixture(t); f.put('.agents/core/distribution.json', JSON.stringify(defaults));
  const original = readFileSync(join(f.root, '.agents/core/distribution.json'));
  f.write({ updates: { check_interval_seconds: 600, request_timeout_seconds: 20 } });
  assert.equal(configuration(f.root).check_interval_seconds, 86400);
  const effective = configuration(f.root, { user: true });
  assert.equal(effective.check_interval_seconds, 600); assert.equal(effective.request_timeout_seconds, 20);
  assert.deepEqual(readFileSync(join(f.root, '.agents/core/distribution.json')), original);
});
test('CLI supplies unified JSON, both help levels and strict mutation preconditions', t => {
  const f = fixture(t), run = args => runUserDataCommand(args, f.root);
  for (const args of [[], ['--help'], ['write', '--help']]) assert.equal(run(args).exitCode, 0);
  for (const args of [['write', 'settings', '--data', '{}'], ['write', 'settings', '--data', '{}', '--from', 'x', '--if-match', 'missing'], ['read', 'settings', '--json', '--json'], ['remove'], ['list', 'settings'], ['read', 'settings', '--dry-run']]) {
    const result = run([...args, '--json']); assert.equal(result.exitCode, 2); assert.equal(JSON.parse(result.stdout).ok, false);
  }
  const badJson = run(['write', 'settings', '--data', '{', '--if-match', 'missing', '--json']); assert.equal(badJson.exitCode, 2);
  const created = run(['write', 'settings', '--data', '{"updates":{"request_timeout_seconds":20}}', '--if-match=missing', '--json']);
  assert.equal(created.exitCode, 0); assert.equal(JSON.parse(created.stdout).data.revision, 1);
  f.put('.agents/user-data/conflict.json', 'inspect');
  const partial = run(['list', '--json']); assert.equal(partial.exitCode, 1); assert.equal(JSON.parse(partial.stdout).data.complete, false);
});
test('real JavaScript CLI resolves --from against its KSF root when called from another cwd', t => {
  const f = fixture(t), localRuntime = join(f.root, '.agents/core/runtime');
  mkdirSync(localRuntime, { recursive: true }); cpSync(join(runtime, 'src'), join(localRuntime, 'src'), { recursive: true });
  cpSync(join(runtime, 'package.json'), join(localRuntime, 'package.json'));
  f.put('settings-input.json', '{"updates":{"request_timeout_seconds":20}}');
  const result = spawnSync(process.execPath, [join(localRuntime, 'src/cli.js'), 'user-data', 'write', 'settings', '--from', 'settings-input.json', '--if-match', 'missing', '--json'], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr + result.stdout); assert.equal(JSON.parse(result.stdout).data.changed, true);
  assert.equal(f.read().values.updates.request_timeout_seconds, 20);
});
