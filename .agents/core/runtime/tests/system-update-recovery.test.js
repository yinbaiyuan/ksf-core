import {platform as nativePlatform} from '../src/platform/index.js';
import {fixtureTarget} from './helpers/distribution-fixture.js';
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
  assert.equal(existsSync(join(f.workspace, '源档')), false);
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
    if(nativePlatform.name==='win32')assert.equal(child.status,1,child.stderr);else assert.equal(child.signal,'SIGKILL',child.stderr);
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
