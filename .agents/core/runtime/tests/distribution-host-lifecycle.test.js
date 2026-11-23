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
import { systemUpdate,systemRollback,systemFingerprint } from '../src/distribution/system.js';
import { ForkAPI } from './helpers/contribution-api.js';







import {writeUserData,readUserData} from '../src/services/user-data.js';
import {contextEntry} from '../src/services/entry-context.js';
const statePath='.agents/user-data/incubation.json';
test('distribution fixture reconstructs Core sources from an installed workspace', async t => {
  const source = await distributionFixture(t);
  assert.equal(existsSync(join(source.workspace, '.agents/core/release.json')), true);
  const f = await distributionFixture(t, { sourceRoot: source.workspace });
  assert.equal(existsSync(join(f.root, '.agents/core/release.json')), false);
  const discovery = contextCapabilities(f.root);
  assert.equal(discovery.data.complete, true, JSON.stringify(discovery.errors));
  assert.equal(existsSync(join(source.workspace, '.agents/core/release.json')), true);
  assert.equal(f.launch(['context', 'capabilities', '--json']).status, 0);
});

test('a new updater explicitly targets an existing instance and leaves its source directory untouched',async t=>{
 const f=await distributionFixture(t),next=await f.next('0.1.1',{'.agents/core/example.txt':'target update\n'}),{runDistributionCommand}=await import('../src/commands/distribution.js');
 writeAtomic(join(f.workspace,'USER.md'),'Private instance\n');const sourceBefore=readFileSync(join(f.root,'.agents/core/example.txt')),targetBefore=readFileSync(join(f.workspace,'.agents/core/example.txt'));
 assert.throws(()=>parseDistributionArgs('system',['read','--instance',f.workspace]),{code:'INVALID_ARGUMENTS'});
 const args=['update','--instance',f.workspace,'--from',next.coreArchive,'--json'],preview=await runDistributionCommand('system',[...args,'--dry-run'],f.root);assert.equal(preview.exitCode,0,preview.stdout);const planned=JSON.parse(preview.stdout);assert.equal(planned.data.current,'0.1.0');assert.equal(planned.data.latest,'0.1.1');assert.equal(planned.data.instanceRoot,realpathSync(f.workspace));assert.deepEqual(readFileSync(join(f.workspace,'.agents/core/example.txt')),targetBefore);
 const applied=await runDistributionCommand('system',args,f.root);assert.equal(applied.exitCode,0,applied.stdout);assert.equal(installedManifest(f.workspace).version,'0.1.1');assert.equal(readFileSync(join(f.workspace,'.agents/core/example.txt'),'utf8'),'target update\n');assert.equal(readFileSync(join(f.workspace,'USER.md'),'utf8'),'Private instance\n');assert.deepEqual(readFileSync(join(f.root,'.agents/core/example.txt')),sourceBefore);assert.equal(existsSync(join(f.root,'.agents/core/release.json')),false);
 writeAtomic(join(f.workspace,'.agents/runtime-data/cooperation-migration/state.json'),stableJSON({schemaVersion:1,root:realpathSync(f.workspace),actions:[],status:'applying'}));const blocked=await runDistributionCommand('system',[...args,'--dry-run'],f.root);assert.equal(blocked.exitCode,1);assert.equal(JSON.parse(blocked.stdout).errors[0].code,'MIGRATION_PENDING');
});

test('lifecycle changes do not alter Core fingerprint and upgrade/rollback preserve state without incubating legacy instances',async t=>{
  const f=await distributionFixture(t),initial=systemFingerprint(f.workspace),entry=f.launch(['context','entry','--json']);
  assert.equal(entry.status,0,entry.stdout+entry.stderr);assert.equal(JSON.parse(entry.stdout).data.mode,'incubation');
  writeUserData({root:f.workspace,namespace:'incubation',ifMatch:readUserData({root:f.workspace,namespace:'incubation'}).etag,values:{status:'completed'}});
  assert.equal(systemFingerprint(f.workspace),initial);const before=readFileSync(join(f.workspace,statePath)),next=await f.next();
  await systemUpdate({root:f.workspace,from:next.coreArchive});assert.deepEqual(readFileSync(join(f.workspace,statePath)),before);assert.equal(contextEntry(f.workspace).mode,'runtime');
  await systemRollback({root:f.workspace});assert.deepEqual(readFileSync(join(f.workspace,statePath)),before);
  rmSync(join(f.workspace,statePath));await systemUpdate({root:f.workspace,from:next.coreArchive});assert.equal(readUserData({root:f.workspace,namespace:'incubation'}).state,'missing');assert.equal(contextEntry(f.workspace).mode,'runtime');
});
