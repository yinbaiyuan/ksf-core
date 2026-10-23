import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, realpathSync, symlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { repository } from '../src/services/repositories.js';
import { project } from '../src/services/projects.js';
import { withWriteLock } from '../src/metadata/files.js';

function git(root, args) {
  const result = spawnSync('/usr/bin/git', ['-c', 'core.quotepath=false', '-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function fixture(t, outerGit = true) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'ksf repositories 测试 ')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, '我的 KSF'); mkdirSync(root);
  writeFileSync(join(root, '.gitignore'), '/repositories/\n/.agents/runtime-data/\n');
  if (outerGit) git(root, ['init', '--template=', '--initial-branch=main']);
  const call = (operation, target, options = {}, hooks = {}) => repository({ root, operation, target, ...options }, hooks);
  const card = name => project({ root, operation: 'write', name, data: { metadata: { name, custom: 'keep' }, body: '# 项目\n\n原有正文。\n' } });
  return { root, directory, call, card };
}
function files(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => entry.isDirectory()
    ? files(join(root, entry.name)).map(([path, bytes]) => [entry.name + '/' + path, bytes])
    : [[entry.name, readFileSync(join(root, entry.name)).toString('base64')]]);
}

test('managed creation isolates Git history, keeps the exact name, and is repeatable without commits', t => {
  const f = fixture(t), created = f.call('create', '客户 方案');
  assert.equal(created.data.created, true); assert.equal(created.data.changed, true);
  const target = join(f.root, 'repositories/客户 方案');
  assert.equal(git(target, ['rev-parse', '--show-toplevel']), target);
  assert.equal(git(target, ['symbolic-ref', '--short', 'HEAD']), 'main');
  assert.equal(git(target, ['remote']), '');
  assert.notEqual(spawnSync('/usr/bin/git', ['-C', target, 'rev-parse', '--verify', 'HEAD']).status, 0);
  writeFileSync(join(target, '成果.md'), '工程正文');
  assert.equal(git(target, ['ls-files', '--others', '--exclude-standard']), '成果.md');
  assert.ok(!git(f.root, ['status', '--porcelain', '--untracked-files=all']).includes('成果.md'));
  const before = files(target);
  assert.equal(f.call('create', '客户 方案').data.changed, false); assert.deepEqual(files(target), before);
});

test('Git reserved names are rejected before creating directories, locks or calling Git', t => {
  const f = fixture(t), before = files(f.root);
  for (const name of ['.git', '.GIT', '.gIt', '.git ', '.git.', '.Git. ', '.g\u200cit', '.git\ufeff']) {
    for (const dryRun of [false, true]) {
      let calls = 0;
      assert.throws(() => f.call('create', name, { dryRun }, { run: (...args) => { calls++; return spawnSync(...args); } }), { code: 'INVALID_ARGUMENTS' });
      assert.equal(calls, 0);
      assert.deepEqual(files(f.root), before);
      assert.equal(existsSync(join(f.root, 'repositories')), false);
      assert.equal(existsSync(join(f.root, '.agents')), false);
      assert.equal(f.call('list').data.complete, true);
    }
  }
  assert.equal(f.call('create', 'git-project').data.created, true);
  assert.equal(f.call('create', '.git-project').data.created, true);
  assert.equal(f.call('check').data.valid, true);
});

test('all modifying previews leave targets and locks byte-for-byte unchanged', t => {
  const f = fixture(t); f.card('测试');
  let before = files(f.root);
  assert.equal(f.call('create', 'preview', { dryRun: true }).data.wouldChange, true);
  assert.deepEqual(files(f.root), before); assert.equal(existsSync(join(f.root, 'repositories')), false);
  f.call('create', 'actual'); before = files(f.root);
  const options = { projectName: '测试', dryRun: true };
  assert.equal(f.call('link', 'repositories/actual', options).data.wouldChange, true);
  assert.equal(f.call('unlink', 'repositories/actual', options).data.wouldChange, false);
  assert.deepEqual(files(f.root), before);
});

test('plain-folder instances create independent repositories and an absent container lists as empty', t => {
  const f = fixture(t, false);
  assert.deepEqual(f.call('list').data, { complete: true, repositories: [] });
  assert.equal(existsSync(join(f.root, 'repositories')), false);
  assert.equal(f.call('create', 'standalone').data.created, true);
  assert.equal(existsSync(join(f.root, '.git')), false);
  assert.equal(f.call('create', '工程 尾空格 ').data.created, true);
  f.card('可迁移项目');
  f.call('link', 'repositories/工程 尾空格 ', { projectName: '可迁移项目' });
  const moved = join(f.directory, '移动后的 KSF'); renameSync(f.root, moved);
  assert.equal(repository({ root: moved, operation: 'check', projectName: '可迁移项目' }).data.valid, true);
});

test('managed creation refuses a missing ignore rule and already tracked outer content', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.gitignore'), '');
  assert.throws(() => f.call('create', 'unsafe'), { code: 'REPOSITORY_NOT_IGNORED' });
  assert.equal(existsSync(join(f.root, 'repositories')), false);
  writeFileSync(join(f.root, '.gitignore'), '/repositories/\n');
  mkdirSync(join(f.root, 'repositories')); writeFileSync(join(f.root, 'repositories/old'), 'tracked');
  git(f.root, ['add', '--force', '--', 'repositories/old']);
  assert.throws(() => f.call('create', 'unsafe'), { code: 'REPOSITORY_PARENT_TRACKED' });
});

test('project associations are many-to-many, preserve content, and support external repositories in place', t => {
  const f = fixture(t); f.card('项目甲'); f.card('项目乙');
  f.call('create', 'inside');
  const outside = join(f.directory, '已有工程'); mkdirSync(outside); git(outside, ['init', '--template=', '--initial-branch=existing']);
  writeFileSync(join(outside, '原文件'), 'keep');
  const body = project({ root: f.root, operation: 'read', name: '项目甲' }).data.project.body;
  f.call('link', 'repositories/inside', { projectName: '项目甲' });
  f.call('link', outside, { projectName: '项目甲' });
  f.call('link', 'repositories/inside', { projectName: '项目乙' });
  const linked = project({ root: f.root, operation: 'read', name: '项目甲' }).data.project;
  assert.deepEqual(linked.metadata.repositories, ['../../repositories/inside', outside]);
  assert.equal(linked.metadata.custom, 'keep'); assert.equal(linked.body, body);
  assert.equal(f.call('link', outside, { projectName: '项目甲' }).data.changed, false);
  assert.equal(f.call('list', undefined, { projectName: '项目甲' }).data.repositories.length, 2);
  assert.equal(git(outside, ['symbolic-ref', '--short', 'HEAD']), 'existing');
  assert.equal(readFileSync(join(outside, '原文件'), 'utf8'), 'keep');
});

test('unlink works for a missing target, preserves other links, and never deletes an existing repository', t => {
  const f = fixture(t); f.card('测试'); f.call('create', 'one'); f.call('create', 'two');
  for (const name of ['one', 'two']) f.call('link', 'repositories/' + name, { projectName: '测试' });
  rmSync(join(f.root, 'repositories/one'), { recursive: true });
  assert.equal(f.call('check', undefined, { projectName: '测试' }).data.valid, false);
  f.call('unlink', 'repositories/one', { projectName: '测试' });
  assert.equal(f.call('check', undefined, { projectName: '测试' }).data.valid, true);
  f.call('unlink', 'repositories/two', { projectName: '测试' });
  assert.equal(existsSync(join(f.root, 'repositories/two/.git')), true);
  assert.equal(f.call('unlink', 'repositories/two', { projectName: '测试' }).data.changed, false);
});

test('project archival and deletion leave its independently managed engineering workspace unchanged', t => {
  const f = fixture(t); f.card('测试'); f.call('create', 'kept');
  f.call('link', 'repositories/kept', { projectName: '测试' });
  const target = join(f.root, 'repositories/kept'), before = files(target);
  project({ root: f.root, operation: 'write', name: '测试', data: { metadata: { status: 'archived' } } });
  assert.deepEqual(files(target), before);
  project({ root: f.root, operation: 'remove', name: '测试' });
  assert.deepEqual(files(target), before);
});

test('identity checking rejects inherited parent Git, nonempty ordinary folders and linked managed paths', t => {
  const f = fixture(t); f.card('测试');
  mkdirSync(join(f.root, 'inherited'));
  assert.throws(() => f.call('link', 'inherited', { projectName: '测试' }), { code: 'REPOSITORY_ROOT_MISMATCH' });
  mkdirSync(join(f.root, 'repositories')); mkdirSync(join(f.root, 'repositories/occupied'));
  writeFileSync(join(f.root, 'repositories/occupied/keep'), 'keep');
  assert.throws(() => f.call('create', 'occupied'), { code: 'REPOSITORY_ROOT_MISMATCH' });
  assert.equal(readFileSync(join(f.root, 'repositories/occupied/keep'), 'utf8'), 'keep');
  symlinkSync(join(f.root, 'inherited'), join(f.root, 'repositories/linked'));
  assert.throws(() => f.call('create', 'linked'), { code: 'REPOSITORY_PATH_INVALID' });
  const listed = f.call('list'); assert.equal(listed.data.complete, false); assert.equal(listed.data.repositories.length, 2);
});

test('association changes preserve concurrent edits and respect project and metadata locks', t => {
  const f = fixture(t); f.card('测试'); f.call('create', 'inside');
  const target = join(f.root, '项目/测试/project.md'), before = readFileSync(target, 'utf8');
  assert.throws(() => f.call('link', 'repositories/inside', { projectName: '测试' }, {
    beforeCheck: () => writeFileSync(target, before + 'concurrent\n'),
  }), { code: 'FILE_CONFLICT' });
  assert.equal(readFileSync(target, 'utf8'), before + 'concurrent\n');
  withWriteLock(target, () => assert.throws(() => f.call('link', 'repositories/inside', { projectName: '测试' }), { code: 'FILE_LOCKED' }));
  const repositoryLock = join(f.root, '.agents/runtime-data/repositories/write.lock'); writeFileSync(repositoryLock, 'other creator');
  assert.throws(() => f.call('create', 'blocked'), { code: 'REPOSITORY_LOCKED' });
  assert.equal(f.call('create', 'blocked', { dryRun: true }).data.wouldChange, true);
  assert.equal(f.call('list').data.complete, true); rmSync(repositoryLock);
  const lock = join(f.root, '.agents/runtime-data/projects/write.lock'); writeFileSync(lock, 'other writer');
  assert.throws(() => f.call('link', 'repositories/inside', { projectName: '测试' }), { code: 'PROJECT_LOCKED' });
  assert.equal(readFileSync(lock, 'utf8'), 'other writer');
});

test('broken association metadata is not silently replaced and ordinary project checks stay compatible', t => {
  const f = fixture(t); f.card('测试'); f.call('create', 'inside');
  project({ root: f.root, operation: 'write', name: '测试', data: { metadata: { repositories: null } } });
  assert.equal(project({ root: f.root, operation: 'check', name: '测试' }).data.valid, true);
  const before = readFileSync(join(f.root, '项目/测试/project.md'));
  assert.throws(() => f.call('link', 'repositories/inside', { projectName: '测试' }), { code: 'REPOSITORY_LINKS_INVALID' });
  assert.deepEqual(readFileSync(join(f.root, '项目/测试/project.md')), before);
});

test('Git initialization failure retains partial state with a recovery path instead of deleting project files', t => {
  const f = fixture(t);
  assert.throws(() => f.call('create', 'partial', {}, { run: (binary, args, options) => {
    if (args.includes('init')) {
      writeFileSync(join(f.root, 'repositories/partial/keep'), 'partial output');
      return { status: 1, stdout: '', stderr: 'failed' };
    }
    return spawnSync(binary, args, options);
  } }), error => error.code === 'REPOSITORY_GIT_FAILED' && error.details.data.changed && error.details.data.recoveryPath === 'repositories/partial');
  assert.equal(readFileSync(join(f.root, 'repositories/partial/keep'), 'utf8'), 'partial output');
});

test('managed roots cannot be replaced before Git initialization and injected Git environments cannot redirect writes', t => {
  const f = fixture(t), outside = join(f.directory, 'outside'); mkdirSync(outside);
  assert.throws(() => f.call('create', 'race', {}, { beforeInit: () => {
    rmSync(join(f.root, 'repositories/race'), { recursive: true });
    symlinkSync(outside, join(f.root, 'repositories/race'));
  } }), { code: 'REPOSITORY_PATH_INVALID' });
  assert.deepEqual(readdirSync(outside), []);
  const old = process.env.GIT_DIR; process.env.GIT_DIR = join(outside, 'wrong.git');
  try { f.call('create', 'safe'); } finally { if (old === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = old; }
  assert.equal(existsSync(join(outside, 'wrong.git')), false);
  assert.equal(existsSync(join(f.root, 'repositories/safe/.git')), true);
});

test('an existing external Git worktree is linked in place with a detached HEAD', t => {
  const f = fixture(t); f.card('测试'); f.call('create', 'source');
  const source = join(f.root, 'repositories/source'), worktree = join(f.directory, 'existing worktree');
  git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Fictional fixture']);
  git(source, ['worktree', 'add', '--detach', worktree]);
  assert.ok(readFileSync(join(worktree, '.git'), 'utf8').startsWith('gitdir:'));
  const linked = f.call('link', worktree, { projectName: '测试' });
  assert.equal(linked.data.repository.branch, null);
  assert.equal(f.call('check', undefined, { projectName: '测试' }).data.valid, true);
});

test('KSF worktrees are rejected without rewriting project associations or Git state', t => {
  const f = fixture(t); f.card('测试'); f.call('create', 'independent');
  git(f.root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Fictional KSF fixture']);
  const managed = join(f.root, 'repositories/shared-parent'), outside = join(f.directory, 'outside KSF worktree');
  for (const target of [managed, outside]) git(f.root, ['worktree', 'add', '--detach', target]);
  const before = files(f.root), outsideBefore = files(outside);
  for (const target of [managed, outside, f.root]) {
    for (const dryRun of [false, true]) {
      assert.throws(() => f.call('link', target, { projectName: '测试', dryRun }), { code: 'REPOSITORY_SHARED_GIT' });
    }
    const checked = f.call('check', target);
    assert.equal(checked.data.valid, false);
    assert.equal(checked.errors[0].code, 'REPOSITORY_SHARED_GIT');
  }
  for (const dryRun of [false, true]) assert.throws(() => f.call('create', 'shared-parent', { dryRun }), { code: 'REPOSITORY_SHARED_GIT' });
  const listed = f.call('list');
  assert.equal(listed.data.complete, false);
  assert.ok(listed.data.repositories.some(entry => entry.name === 'independent' && entry.valid));
  assert.ok(listed.data.repositories.some(entry => entry.name === 'shared-parent' && !entry.valid));
  assert.deepEqual(files(f.root), before);
  assert.deepEqual(files(outside), outsideBefore);
  project({ root: f.root, operation: 'write', name: '测试', data: { metadata: { repositories: ['../../repositories/shared-parent'] } } });
  assert.equal(f.call('check', undefined, { projectName: '测试' }).errors[0].code, 'REPOSITORY_SHARED_GIT');
  f.call('unlink', managed, { projectName: '测试' });
  assert.deepEqual(project({ root: f.root, operation: 'read', name: '测试' }).data.project.metadata.repositories, []);
  assert.equal(project({ root: f.root, operation: 'read', name: '测试' }).data.project.body, '# 项目\n\n原有正文。\n');
  assert.ok(existsSync(managed));
});

test('managed engineering worktrees remain valid when KSF itself uses a worktree', t => {
  const f = fixture(t); f.card('测试'); f.call('create', 'source');
  const source = join(f.root, 'repositories/source'), managed = join(f.root, 'repositories/engineering worktree');
  git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Fictional engineering fixture']);
  git(source, ['worktree', 'add', '--detach', managed]);
  assert.equal(f.call('link', managed, { projectName: '测试' }).data.repository.managed, true);
  assert.equal(f.call('check', managed).data.valid, true);
  git(f.root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Fictional KSF fixture']);
  const ksfWorktree = join(f.directory, 'KSF worktree');
  git(f.root, ['worktree', 'add', '--detach', ksfWorktree]);
  writeFileSync(join(ksfWorktree, '.gitignore'), '/repositories/\n');
  const call = (operation, target) => repository({ root: ksfWorktree, operation, target });
  assert.equal(call('create', 'independent').data.created, true);
  const commonHistory = join(ksfWorktree, 'repositories/shared-parent');
  git(f.root, ['worktree', 'add', '--detach', commonHistory]);
  assert.equal(call('check', commonHistory).errors[0].code, 'REPOSITORY_SHARED_GIT');
});

test('missing Git is a specific failure and a repository container cannot itself be a Git root', t => {
  const f = fixture(t, false);
  assert.throws(() => f.call('create', 'missing', { dryRun: true }, { run: () => ({ error: { code: 'ENOENT' } }) }), { code: 'REPOSITORY_GIT_REQUIRED' });
  assert.equal(existsSync(join(f.root, 'repositories')), false);
  mkdirSync(join(f.root, 'repositories')); git(join(f.root, 'repositories'), ['init', '--template=']);
  assert.throws(() => f.call('create', 'nested'), { code: 'REPOSITORY_SCOPE_INVALID' });
});
