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

test('HEAD includes cumulative committed fixes even when the latest commit contains only private material', async t => {
  const f = await fixture(t); edit(f);
  const path = '.agents/core/中文 文件.txt';
  writeAtomic(join(f.workspace, path), 'another committed system fix\n'); commitWorkspace(f, { paths: [path] });
  writeAtomic(join(f.workspace, '知识/private.md'), 'FICTIONAL_PRIVATE_FILE');
  const head = commitWorkspace(f, { paths: ['知识/private.md'], message: 'FICTIONAL_PRIVATE_MESSAGE' });
  const plan = await prepareContribution({ ...contributionDescription, root: f.workspace, all: true });
  assert.equal(plan.schema_version, 4); assert.equal(plan.sourceCommit, head);
  assert.deepEqual(plan.changes.map(c => c.workspace_path), [example, path].sort());
  assert.ok(!JSON.stringify(plan).includes('FICTIONAL_PRIVATE_'));
  assert.equal(readContribution({ root: f.workspace, id: plan.id }).digest, plan.digest);
  assert.ok(existsSync(join(f.workspace, plan.reviewPath)));
});

test('index, working edits, untracked files and an uncommitted manifest do not enter or block a contribution', async t => {
  const f = await fixture(t), head = edit(f), api = apiFor(f);
  writeAtomic(join(f.workspace, example), 'FICTIONAL_INDEX_CONTENT\n'); git(f.workspace, ['add', '--', example]);
  writeAtomic(join(f.workspace, example), 'FICTIONAL_WORKING_CONTENT\n');
  writeAtomic(join(f.workspace, '.agents/core/untracked.txt'), 'FICTIONAL_UNTRACKED_CONTENT');
  writeAtomic(join(f.workspace, '.agents/core/release.json'), 'uncommitted broken development metadata');
  const beforeIndex = readFileSync(join(f.workspace, '.git/index'));
  const plan = await prepareContribution({ ...contributionDescription, root: f.workspace, all: true });
  assert.equal(plan.sourceCommit, head); assert.equal(plan.changes.length, 1);
  assert.equal(Buffer.from(plan.changes[0].content, 'base64').toString(), 'a useful fictional Core fix\n');
  const result = await publish(f, plan, api);
  assert.equal(result.draft, true); assert.ok(readFileSync(join(f.workspace, '.git/index')).equals(beforeIndex));
  assert.equal(git(f.workspace, ['rev-parse', 'HEAD']), head);
  assert.ok(!JSON.stringify(api.calls).includes('FICTIONAL_'));
});

test('working-tree-only changes produce an empty committed contribution and no plan', async t => {
  const f = await fixture(t);
  writeAtomic(join(f.workspace, example), 'only uncommitted content');
  writeAtomic(join(f.workspace, '.agents/core/new.txt'), 'only untracked content');
  await assert.rejects(() => prepareContribution({ ...contributionDescription, root: f.workspace, all: true }), error => {
    assert.equal(error.code, 'CONTRIBUTION_EMPTY'); assert.equal(error.data.changes.length, 0);
    assert.equal(error.data.sourceCommit, git(f.workspace, ['rev-parse', 'HEAD'])); return true;
  });
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/contributions')), false);
});

for (const path of ['知识/private.md', '.git/config', '../outside', '.agents/core/release.json', '.agents/core/manifest.yaml']) {
  test(`contribution rejects non-source target ${path}`, async t => {
    const f = await fixture(t);
    const selected = path === '知识/private.md' ? [path, 'USER.md', 'BOT.md', 'MEMORY.md'] : [path];
    for (const userPath of selected) await assert.rejects(() => prepare(f, { paths: [userPath] }), { code: 'CONTRIBUTION_PATH_INVALID' });
  });
}

test('committed additions, deletion, permissions, binary data and Chinese paths are exported from Git', async t => {
  const f = await fixture(t);
  const binary = '.agents/core/binary.bin', added = '.agents/core/新增 文件.txt';
  rmSync(join(f.workspace, example)); chmodSync(join(f.workspace, 'AGENTS.md'), 0o755);
  writeAtomic(join(f.workspace, binary), Buffer.from([0, 255, 10])); writeAtomic(join(f.workspace, added), 'committed new text\n');
  commitWorkspace(f, { paths: [example, 'AGENTS.md', binary, added], modes:{'AGENTS.md':0o755} });
  const plan = await prepareContribution({ ...contributionDescription, root: f.workspace, all: true, dryRun: true });
  assert.equal(plan.changes.find(c => c.workspace_path === example).operation, 'delete');
  assert.equal(plan.changes.find(c => c.workspace_path === 'AGENTS.md').mode, 0o755);
  assert.equal(plan.changes.find(c => c.workspace_path === binary).diff, `Binary change: ${binary}\n`);
  assert.equal(plan.changes.find(c => c.workspace_path === added).operation, 'add');
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/contributions')), false);
  const saved = await prepareContribution({ ...contributionDescription, root: f.workspace, all: true }), api = apiFor(f);
  assert.equal((await publish(f, saved, api)).draft, true);
  assert.ok(api.calls.some(c => c.method === 'POST' && c.path.endsWith('/git/blobs')));
});

test('Git and an existing HEAD are required; a parent repository cannot silently supply the source', async t => {
  const f = await distributionFixture(t);
  await assert.rejects(() => prepare(f), { code: 'CONTRIBUTION_GIT_REQUIRED' });
  assert.throws(() => committedSource(f.workspace, { binary: join(f.directory, 'missing-git') }), { code: 'CONTRIBUTION_GIT_REQUIRED' });
  git(f.workspace, ['init', '--template=', '--initial-branch=main']);
  await assert.rejects(() => prepare(f), { code: 'CONTRIBUTION_HEAD_REQUIRED' });
  commitWorkspace(f);
  const nested = join(f.workspace, 'nested-ksf'); mkdirSync(nested);
  await assert.rejects(() => prepareContribution({ ...contributionDescription, root: nested, all: true }), { code: 'CONTRIBUTION_GIT_ROOT_MISMATCH' });
});

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

async function submitted(t) {
  const f = await fixture(t); edit(f); const plan = await prepare(f), api = apiFor(f), result = await publish(f, plan, api);
  api.calls = []; return { f, plan, api, result, retry: () => publish(f, plan, api) };
}
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
test('legacy plans remain readable but cannot initiate remote publication', async t => {
  const f = await fixture(t); edit(f); const old = makeLegacy(f, await prepare(f)), api = apiFor(f);
  assert.equal(readContribution({ root: f.workspace, id: old.id }).schema_version, 1);
  await assert.rejects(publish(f, old, api), { code: 'CONTRIBUTION_LEGACY_PLAN' }); assert.equal(api.calls.length, 0);
});
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
