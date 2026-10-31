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

test('committed symlinks are rejected while a working symlink cannot replace the committed blob', async t => {
  const f = await fixture(t); edit(f);
  rmSync(join(f.workspace, example)); symlinkSync('/fictional/private/location', join(f.workspace, example));
  assert.equal((await prepare(f)).changes[0].operation, 'update');
  commitWorkspace(f, { paths: [example] });
  await assert.rejects(() => prepare(f), { code: 'CONTRIBUTION_FILE_TYPE' });
});

test('unreviewed and tampered plans and a newly advanced HEAD are refused before remote requests', async t => {
  const f = await fixture(t); edit(f);
  const plan = await prepare(f), api = apiFor(f);
  await assert.rejects(publish(f, plan, api, { reviewed: '0'.repeat(64) }), { code: 'CONTRIBUTION_REVIEW_REQUIRED' });
  writeAtomic(join(f.workspace, '知识/private.md'), 'a later private checkpoint');
  commitWorkspace(f, { paths: ['知识/private.md'] });
  await assert.rejects(publish(f, plan, api), { code: 'CONTRIBUTION_STALE' });
  const path = join(f.workspace, `.agents/runtime-data/contributions/${plan.id}/plan.json`), data = JSON.parse(readFileSync(path));
  data.title = 'changed after review'; writeFileSync(path, stableJSON(data));
  assert.throws(() => readContribution({ root: f.workspace, id: plan.id }), { code: 'CONTRIBUTION_TAMPERED' });
  assert.equal(api.calls.length, 0);
});

test('public submission exports only committed system content, never private history, author or local source ID', async t => {
  const f = await fixture(t); edit(f);
  writeAtomic(join(f.workspace, '知识/private.md'), 'FICTIONAL_PRIVATE_FILE');
  git(f.workspace, ['config', 'user.name', 'FICTIONAL_PRIVATE_AUTHOR']);
  const privateRevision = commitWorkspace(f, { paths: ['知识/private.md'], message: 'FICTIONAL_PRIVATE_MESSAGE' });
  const plan = await prepare(f), api = apiFor(f);
  const response = await publish(f, plan, api);
  assert.equal(response.number, 17); assert.equal(response.draft, true);
  const serialized = JSON.stringify(api.calls);
  assert.ok(!serialized.includes('FICTIONAL_PRIVATE_')); assert.ok(!serialized.includes(privateRevision));
  const commit = api.calls.find(c => c.method === 'POST' && c.path.endsWith('/git/commits')).body;
  assert.deepEqual(commit.parents, [plan.core.revision]);
  assert.equal(commit.message, plan.commitMessage);
  assert.equal(commit.message, `${plan.title}\n\n${plan.body.trimEnd()}\n`);
  assert.deepEqual(api.calls.find(c => c.method === 'POST' && c.path.endsWith('/git/trees')).body.tree.map(c => c.path), [example]);
});

for (const failure of ['truncated', 'blob', 'mode', 'missing', 'commit']) {
  test(`the actual original Core baseline is verified before any remote write: ${failure}`, async t => {
    const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f), request = api.request.bind(api);
    api.request = async (...args) => {
      const result = await request(...args), path = args[1];
      if (path.includes('/git/trees/')) {
        if (failure === 'truncated') result.truncated = true;
        if (failure === 'mode') result.tree.find(e => e.path === example).mode = '100755';
        if (failure === 'missing') result.tree = result.tree.filter(e => e.path !== example);
      }
      if (failure === 'blob' && path.includes('/git/blobs/')) result.content = Buffer.from('a different original').toString('base64');
      if (failure === 'commit' && path.includes('/git/commits/')) result.sha = 'f'.repeat(40);
      return result;
    };
    await assert.rejects(publish(f, plan, api), { code: ['truncated', 'commit'].includes(failure) ? 'CONTRIBUTION_BASELINE_UNVERIFIED' : 'CONTRIBUTION_BASELINE_MISMATCH' });
    assert.ok(api.calls.every(c => c.method === 'GET'));
    assert.ok(existsSync(join(f.workspace, plan.reviewPath)));
    assert.equal(existsSync(join(f.workspace, `.agents/runtime-data/contributions/${plan.id}/submitted.json`)), false);
  });
}

test('a supposed addition is rejected when that source path already exists in original Core', async t => {
  const f = await fixture(t), path = join(f.workspace, '.agents/core/release.json'), m = installedManifest(f.workspace);
  delete m.files[example]; writeAtomic(path, stableJSON(m)); commitWorkspace(f, { paths: ['.agents/core/release.json'] });
  const plan = await prepare(f), api = apiFor(f); assert.equal(plan.changes[0].operation, 'add');
  await assert.rejects(publish(f, plan, api), { code: 'CONTRIBUTION_BASELINE_MISMATCH' });
  assert.ok(api.calls.every(c => c.method === 'GET'));
});

for (const step of ['PR', 'ref']) test(`an unknown ${step} creation response recovers without duplicating the PR`, async t => {
  const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f, step === 'PR' ? { failAfterPR: true } : { failAfterRef: true });
  await assert.rejects(publish(f, plan, api), { code: 'GITHUB_REQUEST_FAILED' });
  assert.equal((await publish(f, plan, api)).number, 17); assert.equal(api.prCount, 1);
});

test('a mismatched saved contribution branch is refused before any remote request', async t => {
  const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f);
  writeAtomic(join(f.workspace, `.agents/runtime-data/contributions/${plan.id}/submitted.json`), stableJSON({ digest: plan.digest, branch: `unrelated-${plan.id}` }));
  await assert.rejects(publish(f, plan, api), { code: 'CONTRIBUTION_TAMPERED' }); assert.equal(api.calls.length, 0);
});

test('a same-named repository from another fork network cannot receive contribution data', async t => {
  const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f, { wrongFork: true });
  await assert.rejects(publish(f, plan, api), { code: 'FORK_INVALID' });
  assert.equal(api.calls.some(c => c.path.endsWith('/git/trees') && c.method === 'POST'), false);
});
