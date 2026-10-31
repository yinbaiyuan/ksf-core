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

test('explicit sync caches offline attempts; normal commands do not perform checks', async t => {
  const f = await distributionFixture(t); let calls = 0;
  const offline = async () => { calls++; throw new Error('FICTIONAL_OFFLINE'); };
  await assert.rejects(systemSync({ root: f.workspace, now: 100000, fetcher: offline }), { code: 'DOWNLOAD_FAILED' });
  const skipped = await systemSync({ root: f.workspace, now: 100001, fetcher: offline });
  assert.equal(skipped.reason, 'not-due'); assert.equal(calls, 1);
  assert.equal(f.launch(['hello', '--json']).status, 0);
});
