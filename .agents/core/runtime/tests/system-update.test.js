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

test('Release check and upgrade work without Git, preserve private files and use explicit version identity', async t => {
  const f = await distributionFixture(t), next = await f.next('0.1.1', { '.agents/core/example.txt': sample.replace('last', 'release') });
  writeAtomic(join(f.workspace, '知识/private.md'), 'FICTIONAL_PRIVATE_CONTENT');
  writeAtomic(join(f.workspace, '能力/个人定制.md'), 'FICTIONAL_USER_CAPABILITY');
  assert.equal(existsSync(join(f.workspace, 'MEMORY.md')), false);
  for (const name of ['USER.md', 'BOT.md']) rmSync(join(f.workspace, name));
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
  assert.equal(existsSync(join(f.workspace, '源档')), false);
  for (const name of ['USER.md', 'BOT.md', 'MEMORY.md']) assert.equal(existsSync(join(f.workspace, name)), false);
  await systemRollback({ root: f.workspace });
  for (const name of ['USER.md', 'BOT.md', 'MEMORY.md']) assert.equal(existsSync(join(f.workspace, name)), false);
});

test('upgrading and rolling back a legacy instance preserves originals outside the managed system', async t => {
  const f = await distributionFixture(t, { legacyEntry: true });
  const original = Buffer.from('会议原件\n来源：虚构会议，日期：2026-10-22\n');
  const custom = { 'USER.md': '虚构用户自行编辑的身份与偏好\n', 'BOT.md': '虚构 Agent 协作方式\n', 'MEMORY.md': '未解决与待沉淀线索\n', '知识/knowledge.md': '用户自行设计的知识分类\n', '档案/archive.md': '用户自行设计的档案机制\n', '归档/旧资料.txt': '旧目录内容保留\n' };
  for (const [path, text] of Object.entries(custom)) writeAtomic(join(f.workspace, path), text);
  const path = join(f.workspace, '源档/会议/原件.txt');
  writeAtomic(path, original);
  writeAtomic(join(f.workspace, '源档/.gitkeep'), Buffer.alloc(0));
  const next = await f.next();
  await systemUpdate({ root: f.workspace, from: next.coreArchive });
  assert.deepEqual(readFileSync(path), original);
  for (const [relative, text] of Object.entries(custom)) assert.equal(readFileSync(join(f.workspace, relative), 'utf8'), text);
  assert.equal(readFileSync(join(f.workspace, '源档/.gitkeep')).length, 0);
  // A user edit after the update must survive rollback as well.
  const updated = Buffer.concat([original, Buffer.from('用户补充\n')]);
  writeFileSync(path, updated);
  for (const name of ['USER.md', 'BOT.md', 'MEMORY.md']) {
    custom[name] += '升级后的用户补充，不应被回滚覆盖\n';
    writeFileSync(join(f.workspace, name), custom[name]);
  }
  await systemRollback({ root: f.workspace });
  assert.equal(installedManifest(f.workspace).version, '0.1.0');
  assert.deepEqual(readFileSync(path), updated);
  for (const [relative, text] of Object.entries(custom)) assert.equal(readFileSync(join(f.workspace, relative), 'utf8'), text);
  assert.equal(readFileSync(join(f.workspace, '源档/.gitkeep')).length, 0);
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
  feed.platforms[fixtureTarget].core.sha256 = '0'.repeat(64);
  writeFileSync(next.source, stableJSON(feed));
  await assert.rejects(systemUpdate({ root: f.workspace, source: next.source }), { code: 'CHECKSUM_MISMATCH' });
  feed.core_repository = 'different/core'; writeFileSync(next.source, stableJSON(feed));
  await assert.rejects(systemCheck({ root: f.workspace, source: next.source }), { code: 'RELEASE_INVALID' });
  assert.equal(systemFingerprint(f.workspace), before);
});
