import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gitBinary, nullDevice } from './helpers/platform.js';
import { planRuntimeCleanup, cleanupRuntimeArtifacts } from '../src/distribution/retention.js';
import { runDistributionCommand, parseDistributionArgs } from '../src/commands/distribution.js';
import { applyMatchedSwitch } from '../src/distribution/matched-switch.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'KSF 清理 '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value)); };
  put('.agents/core/original.txt', 'recoverable original');
  const switchRun = (at, phase = 'complete', fields = {}) => {
    const id = randomUUID(), base = `.agents/runtime-data/t15-switch/${id}`;
    put(`${base}/switch.json`, { schemaVersion: 1, id, root, at, phase, ...fields });
    put(`${base}/${phase === 'prepared' ? 'core' : 'previous-core'}/original.txt`, 'recoverable original');
    put(`${base}/identity-originals/original.json`, { originalIdentity: 'synthetic' });
    return base;
  };
  return { root, put, switchRun };
}
test('cleanup defaults to a read-only plan; apply retires only older complete rollback payloads', async t => {
  const f = fixture(t), old = f.switchRun('2026-01-01'), latest = f.switchRun('2026-01-02');
  for (const p of ['communication/identity.json','applications/data/com.example.test/db','routing/identity.key','task-capture/config.json','ai/tasks/work.json','runtime/node/current/bin/node','unknown/unique.txt']) f.put(`.agents/runtime-data/${p}`, 'protected');
  f.put('.agents/user-data/unique.json', 'business');
  const response = await runDistributionCommand('system', ['cleanup', '--json'], f.root), data = JSON.parse(response.stdout);
  assert.equal(response.exitCode, 0); assert.equal(data.data.apply, false);
  assert.equal(data.data.candidates.length, 1); assert(existsSync(join(f.root, old, 'previous-core')));
  const done = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert.deepEqual(done.removed, [`${old}/previous-core`]); assert.equal(done.errors.length, 0);
  assert(existsSync(join(f.root, latest, 'previous-core/original.txt')));
  assert(existsSync(join(f.root, old, 'switch.json'))); assert(existsSync(join(f.root, old, 'identity-originals/original.json')));
  assert.equal(JSON.parse(readFileSync(join(f.root, old, 'retention.json'))).rollbackRetired, true);
  assert.equal(readFileSync(join(f.root, '.agents/runtime-data/communication/identity.json'), 'utf8'), 'protected');
  assert.equal(readFileSync(join(f.root, '.agents/user-data/unique.json'), 'utf8'), 'business');
  assert.equal(cleanupRuntimeArtifacts({ root: f.root, apply: true }).changed, false);
});
test('incomplete switch and service recovery preserve all rollback copies', t => {
  for (const fields of [{ phase: 'switching' }, { wasRunning: true, serviceRestored: false }]) {
    const f = fixture(t); f.switchRun('2026-01-01'); f.switchRun('2026-01-02', 'complete', fields);
    const result = planRuntimeCleanup(f.root);
    assert.equal(result.candidates.length, 0); assert.equal(result.warnings[0].reason, 'switch-recovery-pending');
  }
});
test('deployment and launcher transactions block cleanup without deleting recovery material', t => {
  for (const path of ['service/deployment.json', 'system/transaction']) {
    const f = fixture(t), old = f.switchRun('2026-01-01'); f.switchRun('2026-01-02');
    f.put(`.agents/runtime-data/${path}`, '{}');
    assert.throws(() => cleanupRuntimeArtifacts({ root: f.root, apply: true }), { code: 'CLEANUP_BUSY' });
    assert(existsSync(join(f.root, old, 'previous-core')));
  }
});
test('superseded preparation is retired explicitly; undated or unknown failed work is retained', async t => {
  const f = fixture(t); f.put('.agents/core/build.json', '{}');
  const stale = f.switchRun('2026-01-01', 'prepared', { beforeCoreEtag: 'a'.repeat(64) });
  f.switchRun('2026-01-02'); f.put('.agents/runtime-data/t15-switch/unknown/core/only-copy', 'unknown');
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert(result.removed.includes(`${stale}/core`)); assert(existsSync(join(f.root, '.agents/runtime-data/t15-switch/unknown/core/only-copy')));
  await assert.rejects(applyMatchedSwitch(f.root, join(f.root, stale, 'switch.json')), { code: 'MATCHED_ARTIFACTS_RETIRED' });
});
test('official cleanup retains one committed rollback and never treats arbitrary backups as disposable', t => {
  const f = fixture(t);
  f.put('.agents/core/code.js', 'old');
  for (let i = 1; i <= 3; i++) {
    const base = `.agents/runtime-data/system/backups/${i}`;
    f.put(`${base}/meta.json`, { operation: 'update', createdAt: `2026-01-0${i}` }); f.put(`${base}/committed`, '1'); f.put(`${base}/old-core/code.js`, 'old');
  }
  f.put('.agents/runtime-data/system/backups/personal/unique.sqlite', 'unique');
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert.equal(result.removed.length, 2); assert(existsSync(join(f.root, '.agents/runtime-data/system/backups/3/old-core/code.js')));
  assert(existsSync(join(f.root, '.agents/runtime-data/system/backups/personal/unique.sqlite')));
});
test('cleanup never follows an external symlink or an artifact path alias', t => {
  const f = fixture(t), outside = mkdtempSync(join(tmpdir(), 'KSF external ')); t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'unique'), 'retain');
  const old = f.switchRun('2026-01-01'); f.switchRun('2026-01-02');
  symlinkSync(outside, join(f.root, old, 'previous-core/link'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert.equal(result.errors.length, 0); assert(existsSync(join(outside, 'unique')));
  assert(result.warnings.some(x => x.reason === 'source-not-preserved'));
  rmSync(join(f.root, old, 'previous-core'), { recursive: true }); symlinkSync(outside, join(f.root, old, 'previous-core'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => cleanupRuntimeArtifacts({ root: f.root, apply: true }), { code: 'CLEANUP_PATH_INVALID' }); assert(existsSync(join(outside, 'unique')));
});
test('obsolete rollback containing the only local edit stays until its source is preserved', t => {
  const f = fixture(t), old = f.switchRun('2026-01-01'); f.switchRun('2026-01-02');
  f.put(`${old}/previous-core/unique.js`, 'uncommitted local fix');
  const blocked = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert.equal(blocked.removed.length, 0);
  assert.equal(blocked.warnings[0].reason, 'source-not-preserved');
  assert.deepEqual(blocked.warnings[0].files, ['unique.js']);
  assert(!existsSync(join(f.root, old, 'retention.json')));
  f.put('.agents/core/unique.js', 'uncommitted local fix');
  assert.equal(cleanupRuntimeArtifacts({ root: f.root, apply: true }).removed.length, 1);
});
test('source in reachable local Git history is recoverable even after the live source changes', t => {
  const f = fixture(t), old = f.switchRun('2026-01-01'); f.switchRun('2026-01-02');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_GLOBAL: nullDevice, GIT_CONFIG_SYSTEM: nullDevice, GIT_TERMINAL_PROMPT: '0' });
  const git = args => { const r = spawnSync(gitBinary, ['-C', f.root, ...args], { encoding: 'utf8', env }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git(['init', '--template=', '--initial-branch=main']);
  git(['config', 'user.name', 'Isolated Fixture']); git(['config', 'user.email', 'test@example.invalid']); git(['config', 'commit.gpgsign', 'false']);
  f.put('.agents/core/unique.js', 'historical source');
  git(['add', '--', '.agents/core/unique.js']); git(['commit', '-m', 'Preserve synthetic source']);
  const blob = git(['rev-parse', 'HEAD:.agents/core/unique.js']);
  f.put('.agents/core/unique.js', 'current source');
  git(['add', '--', '.agents/core/unique.js']); git(['commit', '-m', 'Evolve synthetic source']);
  f.put(`${old}/previous-core/unique.js`, 'historical source');
  assert.equal(planRuntimeCleanup(f.root).candidates.length, 1);
  // A promised/missing object or a symlink to unrelated source is not custody.
  rmSync(join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert.equal(result.removed.length, 0); assert.equal(result.warnings[0].reason, 'source-not-preserved');
});
test('independent Git metadata in an otherwise redundant payload is never retired automatically', t => {
  const f = fixture(t), old = f.switchRun('2026-01-01'); f.switchRun('2026-01-02');
  f.put(`${old}/previous-core/.git/HEAD`, 'ref: refs/heads/valuable-branch');
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert.equal(result.removed.length, 0); assert(result.warnings[0].files.includes('.git'));
});
test('a Git blob at another path does not preserve an uncommitted source filename', t => {
  const f = fixture(t), old = f.switchRun('2026-01-01'); f.switchRun('2026-01-02');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_GLOBAL: nullDevice, GIT_CONFIG_SYSTEM: nullDevice, GIT_TERMINAL_PROMPT: '0' });
  const git = args => { const r = spawnSync(gitBinary, ['-C', f.root, ...args], { encoding: 'utf8', env }); assert.equal(r.status, 0, r.stderr); };
  git(['init', '--template=', '--initial-branch=main']);
  git(['config', 'user.name', 'Isolated Fixture']); git(['config', 'user.email', 'test@example.invalid']); git(['config', 'commit.gpgsign', 'false']);
  f.put('.agents/core/other.js', 'identical source');
  git(['add', '--', '.agents/core/other.js']); git(['commit', '-m', 'Preserve other synthetic source']);
  f.put(`${old}/previous-core/uncommitted-name.js`, 'identical source');
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert.equal(result.removed.length, 0);
  assert.deepEqual(result.warnings[0].files, ['uncommitted-name.js']);
  assert(existsSync(join(f.root, old, 'previous-core/uncommitted-name.js')));
});
test('missing latest payload cannot cause the last still usable rollback to be deleted', t => {
  const f = fixture(t), available = f.switchRun('2026-01-01'), missing = f.switchRun('2026-01-02');
  rmSync(join(f.root, missing, 'previous-core'), { recursive: true });
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true });
  assert.equal(result.removed.length, 0);
  assert(result.retained.some(x => x.path === `${available}/previous-core`));
});
test('cooperation migration journal is checked using its actual persisted schema', t => {
  const f = fixture(t); f.switchRun('2026-01-01'); f.switchRun('2026-01-02');
  const path = '.agents/runtime-data/cooperation-migration/state.json';
  f.put(path, { schemaVersion: 1, root: f.root, status: 'applying', actions: [] });
  assert.throws(() => cleanupRuntimeArtifacts({ root: f.root, apply: true }), { code: 'MIGRATION_PENDING' });
  f.put(path, { schemaVersion: 1, root: f.root, status: 'complete', actions: [] });
  assert.equal(planRuntimeCleanup(f.root).candidates.length, 1);
});
test('test history and cache have count budgets; running and damaged records remain intact', t => {
  const f = fixture(t), ids = [];
  for (let i = 1; i <= 20; i++) {
    const id = randomUUID(); ids.push(id);
    f.put(`.agents/runtime-data/tests/${id}/report.json`, { schemaVersion: 1, runId: id, finishedAt: `2026-01-${String(i).padStart(2, '0')}`, status: i < 6 ? 'failed' : 'passed' });
    f.put(`.agents/runtime-data/tests/${id}/0.log`, 'test log');
  }
  const running = randomUUID(); f.put(`.agents/runtime-data/tests/${running}/0.log`, 'active');
  f.put(`.agents/runtime-data/tests/${randomUUID()}/report.json`, '{broken');
  for (let i = 0; i < 260; i++) { const key = i.toString(16).padStart(64, '0'); f.put(`.agents/runtime-data/tests/cache/${key}.json`, { schemaVersion: 1, key, result: { status: 'passed' } }); }
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true, scope: 'tests' });
  assert.equal(result.errors.length, 0); assert.equal(result.removed.filter(p => p.includes('/cache/')).length, 4);
  assert.equal(result.removed.filter(p => !p.includes('/cache/')).length, 5);
  assert(existsSync(join(f.root, `.agents/runtime-data/tests/${running}/0.log`))); assert(result.warnings.length);
  assert.equal(readdirSync(join(f.root, '.agents/runtime-data/tests/cache')).length, 256);
});
test('finishing a run preserves its own receipt even when historical timestamps are in the future', t => {
  const f = fixture(t), current = randomUUID();
  for (let i = 1; i <= 12; i++) {
    const id = randomUUID();
    f.put(`.agents/runtime-data/tests/${id}/report.json`, { schemaVersion: 1, runId: id, finishedAt: `2099-01-${String(i).padStart(2, '0')}`, status: 'passed' });
  }
  f.put(`.agents/runtime-data/tests/${current}/report.json`, { schemaVersion: 1, runId: current, finishedAt: '2026-01-01', status: 'passed' });
  const result = cleanupRuntimeArtifacts({ root: f.root, apply: true, scope: 'tests', keepRunId: current });
  assert.equal(result.errors.length, 0); assert.equal(result.removed.length, 2);
  assert(existsSync(join(f.root, `.agents/runtime-data/tests/${current}/report.json`)));
});
test('cleanup arguments reject accidental application and have explicit help', async t => {
  assert.throws(() => parseDistributionArgs('system', ['cleanup', '--apply', '--dry-run']), { code: 'INVALID_ARGUMENTS' });
  assert.throws(() => parseDistributionArgs('system', ['cleanup', '--apply=yes']), { code: 'INVALID_ARGUMENTS' });
  const f = fixture(t), help = await runDistributionCommand('system', ['cleanup', '--help'], f.root);
  assert.equal(help.exitCode, 0); assert.match(help.stdout, /cleanup/); assert.match(help.stdout, /--apply/);
});
