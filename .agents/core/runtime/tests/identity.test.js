import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readUserData, writeUserData, removeUserData, listUserData } from '../src/services/user-data.js';
import { runUserDataCommand } from '../src/commands/user-data.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ksf identity 中文 '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const read = namespace => readUserData({ root, namespace: namespace ?? 'identity' });
  const write = (values, options = {}) => writeUserData({ root, namespace: 'identity', values, ifMatch: read().etag, ...options });
  return { root, read, write };
}
const profile = { name: '示例用户', email: 'author@example.invalid', namespace: 'example-author' };

test('identity reads as missing without creating or inferring user details', t => {
  const f = fixture(t);
  assert.deepEqual(f.read().values, {});
  assert.equal(f.read().state, 'missing');
  assert.equal(listUserData({ root: f.root }).entries.find(item => item.namespace === 'identity').state, 'missing');
  assert.deepEqual(readdirSync(f.root), []);
});
test('identity saves local fields and partial writes preserve omitted contact and namespace values', t => {
  const f = fixture(t), first = f.write(profile);
  assert.equal(first.revision, 1);
  const document = JSON.parse(readFileSync(join(f.root, '.agents/user-data/identity.json')));
  assert.equal(document.namespace, 'identity'); assert.equal(document.schema_version, 1);
  f.write({ name: '新的显示名' });
  assert.deepEqual(f.read().values, { ...profile, name: '新的显示名' });
  assert.equal(f.read().revision, 2);
  assert.equal(f.write({ name: '新的显示名' }).changed, false);
});
for (const values of [
  { name: '' }, { name: '  ' }, { name: 'a\nb' }, { name: 123 },
  { email: 'not-an-email' }, { email: 'Name <a@example.invalid>' }, { email: 'a@example.invalid\n' },
  { namespace: 'one.two' }, { namespace: 'two words' }, { namespace: '../outside' }, { namespace: '' },
  { github: { id: 1, login: 'example' } }, { verified: true },
]) {
  test(`invalid or unregistered identity input is rejected: ${JSON.stringify(values)}`, t => {
    const f = fixture(t);
    assert.throws(() => f.write(values), { code: 'USER_DATA_INVALID' });
    assert.deepEqual(readdirSync(f.root), []);
  });
}
test('namespace is a local ID segment; duplicates in different workspaces need no account verification', t => {
  const first = fixture(t), second = fixture(t);
  first.write(profile); second.write(profile);
  assert.equal(first.read().values.namespace, second.read().values.namespace);
  assert.equal(first.write({ namespace: '用户' }).changed, true);
});
test('identity dry-run, stale versions and removal retain existing settings independently', t => {
  const f = fixture(t);
  assert.equal(f.write(profile, { dryRun: true }).wouldChange, true);
  assert.deepEqual(readdirSync(f.root), []);
  writeUserData({ root: f.root, namespace: 'settings', values: { updates: { request_timeout_seconds: 20 } }, ifMatch: 'missing' });
  const settings = readFileSync(join(f.root, '.agents/user-data/settings.json'));
  f.write(profile); const etag = f.read().etag;
  f.write({ email: 'new@example.invalid' });
  assert.throws(() => f.write({ name: 'stale edit' }, { ifMatch: etag }), { code: 'USER_DATA_CONFLICT' });
  assert.equal(f.read().values.email, 'new@example.invalid');
  removeUserData({ root: f.root, namespace: 'identity', ifMatch: f.read().etag });
  assert.equal(f.read().state, 'missing');
  assert.deepEqual(readFileSync(join(f.root, '.agents/user-data/settings.json')), settings);
});
test('copying the portable directory preserves identity without device locks or credentials', t => {
  const first = fixture(t), second = fixture(t);
  first.write(profile);
  cpSync(join(first.root, '.agents/user-data'), join(second.root, '.agents/user-data'), { recursive: true });
  assert.deepEqual(second.read().values, profile);
  assert.equal(second.read().etag, first.read().etag);
  assert.equal(existsSync(join(second.root, '.agents/runtime-data')), false);
});
test('local identity writes do not rename existing objects or change Git configuration', t => {
  const f = fixture(t), files = { '能力/基本功/competency.user.example/competency.md': 'id: competency.user.example\n', '.git/config': '[user]\n name = Existing Author\n' };
  for (const [path, bytes] of Object.entries(files)) { mkdirSync(dirname(join(f.root, path)), { recursive: true }); writeFileSync(join(f.root, path), bytes); }
  f.write(profile);
  for (const [path, bytes] of Object.entries(files)) assert.equal(readFileSync(join(f.root, path), 'utf8'), bytes);
});
test('identity uses existing CLI write/read/check/remove, and help lists its local fields', t => {
  const f = fixture(t), run = args => runUserDataCommand(args, f.root);
  assert.match(run(['--help']).stdout, /settings, identity/);
  assert.match(run(['write', '--help']).stdout, /name, email and namespace/);
  const created = run(['write', 'identity', '--data', JSON.stringify(profile), '--if-match', 'missing', '--json']);
  assert.equal(created.exitCode, 0); assert.equal(JSON.parse(created.stdout).data.revision, 1);
  const read = JSON.parse(run(['read', 'identity', '--json']).stdout);
  assert.deepEqual(read.data.values, profile);
  assert.equal(JSON.parse(run(['check', 'identity', '--json']).stdout).data.valid, true);
  assert.equal(run(['remove', 'identity', '--if-match', read.data.etag, '--json']).exitCode, 0);
});
test('real CLI saves identity from another cwd using the KSF root without remote account lookup', t => {
  const f = fixture(t), runtime = fileURLToPath(new URL('../', import.meta.url)), local = join(f.root, '.agents/core/runtime');
  mkdirSync(local, { recursive: true }); cpSync(join(runtime, 'src'), join(local, 'src'), { recursive: true });
  cpSync(join(runtime, 'package.json'), join(local, 'package.json'));
  const result = spawnSync(process.execPath, [join(local, 'src/cli.js'), 'user-data', 'write', 'identity', '--data', JSON.stringify(profile), '--if-match', 'missing', '--json'], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, KSF_GITHUB_TOKEN: '', GH_TOKEN: '', GITHUB_TOKEN: '', HTTPS_PROXY: 'http://127.0.0.1:1' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(f.read().values, profile);
});
