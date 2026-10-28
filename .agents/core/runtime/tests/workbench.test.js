import {platform} from '../src/platform/index.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCoordinator } from '../src/services/workbench-common.js';
import { createWorkspaceFiles, filePolicy } from '../src/services/workspace-files.js';
import { createWorkbenchGit, runGit, parseStatus } from '../src/services/workbench-git.js';
import { startWebServer } from '../src/services/web.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ksf-workbench-'))); t.after(() => rm(root, { recursive: true, force: true }));
  const coordinator = createCoordinator(), files = createWorkspaceFiles(root, coordinator), git = createWorkbenchGit(root, files, coordinator);
  await mkdir(join(root, 'repositories')); await mkdir(join(root, '项目')); await writeFile(join(root, 'USER.md'), '# 用户\n');
  return { root, files, git, coordinator };
}
async function init(path) { await mkdir(path, { recursive: true }); await runGit(path, ['init', '-b', 'main']); await runGit(path, ['config','core.autocrlf','false']); await runGit(path, ['config', 'user.name', 'Workbench Test']); await runGit(path, ['config', 'user.email', 'workbench@example.invalid']); await runGit(path, ['config', 'commit.gpgsign', 'false']); }
async function committed(path, name = '文档.md', text = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n') { await writeFile(join(path, name), text); await runGit(path, ['add', '--', name]); await runGit(path, ['commit', '-m', 'initial']); }
async function operation(git, repo, action, input = {}) {
  const state = await git.status(repo.id), start = await git.start({ repo: repo.id, action, version: state.version, requestId: crypto.randomUUID(), ...input });
  while (['queued', 'running'].includes(start.status)) await new Promise(r => setTimeout(r, 10));
  return start;
}
async function mustOperation(git, repo, action, input = {}) { const result = await operation(git, repo, action, input); assert.equal(result.status, 'completed', JSON.stringify(result.error)); return result; }
async function repository(f, path) { await f.git.scan(); const list = await f.git.list(); const repo = list.repositories.find(r => r.path === path); assert.ok(repo, JSON.stringify(list)); return repo; }

test('file service preserves bytes, versions, modes, metadata and rejects stale writes', async t => {
  const f = await fixture(t), path = '项目/测试.md', text = '\uFEFF---\r\nid: test\r\n---\r\n# 中文\r\n';
  await writeFile(join(f.root, path), text, { mode: 0o640 });
  const before = await f.files.read(path); assert.equal(before.text, text);
  await f.files.save({ path, text, version: before.version }); assert.deepEqual(await readFile(join(f.root, path)), Buffer.from(text));
  const changed = await f.files.save({ path, text: text + '内容\r\n', version: before.version }); assert.equal(changed.text, text + '内容\r\n');
  if(platform.supportsPosixModes)assert.equal((await stat(join(f.root, path))).mode & 0o777, 0o640);
  await assert.rejects(f.files.save({ path, text: 'overwrite', version: before.version }), e => e.code === 'WORKSPACE_CONFLICT' && e.data.disk.text === changed.text);
  assert.equal((await f.files.read(path)).text, changed.text);
});
test('filesystem rejects traversal, symlinks, secrets, runtime and generated archives; unlock is session-only', async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, '.agents/core'), { recursive: true }); await writeFile(join(f.root, '.agents/core/source.js'), 'export {};');
  await writeFile(join(f.root, '.env'), 'PRIVATE=1'); await symlink(join(f.root, 'USER.md'), join(f.root, 'link.md'));
  for (const path of ['../USER.md', '/etc/passwd', '项目/../USER.md', 'C:/outside', 'link.md', '.env', '.agents/runtime-data/key']) await assert.rejects(f.files.read(path));
  let file = await f.files.read('.agents/core/source.js'); assert.equal(file.writable, false);
  await assert.rejects(f.files.save({ path: file.path, text: 'changed', version: file.version }), e => e.code === 'WORKSPACE_READONLY');
  file = await f.files.unlock({ path: file.path }); assert.equal(file.writable, true); await f.files.save({ path: file.path, text: 'changed', version: file.version });
  assert.equal((await createWorkspaceFiles(f.root, f.coordinator).read(file.path)).writable, false);
  assert.equal(filePolicy('档案/对话/Codex/task/turns/id.json'), 'readonly');
  assert.equal(filePolicy('README.md'), 'system');
  assert.equal(filePolicy('repositories/a/README.md'), 'editable');
  for (const path of ['.git-credentials', '.npmrc', '.netrc', '.ssh/config', '.aws/config', '.credentials.json', '.GIT/HEAD', '.AGENTS/RUNTIME-DATA/file']) assert.equal(filePolicy(path), 'blocked', path);
  for (const name of ['.git-credentials', '.npmrc', '.netrc']) { await writeFile(join(f.root, name), 'secret'); await assert.rejects(f.files.read(name), e => e.code === 'WORKSPACE_PROTECTED'); }
  await assert.rejects(f.files.unlock({ path: '.env' }));
});
test('files create/move publish exclusively; search includes independently ignored repositories', async t => {
  const f = await fixture(t);
  await f.files.create({ path: '项目/说明.md', text: '# 关键词\n内容关键词\n' });
  await f.files.create({ path: '项目/附件', kind: 'directory' });
  const file = await f.files.read('项目/说明.md');
  await f.files.move({ path: file.path, destination: '项目/附件/新说明.md', version: file.version });
  await assert.rejects(f.files.read(file.path)); assert.equal((await f.files.read('项目/附件/新说明.md')).text, file.text);
  await assert.rejects(f.files.create({ path: '项目/附件/新说明.md' }), e => e.code === 'WORKSPACE_EXISTS');
  await writeFile(join(f.root, '.gitignore'), '/repositories/\n'); await mkdir(join(f.root, 'repositories/a')); await writeFile(join(f.root, 'repositories/a/doc.md'), '关键词');
  const search = await f.files.search({ q: '关键词' }); assert.ok(search.matches.some(m => m.path === 'repositories/a/doc.md')); assert.ok(search.matches.some(m => m.line === 2));
  await writeFile(join(f.root, 'repositories/.DS_Store'), 'metadata'); const tree = await f.files.tree('repositories'); assert.equal(tree.entries.some(e => e.name === '.DS_Store'), false);
});
test('directory moves preserve contents and reject stale versions, repositories and protected descendants', async t => {
  const f = await fixture(t); await f.files.create({ path: '项目/旧目录', kind: 'directory' }); await f.files.create({ path: '项目/旧目录/说明.md', text: '\uFEFF# 中文\r\n' });
  const before = await f.files.tree('项目/旧目录'); await f.files.move({ path: before.path, destination: '项目/新目录', version: before.version });
  assert.equal((await f.files.read('项目/新目录/说明.md')).text, '\uFEFF# 中文\r\n'); await assert.rejects(f.files.tree(before.path));
  const stale = await f.files.tree('项目/新目录'); await f.files.create({ path: '项目/新目录/新增.md' });
  await assert.rejects(f.files.move({ path: stale.path, destination: '项目/其他目录', version: stale.version }), e => e.code === 'WORKSPACE_CONFLICT');
  const current = await f.files.tree(stale.path); await assert.rejects(f.files.move({ path: current.path, destination: '项目/新目录/内部', version: current.version }), e => e.code === 'WORKSPACE_MOVE_INVALID');
  await f.files.create({ path: '项目/目标', kind: 'directory' }); await assert.rejects(f.files.move({ path: current.path, destination: '项目/目标', version: current.version }), e => e.code === 'WORKSPACE_EXISTS');
  await mkdir(join(f.root, '项目/新目录/.git')); await assert.rejects(f.files.move({ path: current.path, destination: '项目/其他目录', version: (await f.files.tree(current.path)).version }), e => e.code === 'WORKSPACE_PROTECTED' || e.code === 'WORKSPACE_MOVE_PROTECTED');
  await rm(join(f.root, '项目/新目录/.git'), { recursive: true }); await writeFile(join(f.root, '项目/新目录/.npmrc'), 'secret');
  await assert.rejects(f.files.move({ path: current.path, destination: '项目/其他目录', version: (await f.files.tree(current.path)).version }), e => e.code === 'WORKSPACE_PROTECTED');
  await rm(join(f.root, '项目/新目录/.npmrc')); await symlink(join(f.root, 'USER.md'), join(f.root, '项目/新目录/link.md'));
  await assert.rejects(f.files.move({ path: current.path, destination: '项目/其他目录', version: (await f.files.tree(current.path)).version }), e => e.code === 'WORKSPACE_SYMLINK');
  await assert.rejects(f.files.move({ path: '项目', destination: '改名分区', version: (await f.files.tree('项目')).version }), e => e.code === 'WORKSPACE_MOVE_INVALID');
  await assert.rejects(f.files.tree('项目/其他目录')); assert.equal((await f.files.read('项目/新目录/说明.md')).text, '\uFEFF# 中文\r\n');
});
test('image upload returns relative references; HTML and SVG are not served as active media', async t => {
  const f = await fixture(t); await f.files.create({ path: '项目/a.md' });
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex'), image = await f.files.upload({ path: '项目/a.md', name: '图片.png', base64: bytes.toString('base64') });
  assert.match(image.relativePath, /^assets\//); assert.deepEqual((await f.files.media(image.path)).bytes, bytes);
  await assert.rejects(f.files.upload({ path: '项目/a.md', name: 'evil.svg', base64: bytes.toString('base64') }));
  await assert.rejects(f.files.media('项目/a.md'));
});
test('shared coordinator queues saves behind repository mutations and releases failed jobs', async () => {
  const coordinator = createCoordinator(), order = []; let release;
  const first = coordinator.run('repo', async () => { order.push('git'); await new Promise(r => release = r); throw Error('failure'); }).catch(() => {});
  const second = coordinator.run('repo', () => order.push('save'));
  await new Promise(r => setTimeout(r, 5)); assert.deepEqual(order, ['git']); release(); await Promise.all([first, second]); assert.deepEqual(order, ['git', 'save']);
});
test('Git discovers instance, nested repositories and worktree pointers; ignores ordinary files', async t => {
  const f = await fixture(t); await init(f.root); await writeFile(join(f.root, '.gitignore'), '/repositories/\n'); await committed(f.root);
  const repoPath = join(f.root, 'repositories/group/a'); await init(repoPath); await committed(repoPath);
  await writeFile(join(f.root, 'repositories/.DS_Store'), 'metadata'); await runGit(repoPath, ['worktree', 'add', '-b', 'side', join(f.root, 'repositories/worktree')]);
  await f.git.scan(); const list = await f.git.list(); assert.ok(list.repositories.some(r => r.kind === 'instance')); assert.ok(list.repositories.some(r => r.path === 'repositories/group/a')); assert.equal(list.repositories.find(r => r.path === 'repositories/worktree').worktree, true); assert.equal(list.errors.length, 0);
  assert.ok(list.repositories.every(r => !Object.hasOwn(r, 'entries')), 'catalog only includes summaries, never full changed-file lists');
  const selected = list.repositories.find(r => r.path === 'repositories/group/a');
  assert.ok(Array.isArray((await f.git.status(selected.id)).entries));
  assert.ok((await f.git.list()).repositories.every(r => !Object.hasOwn(r, 'entries')), 'full status must not leak into cached catalog summaries');
});
test('Git stages/unstages single files and hunks while preserving other staged content; rejects stale snapshots', async t => {
  const f = await fixture(t), folder = join(f.root, 'repositories/a'); await init(folder); await committed(folder);
  const repo = await repository(f, 'repositories/a');
  await writeFile(join(folder, '文档.md'), 'ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\n');
  await writeFile(join(folder, '已暂存.txt'), 'keep'); await runGit(folder, ['add', '--', '已暂存.txt']);
  const diff = await f.git.diff(repo.id, { path: '文档.md' }); assert.equal(diff.hunks.length, 2);
  await mustOperation(f.git, repo, 'hunk', { snapshotId: diff.snapshotId, hunkId: diff.hunks[0].id });
  let staged = (await runGit(folder, ['show', ':文档.md'])).stdout; assert.match(staged, /^ONE/); assert.match(staged, /ten\n$/);
  assert.equal((await runGit(folder, ['show', ':已暂存.txt'])).stdout, 'keep');
  const stale = await operation(f.git, repo, 'hunk', { snapshotId: diff.snapshotId, hunkId: diff.hunks[1].id }); assert.equal(stale.status, 'failed'); assert.equal(stale.error.code, 'GIT_DIFF_EXPIRED');
  const cached = await f.git.diff(repo.id, { path: '文档.md', staged: true }); await mustOperation(f.git, repo, 'hunk', { snapshotId: cached.snapshotId, hunkId: cached.hunks[0].id });
  assert.equal((await runGit(folder, ['diff', '--cached', '--', '文档.md'])).stdout, '');
  await mustOperation(f.git, repo, 'stage', { paths: ['文档.md'] }); await mustOperation(f.git, repo, 'commit', { message: '保存修改\n\n验证已暂存内容。' });
  assert.equal((await f.git.status(repo.id)).changedCount, 0); assert.ok((await f.git.history(repo.id)).commits[0].subject.includes('保存修改'));
});
test('initial repository, detached HEAD, rename, binary and special filenames remain accurate', async t => {
  const f = await fixture(t), folder = join(f.root, 'repositories/a'); await init(folder); const repo = await repository(f, 'repositories/a');
  assert.equal((await f.git.status(repo.id)).branch.oid, null); assert.deepEqual((await f.git.history(repo.id)).commits, []);
  const name = '-中文 空格[1].md'; await writeFile(join(folder, name), 'original'); await mustOperation(f.git, repo, 'stage', { paths: [name] }); await mustOperation(f.git, repo, 'unstage', { paths: [name] });
  assert.equal((await f.git.status(repo.id)).entries[0].untracked, true); await mustOperation(f.git, repo, 'stage', { paths: [name] }); await mustOperation(f.git, repo, 'commit', { message: 'first' });
  await runGit(folder, ['mv', '--', name, 'renamed.md']); const state = await f.git.status(repo.id); assert.equal(state.entries[0].originalPath, name);
  await mustOperation(f.git, repo, 'commit', { message: 'rename' });
  await writeFile(join(folder, 'binary.bin'), Buffer.from([0, 1, 2])); assert.equal((await f.git.diff(repo.id, { path: 'binary.bin' })).binary, true);
  await runGit(folder, ['checkout', '--detach']); assert.equal((await f.git.status(repo.id)).branch.name, null);
  const tree = await f.git.tree(repo.id); assert.equal(tree.entries[0].name, 'renamed.md'); const historical = await f.git.diff(repo.id, { path: 'renamed.md', rev: 'HEAD' }); assert.equal(historical.after, 'original');
});
test('branches, stash, merge conflicts, result editing and abort/complete work with native Git', async t => {
  const f = await fixture(t), folder = join(f.root, 'repositories/a'); await init(folder); await committed(folder, 'a.md', 'base\n'); const repo = await repository(f, 'repositories/a');
  await mustOperation(f.git, repo, 'branch-create', { name: 'feature' }); await writeFile(join(folder, 'a.md'), 'theirs\n'); await mustOperation(f.git, repo, 'stage', { paths: ['a.md'] }); await mustOperation(f.git, repo, 'commit', { message: 'feature' });
  await mustOperation(f.git, repo, 'branch-switch', { name: 'main' }); await writeFile(join(folder, 'a.md'), 'ours\n'); await mustOperation(f.git, repo, 'stage', { paths: ['a.md'] }); await mustOperation(f.git, repo, 'commit', { message: 'main' });
  assert.equal((await operation(f.git, repo, 'merge', { name: 'feature' })).status, 'failed'); const state = await f.git.status(repo.id); assert.equal(state.merging, true); assert.equal(state.conflictCount, 1);
  await mustOperation(f.git, repo, 'merge-abort'); assert.equal((await f.git.status(repo.id)).merging, false);
  assert.equal((await operation(f.git, repo, 'merge', { name: 'feature' })).status, 'failed');
  const conflict = await f.git.conflict(repo.id, 'a.md'); assert.equal(conflict.base, 'base\n'); assert.equal(conflict.ours, 'ours\n'); assert.equal(conflict.theirs, 'theirs\n');
  const file = await f.files.read('repositories/a/a.md'); await mustOperation(f.git, repo, 'resolve', { path: 'a.md', text: 'both\n', fileVersion: file.version }); await mustOperation(f.git, repo, 'merge-complete');
  await mustOperation(f.git, repo, 'branch-delete', { name: 'feature' });
  await writeFile(join(folder, 'a.md'), 'dirty\n'); await mustOperation(f.git, repo, 'stash-create', { message: 'test stash' }); const stash = (await f.git.refs(repo.id)).stashes[0];
  await mustOperation(f.git, repo, 'stash-apply', { stash: stash.ref, stashOid: stash.oid }); assert.equal((await readFile(join(folder, 'a.md'), 'utf8')), 'dirty\n');
  await mustOperation(f.git, repo, 'stash-drop', { stash: stash.ref, stashOid: stash.oid }); assert.equal((await f.git.refs(repo.id)).stashes.length, 0);
  await mustOperation(f.git, repo, 'stash-create', { message: 'pop test' }); const pop = (await f.git.refs(repo.id)).stashes[0];
  await mustOperation(f.git, repo, 'stash-pop', { stash: pop.ref, stashOid: pop.oid }); assert.equal((await f.git.refs(repo.id)).stashes.length, 0); assert.equal(await readFile(join(folder, 'a.md'), 'utf8'), 'dirty\n');
});
test('Git failures preserve index locks, expose missing identities, and bound interrupted operations', async t => {
  const f = await fixture(t), folder = join(f.root, 'repositories/a'); await init(folder); await committed(folder); const repo = await repository(f, 'repositories/a');
  await writeFile(join(folder, 'new.md'), 'new'); await writeFile(join(folder, '.git/index.lock'), 'external owner');
  const locked = await operation(f.git, repo, 'stage', { paths: ['new.md'] }); assert.equal(locked.status, 'failed'); assert.match(locked.error.message, /index.lock/); assert.equal(await readFile(join(folder, '.git/index.lock'), 'utf8'), 'external owner');
  await rm(join(folder, '.git/index.lock')); await mustOperation(f.git, repo, 'stage', { paths: ['new.md'] });
  await runGit(folder, ['config', 'user.name', '']); const identity = await operation(f.git, repo, 'commit', { message: 'must fail' }); assert.equal(identity.status, 'failed'); assert.ok((await f.git.status(repo.id)).entries.some(e => e.index === 'A'));
  await assert.rejects(runGit(folder, ['-c', 'alias.workbench-delay=!sleep 2', 'workbench-delay'], { timeout: 20 }), e => e.code === 'GIT_TIMEOUT');
  await runGit(folder, ['remote', 'add', 'missing', join(f.root, 'not-a-remote')]); const network = await operation(f.git, repo, 'fetch', { remote: 'missing' }); assert.equal(network.status, 'failed'); assert.match(network.error.message, /repository|access/i);
});
test('repository ownership includes plain instances, aliases, deleted directories and historical comparisons', async t => {
  const f = await fixture(t), folder = join(f.root, 'repositories/a'); await init(folder); await mkdir(join(folder, 'docs')); await committed(folder, 'docs/a.md', 'one\n'); const repo = await repository(f, 'repositories/a');
  assert.equal(repo.worktree, false); assert.ok((await f.git.list()).repositories.some(r => r.kind === 'instance' && r.error));
  assert.deepEqual(await f.git.owner('repositories/a/docs/a.md'), { repo: repo.id, path: 'docs/a.md' });
  await committed(folder, 'docs/a.md', 'two\n'); const comparison = await f.git.diff(repo.id, { path: 'docs/a.md', rev: 'HEAD', baseRev: 'HEAD~1' }); assert.equal(comparison.before, 'one\n'); assert.equal(comparison.after, 'two\n');
  await rm(join(folder, 'docs'), { recursive: true }); const deleted = await f.git.diff(repo.id, { path: 'docs/a.md' }); assert.equal(deleted.before, 'two\n'); assert.equal(deleted.after, '');
});
test('fetch/pull/push use explicit remotes and reject divergence without rewriting history', async t => {
  const f = await fixture(t), folder = join(f.root, 'repositories/a'), remote = join(f.root, 'bare.git'); await init(folder); await committed(folder); await runGit(f.root, ['init', '--bare', remote]); await runGit(folder, ['remote', 'add', 'origin', remote]); const repo = await repository(f, 'repositories/a');
  await mustOperation(f.git, repo, 'push', { remote: 'origin', branch: 'main' }); await mustOperation(f.git, repo, 'fetch', { remote: 'origin' }); await mustOperation(f.git, repo, 'pull', { remote: 'origin', branch: 'main' });
  await runGit(folder, ['config', 'branch.main.remote', 'origin']); await runGit(folder, ['config', 'branch.main.merge', 'refs/heads/main']);
  const other = join(f.root, 'other'); await runGit(f.root, ['clone', '-b', 'main', remote, other]); await runGit(other, ['config', 'user.name', 'Other']); await runGit(other, ['config', 'user.email', 'other@example.invalid']); await committed(other, 'remote.md', 'remote'); await runGit(other, ['push', 'origin', 'main']);
  await committed(folder, 'local.md', 'local'); const before = (await f.git.status(repo.id)).branch.oid;
  const result = await operation(f.git, repo, 'pull', { remote: 'origin', branch: 'main' }); assert.equal(result.status, 'failed'); assert.equal((await f.git.status(repo.id)).branch.oid, before);
  assert.equal((await operation(f.git, repo, 'push', { remote: '--all', branch: 'main' })).status, 'failed');
});
test('operation IDs deduplicate requests and stale repository state cannot execute writes', async t => {
  const f = await fixture(t), folder = join(f.root, 'repositories/a'); await init(folder); await committed(folder); const repo = await repository(f, 'repositories/a'); const state = await f.git.status(repo.id);
  await writeFile(join(folder, 'new.md'), 'new'); const input = { repo: repo.id, action: 'stage', paths: ['new.md'], version: state.version, requestId: 'same-request' };
  const a = await f.git.start(input), b = await f.git.start(input); assert.equal(a.id, b.id); while (a.status === 'running' || a.status === 'queued') await new Promise(r => setTimeout(r, 10)); assert.equal(a.error.code, 'GIT_STATE_CHANGED');
  await assert.rejects(f.git.start({ ...input, action: 'unstage' }), e => e.code === 'GIT_REQUEST_CONFLICT'); await assert.rejects(f.git.start({ ...input, action: 'shell' }));
  const index = (await runGit(folder, ['diff', '--cached'])).stdout; assert.equal(index, '');
});
test('HTTP write routes require exact local origin, JSON and session token; old APIs stay read-only', async t => {
  const f = await fixture(t), server = await startWebServer({ root: f.root, port: 0, capture: false }); t.after(() => server.close());
  const call = (path, input, headers = {}) => fetch(server.url + path, { method: input ? 'POST' : 'GET', headers: input ? { Origin: server.url.slice(0, -1), 'Content-Type': 'application/json', ...headers } : headers, body: input ? JSON.stringify(input) : undefined });
  const session = (await (await call('api/workbench/session')).json()).data;
  const file = (await (await call('api/workspace/file?path=USER.md')).json()).data;
  const input = { path: 'USER.md', text: '# Changed\n', version: file.version };
  assert.equal((await call('api/workspace/save', input)).status, 403);
  const expired = await call('api/workspace/save', input, { 'X-KSF-Token': 'stale-token' });
  assert.equal(expired.status, 403); assert.equal((await expired.json()).error.code, 'WEB_SESSION_EXPIRED');
  assert.equal(await readFile(join(f.root, 'USER.md'), 'utf8'), file.text, 'expired auth must reject before any file mutation');
  const crossSite = await call('api/workspace/save', input, { 'X-KSF-Token': session.token, 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(crossSite.status, 403); assert.equal((await crossSite.json()).error.code, 'WEB_WRITE_FORBIDDEN');
  assert.equal((await call('api/workspace/save', input, { 'X-KSF-Token': session.token, Origin: 'http://evil.example' })).status, 403);
  assert.equal((await call('api/workspace/save', input, { 'X-KSF-Token': session.token, 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await call('api/workspace/save', input, { 'X-KSF-Token': session.token })).status, 200);
  assert.equal((await call('api/workspace/save', input, { 'X-KSF-Token': session.token })).status, 409);
  assert.equal((await call('api/tasks', {})).status, 405); assert.equal((await call('USER.md')).status, 404);
  assert.equal((await call('api/workspace/file?path=../USER.md')).status, 400);
  assert.equal((await call('api/workspace/file?path=USER.md&path=USER.md')).status, 400);
  assert.equal((await call('api/workspace/file?path=.env')).status, 403);
  const catalog = await call('api/git/repositories?refresh=1'); assert.equal(catalog.status, 200);
  assert.equal(typeof (await catalog.json()).data.refreshing, 'boolean');
  assert.equal((await call('api/git/repositories?refresh=0')).status, 400);
  assert.equal((await call('api/git/repositories?refresh=1&refresh=1')).status, 400);
});
