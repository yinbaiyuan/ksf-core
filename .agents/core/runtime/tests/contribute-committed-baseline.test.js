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

for (const kind of ['missing', 'json', 'checksum', 'repository', 'revision', 'development']) {
  test(`only a valid formal baseline in HEAD is accepted: ${kind}`, async t => {
    const f = await fixture(t), path = join(f.workspace, '.agents/core/release.json'), original = readFileSync(path);
    const m = JSON.parse(original);
    if (kind === 'missing') rmSync(path);
    else if (kind === 'json') writeAtomic(path, '{broken');
    else {
      if (kind === 'checksum') m.files[example].sha256 = '0'.repeat(64);
      if (kind === 'repository') m.core.repository = '../wrong';
      if (kind === 'revision') m.core.revision = 'main';
      if (kind === 'development') m.development = true;
      writeAtomic(path, stableJSON(m));
    }
    commitWorkspace(f, { paths: ['.agents/core/release.json'] });
    writeAtomic(path, original); // A valid working manifest must not hide a bad committed baseline.
    await assert.rejects(() => prepare(f), { code: kind === 'missing' ? 'CONTRIBUTION_BASELINE_MISSING' : kind === 'development' ? 'DEVELOPMENT_PACKAGE' : 'CONTRIBUTION_BASELINE_INVALID' });
  });
}

test('schema 2 contribution baselines support removal of the old launcher without changing installation validation', async t => {
  const f = await distributionFixture(t), manifest = installedManifest(f.workspace);
  const launcher = readFileSync(join(f.root, '.agents/ksf'));
  writeAtomic(join(f.root, '.agents/bin/ksf'), launcher, 0o755);
  rmSync(join(f.root, '.agents/ksf')); rmSync(join(f.root, '.agents/ksf.ps1'));
  git(f.root, ['add', '--', '.agents']);git(f.root,['update-index','--chmod=+x','.agents/bin/ksf']);git(f.root, ['commit', '-m', 'Fictional old launcher source']);
  manifest.schema_version = 2; delete manifest.launcher_protocol;
  manifest.core.revision = git(f.root, ['rev-parse', 'HEAD']);
  manifest.files['.agents/bin/ksf'] = { ...manifest.files['.agents/ksf'], source_path: '.agents/bin/ksf' };
  delete manifest.files['.agents/ksf']; delete manifest.files['.agents/ksf.ps1'];
  writeAtomic(join(f.workspace, '.agents/core/release.json'), stableJSON(manifest));
  writeAtomic(join(f.workspace, '.agents/bin/ksf'), launcher, 0o755);
  rmSync(join(f.workspace, '.agents/ksf')); rmSync(join(f.workspace, '.agents/ksf.ps1'));
  commitWorkspace(f, { paths: ['.agents/core', 'AGENTS.md', '.agents/bin/ksf'],modes:{'.agents/bin/ksf':0o755} });
  await assert.rejects(() => prepareContribution({ ...contributionDescription, root: f.workspace, all: true }), { code: 'CONTRIBUTION_EMPTY' });
  assert.throws(() => validateManifest(manifest), { code: 'RELEASE_INVALID' });
  rmSync(join(f.workspace, '.agents/bin/ksf'));
  writeAtomic(join(f.workspace, '.agents/ksf'), launcher, 0o755);
  writeAtomic(join(f.workspace, '.agents/ksf.ps1'), '# fictional new Windows entry\n');
  commitWorkspace(f, { paths: ['.agents/bin/ksf', '.agents/ksf', '.agents/ksf.ps1'] });
  const plan = await prepareContribution({ ...contributionDescription, root: f.workspace, all: true });
  assert.equal(plan.baseline.schema_version, 2);
  assert.equal(plan.changes.find(c => c.workspace_path === '.agents/bin/ksf').operation, 'delete');
  assert.equal((await publish(f, plan, apiFor(f))).draft, true);
});
