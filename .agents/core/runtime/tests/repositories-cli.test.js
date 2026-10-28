import {gitBinary} from './helpers/platform.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runRepositoryCommand } from '../src/commands/repositories.js';
import { project } from '../src/services/projects.js';

const runtime = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf repository CLI ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (...args) => { const result = runRepositoryCommand(args, root); return { ...result, parsed: JSON.parse(result.stdout) }; };
  return { root, run };
}
test('repository exposes top-level and operation help with explicit Git and deletion boundaries', () => {
  const top = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), '--help'], { encoding: 'utf8' });
  assert.equal(top.status, 0); assert.match(top.stdout, /ksf repository --help/);
  for (const args of [[], ['--help'], ['-h'], ...['create', 'link', 'unlink', 'list', 'check'].flatMap(op => [[op, '--help'], [op, '-h']])]) {
    const result = runRepositoryCommand(args, '/absent');
    assert.equal(result.exitCode, 0); assert.match(result.stdout, /unlink never deletes files/);
  }
});
test('repository CLI validates parameters, JSON errors, path targets and operation options', t => {
  const f = fixture(t);
  for (const args of [
    ['clone', 'url'], ['create'], ['create', '../escape'], ['create', '.'], ['create', ''],
    ['create', '.git'], ['create', '.GIT'], ['create', '.git.'], ['create', '.git', '--dry-run'],
    ['create', 'a', '--project', 'x'], ['link', 'a'], ['unlink', 'a'], ['list', 'a'],
    ['check', 'a', '--project', 'b'], ['check', '--dry-run'], ['list', '--project'],
    ['list', '--json=true'], ['create', 'a', '--force'], ['create', 'a', 'b'],
    ['create', 'a', '--dry-run', '--dry-run'], ['list', '--project=a', '--project=b'],
    ['check', '--help', '--project', 'a'], ['create', '--help', 'a'], ['check', ''],
  ]) {
    const result = f.run(...args, '--json');
    assert.equal(result.exitCode, 2, args.join(' '));
    assert.deepEqual(Object.keys(result.parsed), ['ok', 'command', 'operation', 'data', 'errors']);
  }
  assert.equal(f.run('check', 'absent', '--json').exitCode, 1);
  assert.match(runRepositoryCommand(['list'], f.root).stdout, /Repository list: ok/);
});

test('CLI rejects KSF worktrees with structured errors while retaining valid list entries', t => {
  const f = fixture(t);
  const git = args => {
    const result = spawnSync(gitBinary, ['-C', f.root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
    assert.equal(result.status, 0, result.stderr);
  };
  git(['init', '--template=', '--initial-branch=main']);
  writeFileSync(join(f.root, '.gitignore'), '/repositories/\n');
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Fictional KSF fixture']);
  project({ root: f.root, operation: 'write', name: '测试', data: { body: '# 项目' } });
  assert.equal(f.run('create', 'independent', '--json').exitCode, 0);
  git(['worktree', 'add', '--detach', join(f.root, 'repositories/shared-parent')]);
  const before = readFileSync(join(f.root, '项目/测试/project.md'));
  const linked = f.run('link', 'repositories/shared-parent', '--project', '测试', '--json');
  assert.equal(linked.exitCode, 1);
  assert.equal(linked.parsed.errors[0].code, 'REPOSITORY_SHARED_GIT');
  assert.deepEqual(readFileSync(join(f.root, '项目/测试/project.md')), before);
  const checked = f.run('check', '--json');
  assert.equal(checked.exitCode, 1);
  assert.equal(checked.parsed.data.valid, false);
  assert.ok(checked.parsed.data.repositories.some(entry => entry.name === 'independent' && entry.valid));
  assert.equal(checked.parsed.errors[0].code, 'REPOSITORY_SHARED_GIT');
});
test('real deployed CLI resolves paths from KSF root from unrelated cwd and leaves previews uncreated', t => {
  const f = fixture(t), deployed = join(f.root, '.agents/core/runtime');
  cpSync(join(runtime, 'src'), join(deployed, 'src'), { recursive: true });
  cpSync(join(runtime, 'package.json'), join(deployed, 'package.json'));
  project({ root: f.root, operation: 'write', name: '项目 甲', data: { body: '# 项目' } });
  const foreign = join(f.root, 'unrelated'); mkdirSync(foreign);
  const launch = args => {
    const result = spawnSync(process.execPath, [join(deployed, 'src/cli.js'), 'repository', ...args, '--json'], { cwd: foreign, encoding: 'utf8', env: { ...process.env, PATH: '' } });
    assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout);
  };
  assert.equal(launch(['create', '工程 甲', '--dry-run']).data.wouldChange, true);
  assert.equal(existsSync(join(f.root, 'repositories')), false);
  assert.equal(launch(['create', '工程 甲']).data.created, true);
  assert.equal(launch(['link', 'repositories/工程 甲', '--project=项目 甲']).data.changed, true);
  assert.equal(launch(['check', '--project', '项目 甲']).data.valid, true);
  assert.equal(launch(['check', 'repositories/工程 甲']).data.valid, true);
  assert.equal(launch(['unlink', 'repositories/工程 甲', '--project', '项目 甲']).data.changed, true);
  assert.equal(existsSync(join(f.root, 'repositories/工程 甲/.git')), true);
  assert.equal(existsSync(join(foreign, 'repositories')), false);
});
test('CLI supports a literal hyphen name and preserves structured errors with partial results', t => {
  const f = fixture(t);
  assert.equal(f.run('create', '--json', '--', '-工程').parsed.data.created, true);
  mkdirSync(join(f.root, 'repositories/broken')); writeFileSync(join(f.root, 'repositories/broken/keep'), 'keep');
  const checked = f.run('check', '--json');
  assert.equal(checked.exitCode, 1); assert.equal(checked.parsed.data.complete, false);
  assert.equal(checked.parsed.data.repositories.length, 2);
  assert.ok(checked.parsed.data.repositories.some(row => row.valid));
  assert.equal(readFileSync(join(f.root, 'repositories/broken/keep'), 'utf8'), 'keep');
});
