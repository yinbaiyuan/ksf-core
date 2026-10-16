import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installedManifest, stableJSON, writeAtomic } from '../src/distribution/common.js';
import { systemCheck, systemUpdate, systemRollback, systemRead, systemSync, systemFingerprint } from '../src/distribution/system.js';
import { distributionFixture } from './helpers/distribution-fixture.js';

const sample = 'first\none\ntwo\nthree\nfour\nfive\nlast\n';
test('Release check and upgrade work without Git, preserve private files and use explicit version identity', async t => {
  const f = await distributionFixture(t), next = await f.next('0.1.1', { '.agents/core/example.txt': sample.replace('last', 'release') });
  writeAtomic(join(f.workspace, '知识/private.md'), 'FICTIONAL_PRIVATE_CONTENT');
  writeAtomic(join(f.workspace, '能力/个人定制.md'), 'FICTIONAL_USER_CAPABILITY');
  const ignore = readFileSync(join(f.workspace, '.gitignore'));
  writeAtomic(join(f.workspace, '.agents/runtime-data/local-cache.txt'), 'FICTIONAL_CACHE');
  const checked = await systemCheck({ root: f.workspace, source: next.source });
  assert.equal(checked.available, true); assert.equal(checked.latest, '0.1.1');
  const result = await systemUpdate({ root: f.workspace, source: next.source });
  assert.equal(result.changed, true); assert.equal(installedManifest(f.workspace).version, '0.1.1');
  assert.equal(readFileSync(join(f.workspace, '.agents/core/example.txt'), 'utf8'), sample.replace('last', 'release'));
  assert.equal(readFileSync(join(f.workspace, '知识/private.md'), 'utf8'), 'FICTIONAL_PRIVATE_CONTENT');
  assert.deepEqual(readFileSync(join(f.workspace, '.gitignore')), ignore);
  assert.equal(readFileSync(join(f.workspace, '.agents/runtime-data/local-cache.txt'), 'utf8'), 'FICTIONAL_CACHE');
  assert.equal(existsSync(join(f.workspace, 'ksf')), false);
  assert.equal(existsSync(join(f.workspace, '.runtime_data')), false);
  assert.equal(existsSync(join(f.workspace, '.git')), false);
  assert.equal(f.launch(['hello', '--json']).status, 0);
});
test('three-way update preserves non-overlapping local edits and untracked Core additions', async t => {
  const f = await distributionFixture(t), next = await f.next('0.1.1', { '.agents/core/example.txt': sample.replace('last', 'release') });
  writeAtomic(join(f.workspace, '.agents/core/example.txt'), sample.replace('first', 'local'));
  writeAtomic(join(f.workspace, '.agents/core/my-extension.txt'), 'my local extension\n');
  const result = await systemUpdate({ root: f.workspace, from: next.coreArchive });
  assert.equal(result.changed, true);
  assert.equal(readFileSync(join(f.workspace, '.agents/core/example.txt'), 'utf8'), sample.replace('first', 'local').replace('last', 'release'));
  assert.equal(readFileSync(join(f.workspace, '.agents/core/my-extension.txt'), 'utf8'), 'my local extension\n');
});
test('text conflicts preserve the complete previous system and return reviewable conflict content', async t => {
  const f = await distributionFixture(t), next = await f.next('0.1.1', { '.agents/core/example.txt': 'release\n' });
  writeAtomic(join(f.workspace, '.agents/core/example.txt'), 'local\n');
  const before = systemFingerprint(f.workspace);
  await assert.rejects(systemUpdate({ root: f.workspace, source: next.source }), error => {
    assert.equal(error.code, 'UPDATE_CONFLICT'); assert.equal(error.data.conflicts[0].path, '.agents/core/example.txt');
    assert.match(error.data.conflicts[0].merged, /<<<<<<< local/); return true;
  });
  assert.equal(systemFingerprint(f.workspace), before); assert.equal(installedManifest(f.workspace).version, '0.1.0');
});
test('upstream deletion removes unchanged files but refuses to discard locally modified files', async t => {
  const f = await distributionFixture(t), next = await f.next('0.1.1', { '.agents/core/example.txt': null });
  writeAtomic(join(f.workspace, '.agents/core/example.txt'), 'local retained\n');
  await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive }), { code: 'UPDATE_CONFLICT' });
  writeAtomic(join(f.workspace, '.agents/core/example.txt'), sample);
  await systemUpdate({ root: f.workspace, from: next.coreArchive });
  assert.equal(existsSync(join(f.workspace, '.agents/core/example.txt')), false);
});
test('update preview verifies the candidate but changes no live system or personal file', async t => {
  const f = await distributionFixture(t), next = await f.next();
  const before = systemFingerprint(f.workspace);
  const result = await systemUpdate({ root: f.workspace, source: next.source, dryRun: true });
  assert.equal(result.wouldChange, true); assert.equal(result.changed, false);
  assert.equal(systemFingerprint(f.workspace), before);
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/transaction')), false);
});
test('checksum failures, wrong source identity and invalid candidates cannot publish a partial system', async t => {
  const f = await distributionFixture(t), next = await f.next();
  const before = systemFingerprint(f.workspace), feed = structuredClone(next.feed);
  feed.platforms['darwin-arm64'].core.sha256 = '0'.repeat(64);
  writeFileSync(next.source, stableJSON(feed));
  await assert.rejects(systemUpdate({ root: f.workspace, source: next.source }), { code: 'CHECKSUM_MISMATCH' });
  feed.core_repository = 'different/core'; writeFileSync(next.source, stableJSON(feed));
  await assert.rejects(systemCheck({ root: f.workspace, source: next.source }), { code: 'RELEASE_INVALID' });
  assert.equal(systemFingerprint(f.workspace), before);
});
test('candidate runtime failure leaves the original installed version runnable', async t => {
  const f = await distributionFixture(t);
  const next = await f.next('0.1.1', { '.agents/core/runtime/src/cli.js': 'process.exit(7);\n' + readFileSync(join(f.root, '.agents/core/runtime/src/cli.js'), 'utf8') });
  const before = systemFingerprint(f.workspace);
  await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive }), { code: 'CANDIDATE_INVALID' });
  assert.equal(systemFingerprint(f.workspace), before); assert.equal(f.launch(['hello', '--json']).status, 0);
});
test('invalid JavaScript in a lazily loaded file is rejected before installation', async t => {
  const f = await distributionFixture(t), next = await f.next('0.1.1', { '.agents/core/new-module.js': 'const = invalid;\n' });
  const before = systemFingerprint(f.workspace);
  await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive }), { code: 'CANDIDATE_INVALID' });
  assert.equal(systemFingerprint(f.workspace), before);
});
test('successful upgrade has a verified rollback, and post-upgrade edits prevent silent rollback loss', async t => {
  const f = await distributionFixture(t), next = await f.next();
  await systemUpdate({ root: f.workspace, from: next.coreArchive });
  const preview = await systemRollback({ root: f.workspace, dryRun: true });
  assert.equal(preview.target, '0.1.0'); assert.equal(installedManifest(f.workspace).version, '0.1.1');
  writeAtomic(join(f.workspace, '.agents/core/example.txt'), 'new local edit\n');
  await assert.rejects(systemRollback({ root: f.workspace }), { code: 'ROLLBACK_LOCAL_CHANGES' });
  writeAtomic(join(f.workspace, '.agents/core/example.txt'), sample);
  const result = await systemRollback({ root: f.workspace });
  assert.equal(result.to, '0.1.0'); assert.equal(installedManifest(f.workspace).version, '0.1.0');
});
for (const point of ['old-renamed', 'new-renamed', 'roots-installed']) {
  test(`an I/O failure at ${point} restores the original system`, async t => {
    const f = await distributionFixture(t), next = await f.next(), before = systemFingerprint(f.workspace);
    await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive,
      fault: stage => { if (stage === point) throw Object.assign(new Error('FICTIONAL_IO_FAILURE'), { code: 'FICTIONAL_IO_FAILURE' }); } }), { code: 'FICTIONAL_IO_FAILURE' });
    assert.equal(systemFingerprint(f.workspace), before); assert.equal(f.launch(['hello', '--json']).status, 0);
  });
}
for (const point of ['old-renamed', 'new-renamed', 'committed']) {
  test(`a real SIGKILL at ${point} is recovered by the fixed launcher without Node or Git setup`, async t => {
    const f = await distributionFixture(t), next = await f.next();
    const moduleURL = new URL('../src/distribution/system.js', import.meta.url).href;
    const script = `import {systemUpdate} from ${JSON.stringify(moduleURL)};\n` +
      `await systemUpdate({root: process.argv[1], from: process.argv[2], fault: stage => {if(stage === process.argv[3]) process.kill(process.pid, 'SIGKILL');}});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, f.workspace, next.coreArchive, point], { encoding: 'utf8', timeout: 20000 });
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    const recovered = f.launch(['hello', '--json']);
    assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
    assert.equal(installedManifest(f.workspace).version, point === 'committed' ? '0.1.1' : '0.1.0');
    assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/transaction')), false);
    assert.equal(f.launch(['hello', '--json']).status, 0);
  });
}
test('a live transaction blocks another launcher instead of being rolled back', async t => {
  const f = await distributionFixture(t), next = await f.next(); let checked = false;
  await systemUpdate({ root: f.workspace, from: next.coreArchive, fault: stage => {
    if (stage !== 'old-renamed') return;
    const result = f.launch(['system', 'read', '--json']);
    assert.equal(result.status, 1); assert.match(result.stderr, /update is running/); checked = true;
  } });
  assert.equal(checked, true); assert.equal(installedManifest(f.workspace).version, '0.1.1');
});
test('explicit sync caches offline attempts; normal commands do not perform checks', async t => {
  const f = await distributionFixture(t); let calls = 0;
  const offline = async () => { calls++; throw new Error('FICTIONAL_OFFLINE'); };
  await assert.rejects(systemSync({ root: f.workspace, now: 100000, fetcher: offline }), { code: 'DOWNLOAD_FAILED' });
  const skipped = await systemSync({ root: f.workspace, now: 100001, fetcher: offline });
  assert.equal(skipped.reason, 'not-due'); assert.equal(calls, 1);
  assert.equal(f.launch(['hello', '--json']).status, 0);
});
test('normal commands never check or install a newer Release; explicit commands do', async t => {
  const f = await distributionFixture(t), next = await f.next();
  const path = join(f.workspace, '.agents/core/distribution.json'), config = JSON.parse(readFileSync(path));
  config.release_source = pathToFileURL(next.source).href; writeFileSync(path, stableJSON(config));
  const result = f.launch(['hello', '--json'], { env: { KSF_SKIP_AUTO_UPDATE: '0' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).message, 'Hello, KSF!');
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
  assert.match(result.stderr, /^(?:KSF: preparing Node\.js [^\n]+\.\n)?$/);
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/check.json')), false);
  assert.equal((await systemRead({ root: f.workspace })).automaticUpdates, false);
  const checked = f.launch(['system', 'check', '--json']);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.equal(JSON.parse(checked.stdout).data.available, true);
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
  const updated = f.launch(['system', 'update', '--json']);
  assert.equal(updated.status, 0, updated.stdout + updated.stderr);
  assert.equal(installedManifest(f.workspace).version, '0.1.1');
});

test('preparation failure preserves concurrent root edits (F01) and never replaces unchanged launchers', async t => {
  const f = await distributionFixture(t);
  const original = readFileSync(join(f.workspace, 'AGENTS.md'), 'utf8');
  const next = await f.next('0.1.1', { 'AGENTS.md': original + '\nRelease addition.\n' });
  await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive, fault: stage => {
    if (stage === 'prepared') {
      writeFileSync(join(f.workspace, 'AGENTS.md'), original + '\nConcurrent user addition.\n');
      throw Object.assign(new Error('FICTIONAL_FAILURE'), { code: 'FICTIONAL_FAILURE' });
    }
  } }), { code: 'FICTIONAL_FAILURE' });
  assert.equal(readFileSync(join(f.workspace, 'AGENTS.md'), 'utf8'), original + '\nConcurrent user addition.\n');
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
});
for (const rootFile of ['AGENTS.md', '.agents/ksf', '.agents/ksf.ps1']) {
  test(`SIGKILL after replacing ${rootFile} restores roots and Core together`, async t => {
    const f = await distributionFixture(t);
    const paths = ['AGENTS.md', '.agents/ksf', '.agents/ksf.ps1'];
    const changes = Object.fromEntries(paths.map(path => [path, readFileSync(join(f.root, path), 'utf8') + '\n# Fictional new release\n']));
    const next = await f.next('0.1.1', changes), before = systemFingerprint(f.workspace);
    const moduleURL = new URL('../src/distribution/system.js', import.meta.url).href;
    const script = `import {systemUpdate} from ${JSON.stringify(moduleURL)};\n` +
      `await systemUpdate({root:process.argv[1],from:process.argv[2],fault:stage=>{if(stage===process.argv[3])process.kill(process.pid,'SIGKILL');}});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, f.workspace, next.coreArchive, `root-installed:${rootFile}`], { encoding: 'utf8', timeout: 20000 });
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    const recovered = f.launch(['launcher', 'recover']);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(systemFingerprint(f.workspace), before);
  });
}
test('unchanged launcher inodes survive an ordinary Core upgrade', async t => {
  const { statSync } = await import('node:fs');
  const f = await distributionFixture(t), next = await f.next();
  const paths = ['.agents/ksf', '.agents/ksf.ps1'];
  const before = paths.map(path => statSync(join(f.workspace, path)).ino);
  await systemUpdate({ root: f.workspace, from: next.coreArchive });
  assert.deepEqual(paths.map(path => statSync(join(f.workspace, path)).ino), before);
});
test('post-install concurrent root edits preserve the transaction for explicit recovery', async t => {
  const f = await distributionFixture(t);
  const original = readFileSync(join(f.root, 'AGENTS.md'), 'utf8');
  const next = await f.next('0.1.1', { 'AGENTS.md': original + '\nRelease addition.\n' });
  await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive, fault: stage => {
    if (stage === 'root-installed:AGENTS.md') {
      writeFileSync(join(f.workspace, 'AGENTS.md'), 'Concurrent edit after replacement.\n');
      throw new Error('FICTIONAL_FAILURE');
    }
  } }), { code: 'RECOVERY_CONFLICT' });
  assert.equal(readFileSync(join(f.workspace, 'AGENTS.md'), 'utf8'), 'Concurrent edit after replacement.\n');
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/transaction')), true);
  assert.equal(installedManifest(f.workspace).version, '0.1.1');
});

for (const defect of ['missing-entry', 'missing-reference', 'inactive-entry']) test(`invalid candidate definitions (${defect}) leave the installed system intact`, async t => {
  const f = await distributionFixture(t), path = '.agents/core/abilities/partners/ksf-runtime/partner.md';
  const original = readFileSync(join(f.root, path), 'utf8');
  const changes = defect === 'missing-entry' ? { [path]: null }
    : { [path]: defect === 'missing-reference' ? original.replace('competency.ksf.ability-route@0.1.0', 'competency.ksf.absent@0.1.0') : original.replace('status: active', 'status: archived') };
  const next = await f.next('0.1.1', changes), before = systemFingerprint(f.workspace);
  await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive }), { code: 'CANDIDATE_INVALID' });
  assert.equal(systemFingerprint(f.workspace), before); assert.equal(installedManifest(f.workspace).version, '0.1.0');
  assert.equal(f.launch(['hello', '--json']).status, 0);
});
test('offline normal reads neither check the feed nor create an attempt cache', async t => {
  const f = await distributionFixture(t), path = join(f.workspace, '.agents/core/distribution.json');
  const config = JSON.parse(readFileSync(path)); config.release_source = 'file:///definitely-missing-ksf-index.json';
  writeFileSync(path, stableJSON(config));
  for (const args of [['hello', '--json'], ['context', 'capabilities', '--json'], ['system', 'read', '--json']]) {
    const result = f.launch(args, { env: { KSF_SKIP_AUTO_UPDATE: '0' } });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /^(?:KSF: preparing Node\.js [^\n]+\.\n)?$/);
  }
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/check.json')), false);
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
});
