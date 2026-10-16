import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareContribution, readContribution, submitContribution } from '../src/distribution/contribute.js';
import { installedManifest, stableJSON, writeAtomic } from '../src/distribution/common.js';
import { GitHubAPI } from '../src/distribution/github.js';
import { distributionFixture, git } from './helpers/distribution-fixture.js';

class ForkAPI {
  constructor({ login = 'contributor', wrongFork = false, failAfterPR = false } = {}) {
    this.login = login; this.wrongFork = wrongFork; this.failAfterPR = failAfterPR;
    this.calls = []; this.fork = false; this.ref = null; this.pr = null; this.prCount = 0;
    this.commit = { sha: 'c'.repeat(40), tree: { sha: 'b'.repeat(40) }, parents: [] };
  }
  async request(method, path, body) {
    this.calls.push({ method, path, body });
    if (path === '/user') return { login: this.login };
    if (method === 'GET' && path === '/repos/contributor/ksf-core') return this.fork ? { parent: { full_name: this.wrongFork ? 'wrong/core' : 'yinbaiyuan/ksf-core' } } : null;
    if (method === 'POST' && path.endsWith('/forks')) { this.fork = true; return {}; }
    if (method === 'GET' && path.includes('/git/commits/')) return path.endsWith('/' + this.commit.sha) ? this.commit : { sha: path.split('/').at(-1), tree: { sha: 'a'.repeat(40) } };
    if (method === 'POST' && path.endsWith('/git/trees')) return { sha: 'b'.repeat(40) };
    if (method === 'GET' && path.includes('/git/ref/heads/')) return this.ref;
    if (method === 'POST' && path.endsWith('/git/commits')) { this.commit.parents = body.parents.map(sha => ({ sha })); return this.commit; }
    if (method === 'POST' && path.endsWith('/git/refs')) return this.ref = { object: { sha: body.sha } };
    if (method === 'GET' && path.includes('/pulls?')) return this.pr ? [this.pr] : [];
    if (method === 'POST' && path.endsWith('/pulls')) {
      this.prCount++;
      this.pr = { number: 17, html_url: 'https://github.com/yinbaiyuan/ksf-core/pull/17', draft: true,
        head: { ref: body.head.split(':')[1] }, base: { ref: body.base } };
      if (this.failAfterPR) { this.failAfterPR = false; throw Object.assign(new Error('unknown response'), { code: 'GITHUB_REQUEST_FAILED' }); }
      return this.pr;
    }
    throw new Error(`Unexpected fixture API call: ${method} ${path}`);
  }
}
function edit(f) { writeAtomic(join(f.workspace, '.agents/core/example.txt'), 'a useful fictional Core fix\n'); }
test('no-Git contribution preview exports only selected Core changes and a reviewable diff', async t => {
  const f = await distributionFixture(t); edit(f);
  writeAtomic(join(f.workspace, '知识/private.md'), 'FICTIONAL_PRIVATE_FILE');
  const plan = prepareContribution({ root: f.workspace, paths: ['.agents/core/example.txt'], title: 'Fix fictional behavior' });
  assert.equal(existsSync(join(f.workspace, '.git')), false);
  assert.equal(plan.changes.length, 1); assert.match(plan.changes[0].diff, /a useful fictional Core fix/);
  assert.ok(!JSON.stringify(plan).includes('FICTIONAL_PRIVATE_FILE'));
  assert.equal(readContribution({ root: f.workspace, id: plan.id }).digest, plan.digest);
  assert.ok(existsSync(join(f.workspace, plan.reviewPath)));
});
for (const path of ['知识/private.md', '.git/config', '../outside', '.agents/core/release.json', '.agents/core/manifest.yaml']) {
  test(`contribution rejects non-source target ${path}`, async t => {
    const f = await distributionFixture(t);
    assert.throws(() => prepareContribution({ root: f.workspace, paths: [path] }), { code: 'CONTRIBUTION_PATH_INVALID' });
  });
}
test('preview handles new and deleted files and dry-run does not save a plan', async t => {
  const f = await distributionFixture(t);
  writeAtomic(join(f.workspace, '.agents/core/new-feature.js'), 'export const fictional = true;\n');
  const plan = prepareContribution({ root: f.workspace, paths: ['.agents/core/new-feature.js'], dryRun: true });
  assert.equal(plan.changes[0].operation, 'add');
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/contributions')), false);
});
test('tampered, unreviewed and stale plans are rejected before any remote request', async t => {
  const f = await distributionFixture(t); edit(f);
  const plan = prepareContribution({ root: f.workspace, all: true }), api = new ForkAPI();
  await assert.rejects(submitContribution({ root: f.workspace, id: plan.id, reviewed: '0'.repeat(64), api }), { code: 'CONTRIBUTION_REVIEW_REQUIRED' });
  writeAtomic(join(f.workspace, '.agents/core/example.txt'), 'edited after review\n');
  await assert.rejects(submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api }), { code: 'CONTRIBUTION_STALE' });
  const path = join(f.workspace, '.agents/runtime-data/contributions', plan.id, 'plan.json'), data = JSON.parse(readFileSync(path));
  data.title = 'changed after review'; writeFileSync(path, stableJSON(data));
  assert.throws(() => readContribution({ root: f.workspace, id: plan.id }), { code: 'CONTRIBUTION_TAMPERED' });
  assert.equal(api.calls.length, 0);
});
test('public submission creates a clean Core commit and draft PR without personal files, ancestry or messages', async t => {
  const f = await distributionFixture(t); edit(f);
  writeAtomic(join(f.workspace, '知识/private.md'), 'FICTIONAL_PRIVATE_FILE');
  git(f.workspace, ['init', '--template=', '--initial-branch=main']);
  git(f.workspace, ['config', 'user.name', 'KSF Fixture']); git(f.workspace, ['config', 'user.email', 'fixture@example.invalid']);
  git(f.workspace, ['config', 'commit.gpgsign', 'false']);
  git(f.workspace, ['add', '知识/private.md', '.agents/core/example.txt']);
  git(f.workspace, ['commit', '-m', 'FICTIONAL_PRIVATE_COMMIT_MESSAGE']);
  const privateRevision = git(f.workspace, ['rev-parse', 'HEAD']);
  const plan = prepareContribution({ root: f.workspace, paths: ['.agents/core/example.txt'], title: 'Fix public behavior', body: 'A fictional reproducible Core fix.' });
  const api = new ForkAPI(), response = await submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api });
  assert.equal(response.number, 17); assert.equal(response.draft, true);
  const serialized = JSON.stringify(api.calls);
  assert.ok(!serialized.includes('FICTIONAL_PRIVATE_FILE'));
  assert.ok(!serialized.includes('FICTIONAL_PRIVATE_COMMIT_MESSAGE'));
  assert.ok(!serialized.includes(privateRevision));
  const commit = api.calls.find(c => c.method === 'POST' && c.path.endsWith('/git/commits')).body;
  assert.deepEqual(commit.parents, [installedManifest(f.workspace).core.revision]);
  const tree = api.calls.find(c => c.path.endsWith('/git/trees')).body;
  assert.deepEqual(tree.tree.map(file => file.path), ['.agents/core/example.txt']);
  assert.equal(api.calls.find(c => c.method === 'POST' && c.path.endsWith('/pulls')).body.base, 'main');
  const again = await submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api });
  assert.equal(again.reused, true); assert.equal(api.prCount, 1);
});
test('an unknown PR creation response recovers the existing PR without duplicating it', async t => {
  const f = await distributionFixture(t); edit(f);
  const plan = prepareContribution({ root: f.workspace, all: true }), api = new ForkAPI({ failAfterPR: true });
  await assert.rejects(submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api }), { code: 'GITHUB_REQUEST_FAILED' });
  const response = await submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api });
  assert.equal(response.number, 17); assert.equal(api.prCount, 1);
});
test('a mismatched saved contribution branch is refused before any remote request', async t => {
  const f = await distributionFixture(t); edit(f);
  const plan = prepareContribution({ root: f.workspace, all: true }), api = new ForkAPI();
  writeAtomic(join(f.workspace, `.agents/runtime-data/contributions/${plan.id}/submitted.json`), stableJSON({ digest: plan.digest, branch: `unrelated-${plan.id}` }));
  await assert.rejects(submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api }), { code: 'CONTRIBUTION_TAMPERED' });
  assert.equal(api.calls.length, 0);
});
test('a same-named repository from another fork network cannot receive contribution data', async t => {
  const f = await distributionFixture(t); edit(f);
  const plan = prepareContribution({ root: f.workspace, all: true }), api = new ForkAPI({ wrongFork: true });
  await assert.rejects(submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api }), { code: 'FORK_INVALID' });
  assert.equal(api.calls.some(c => c.path.endsWith('/git/trees')), false);
});
test('the Core owner contributes directly on a contrib branch and dry-run does not authenticate', async t => {
  const f = await distributionFixture(t); edit(f);
  const plan = prepareContribution({ root: f.workspace, all: true }), api = new ForkAPI({ login: 'yinbaiyuan' });
  const preview = await submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, dryRun: true, api });
  assert.equal(preview.wouldPublish, true); assert.equal(api.calls.length, 0);
  const result = await submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api });
  assert.equal(result.repository, 'yinbaiyuan/ksf-core'); assert.match(result.branch, /^contrib-/);
  assert.equal(api.calls.some(c => c.path.endsWith('/forks')), false);
});
test('GitHub errors never echo authorization or server body contents', async () => {
  const api = new GitHubAPI({ token: 'FICTIONAL_TOKEN', fetcher: async () => new Response('FICTIONAL_SERVER_SECRET', { status: 403 }) });
  await assert.rejects(api.request('POST', '/repos/example/core/git/trees', {}), error => {
    assert.equal(error.code, 'GITHUB_PERMISSION_DENIED'); assert.ok(!error.message.includes('FICTIONAL_')); return true;
  });
});
test('the installed fixed launcher maps back to its single Core source with the source permission', async t => {
  const f = await distributionFixture(t), path = join(f.workspace, '.agents/bin/ksf');
  writeAtomic(path, readFileSync(path, 'utf8') + '\n# Fictional launcher improvement\n', 0o755);
  const plan = prepareContribution({ root: f.workspace, paths: ['.agents/bin/ksf'] });
  assert.equal(plan.changes[0].source_path, '.agents/bin/ksf');
  assert.equal(plan.changes[0].workspace_mode, 0o755);
  assert.equal(plan.changes[0].mode, installedManifest(f.workspace).files['.agents/bin/ksf'].mode);
  assert.equal((await submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, dryRun: true })).wouldPublish, true);
});
