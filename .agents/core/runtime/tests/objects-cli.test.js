import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, cpSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runObjectCommand } from '../src/commands/objects.js';
import { types } from '../src/objects/schema.js';
import { withObjectLock } from '../src/objects/storage.js';

const runtime = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf objects CLI ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const def of Object.values(types)) for (const source of ['system', 'user']) mkdirSync(join(root, def[source]), { recursive: true });
  const run = (type, ...args) => {
    const result = runObjectCommand(type, args, root);
    return { ...result, result: JSON.parse(result.stdout) };
  };
  return { root, run };
}

test('all object types have command/operation help and appear in top-level help', () => {
  const top = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), '--help'], { encoding: 'utf8' });
  for (const type of Object.keys(types)) {
    assert.ok(top.stdout.includes(`ksf ${type} --help`));
    for (const args of [[], ['--help'], ['-h'], ...['list', 'read', 'write', 'remove', 'check'].map(operation => [operation, '--help'])]) {
      const result = runObjectCommand(type, args, '/');assert.equal(result.exitCode, 0);assert.match(result.stdout, /Usage:/);
    }
  }
});

test('retired object commands and identities are rejected without publishing objects', t => {
  const f = fixture(t);
  const top = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), '--help'], { encoding: 'utf8' });
  assert.ok(!top.stdout.includes('ksf skill'));
  for (const args of [['--help'], ['list', '--json'], ['read', 'skill.test.x', '--json'],
    ['write', 'skill.test.x', '--data', '{}', '--json'], ['remove', 'skill.test.x', '--json'], ['check', 'skill.test.x', '--json']]) {
    const result = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), 'skill', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    if (args.includes('--json')) assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENTS');
  }
  assert.equal(f.run('skill', '--help', '--json').exitCode, 2);
  assert.equal(f.run('competency', 'read', 'skill.test.x', '--json').exitCode, 2);
  const input = JSON.stringify({metadata:{name:'测试',description:'不接受已移除类型的依赖',status:'draft',version:'0.1.0',references:['skill.test.x@0.1.0']},body:'# 测试\n'});
  const write = f.run('competency', 'write', 'competency.test.x', '--data', input, '--json');
  assert.equal(write.exitCode, 1, write.stdout);
  assert.equal(write.result.errors[0].code, 'OBJECT_INVALID');
  assert.ok(write.result.errors.some(error => error.code === 'OBJECT_REFERENCE_INVALID'));
  assert.equal(f.run('competency', 'list', '--json').result.data.objects.length, 0);
});

test('CLI creates, reads selected parts, updates and removes four types through the same contract', t => {
  const f = fixture(t);
  for (const type of Object.keys(types)) {
    const id = `${type}.test.item`;
    const input = JSON.stringify({ metadata: { name: '测试', description: '用于验证', status: 'draft', version: '0.1.0' }, body: '# 正文' });
    const written = f.run(type, 'write', id, '--data', input, '--json');
    assert.equal(written.exitCode, 0, written.stdout);assert.equal(written.result.data.user_revision, 1);
    assert.deepEqual(Object.keys(written.result), ['ok', 'command', 'operation', 'data', 'errors']);
    const listed = f.run(type, 'list', '--source', 'all', '--json');
    assert.equal(listed.result.data.complete, true);assert.equal(listed.result.data.objects.length, 1);
    assert.ok(!Object.hasOwn(listed.result.data.objects[0], 'body'));
    const defaultRead = f.run(type, 'read', id, '--json').result.data.object;
    assert.ok(Object.hasOwn(defaultRead, 'metadata'));assert.equal(defaultRead.body, '# 正文');
    const metadata = f.run(type, 'read', id, '--part', 'metadata', '--json').result.data.object;
    assert.ok(!Object.hasOwn(metadata, 'body'));
    const body = f.run(type, 'read', id, '--part=body', '--json').result.data.object;
    assert.ok(!Object.hasOwn(body, 'metadata'));assert.equal(body.body, '# 正文');
    assert.equal(f.run(type, 'check', id + '@0.1.0', '--json').result.data.valid, true);
    assert.equal(f.run(type, 'write', id, '--data', '{"body":"new"}', '--dry-run', '--json').result.data.changed, false);
    assert.equal(f.run(type, 'write', id, '--data', '{"body":"new"}', '--json').result.data.user_revision, 2);
    assert.equal(f.run(type, 'remove', id, '--json').result.data.changed, true);
  }
});

test('invalid object CLI calls return exit 2 and a JSON result without writing', t => {
  const f = fixture(t);
  for (const args of [
    ['get', 'partner.test.x'], ['read'], ['read', 'bad-id'], ['read', 'competency.test.x'],
    ['read', 'partner.test.x@latest'], ['read', 'partner.test.x', '--part', 'resources'],
    ['read', 'partner.test.x', '--source', 'all'], ['read', 'partner.test.x', '--part'],
    ['read', 'partner.test.x', '--part', 'body', '--part', 'all'],
    ['read', 'partner.test.x', '--unknown'], ['list', 'extra'], ['list', '--source', 'other'],
    ['write', 'partner.test.x'], ['write', 'partner.test.x', '--data', '{}', '--from', 'data.json'],
    ['write', 'partner.test.x@0.1.0', '--data', '{}'],
    ['write', 'partner.test.x', '--data', 'PRIVATE_INVALID_INPUT'],
    ['write', 'partner.test.x', '--data', '{"metadata":[]}'],
    ['write', 'partner.test.x', '--data', '{"body":3}'],
    ['write', 'partner.test.x', '--data', '{"unexpected":true}'],
    ['write', 'partner.test.x', '--data', '{}', '--source', 'system'],
    ['remove', 'partner.test.x', '--force'], ['remove', 'partner.test.x', '--json'],
  ]) {
    const result = f.run('partner', ...args, '--json');
    assert.equal(result.exitCode, 2, args.join(' '));assert.equal(result.result.ok, false);
    assert.ok(!result.stdout.includes('PRIVATE_INVALID_INPUT'));
  }
  assert.equal(existsSync(join(f.root, '.agents/runtime-data')), false);
});

test('object metadata validation errors report fields; missing objects and invalid checks return exit 1', t => {
  const f = fixture(t), id = 'partner.test.x';
  const invalid = f.run('partner', 'write', id, '--data', '{"body":"x"}', '--json');
  assert.equal(invalid.exitCode, 1);assert.equal(invalid.result.errors[0].code, 'OBJECT_INVALID');
  assert.ok(invalid.result.errors.some(error => error.field === 'version'));
  assert.equal(f.run('partner', 'read', id, '--json').exitCode, 1);
  assert.equal(f.run('partner', 'check', id, '--json').result.data.valid, false);
  assert.equal(f.run('partner', 'remove', id, '--json').exitCode, 1);
});

test('relative --from uses KSF root across cwd, supports Unicode body and does not use global Node', t => {
  const f = fixture(t), deployed = join(f.root, '.agents/core/runtime');mkdirSync(deployed, { recursive: true });
  cpSync(join(runtime, 'src'), join(deployed, 'src'), { recursive: true });cpSync(join(runtime, 'package.json'), join(deployed, 'package.json'));
  const data = { metadata: { name: '示例', description: 'CLI 输入', status: 'draft', version: '0.1.0' }, body: '# Unicode 正文\r\n' };
  writeFileSync(join(f.root, 'definition.json'), JSON.stringify(data));
  const other = join(f.root, 'other');mkdirSync(other);writeFileSync(join(other, 'definition.json'), 'WRONG');
  const launch = (...args) => spawnSync(process.execPath, [join(deployed, 'src/cli.js'), 'partner', ...args], { cwd: other, encoding: 'utf8', env: { ...process.env, PATH: '' } });
  const written = launch('write', 'partner.test.x', '--from', 'definition.json', '--json');assert.equal(written.status, 0, written.stdout + written.stderr);assert.equal(written.stderr, '');
  const read = launch('read', 'partner.test.x', '--part', 'body', '--json');assert.equal(read.status, 0, read.stdout);assert.equal(JSON.parse(read.stdout).data.object.body, data.body);
  withObjectLock(f.root, () => {
    const blocked = launch('write', 'partner.test.x', '--data', '{"body":"other"}', '--json');
    assert.equal(blocked.status, 1);assert.equal(JSON.parse(blocked.stdout).errors[0].code, 'OBJECT_LOCKED');
  });
  const removed = launch('remove', 'partner.test.x', '--json');assert.equal(removed.status, 0, removed.stdout);
});

test('CLI ordinary text output is readable and preserves old commands', t => {
  const f = fixture(t);const output = runObjectCommand('partner', ['list'], f.root);
  assert.equal(output.exitCode, 0);assert.match(output.stdout, /objects/);
  const hello = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), 'hello', '--json'], { encoding: 'utf8' });
  assert.equal(hello.status, 0);assert.equal(JSON.parse(hello.stdout).message, 'Hello, KSF!');
});
