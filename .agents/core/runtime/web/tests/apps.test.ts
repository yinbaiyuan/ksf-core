import test from 'node:test';
import assert from 'node:assert/strict';
import { appFromSearch, appSearch, resourceKey, windowTitle } from '../src/apps/app-services.ts';
import { applyRawChanges, rawOffset } from '../src/apps/document-model.ts';
import { resolveLocalPath } from '../src/apps/document-model.ts';
import { graphRows, conflictBlocks } from '../src/apps/git-model.ts';
import { repositoryStatusText, repositoryMatches, type Repository } from '../src/apps/git-model.ts';

test('catalog placeholders never imply a clean repository and dirty filtering keeps unknown rows', () => {
  const repo: Repository = { id: 'repo', name: '示例', path: 'repositories/demo', kind: 'repository', worktree: false, error: null, statusState: 'pending' };
  assert.equal(repositoryStatusText(repo), '正在读取状态…');
  assert.equal(repositoryMatches(repo, 'DEMO', true), true);
  assert.equal(repositoryMatches(repo, 'missing', false), false);
  assert.equal(repositoryMatches({ ...repo, changedCount: 0, statusState: 'ready' }, '', true), false);
  assert.equal(repositoryStatusText({ ...repo, changedCount: 2, statusState: 'stale' }), '2 个变更 · 更新中');
  assert.equal(repositoryStatusText({ ...repo, changedCount: 0, statusState: 'ready' }), '干净');
  assert.equal(repositoryStatusText({ ...repo, error: 'unavailable' }), '状态不可用');
});

test('application URLs isolate resources and preserve existing conversation deep links', () => {
  assert.equal(appFromSearch('?task=one&turn=two'), 'conversations'); assert.equal(appFromSearch('?view=routes'), 'conversations');
  assert.equal(appFromSearch('?app=markdown&path=USER.md'), 'markdown'); assert.equal(appFromSearch('?app=git&repo=abc'), 'git');
  assert.equal(resourceKey('markdown', 'path=项目%2F测试.md'), '项目/测试.md');
  assert.equal(resourceKey('git', 'repo=abc'), 'abc'); assert.equal(resourceKey('conversations', 'task=one'), 'one');
  assert.equal(windowTitle('markdown', 'path=项目%2F测试.md'), '测试.md');
  assert.equal(new URLSearchParams(appSearch('conversations', 'app=git&task=one')).has('app'), false);
});
test('localized text edits preserve BOM, frontmatter, CRLF and untouched mixed newlines', () => {
  const raw = '\uFEFF---\r\nid: hello\r\n---\r\n# 中文\r\nlast\n';
  const normalized = raw.replace(/\r\n/g, '\n'), from = normalized.indexOf('中文');
  assert.equal(applyRawChanges(raw, []), raw);
  const result = applyRawChanges(raw, [{ from, to: from + 2, insert: '新内容\n下一行' }]);
  assert.equal(result, '\uFEFF---\r\nid: hello\r\n---\r\n# 新内容\r\n下一行\r\nlast\n');
  assert.equal(rawOffset('a\r\nb', 2), 3);
  assert.equal(applyRawChanges('a\nb\nc', [{ from: 0, to: 1, insert: 'A' }, { from: 4, to: 5, insert: 'C' }]), 'A\nb\nC');
});
test('local links resolve relative Chinese paths and reject traversal and active protocols', () => {
  assert.deepEqual(resolveLocalPath('项目/a/入口.md', '../资料/%E8%AF%B4%E6%98%8E.md#标题'), { path: '项目/资料/说明.md', hash: '标题' });
  assert.deepEqual(resolveLocalPath('项目/入口.md', '#标题'), { path: '项目/入口.md', hash: '标题' });
  for (const href of ['../../../outside', 'javascript:alert(1)', 'file:///etc/passwd', '//evil.example/a', '/outside', 'https://example.com']) assert.equal(resolveLocalPath('项目/入口.md', href), null);
});
test('commit graph retains both parents across merges and joins converging lanes', () => {
  const commits = [
    { oid: 'merge', parents: ['a', 'b'] }, { oid: 'a', parents: ['root'] }, { oid: 'b', parents: ['root'] }, { oid: 'root', parents: [] },
  ].map(c => ({ ...c, author: 'test', at: '', subject: '', refs: '' }));
  const graph = graphRows(commits); assert.equal(graph[0].edges.length, 2); assert.equal(graph[2].edges.filter(e => e.from === graph[2].lane).length, 1); assert.equal(graph[3].width, 1);
});
test('conflict blocks permit per-block selections without modifying other content', () => {
  const text = 'start\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\nend\n';
  const [block] = conflictBlocks(text); assert.equal(block.ours, 'ours\n'); assert.equal(block.theirs, 'theirs\n');
  const result = text.slice(0, block.from) + block.ours + text.slice(block.to); assert.equal(result, 'start\nours\nend\n');
  const diff3 = '<<<<<<< HEAD\nours\n||||||| base\nold\n=======\ntheirs\n>>>>>>> theirs\n';
  assert.equal(conflictBlocks(diff3)[0].ours, 'ours\n');
});

test('Git status filters retain partially staged files and recognize renamed paths', async () => {
  const { filterEntries, entryLabel } = await import('../src/apps/git-model.ts');
  const renamed = { path: '目录/新名称10.md', originalPath: '目录/旧名称.md', index: 'R', worktree: 'M', conflict: false, untracked: false };
  const fresh = { path: '目录/新名称2.md', originalPath: null, index: '?', worktree: '?', conflict: false, untracked: true };
  assert.equal(entryLabel(renamed, true), '重命名'); assert.equal(entryLabel(renamed, false), '已修改');
  assert.deepEqual(filterEntries([renamed, fresh], '旧名称'), [renamed]);
  assert.deepEqual(filterEntries([renamed, fresh], '', 'untracked'), [fresh]);
  assert.deepEqual(filterEntries([renamed, fresh], '').map(e => e.path), [fresh.path, renamed.path]);
});
test('Git sync defaults follow an upstream with a different remote branch name', async () => {
  const { remoteTarget } = await import('../src/apps/git-model.ts');
  assert.deepEqual(remoteTarget({ name: 'local', oid: 'a', upstream: 'origin/review/topic', ahead: 1, behind: 2 }, ['backup', 'origin']), { remote: 'origin', branch: 'review/topic' });
  assert.deepEqual(remoteTarget({ name: 'new', oid: 'a', upstream: null, ahead: 0, behind: 0 }, ['origin']), { remote: 'origin', branch: 'new' });
});
test('Git patch line numbers account for insertion, deletion, context and multiple hunks', async () => {
  const { patchLines } = await import('../src/apps/git-model.ts');
  const rows = patchLines('@@ -2,2 +2,2 @@\n-old\n+new\n same\n@@ -9,0 +10,1 @@\n+last\n');
  assert.equal(rows[1].before, '2');assert.equal(rows[1].after, '');assert.equal(rows[2].after, '2');assert.equal(rows[3].before,'3');assert.equal(rows[3].after,'3');assert.equal(rows[5].after,'10');
});


test('filtered sparse history keeps unloaded ancestors out of graph lanes', () => {
 const commits = Array.from({length:500}, (_,i) => ({oid:'row-'+i,parents:['unloaded-'+i],author:'test',at:'',subject:'',refs:''}));
 assert.equal(Math.max(...graphRows(commits).map(row => row.width)),1);
});


test('Git errors explain lock, identity and divergence while retaining original diagnostics', async () => {
 const {gitErrorSummary} = await import('../src/apps/git-model.ts');
 const lock = {code:'GIT_FAILED',message:"fatal: Unable to create '/private/demo/.git/index.lock': File exists.\nAnother git process seems to be running"};
 assert.match(gitErrorSummary(lock),/索引正在被占用/);assert.ok(!gitErrorSummary(lock).includes('/private'));assert.ok(lock.message.includes('/private'));
 assert.match(gitErrorSummary({code:'GIT_FAILED',message:'Author identity unknown'}),/提交身份/);
 assert.match(gitErrorSummary({code:'GIT_FAILED',message:'Not possible to fast-forward, aborting.'}),/分支已分叉/);
});


test('branch form validation permits real Git names and blocks incomplete or invalid names', async () => {
 const {validBranchName} = await import('../src/apps/git-model.ts');
 for(const name of ['codex/topic','功能/界面优化','@','foo./bar','foo/-bar'])assert.equal(validBranchName(name),true,name);
 for(const name of ['','codex/','HEAD','foo.lock/bar','foo/ending.','foo..bar','foo@{bar','-bad','has space','foo//bar','foo\\bar'])assert.equal(validBranchName(name),false,name);
});
