import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCoordinator } from '../src/services/workbench-common.js';
import { createWorkspaceFiles } from '../src/services/workspace-files.js';
import { createWorkbenchGit, runGit } from '../src/services/workbench-git.js';

const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
async function until(check) {
  const deadline = Date.now() + 5000;
  while (!await check()) { assert.ok(Date.now() < deadline, 'background work did not settle'); await new Promise(resolve => setTimeout(resolve, 5)); }
}
async function fixture(t, count, options = {}, release = () => {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ksf-git-catalog-')));
  const coordinator = createCoordinator(), git = createWorkbenchGit(root, createWorkspaceFiles(root, coordinator), coordinator, options);
  t.after(async () => { release(); await git.close(); await rm(root, { recursive: true, force: true }); });
  async function init(name) {
    const path = join(root, 'repositories', name); await mkdir(path, { recursive: true });
    await runGit(path, ['init', '-b', 'main']);
    await runGit(path, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'initial']);
    return path;
  }
  for (let i = 0; i < count; i++) await init(`repo-${i}`);
  await git.scan();
  const settled = async () => { let list; await until(async () => { list = await git.list(); return !list.refreshing && !list.scanning; }); return list; };
  return { root, git, init, settled };
}

test('catalog returns every discovered name while slow status is blocked; polling shares four bounded workers', async t => {
  const slow = gate(); let active = 0, peak = 0, reads = 0;
  const command = async (path, args, options) => {
    if (args[0] !== 'status') return runGit(path, args, options);
    active++; reads++; peak = Math.max(peak, active);
    try { await slow.promise; return await runGit(path, args, options); } finally { active--; }
  };
  const f = await fixture(t, 6, { command }, slow.release);
  const list = await Promise.race([f.git.list(), new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('catalog waited for status')), 500); timer.unref(); })]);
  assert.equal(list.repositories.length, 7); assert.equal(list.pendingCount, 6); assert.equal(list.refreshing, true);
  assert.ok(list.repositories.find(r => r.kind === 'instance').error);
  assert.ok(list.repositories.filter(r => r.valid).every(r => r.statusState === 'pending' && r.changedCount === undefined));
  await until(() => active === 4);
  await Promise.all(Array.from({ length: 20 }, () => f.git.list()));
  assert.equal(reads, 4); assert.equal(peak, 4);
  slow.release(); const complete = await f.settled(); assert.equal(reads, 6);
  assert.ok(complete.repositories.filter(r => r.valid).every(r => r.statusState === 'ready' && r.changedCount === 0));
  assert.ok(complete.repositories.every(r => !Object.hasOwn(r, 'entries') && !Object.hasOwn(r, 'absolute')));
  await f.git.list(); assert.equal(reads, 6, 'reopening a warm catalog must not run Git again');
});

test('expired summaries stay visible during refresh and retain exact untracked-file counts', async t => {
  let clock = 1000000, block = false; const slow = gate();
  const command = async (path, args, options) => { if (block && args[0] === 'status') await slow.promise; return runGit(path, args, options); };
  const f = await fixture(t, 1, { command, now: () => clock }, slow.release);
  let list = await f.settled(), repo = list.repositories.find(r => r.valid); const at = repo.statusUpdatedAt;
  await mkdir(join(f.root, repo.path, '新目录'));
  await writeFile(join(f.root, repo.path, '新目录/一.md'), 'one'); await writeFile(join(f.root, repo.path, '新目录/二.md'), 'two');
  clock += 30001; block = true; list = await f.git.list(); repo = list.repositories.find(r => r.valid);
  assert.equal(repo.statusState, 'stale'); assert.equal(repo.changedCount, 0); assert.equal(repo.statusUpdatedAt, at); assert.equal(list.refreshing, true);
  slow.release(); repo = (await f.settled()).repositories.find(r => r.valid);
  assert.equal(repo.changedCount, 2); assert.equal(repo.statusState, 'ready');
});

test('file writes invalidate only their owning repository; late summaries cannot replace a newer full status', async t => {
  let reads = [], blockNext = false; const captured = gate(), slow = gate();
  const command = async (path, args, options) => {
    if (args[0] !== 'status') return runGit(path, args, options);
    reads.push(path); const result = await runGit(path, args, options);
    if (blockNext) { blockNext = false; captured.release(); await slow.promise; }
    return result;
  };
  const f = await fixture(t, 2, { command }, slow.release);
  const initial = await f.settled(), repo = initial.repositories.find(r => r.name === 'repo-0'); reads = [];
  blockNext = true; f.git.invalidate(`${repo.path}/new.md`); await f.git.list(); await captured.promise;
  await writeFile(join(f.root, repo.path, 'new.md'), 'new');
  const full = await f.git.status(repo.id); assert.equal(full.changedCount, 1); assert.equal(full.entries[0].path, 'new.md');
  slow.release(); const final = await f.settled();
  assert.equal(final.repositories.find(r => r.id === repo.id).changedCount, 1);
  assert.equal(reads.length, 2); assert.ok(reads.every(path => path.replaceAll('\\','/').endsWith('/repo-0')));
});

test('invalidation during an in-flight read rejects that stale result and schedules a fresh one', async t => {
  let blockNext = false; const captured = gate(), slow = gate();
  const command = async (path, args, options) => {
    const result = await runGit(path, args, options);
    if (args[0] === 'status' && blockNext) { blockNext = false; captured.release(); await slow.promise; }
    return result;
  };
  const f = await fixture(t, 1, { command }, slow.release), repo = (await f.settled()).repositories.find(r => r.valid);
  blockNext = true; f.git.invalidate(); await f.git.list(); await captured.promise;
  await writeFile(join(f.root, repo.path, 'new.md'), 'new'); f.git.invalidate(`${repo.path}/new.md`); slow.release();
  const final = (await f.settled()).repositories.find(r => r.valid); assert.equal(final.changedCount, 1); assert.equal(final.statusState, 'ready');
});

test('one failed repository is isolated and explicit refresh discovers additions and removals without waiting for TTL', async t => {
  let failing = true;
  const command = (path, args, options) => { if (failing && args[0] === 'status' && path.replaceAll('\\','/').endsWith('/repo-0')) throw Error('status unavailable'); return runGit(path, args, options); };
  const f = await fixture(t, 2, { command }); let list = await f.settled();
  assert.equal(list.repositories.find(r => r.name === 'repo-0').error, 'status unavailable');
  assert.equal(list.repositories.find(r => r.name === 'repo-1').statusState, 'ready');
  await f.init('repo-new'); await rm(join(f.root, 'repositories/repo-1'), { recursive: true }); failing = false;
  await f.git.list({ refresh: true }); list = await f.settled();
  assert.ok(list.repositories.some(r => r.name === 'repo-new')); assert.ok(!list.repositories.some(r => r.name === 'repo-1'));
  assert.equal(list.repositories.find(r => r.name === 'repo-0').error, null);
});
