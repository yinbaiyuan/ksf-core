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

test('normal commands never check or install a newer Release; explicit commands do', async t => {
  const f = await distributionFixture(t), next = await f.next();
  const path = join(f.workspace, '.agents/core/distribution.json'), config = JSON.parse(readFileSync(path));
  config.release_source = pathToFileURL(next.source).href; writeFileSync(path, stableJSON(config));
  const result = f.launch(['hello', '--json'], { env: { KSF_SKIP_AUTO_UPDATE: '0' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).message, 'Hello, KSF!');
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
  assert.match(result.stderr.replaceAll('\r\n','\n'), /^(?:KSF: preparing Node\.js [^\n]+\.\n)?$/);
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/check.json')), false);
  assert.equal((await systemRead({ root: f.workspace })).automaticUpdates, false);
  const checked = f.launch(['system', 'check', '--json'], {timeoutMs:60000});
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.equal(JSON.parse(checked.stdout).data.available, true);
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
  const updated = f.launch(['system', 'update', '--json'], {timeoutMs:60000});
  assert.equal(updated.status, 0, updated.stdout + updated.stderr);
  assert.equal(installedManifest(f.workspace).version, '0.1.1');
});

test('unchanged launcher inodes survive an ordinary Core upgrade', async t => {
  const { statSync } = await import('node:fs');
  const f = await distributionFixture(t), next = await f.next();
  const paths = ['.agents/ksf', '.agents/ksf.ps1'];
  const before = paths.map(path => statSync(join(f.workspace, path)).ino);
  await systemUpdate({ root: f.workspace, from: next.coreArchive });
  assert.deepEqual(paths.map(path => statSync(join(f.workspace, path)).ino), before);
});

test('offline normal reads neither check the feed nor create an attempt cache', async t => {
  const f = await distributionFixture(t), path = join(f.workspace, '.agents/core/distribution.json');
  const config = JSON.parse(readFileSync(path)); config.release_source = 'file:///definitely-missing-ksf-index.json';
  writeFileSync(path, stableJSON(config));
  for (const args of [['hello', '--json'], ['context', 'capabilities', '--json'], ['system', 'read', '--json']]) {
    const result = f.launch(args, { env: { KSF_SKIP_AUTO_UPDATE: '0' } });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr.replaceAll('\r\n','\n'), /^(?:KSF: preparing Node\.js [^\n]+\.\n)?$/);
  }
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/check.json')), false);
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
});
