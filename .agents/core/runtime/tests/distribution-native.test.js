import {storedZip} from './helpers/platform.js';
import {buildManifest} from '../src/services/build-manifest.js';
import {launcherInvocation,platform as nativePlatform} from '../src/platform/index.js';
import {fileMode} from '../src/distribution/files.js';
import {fixtureTarget} from './helpers/distribution-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, existsSync, lstatSync, readFileSync, writeFileSync, symlinkSync, rmSync, realpathSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createArchive, readArchive } from '../src/distribution/archive.js';
import { compareVersions, configuration, installedManifest, releaseReceipt, isBranch, sha256, stableJSON, writeAtomic } from '../src/distribution/common.js';
import { buildRelease, inspectCoreArchive, workspaceDocuments, knowledgeFrameworkFiles } from '../src/distribution/release.js';
import { inspectReleaseDirectory } from '../src/distribution/publish.js';
import { parseDistributionArgs } from '../src/commands/distribution.js';
import { distributionFixture, git } from './helpers/distribution-fixture.js';
import { contextCapabilities } from '../src/services/context.js';
import { objectQuery } from '../src/services/objects.js';
import { systemUpdate } from '../src/distribution/system.js';
import { ForkAPI } from './helpers/contribution-api.js';

test('a custom-named user instance starts and upgrades independently of its template name', async t => {
  const f = await distributionFixture(t), next = await f.next();
  const instance = join(f.directory, '我的个人资料 实例');
  cpSync(f.first.template, instance, { recursive: true });
  writeAtomic(join(instance, '知识/private.md'), 'FICTIONAL_PRIVATE');
  const invocation=launcherInvocation(instance,['hello','--json']);
  const launched = spawnSync(invocation.executable, invocation.args, {
    cwd: f.directory, encoding: 'utf8', timeout: 20000, env: { ...process.env, PATH: '', KSF_SKIP_AUTO_UPDATE: '1' },
  });
  assert.equal(launched.status, 0, launched.stderr);
  assert.equal(JSON.parse(launched.stdout).runtime.ksfRoot.replace(/[\\/]$/, ''), realpathSync.native(instance));
  await systemUpdate({ root: instance, from: next.coreArchive, api: new ForkAPI({ coreRoot: f.root }) });
  assert.equal(installedManifest(instance).version, '0.1.1');
  assert.equal(readFileSync(join(instance, '知识/private.md'), 'utf8'), 'FICTIONAL_PRIVATE');
});

test('a copied no-Git workspace starts through its fixed launcher from another cwd without global Node', async t => {
  const f = await distributionFixture(t);
  assert.equal(existsSync(join(f.workspace, '.git')), false);
  const result = f.launch(['hello', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).message, 'Hello, KSF!');
  const status = f.launch(['system', 'read', '--json']);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).data.version, '0.1.0');
  const discovery = f.launch(['context', 'capabilities', '--json']);
  assert.equal(discovery.status, 0, discovery.stdout + discovery.stderr);
  assert.equal(JSON.parse(discovery.stdout).data.complete, true);
  assert.equal(existsSync(join(f.workspace, '源档')), false);
  for (const path of ['USER.md', 'BOT.md', 'MEMORY.md']) assert.equal(existsSync(join(f.root, path)), false);
});

test('symlinked system inputs and tampered published artifacts are rejected', async t => {
  const f = await distributionFixture(t);
  symlinkSync(join(f.root, 'AGENTS.md'), join(f.root, '.agents/core/symlink'));
  await assert.rejects(buildRelease({ root: f.root, output: join(f.directory, 'unsafe'), allowDirty: true }), { code: 'UNSAFE_PATH' });
  const descriptor = f.first.index.platforms[fixtureTarget].core;
  writeFileSync(join(f.first.output, descriptor.name), 'tampered');
  assert.throws(() => inspectReleaseDirectory(f.root, f.first.output), { code: 'RELEASE_INVALID' });
});
