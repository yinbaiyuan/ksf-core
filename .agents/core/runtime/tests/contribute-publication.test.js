import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareContribution, readContribution, submitContribution } from '../src/distribution/contribute.js';
import { committedSource } from '../src/distribution/committed-source.js';
import { digestObject, installedManifest, sha256, stableJSON, validateManifest, writeAtomic } from '../src/distribution/common.js';
import { GitHubAPI } from '../src/distribution/github.js';
import { commitWorkspace, distributionFixture, git, contributionDescription } from './helpers/distribution-fixture.js';
import { ForkAPI } from './helpers/contribution-api.js';
const example = '.agents/core/example.txt';
async function fixture(t) {
  const f = await distributionFixture(t); commitWorkspace(f); return f;
}
function edit(f) {
  writeAtomic(join(f.workspace, example), 'a useful fictional Core fix\n');
  return commitWorkspace(f, { paths: [example] });
}
const apiFor = (f, options = {}) => new ForkAPI({ coreRoot: f.root, ...options });
const publish = (f, plan, api, options = {}) => submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api, ...options });
const prepare = (f, options = {}) => prepareContribution({ ...contributionDescription, root: f.workspace, paths: [example], ...options });
async function submitted(t) {
  const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f), result = await publish(f, plan, api);
  api.calls = []; return { f, plan, api, result, retry: () => publish(f, plan, api) };
}
function makeLegacy(f, plan, schema = 1) {
  const { digest, prDescription, prBody, ...old } = readContribution({ root: f.workspace, id: plan.id });
  old.schema_version = schema;
  if (schema < 3) delete old.commitMessage;
  if (schema === 1) {
    delete old.sourceCommit; delete old.baseline;
    old.changes = old.changes.map(({ before_mode, ...change }) => change);
  }
  const legacy = { ...old, digest: digestObject(old) };
  writeAtomic(join(f.workspace, `.agents/runtime-data/contributions/${plan.id}/plan.json`), stableJSON(legacy));
  return legacy;
}

test('the Core owner uses a contrib branch; dry-run authenticates or verifies no remote state', async t => {
  const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f, { login: 'yinbaiyuan' });
  const preview = await publish(f, plan, api, { dryRun: true });
  assert.equal(preview.wouldPublish, true); assert.equal(preview.remoteVerified, false); assert.equal(api.calls.length, 0);
  const result = await publish(f, plan, api);
  assert.equal(result.repository, 'yinbaiyuan/ksf-core'); assert.match(result.branch, /^contrib-/);
  assert.equal(api.calls.some(c => c.path.endsWith('/forks')), false);
});

test('GitHub errors never echo authorization or server body contents', async () => {
  const api = new GitHubAPI({ token: 'FICTIONAL_TOKEN', fetcher: async () => new Response('FICTIONAL_SERVER_SECRET', { status: 403 }) });
  await assert.rejects(api.request('POST', '/repos/example/core/git/trees', {}), error => {
    assert.equal(error.code, 'GITHUB_PERMISSION_DENIED'); assert.ok(!error.message.includes('FICTIONAL_')); return true;
  });
});

test('cached success is reverified with reads only even after a later local commit (F03)', async t => {
  const s = await submitted(t);
  writeAtomic(join(s.f.workspace, example), 'a later committed improvement'); commitWorkspace(s.f, { paths: [example] });
  const result = await s.retry();
  assert.equal(result.reused, true); assert.equal(result.state, 'open'); assert.equal(result.merged, false);
  assert.ok(s.api.calls.some(c => c.path.endsWith('/pulls/17'))); assert.ok(s.api.calls.every(c => c.method === 'GET'));
});

test('cached success cannot conceal a remotely changed branch (F03)', async t => {
  const s = await submitted(t), path = join(s.f.workspace, `.agents/runtime-data/contributions/${s.plan.id}/submitted.json`), before = readFileSync(path);
  s.api.ref.object.sha = 'e'.repeat(40);
  await assert.rejects(s.retry(), { code: 'CONTRIBUTION_BRANCH_CHANGED' });
  assert.ok(s.api.calls.every(c => c.method === 'GET')); assert.ok(readFileSync(path).equals(before));
});

test('a merged PR with a deleted branch reports its live state without recreation', async t => {
  const s = await submitted(t); s.api.pr.state = 'closed'; s.api.pr.merged = true; s.api.pr.draft = false; s.api.ref = null;
  const result = await s.retry();
  assert.equal(result.merged, true); assert.equal(result.state, 'closed'); assert.equal(result.draft, false);
  assert.ok(s.api.calls.every(c => c.method === 'GET')); assert.equal(s.api.prCount, 1);
});

test('a closed unmerged PR is reported without creating another PR', async t => {
  const s = await submitted(t); s.api.pr.state = 'closed'; s.api.pr.draft = false;
  const result = await s.retry(); assert.equal(result.state, 'closed'); assert.equal(result.merged, false); assert.equal(s.api.prCount, 1);
});

for (const failure of ['missing-branch', 'missing-pr', 'changed-pr', 'offline']) test(`cached contribution preserves state on ${failure}`, async t => {
  const s = await submitted(t), path = join(s.f.workspace, `.agents/runtime-data/contributions/${s.plan.id}/submitted.json`), before = readFileSync(path);
  if (failure === 'missing-branch') s.api.ref = null;
  if (failure === 'missing-pr') s.api.pr = null;
  if (failure === 'changed-pr') s.api.pr.base.ref = 'another-branch';
  if (failure === 'offline') s.api.request = async () => { throw Object.assign(new Error('fixture offline'), { code: 'GITHUB_REQUEST_FAILED' }); };
  const code = { 'missing-branch': 'CONTRIBUTION_BRANCH_MISSING', 'missing-pr': 'CONTRIBUTION_PR_MISSING', 'changed-pr': 'CONTRIBUTION_PR_CHANGED', offline: 'GITHUB_REQUEST_FAILED' }[failure];
  await assert.rejects(s.retry(), { code }); assert.ok(readFileSync(path).equals(before)); assert.ok(s.api.calls.every(c => c.method === 'GET'));
});

test('legacy plans remain readable but cannot initiate remote publication', async t => {
  const f = await fixture(t); edit(f); const old = makeLegacy(f, await prepare(f)), api = apiFor(f);
  assert.equal(readContribution({ root: f.workspace, id: old.id }).schema_version, 1);
  await assert.rejects(publish(f, old, api), { code: 'CONTRIBUTION_LEGACY_PLAN' }); assert.equal(api.calls.length, 0);
});
