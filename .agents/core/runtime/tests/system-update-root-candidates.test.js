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

for (const defect of ['missing-entry', 'missing-reference', 'inactive-entry']) test(`invalid candidate definitions (${defect}) leave the installed system intact`, async t => {
  const f = await distributionFixture(t), path = '.agents/core/abilities/partners/ksf-runtime/partner.md';
  const original = readFileSync(join(f.root, path), 'utf8');
  const changes = defect === 'missing-entry' ? { [path]: null }
    : { [path]: defect === 'missing-reference' ? original.replace(/competency\.ksf\.ability-route@\d+\.\d+\.\d+/, 'competency.ksf.absent@0.1.0') : original.replace('status: active', 'status: archived') };
  const next = await f.next('0.1.1', changes), before = systemFingerprint(f.workspace);
  await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive }), { code: 'CANDIDATE_INVALID' });
  assert.equal(systemFingerprint(f.workspace), before); assert.equal(installedManifest(f.workspace).version, '0.1.0');
  assert.equal(f.launch(['hello', '--json']).status, 0);
});
