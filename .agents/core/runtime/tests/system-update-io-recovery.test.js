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

for (const point of ['old-renamed', 'new-renamed', 'roots-installed']) {
  test(`an I/O failure at ${point} restores the original system`, async t => {
    const f = await distributionFixture(t), next = await f.next(), before = systemFingerprint(f.workspace);
    await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive,
      fault: stage => { if (stage === point) throw Object.assign(new Error('FICTIONAL_IO_FAILURE'), { code: 'FICTIONAL_IO_FAILURE' }); } }), { code: 'FICTIONAL_IO_FAILURE' });
    assert.equal(systemFingerprint(f.workspace), before); assert.equal(f.launch(['hello', '--json']).status, 0);
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
