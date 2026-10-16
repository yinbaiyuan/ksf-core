import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMetadataCommand, parseMetadataArgs } from '../src/commands/metadata.js';
import { withWriteLock } from '../src/metadata/files.js';

const runtime = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf metadata CLI ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'note.md'), '# BODY\n');
  const run = (...args) => {
    const result = runMetadataCommand(args, root);
    return { ...result, result: JSON.parse(result.stdout) };
  };
  return { root, run };
}

test('metadata and all operation help are available, and top-level help includes metadata', () => {
  const top = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), '--help'], { encoding: 'utf8' });
  assert.match(top.stdout, /ksf metadata --help/);
  for (const args of [[], ['--help'], ['-h'], ...['read', 'write', 'remove', 'check'].map(op => [op, '--help'])]) {
    const result = runMetadataCommand(args, '/');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage:/);
  }
});

test('CLI supports multi-field selection, deduplication, flags after fields and literal names', t => {
  const f = fixture(t);
  assert.equal(f.run('write', 'note.md', '--data', '{"title":"笔记","tags":["KSF"],"display name":true,"a.b":null,"--name":3}', '--json').exitCode, 0);
  const read = f.run('read', 'note.md', '--fields', 'title', 'tags', 'title', 'missing', '--json');
  assert.equal(read.exitCode, 0);
  assert.deepEqual(read.result.data.values, { title: '笔记', tags: ['KSF'] });
  assert.deepEqual(read.result.data.missingFields, ['missing']);
  assert.deepEqual(f.run('read', 'note.md', '--fields', 'display name', 'a.b', '--json').result.data.values, { 'display name': true, 'a.b': null });
  assert.deepEqual(f.run('read', 'note.md', '--fields=--name', '--json').result.data.values, { '--name': 3 });
  const removed = f.run('remove', 'note.md', '--fields', 'title', 'tags', 'missing', '--json');
  assert.equal(removed.result.data.changes.length, 2);
  assert.deepEqual(removed.result.data.missingFields, ['missing']);
});

test('options can precede target except multi-value fields; end-of-options supports hyphen target', t => {
  const f = fixture(t); writeFileSync(join(f.root, '-note.md'), '# title');
  assert.equal(f.run('read', '--json', '--', '-note.md').result.data.state, 'absent');
  assert.equal(f.run('write', '--data={"a":1}', '--json', 'note.md').exitCode, 0);
  assert.equal(f.run('read', '--json', 'note.md', '--fields', 'a').result.data.values.a, 1);
});

test('JSON envelope reports calls, invalid input and missing files with distinct exit codes', t => {
  const f = fixture(t);
  for (const args of [
    ['get', 'note.md'], ['set', 'note.md'], ['read'],
    ['read', 'note.md', '--field', 'a'],
    ['read', 'note.md', '--fields'],
    ['read', '--fields', 'a', 'note.md'],
    ['read', 'note.md', '--fields', 'a', '--fields', 'b'],
    ['read', 'note.md', '--json'], // second --json appended below is invalid
    ['read', 'note.md', '--dry-run'],
    ['read', 'note.md', '--unknown'],
    ['read', 'note.md', 'extra'],
    ['write', 'note.md'],
    ['write', 'note.md', '--data', '{}', '--from', 'in.json'],
    ['write', 'note.md', '--data', '[]'],
    ['write', 'note.md', '--data', '{private-invalid-input'],
    ['remove', 'note.md'],
    ['remove', 'note.md', '--all', '--fields', 'a'],
    ['remove', 'note.md', '--all=true'],
    ['check', 'note.md', '--fields', 'a'],
  ]) {
    const result = f.run(...args, '--json');
    assert.equal(result.exitCode, 2, args.join(' '));
    assert.equal(result.result.ok, false);
    assert.ok(['INVALID_ARGUMENTS', 'INPUT_INVALID'].includes(result.result.errors[0].code));
    assert.ok(!result.stdout.includes('private-invalid-input'));
  }
  const missing = f.run('read', 'missing.md', '--json');
  assert.equal(missing.exitCode, 1);assert.equal(missing.result.errors[0].code, 'FILE_NOT_FOUND');
  assert.deepEqual(readFileSync(join(f.root, 'note.md')), Buffer.from('# BODY\n'));
});

test('malformed frontmatter check returns invalid state, diagnostic location and no body', t => {
  const f = fixture(t);writeFileSync(join(f.root, 'note.md'), '---\na: 1\na: 2\n---\nPRIVATE_BODY');
  const result = f.run('check', 'note.md', '--json');
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.result.data, { target: join(f.root, 'note.md'), state: 'invalid', valid: false });
  assert.equal(result.result.errors[0].line, 3);
  assert.equal(result.result.errors[0].column, 1);
  assert.ok(!result.stdout.includes('PRIVATE_BODY'));
  assert.equal(f.run('remove', 'note.md', '--all', '--json').result.data.changed, false);
});

test('text and JSON results distinguish absent, preview, unchanged and actual updates', t => {
  const f = fixture(t);
  assert.match(runMetadataCommand(['check', 'note.md'], f.root).stdout, /not set/);
  assert.equal(f.run('check', 'note.md', '--json').result.data.valid, null);
  assert.match(runMetadataCommand(['write', 'note.md', '--data', '{"a":1}', '--dry-run'], f.root).stdout, /Preview:/);
  assert.equal(f.run('write', 'note.md', '--data', '{"a":1}', '--dry-run', '--json').result.data.changed, false);
  assert.equal(f.run('write', 'note.md', '--data', '{"a":1}', '--json').result.data.changed, true);
  assert.match(runMetadataCommand(['write', 'note.md', '--data', '{"a":1}'], f.root).stdout, /Unchanged:/);
  assert.match(runMetadataCommand(['read', 'note.md', '--fields', 'a', 'missing'], f.root).stdout, /Missing fields:/);
});

test('CLI loaded from another cwd resolves target and --from against its own KSF root without global Node', t => {
  const f = fixture(t);
  const deployed = join(f.root, '.agents/core/runtime');mkdirSync(deployed, { recursive: true });
  cpSync(join(runtime, 'src'), join(deployed, 'src'), { recursive: true });
  cpSync(join(runtime, 'package.json'), join(deployed, 'package.json'));
  writeFileSync(join(f.root, 'input.json'), '{"title":"from root","created":"2026-05-18"}');
  const foreign = join(f.root, 'foreign');mkdirSync(foreign);
  writeFileSync(join(foreign, 'input.json'), '{"title":"WRONG"}');writeFileSync(join(foreign, 'note.md'), '# WRONG');
  const launch = (...args) => spawnSync(process.execPath, [join(deployed, 'src/cli.js'), 'metadata', ...args], {
    cwd: foreign, encoding: 'utf8', env: { ...process.env, PATH: '' },
  });
  const write = launch('write', 'note.md', '--from', 'input.json', '--json');
  assert.equal(write.status, 0, write.stderr);
  assert.equal(write.stderr, '');
  const read = launch('read', 'note.md', '--json');
  assert.equal(read.status, 0, read.stderr);
  assert.deepEqual(JSON.parse(read.stdout).data.values, { title: 'from root', created: '2026-05-18' });
  assert.equal(JSON.parse(read.stdout).data.target, join(f.root, 'note.md'));
  assert.equal(readFileSync(join(foreign, 'note.md'), 'utf8'), '# WRONG');
  const missingInput = launch('write', 'note.md', '--from', 'missing.json', '--json');
  assert.equal(missingInput.status, 1);assert.equal(JSON.parse(missingInput.stdout).errors[0].code, 'FILE_NOT_FOUND');
  const absolute = launch('read', join(foreign, 'note.md'), '--json');
  assert.equal(JSON.parse(absolute.stdout).data.target, join(foreign, 'note.md'));
});

test('new operations leave old CLI error protocol intact', () => {
  const result = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), 'test', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 2);assert.equal(result.stdout, '');assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENTS');
});

test('input parsing errors and dry-runs leave no lock or temporary file', t => {
  const f = fixture(t);
  f.run('write', 'note.md', '--data', 'null', '--json');
  f.run('write', 'note.md', '--data', '{}', '--dry-run', '--json');
  assert.deepEqual(readdirSync(f.root), ['note.md']);
  assert.equal(parseMetadataArgs(['read', 'note.md', '--fields', '', 'a']).fields[0], '');
});

test('another CLI process cannot write through an existing metadata lock', t => {
  const f = fixture(t); const target = join(f.root, 'note.md');
  withWriteLock(target, () => {
    const result = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), 'metadata', 'write', target, '--data', '{"a":1}', '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'FILE_LOCKED');
    assert.equal(readFileSync(target, 'utf8'), '# BODY\n');
  });
  assert.deepEqual(readdirSync(f.root), ['note.md']);
});
