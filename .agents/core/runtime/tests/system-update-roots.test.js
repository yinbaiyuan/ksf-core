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
    if(nativePlatform.name==='win32')assert.equal(child.status,1,child.stderr);else assert.equal(child.signal,'SIGKILL',child.stderr);
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
    : { [path]: defect === 'missing-reference' ? original.replace(/competency\.ksf\.ability-route@\d+\.\d+\.\d+/, 'competency.ksf.absent@0.1.0') : original.replace('status: active', 'status: archived') };
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
    assert.match(result.stderr.replaceAll('\r\n','\n'), /^(?:KSF: preparing Node\.js [^\n]+\.\n)?$/);
  }
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/check.json')), false);
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
});
