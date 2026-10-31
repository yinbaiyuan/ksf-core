import {fixtureTarget} from './helpers/distribution-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmodSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { digestObject, installedManifest, releaseReceipt, stableJSON, writeAtomic } from '../src/distribution/common.js';
import { buildRelease, inspectCoreArchive } from '../src/distribution/release.js';
import { inspectReleaseDirectory } from '../src/distribution/publish.js';
import { gitBlobID, resolveBaseline } from '../src/distribution/baseline.js';
import { GitHubAPI } from '../src/distribution/github.js';
import { systemRead, systemUpdate, systemRollback, systemFingerprint } from '../src/distribution/system.js';
import { prepareContribution, readContribution, submitContribution } from '../src/distribution/contribute.js';
import { distributionFixture, commitWorkspace, git, contributionDescription } from './helpers/distribution-fixture.js';
import { ForkAPI } from './helpers/contribution-api.js';
const example = '.agents/core/example.txt';
const sample = 'first\none\ntwo\nthree\nfour\nfive\nlast\n';
const apiFor = f => new ForkAPI({ coreRoot: f.root });
const prepare = (f, api, options = {}) => prepareContribution({ ...contributionDescription, root: f.workspace, paths: [example], api, ...options });
const submit = (f, plan, api, options = {}) => submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api, ...options });
async function published(t) {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f);
  writeAtomic(join(f.workspace, example), 'a reviewed fix\n'); commitWorkspace(f);
  const plan = await prepare(f, api); await submit(f, plan, api); api.calls = [];
  return { f, api, plan };
}

test('compact instance creates committed-only diffs, ignores dirty files and submits from the pinned Core commit', async t => {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f);
  writeAtomic(join(f.workspace, example), 'committed fix\n'); const head = commitWorkspace(f);
  writeAtomic(join(f.workspace, example), 'staged private scratch\n'); git(f.workspace, ['add', '--', example]);
  writeAtomic(join(f.workspace, example), 'working private scratch\n');
  writeAtomic(join(f.workspace, '.agents/core/release.json'), 'broken uncommitted receipt');
  const plan = await prepare(f, api);
  assert.equal(plan.sourceCommit, head); assert.equal(plan.baseline.schema_version, 4);
  assert.match(plan.changes[0].diff, /-first/); assert.match(plan.changes[0].diff, /\+committed fix/);
  assert.ok(!JSON.stringify(plan).includes('private scratch'));
  api.calls = [];
  assert.equal((await submit(f, plan, api, { dryRun: true })).remoteVerified, false); assert.equal(api.calls.length, 0);
  const result = await submit(f, plan, api); assert.equal(result.draft, true);
  assert.ok(!JSON.stringify(api.calls).includes(head));
});

test('compact committed snapshots preserve deletions, executable modes, binaries and Chinese additions', async t => {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f), binary = '.agents/core/new.bin', chinese = '.agents/core/中文 新文件.txt';
  rmSync(join(f.workspace, example)); chmodSync(join(f.workspace, 'AGENTS.md'), 0o755);
  writeAtomic(join(f.workspace, binary), Buffer.from([0, 255, 10])); writeAtomic(join(f.workspace, chinese), 'committed Chinese path\n'); commitWorkspace(f,{modes:{'AGENTS.md':0o755}});
  const plan = await prepare(f, api, { paths: undefined, all: true });
  assert.equal(plan.changes.length,4,JSON.stringify(plan.changes.map(item=>({path:item.workspace_path,mode:item.mode})))); assert.equal(plan.changes.find(c => c.workspace_path === example).operation, 'delete');
  assert.equal(plan.changes.find(c => c.workspace_path === 'AGENTS.md').mode, 0o755);
  assert.match(plan.changes.find(c => c.workspace_path === binary).diff, /^Binary change:/);
  assert.equal(plan.changes.find(c => c.workspace_path === chinese).operation, 'add');
  assert.equal((await submit(f, plan, api)).draft, true);
});

test('compact upgrade merges from fetched original bytes and rollback restores the compact receipt', async t => {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f), original = readFileSync(join(f.workspace, '.agents/core/release.json'));
  const next = await f.next('0.1.1', { [example]: sample.replace('last', 'upstream') });
  writeAtomic(join(f.workspace, example), sample.replace('first', 'local'));
  const preview = await systemUpdate({ root: f.workspace, from: next.coreArchive, api, dryRun: true });
  assert.equal(preview.wouldChange, true); assert.ok(readFileSync(join(f.workspace, '.agents/core/release.json')).equals(original));
  await systemUpdate({ root: f.workspace, from: next.coreArchive, api });
  assert.equal(installedManifest(f.workspace).schema_version, 4);
  assert.equal(readFileSync(join(f.workspace, example), 'utf8'), sample.replace('first', 'local').replace('last', 'upstream'));
  await systemRollback({ root: f.workspace });
  assert.ok(readFileSync(join(f.workspace, '.agents/core/release.json')).equals(original));
  assert.equal(readFileSync(join(f.workspace, example), 'utf8'), sample.replace('first', 'local'));
});

for (const defect of ['network', 'commit', 'tree', 'blob']) test(`unverified remote original (${defect}) preserves the compact instance`, async t => {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f), request = api.request.bind(api);
  const next = await f.next('0.1.1', { [example]: sample.replace('last', 'release') });
  writeAtomic(join(f.workspace, example), sample.replace('first', 'local'));
  const before = systemFingerprint(f.workspace);
  api.request = async (...args) => {
    if (defect === 'network') throw Object.assign(new Error('unavailable fixture service'), { code: 'GITHUB_REQUEST_FAILED' });
    const result = await request(...args);
    if (defect === 'commit' && args[1].includes('/git/commits/')) result.sha = 'f'.repeat(40);
    if (defect === 'tree' && args[1].includes('/git/trees/')) result.truncated = true;
    if (defect === 'blob' && args[1].includes('/git/blobs/')) result.content = Buffer.from('wrong original').toString('base64');
    return result;
  };
  await assert.rejects(systemUpdate({ root: f.workspace, from: next.coreArchive, api }));
  assert.equal(systemFingerprint(f.workspace), before); assert.ok(api.calls.every(c => c.method === 'GET'));
});

for (const state of ['open', 'closed', 'merged']) test(`same node warns about the existing ${state} PR and another plan creates no duplicate`, async t => {
  const { f, api, plan } = await published(t);
  if (state !== 'open') { api.pr.state = 'closed'; api.pr.draft = false; api.ref = null; }
  if (state === 'merged') api.pr.merged = true;
  const repeat = await prepare(f, api);
  assert.notEqual(repeat.id, plan.id); assert.equal(repeat.warnings.length, 1);
  assert.equal(repeat.warnings[0].remoteVerified, true); assert.equal(repeat.warnings[0].sameSourceCommit, true);
  assert.equal(repeat.warnings[0].sameContent, true); assert.match(repeat.warnings[0].url, /\/pull\/17$/);
  const result = await submit(f, repeat, api);
  assert.equal(result.duplicate, true); assert.equal(result.id, plan.id); assert.equal(result.merged, state === 'merged');
  assert.equal(api.prCount, 1); assert.ok(api.calls.every(c => c.method === 'GET'));
});

test('a later personal-only commit still warns about identical already-contributed system content', async t => {
  const { f, api } = await published(t);
  writeAtomic(join(f.workspace, '知识/private.md'), 'fictional private note'); commitWorkspace(f, { paths: ['知识/private.md'] });
  const repeat = await prepare(f, api);
  assert.equal(repeat.warnings[0].sameSourceCommit, false); assert.equal(repeat.warnings[0].sameContent, true);
  assert.equal((await submit(f, repeat, api)).duplicate, true); assert.equal(api.prCount, 1);
});
