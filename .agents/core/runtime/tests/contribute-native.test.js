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
