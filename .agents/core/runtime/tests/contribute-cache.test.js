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

test('commit and PR text are frozen separately, including generated provenance', async t => {
  const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f);
  assert.notEqual(plan.prDescription, plan.body);
  assert.equal(plan.prDescription, contributionDescription.prBody);
  assert.ok(plan.prBody.endsWith(`贡献来源：ksf-core ${plan.version}（${plan.core.revision}）。\n仅包含已审阅的系统文件差异。\n`));
  const preview = await publish(f, plan, api, { dryRun: true });
  assert.equal(preview.prBody, plan.prBody); assert.equal(preview.title, plan.title); assert.equal(api.calls.length, 0);
  await publish(f, plan, api);
  assert.equal(api.calls.find(c => c.method === 'POST' && c.path.endsWith('/git/commits')).body.message, plan.commitMessage);
  const posted = api.calls.find(c => c.method === 'POST' && c.path.endsWith('/pulls')).body;
  assert.equal(posted.body, plan.prBody); assert.equal(posted.title, plan.title); assert.equal(posted.draft, true);
});

test('PR tampering and inconsistent provenance fail before any publication', async t => {
  const f = await fixture(t); edit(f); const plan = await prepare(f), path = join(f.workspace, `.agents/runtime-data/contributions/${plan.id}/plan.json`);
  const stored = JSON.parse(readFileSync(path));
  stored.prBody += '未审阅内容\n'; writeAtomic(path, stableJSON(stored));
  assert.throws(() => readContribution({ root: f.workspace, id: plan.id }), { code: 'CONTRIBUTION_TAMPERED' });
  const { digest, ...changed } = stored;
  writeAtomic(path, stableJSON({ ...changed, digest: digestObject(changed) }));
  assert.throws(() => readContribution({ root: f.workspace, id: plan.id }), { code: 'CONTRIBUTION_INVALID' });
});

test('PR edits during review survive ordinary retries without remote writes', async t => {
  const s = await submitted(t); s.api.pr.body = 'Reviewed PR text with newly recorded evidence.'; s.api.pr.title = 'Edited review title';
  const result = await s.retry();
  assert.equal(result.reused, true); assert.equal(s.api.pr.body, 'Reviewed PR text with newly recorded evidence.');
  assert.equal(s.api.pr.title, 'Edited review title');
  assert.ok(s.api.calls.every(c => c.method === 'GET')); assert.equal(s.api.prCount, 1);
});

test('schema 3 remains readable but cannot initiate publication without the independent PR description', async t => {
  const f = await fixture(t); edit(f); const old = makeLegacy(f, await prepare(f), 3), api = apiFor(f);
  assert.equal(readContribution({ root: f.workspace, id: old.id }).commitMessage, old.commitMessage);
  await assert.rejects(publish(f, old, api), { code: 'CONTRIBUTION_LEGACY_PLAN' }); assert.equal(api.calls.length, 0);
});

test('schema 3 published records reconcile read-only and still verify the frozen commit message', async t => {
  const s = await submitted(t), old = makeLegacy(s.f, s.plan, 3);
  const path = join(s.f.workspace, `.agents/runtime-data/contributions/${old.id}/submitted.json`), state = JSON.parse(readFileSync(path));
  state.digest = old.digest; writeAtomic(path, stableJSON(state));
  const before = readFileSync(path), preview = await publish(s.f, old, s.api, { dryRun: true });
  assert.equal(preview.reconcileOnly, true); assert.equal(preview.wouldPublish, false); assert.equal(preview.prBody, null);
  const result = await publish(s.f, old, s.api); assert.equal(result.reconcileOnly, true);
  assert.ok(s.api.calls.every(c => c.method === 'GET')); assert.ok(readFileSync(path).equals(before));
  s.api.commit.message = 'Changed schema-3 message';
  await assert.rejects(publish(s.f, old, s.api), { code: 'CONTRIBUTION_BRANCH_CHANGED' });
});
