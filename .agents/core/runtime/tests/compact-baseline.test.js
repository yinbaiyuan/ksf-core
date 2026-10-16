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
import { distributionFixture, commitWorkspace, git } from './helpers/distribution-fixture.js';
import { ForkAPI } from './helpers/contribution-api.js';

const example = '.agents/core/example.txt';
const sample = 'first\none\ntwo\nthree\nfour\nfive\nlast\n';
const apiFor = f => new ForkAPI({ coreRoot: f.root });
const prepare = (f, api, options = {}) => prepareContribution({ root: f.workspace, paths: [example], api, ...options });
const submit = (f, plan, api, options = {}) => submitContribution({ root: f.workspace, id: plan.id, reviewed: plan.digest, api, ...options });

test('anonymous original reads use pinned raw content and verify blobs without one REST request per file', async () => {
  const commit = 'a'.repeat(40), treeSHA = 'b'.repeat(40), path = '.agents/core/中文 文件.txt', bytes = Buffer.from('original text\n'), calls = [];
  let tamper = false;
  const api = new GitHubAPI({ readOnly: true, token: '', fetcher: async (url, options) => {
    calls.push(String(url)); assert.equal(options.headers.Authorization, undefined);
    if (String(url).includes('/git/commits/')) return Response.json({ sha: commit, tree: { sha: treeSHA } });
    if (String(url).includes('/git/trees/')) return Response.json({ sha: treeSHA, truncated: false,
      tree: ['AGENTS.md', '.agents/core/build.json', '.agents/core/distribution.json', '.agents/ksf', path].map(path => ({ path,
        sha: gitBlobID(bytes), type: 'blob', mode: path === '.agents/ksf' ? '100755' : '100644' })) });
    assert.equal(String(url), `https://raw.githubusercontent.com/example/ksf-core/${commit}/.agents/core/${encodeURIComponent('中文 文件.txt')}`);
    return new Response(tamper ? 'wrong original' : bytes);
  } });
  const manifest = { schema_version: 4, launcher_protocol: 1, name: 'ksf-core', product: 'ksf-core', version: '0.1.0', platform: 'darwin-arm64',
    core: { repository: 'example/ksf-core', branch: 'main', revision: commit }, development: false };
  const resolved = await resolveBaseline(manifest, { api });
  assert.ok((await resolved.read(path)).equals(bytes)); assert.equal(calls.filter(url => url.startsWith('https://api.github.com')).length, 2);
  tamper = true; await assert.rejects(resolved.read(path), { code: 'BASELINE_MISMATCH' });
});

test('new templates contain only a small receipt; update archives retain checksums but no original text copies', async t => {
  const f = await distributionFixture(t, { compact: true }), receipt = installedManifest(f.workspace);
  assert.equal(receipt.schema_version, 4); assert.equal(receipt.files, undefined);
  assert.ok(readFileSync(join(f.workspace, '.agents/core/release.json')).length < 1024);
  const loaded = inspectReleaseDirectory(f.root, f.first.output);
  assert.equal(loaded.workspaces.length, 1);
  const core = inspectCoreArchive(readFileSync(join(f.first.output, f.first.index.platforms['darwin-arm64'].core.name)));
  assert.ok(Object.values(core.manifest.files).every(record => record.baseline === undefined));
  assert.deepEqual(receipt, releaseReceipt(core.manifest));
});

test('ignored source files cannot silently enter an official package whose receipt names a clean commit', async t => {
  const f = await distributionFixture(t, { compact: true });
  const ignore = join(f.root, '.gitignore');
  writeAtomic(ignore, readFileSync(ignore, 'utf8') + '\n/.agents/core/ignored-source.txt\n');
  git(f.root, ['add', '.gitignore']); git(f.root, ['commit', '-m', 'Fictional ignored file policy']);
  f.save('.agents/core/ignored-source.txt', 'not in the recorded commit');
  assert.equal(git(f.root, ['status', '--porcelain']), '');
  await assert.rejects(buildRelease({ root: f.root, output: join(f.directory, 'wrong-official') }), { code: 'RELEASE_SOURCE_DIRTY' });
  assert.equal((await buildRelease({ root: f.root, output: join(f.directory, 'explicit-development'), allowDirty: true })).development, true);
});

test('unpublished development receipts report their identity without claiming a verified original baseline', async t => {
  const f = await distributionFixture(t, { compact: true }), receipt = installedManifest(f.workspace), api = apiFor(f);
  receipt.development = true; writeAtomic(join(f.workspace, '.agents/core/release.json'), stableJSON(receipt));
  const status = await systemRead({ root: f.workspace, api });
  assert.equal(status.version, '0.1.0'); assert.equal(status.baselineVerified, false); assert.equal(status.changes, null);
  assert.equal(status.baselineStatus, 'development-package'); assert.equal(api.calls.length, 0);
  commitWorkspace(f); await assert.rejects(prepare(f, api), { code: 'DEVELOPMENT_PACKAGE' });
});

test('compact baselines read the exact commit after main advances and fetch only required originals', async t => {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f), original = installedManifest(f.workspace).core.revision;
  await f.next('0.1.1', { [example]: 'a newer upstream file\n' });
  assert.notEqual(git(f.root, ['rev-parse', 'HEAD']), original);
  const before = systemFingerprint(f.workspace), status = await systemRead({ root: f.workspace, api });
  assert.deepEqual(status.changes, []); assert.equal(systemFingerprint(f.workspace), before);
  assert.ok(api.calls.some(c => c.path.endsWith(`/git/commits/${original}`)));
  assert.ok(!api.calls.some(c => c.path.includes('/git/blobs/')));
  const resolved = await resolveBaseline(installedManifest(f.workspace), { api });
  assert.equal((await resolved.read(example)).toString(), sample);
  assert.ok(api.calls.every(c => c.method === 'GET'));
  assert.ok(!api.calls.some(c => /latest|ref\/heads/.test(c.path)));
});

test('compact receipts for an older launcher source report both newly added fixed launchers', async t => {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f), receipt = installedManifest(f.workspace);
  const { mkdirSync } = await import('node:fs'); mkdirSync(join(f.root, '.agents/bin'));
  git(f.root, ['mv', '.agents/ksf', '.agents/bin/ksf']); git(f.root, ['rm', '.agents/ksf.ps1']);
  git(f.root, ['commit', '-m', 'Fictional historical launcher layout']);
  receipt.core.revision = git(f.root, ['rev-parse', 'HEAD']);
  writeAtomic(join(f.workspace, '.agents/core/release.json'), stableJSON(receipt));
  const status = await systemRead({ root: f.workspace, api });
  assert.deepEqual(status.changes.map(c => `${c.state}:${c.path}`).sort(), ['deleted:.agents/bin/ksf', 'added:.agents/ksf', 'added:.agents/ksf.ps1'].sort());
});

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
  writeAtomic(join(f.workspace, binary), Buffer.from([0, 255, 10])); writeAtomic(join(f.workspace, chinese), 'committed Chinese path\n'); commitWorkspace(f);
  const plan = await prepare(f, api, { paths: undefined, all: true });
  assert.equal(plan.changes.length, 4); assert.equal(plan.changes.find(c => c.workspace_path === example).operation, 'delete');
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

async function published(t) {
  const f = await distributionFixture(t, { compact: true }), api = apiFor(f);
  writeAtomic(join(f.workspace, example), 'a reviewed fix\n'); commitWorkspace(f);
  const plan = await prepare(f, api); await submit(f, plan, api); api.calls = [];
  return { f, api, plan };
}

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
