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
