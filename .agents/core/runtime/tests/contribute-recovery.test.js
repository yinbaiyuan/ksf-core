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

test('legacy existing PRs are checked with reads only, including old states without a saved tree', async t => {
  const s = await submitted(t), old = makeLegacy(s.f, s.plan), path = join(s.f.workspace, `.agents/runtime-data/contributions/${s.plan.id}/submitted.json`);
  s.api.login = 'a-different-read-only-account';
  const state = JSON.parse(readFileSync(path)); state.digest = old.digest; delete state.tree; writeAtomic(path, stableJSON(state));
  const before = readFileSync(path), result = await publish(s.f, old, s.api);
  assert.equal(result.legacy, true); assert.equal(result.reconcileOnly, true); assert.equal(result.reused, true);
  assert.ok(s.api.calls.every(c => c.method === 'GET')); assert.ok(readFileSync(path).equals(before));
  assert.ok(!s.api.calls.some(c => c.path === '/user'));
});

test('invalid public messages fail before Git, networking or contribution directory creation', async t => {
  const f = await distributionFixture(t), api = apiFor(f);
  await assert.rejects(prepare(f, { title: 'fix(core): 更新代码', api }), { code: 'COMMIT_MESSAGE_INVALID' });
  await assert.rejects(prepare(f, { body: 'An unstructured description', api }), { code: 'COMMIT_MESSAGE_INVALID' });
  assert.equal(api.calls.length, 0);
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/contributions')), false);
});

test('the complete message is frozen in the preview and digest, not reconstructed at publication', async t => {
  const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f);
  const preview = await publish(f, plan, api, { dryRun: true });
  assert.equal(preview.commitMessage, plan.commitMessage);
  const path = join(f.workspace, `.agents/runtime-data/contributions/${plan.id}/plan.json`), changed = JSON.parse(readFileSync(path));
  changed.commitMessage = changed.commitMessage.replace('示例行为', '另一种行为');
  writeAtomic(path, stableJSON(changed));
  assert.throws(() => readContribution({ root: f.workspace, id: plan.id }), { code: 'CONTRIBUTION_TAMPERED' });
  assert.equal(api.calls.length, 0);
});

test('a message inconsistent with title and body is rejected even with a recomputed digest', async t => {
  const f = await fixture(t); edit(f); const plan = await prepare(f);
  const { digest, ...changed } = plan; delete changed.dryRun; delete changed.warnings; delete changed.reviewPath;
  changed.commitMessage = changed.commitMessage.replace('示例行为', '另一种行为');
  writeAtomic(join(f.workspace, `.agents/runtime-data/contributions/${plan.id}/plan.json`), stableJSON({ ...changed, digest: digestObject(changed) }));
  assert.throws(() => readContribution({ root: f.workspace, id: plan.id }), { code: 'CONTRIBUTION_INVALID' });
});

test('retry refuses a remotely changed message without writing another commit or PR', async t => {
  const s = await submitted(t); s.api.commit.message = 'a different remote message';
  await assert.rejects(s.retry(), { code: 'CONTRIBUTION_BRANCH_CHANGED' });
  assert.ok(s.api.calls.every(c => c.method === 'GET')); assert.equal(s.api.prCount, 1);
});

test('schema 2 previews remain readable and unpublished ones require preparation under the message rules', async t => {
  const f = await fixture(t); edit(f); const old = makeLegacy(f, await prepare(f), 2), api = apiFor(f);
  assert.equal(readContribution({ root: f.workspace, id: old.id }).schema_version, 2);
  await assert.rejects(publish(f, old, api), { code: 'CONTRIBUTION_LEGACY_PLAN' });
  assert.equal(api.calls.length, 0);
});

test('schema 2 existing PRs retain their old message and reconcile with reads only', async t => {
  const s = await submitted(t), old = makeLegacy(s.f, s.plan, 2);
  const path = join(s.f.workspace, `.agents/runtime-data/contributions/${s.plan.id}/submitted.json`), state = JSON.parse(readFileSync(path));
  state.digest = old.digest; writeAtomic(path, stableJSON(state));
  s.api.commit.message = 'Original title-only public message';
  const before = readFileSync(path), result = await publish(s.f, old, s.api);
  assert.equal(result.reconcileOnly, true); assert.ok(s.api.calls.every(c => c.method === 'GET'));
  assert.ok(readFileSync(path).equals(before));
});

test('the real launcher accepts a UTF-8 body file and publishes exactly the reviewed full message', async t => {
  const f = await fixture(t); edit(f);
  const path = join(f.directory, '公开正文.txt'); writeFileSync(path, contributionDescription.body);
  const prPath = join(f.directory, 'PR说明.md'); writeFileSync(prPath, contributionDescription.prBody);
  const prepared = f.launch(['contribute', 'prepare', '--paths', example, '--title', contributionDescription.title, '--body-file', path, '--pr-body-file', prPath, '--json']);
  assert.equal(prepared.status, 0, prepared.stderr + prepared.stdout);
  const plan = JSON.parse(prepared.stdout).data, api = apiFor(f);
  assert.equal(plan.commitMessage, `${plan.title}\n\n${contributionDescription.body.trimEnd()}\n`);
  assert.equal(readContribution({ root: f.workspace, id: plan.id }).commitMessage, plan.commitMessage);
  await publish(f, plan, api);
  assert.equal(api.calls.find(call => call.method === 'POST' && call.path.endsWith('/git/commits')).body.message, plan.commitMessage);
  assert.equal(api.calls.find(call => call.method === 'POST' && call.path.endsWith('/pulls')).body.body, plan.prBody);
});
