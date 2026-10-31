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

test('identical legacy PR content warns without inventing a local commit association or creating a replacement', async t => {
  const { f, api, plan } = await published(t);
  const { digest, sourceCommit, baseline, ...old } = readContribution({ root: f.workspace, id: plan.id });
  old.schema_version = 1; old.changes = old.changes.map(({ before_mode, ...change }) => change);
  old.core = { revision: old.core.revision, branch: old.core.branch, repository: old.core.repository };
  const legacyDigest = digestObject(old), directory = join(f.workspace, `.agents/runtime-data/contributions/${plan.id}`);
  writeAtomic(join(directory, 'plan.json'), stableJSON({ ...old, digest: legacyDigest }));
  const state = JSON.parse(readFileSync(join(directory, 'submitted.json'))); state.digest = legacyDigest;
  writeAtomic(join(directory, 'submitted.json'), stableJSON(state)); rmSync(join(directory, 'attempted.json'));
  const repeat = await prepare(f, api);
  assert.equal(repeat.warnings[0].sameContent, true); assert.equal(repeat.warnings[0].sameSourceCommit, false);
  const result = await submit(f, repeat, api); assert.equal(result.legacy, true); assert.equal(result.duplicate, true);
  assert.equal(api.prCount, 1); assert.ok(api.calls.every(c => c.method === 'GET'));
});

test('different selections at the same node warn without falsely marking them as identical', async t => {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f);
  writeAtomic(join(f.workspace, example), 'a fix'); writeAtomic(join(f.workspace, '.agents/core/extra.txt'), 'another fix'); commitWorkspace(f);
  const first = await prepare(f, api); await submit(f, first, api); api.calls = [];
  const next = await prepare(f, api, { paths: ['.agents/core/extra.txt'] });
  assert.equal(next.warnings[0].sameSourceCommit, true); assert.equal(next.warnings[0].sameContent, false);
  assert.ok(api.calls.every(c => c.method === 'GET'));
});

test('a lost ref-creation response is discovered by another plan and resumes through the original ID', async t => {
  const f = await distributionFixture(t, { compact: true }), api = new ForkAPI({ coreRoot: f.root, failAfterRef: true });
  writeAtomic(join(f.workspace, example), 'a reviewed fix'); commitWorkspace(f);
  const plan = await prepare(f, api); await assert.rejects(submit(f, plan, api), { code: 'GITHUB_REQUEST_FAILED' });
  api.calls = [];
  const repeat = await prepare(f, api);
  assert.equal(repeat.warnings[0].reason, 'CONTRIBUTION_PREVIOUS_ATTEMPT');
  await assert.rejects(submit(f, repeat, api), { code: 'CONTRIBUTION_PREVIOUS_ATTEMPT' });
  assert.ok(api.calls.every(c => c.method === 'GET')); assert.equal(api.prCount, 0);
  await submit(f, plan, api); assert.equal(api.prCount, 1);
});

test('unknown prior PR state warns during prepare and prevents another publication', async t => {
  const { f, api } = await published(t), request = api.request.bind(api);
  api.request = async (...args) => {
    if (args[1].endsWith('/pulls/17')) throw Object.assign(new Error('unknown fixture state'), { code: 'GITHUB_REQUEST_FAILED' });
    return request(...args);
  };
  const repeat = await prepare(f, api);
  assert.equal(repeat.warnings[0].remoteVerified, false);
  await assert.rejects(submit(f, repeat, api), { code: 'GITHUB_REQUEST_FAILED' });
  assert.equal(api.prCount, 1); assert.ok(api.calls.every(c => c.method === 'GET'));
});

test('partial publication reuses its original plan rather than creating another PR from another plan', async t => {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f);
  writeAtomic(join(f.workspace, example), 'a reviewed fix'); commitWorkspace(f);
  const plan = await prepare(f, api), request = api.request.bind(api);
  let fail = true;
  api.request = async (...args) => { if (fail && args[0] === 'POST' && args[1].endsWith('/pulls')) throw Object.assign(new Error('fixture failed before PR'), { code: 'GITHUB_REQUEST_FAILED' }); return request(...args); };
  await assert.rejects(submit(f, plan, api)); fail = false; api.calls = [];
  const repeat = await prepare(f, api);
  assert.equal(repeat.warnings[0].reason, 'CONTRIBUTION_PREVIOUS_ATTEMPT');
  await assert.rejects(submit(f, repeat, api), { code: 'CONTRIBUTION_PREVIOUS_ATTEMPT' });
  assert.equal(api.prCount, 0); assert.ok(api.calls.every(c => c.method === 'GET'));
  assert.equal((await submit(f, plan, api)).number, 17); assert.equal(api.prCount, 1);
});
