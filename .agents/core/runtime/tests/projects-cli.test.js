import {launcherInvocation} from '../src/platform/index.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runProjectCommand } from '../src/commands/projects.js';

const runtime = fileURLToPath(new URL('../', import.meta.url));
const repository = fileURLToPath(new URL('../../../../', import.meta.url));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf project CLI ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '项目'));
  const run = (...args) => {
    const result = runProjectCommand(args, root);
    return { ...result, result: JSON.parse(result.stdout) };
  };
  return { root, run };
}

test('project has top-level and all operation help with explicit removal scope', () => {
  const top = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), '--help'], { encoding: 'utf8' });
  assert.equal(top.status, 0); assert.match(top.stdout, /ksf project --help/);
  assert.match(top.stdout, /ksf build --json/);
  for (const args of [[], ['--help'], ['-h'], ...['list', 'read', 'write', 'remove', 'check'].flatMap(op => [[op, '--help'], [op, '-h']])]) {
    const result = runProjectCommand(args, '/does-not-exist');
    assert.equal(result.exitCode, 0); assert.match(result.stdout, /ENTIRE project directory/);
  }
});

test('project CLI rejects unknown, repeated, missing, conflicting and operation-specific arguments', t => {
  const f = fixture(t);
  for (const args of [
    ['create', 'a'], ['get', 'a'], ['read'], ['remove'], ['write', 'a'], ['list', 'a'],
    ['list', '--part', 'all'], ['read', 'a', '--part', 'wrong'], ['read', 'a', '--part'],
    ['write', 'a', '--data', '{}', '--from', 'a.json'], ['write', 'a', '--data', 'null'],
    ['write', 'a', '--data', '{PRIVATE_BAD_INPUT'], ['write', 'a', '--data', '{"body":12}'],
    ['read', 'a', '--json'], ['remove', 'a', '--dry-run', '--dry-run'], ['list', '--json=true'],
    ['check', '--help', '--help'], ['read', '--help', 'a'], ['write', '--help', '--dry-run'],
    ['read', 'a', 'b'], ['check', '--source', 'all'], ['read', '项目/a/project.md'],
    ['list', '--from', 'a.json'], ['remove', 'a', '--all'], ['read', 'a', '--dry-run'],
  ]) {
    const result = f.run(...args, '--json');
    assert.equal(result.exitCode, 2, args.join(' '));
    assert.equal(result.result.ok, false);
    assert.deepEqual(Object.keys(result.result), ['ok', 'command', 'operation', 'data', 'errors']);
    assert.ok(!result.stdout.includes('PRIVATE_BAD_INPUT'));
  }
});

test('project CLI supports options before target, inline values and literal hyphen names', t => {
  const f = fixture(t);
  assert.equal(f.run('write', '--data={"body":"# 字面名称"}', '--json', '--', '-项目').exitCode, 0);
  const read = f.run('read', '--part=body', '--json', '--', '-项目');
  assert.equal(read.result.data.project.body, '# 字面名称');
  assert.equal(Object.hasOwn(read.result.data.project, 'metadata'), false);
  assert.equal(f.run('check', '--json', '--', '-项目').result.data.valid, true);
});

test('project text and JSON expose previews, summaries, body parts and absent targets', t => {
  const f = fixture(t), data = JSON.stringify({ metadata: { description: '摘要' }, body: '# 正文\nPRIVATE_BODY\n' });
  assert.match(runProjectCommand(['write', '示例', '--data', data, '--dry-run'], f.root).stdout, /Preview:/);
  assert.equal(f.run('write', '示例', '--data', data, '--json').result.data.created, true);
  assert.match(runProjectCommand(['write', '示例', '--data', data], f.root).stdout, /Unchanged:/);
  const listed = runProjectCommand(['list'], f.root);
  assert.match(listed.stdout, /示例/); assert.match(listed.stdout, /摘要/); assert.ok(!listed.stdout.includes('PRIVATE_BODY'));
  assert.equal(f.run('read', '示例', '--part', 'metadata', '--json').result.data.project.body, undefined);
  assert.match(runProjectCommand(['read', '示例', '--part', 'body'], f.root).stdout, /PRIVATE_BODY/);
  assert.equal(f.run('check', '--json').result.data.valid, true);
  assert.equal(f.run('read', 'missing', '--json').exitCode, 1);
  assert.equal(f.run('read', 'missing', '--json').result.errors[0].code, 'PROJECT_NOT_FOUND');
  assert.equal(f.run('remove', 'missing', '--json').result.data.changed, false);
  assert.match(runProjectCommand(['remove', '示例'], f.root).stdout, /Removed:/);
});

test('project CLI preserves partial list/check results and puts errors on stdout', t => {
  const f = fixture(t);
  for (const name of ['正常', '损坏']) f.run('write', name, '--data', '{"body":"# 内容"}', '--json');
  writeFileSync(join(f.root, '项目/损坏/project.md'), '---\na: [\n---\n');
  const listed = f.run('list', '--json');
  assert.equal(listed.exitCode, 1); assert.equal(listed.result.data.complete, false);
  assert.deepEqual(listed.result.data.projects.map(row => row.name), ['正常']);
  const checked = f.run('check', '--json');
  assert.equal(checked.exitCode, 1); assert.equal(checked.result.data.valid, false);
  assert.match(runProjectCommand(['list'], f.root).stdout, /正常[\s\S]*YAML_INVALID/);
});

test('actual CLI resolves project and input paths against its KSF root from another cwd with empty PATH', t => {
  const f = fixture(t), deployed = join(f.root, '.agents/core/runtime');
  cpSync(join(runtime, 'src'), join(deployed, 'src'), { recursive: true });
  cpSync(join(runtime, 'package.json'), join(deployed, 'package.json'));
  mkdirSync(join(f.root, 'foreign'));
  writeFileSync(join(f.root, 'input.json'), '{"metadata":{"name":"正确"},"body":"# ROOT"}');
  writeFileSync(join(f.root, 'foreign/input.json'), '{"body":"WRONG"}');
  const launch = (...args) => spawnSync(process.execPath, [join(deployed, 'src/cli.js'), 'project', ...args],
    { cwd: join(f.root, 'foreign'), encoding: 'utf8', env: { ...process.env, PATH: '' } });
  for (const from of ['input.json', join(f.root, 'input.json')]) {
    const write = launch('write', '跨目录项目', '--from', from, '--json');
    assert.equal(write.status, 0, write.stdout + write.stderr); assert.equal(write.stderr, '');
    assert.equal(JSON.parse(write.stdout).data.project.body, '# ROOT');
  }
  assert.equal(readFileSync(join(f.root, '项目/跨目录项目/project.md'), 'utf8').includes('WRONG'), false);
  const listed = launch('list', '--json');
  assert.equal(listed.status, 0); assert.equal(JSON.parse(listed.stdout).data.projects[0].name, '跨目录项目');
  const missing = launch('write', '跨目录项目', '--from', 'missing.json', '--json');
  assert.equal(missing.status, 1); assert.equal(missing.stderr, '');
  assert.equal(JSON.parse(missing.stdout).errors[0].code, 'FILE_NOT_FOUND');
});

test('real launcher runs the full project lifecycle using bundled Node from a foreign cwd without global tools', t => {
  const f = fixture(t);
  for (const path of ['.agents/ksf', '.agents/ksf.ps1', '.agents/core/runtime/src', '.agents/core/runtime/packages']) {
    cpSync(join(repository, path), join(f.root, path), { recursive: true });
  }
  for (const path of ['.agents/core/runtime/bootstrap.sh', '.agents/core/runtime/bootstrap.ps1', '.agents/core/runtime/package.json', '.agents/core/manifest.yaml']) {
    cpSync(join(repository, path), join(f.root, path));
  }
  const launch = (...args) => {
    const invocation=launcherInvocation(f.root,['project',...args,'--json']);
    const result = spawnSync(invocation.executable, invocation.args,
      { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, PATH: '' }, timeout: 30_000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout);
  };
  const input = JSON.stringify({ metadata: { name: '启动入口测试' }, body: '# 真实入口\n' });
  assert.equal(launch('write', '端到端', '--data', input, '--dry-run').data.changed, false);
  assert.equal(existsSync(join(f.root, '项目/端到端')), false);
  assert.equal(launch('write', '端到端', '--data', input).data.created, true);
  assert.equal(launch('read', '端到端', '--part', 'body').data.project.body, '# 真实入口\n');
  assert.equal(launch('write', '端到端', '--data', '{"metadata":{"description":"更新摘要"}}').data.changed, true);
  assert.equal(launch('list').data.projects[0].description, '更新摘要');
  assert.equal(launch('check').data.valid, true);
  assert.equal(launch('remove', '端到端', '--dry-run').data.removed, false);
  assert.equal(launch('remove', '端到端').data.removed, true);
  assert.deepEqual(launch('list').data.projects, []);
});
