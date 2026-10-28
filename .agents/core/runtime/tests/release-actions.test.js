import {fixtureTarget} from './helpers/distribution-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inspectHandoff, recoverPublishedBundle, templatePreflight, reportPublication } from '../src/distribution/release-actions.js';
import { inspectReleaseDirectory } from '../src/distribution/publish.js';
import { createArchive, readArchive } from '../src/distribution/archive.js';
import { sha256, stableJSON } from '../src/distribution/common.js';
import { distributionFixture, repository } from './helpers/distribution-fixture.js';
import { PublicationAPI } from './helpers/publication-api.js';
import YAML from '../src/vendor/yaml/dist/index.js';

function published(f) {
  const files = new Map(['ksf-core-release.json', ...Object.values(f.first.index.platforms[fixtureTarget]).map(d => d.name)]
    .map(name => [name, readFileSync(join(f.first.output, name))]));
  const base = 'https://github.com/yinbaiyuan/ksf-core/releases/download/v0.1.0/';
  const release = { draft: false, tag_name: 'v0.1.0', assets: [...files].map(([name, bytes]) => ({ name, size: bytes.length, digest: `sha256:${sha256(bytes)}`, browser_download_url: base + name })) };
  const calls = [], downloads = [];
  const api = { request: async (method, path) => {
    calls.push({ method, path }); assert.equal(method, 'GET');
    if (path.endsWith('/releases/tags/v0.1.0')) return release;
    if (path.endsWith('/git/ref/tags/v0.1.0')) return { object: { type: 'commit', sha: f.first.coreRevision } };
    throw new Error('Unexpected recovery call: ' + path);
  } };
  const fetcher = async url => { downloads.push(String(url)); return new Response(files.get(new URL(url).pathname.split('/').at(-1))); };
  return { files, release, calls, downloads, api, fetcher };
}
function rewriteWorkspace(f, change) {
  const index = structuredClone(f.first.index), descriptor = index.platforms[fixtureTarget].workspace;
  const entries = readArchive(readFileSync(join(f.first.output, descriptor.name)));
  change(entries);
  const bytes = createArchive([...entries.values()]);
  descriptor.size = bytes.length; descriptor.sha256 = sha256(bytes);
  writeFileSync(join(f.first.output, descriptor.name), bytes);
  writeFileSync(join(f.first.output, 'ksf-core-release.json'), stableJSON(index));
}

test('handoff freezes Core commit and index, and refuses a changed bundle', async t => {
  const f = await distributionFixture(t);
  const identity = inspectHandoff({ root: f.root, directory: f.first.output, revision: f.first.coreRevision });
  assert.equal(identity.tag, 'v0.1.0');
  assert.throws(() => inspectHandoff({ root: f.root, directory: f.first.output, revision: 'f'.repeat(40) }), { code: 'RELEASE_SOURCE_INVALID' });
  assert.throws(() => inspectHandoff({ root: f.root, directory: f.first.output, indexHash: 'f'.repeat(64) }), { code: 'RELEASE_INPUT_CHANGED' });
  writeFileSync(join(f.first.output, 'ksf-core-release.json'), stableJSON({ ...f.first.index, development: true }));
  assert.throws(() => inspectHandoff({ root: f.root, directory: f.first.output }), { code: 'RELEASE_INVALID' });
});

test('template preflight checks App scope and generated provenance with GET requests only', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI();
  const result = await templatePreflight({ root: f.root, api });
  assert.equal(result.accessVerified, true);
  assert.ok(api.calls.every(call => call.method === 'GET'));
  for (const [version, code] of [['9.0.0', 'TEMPLATE_VERSION_OLDER'], ['0.1.0', 'TEMPLATE_VERSION_CONFLICT']]) {
    const conflict = new PublicationAPI({ provenance: { generated_from: 'yinbaiyuan/ksf-core', version, revision: 'f'.repeat(40) } });
    await assert.rejects(templatePreflight({ root: f.root, directory: f.first.output, api: conflict }), { code });
    assert.ok(conflict.calls.every(call => call.method === 'GET'));
  }
  await assert.rejects(templatePreflight({ root: f.root, api: new PublicationAPI({ wrongTemplate: true }) }), { code: 'TEMPLATE_NOT_GENERATED' });
  const wrong = { request: async () => ({ total_count: 2, repositories: [{ full_name: 'yinbaiyuan/ksf-workspace' }, { full_name: 'someone/private' }] }) };
  await assert.rejects(templatePreflight({ root: f.root, api: wrong }), { code: 'TEMPLATE_AUTH_SCOPE_INVALID' });
  await assert.rejects(templatePreflight({ root: f.root, api: { request: async () => { throw Object.assign(new Error('permission denied'), { code: 'GITHUB_PERMISSION_DENIED' }); } } }), { code: 'GITHUB_PERMISSION_DENIED' });
});

test('template-only recovers the exact published assets without a build, latest lookup or remote write', async t => {
  const f = await distributionFixture(t), p = published(f), output = join(f.directory, 'recovered');
  const result = await recoverPublishedBundle({ root: f.root, directory: output, tag: 'v0.1.0', ...p });
  assert.equal(result.revision, f.first.coreRevision);
  for (const [name, bytes] of p.files) assert.deepEqual(readFileSync(join(output, name)), bytes);
  assert.equal(p.downloads.length, 3); assert.equal(p.calls.length, 3);
  assert.ok(p.calls.every(call => !call.path.includes('latest')));
});
for (const kind of ['missing-tag', 'draft', 'wrong-source', 'wrong-index-hash', 'tampered-core', 'duplicate', 'unsafe-name', 'changed-tag']) {
  test(`template-only refuses ${kind} without publishing`, async t => {
    const f = await distributionFixture(t), p = published(f), output = join(f.directory, 'rejected');
    let tag = 'v0.1.0', expected = 'RELEASE_INVALID';
    if (kind === 'missing-tag') { tag = ''; expected = 'RELEASE_TAG_INVALID'; }
    if (kind === 'draft') p.release.draft = true;
    if (kind === 'wrong-source') {
      const index = { ...f.first.index, core_revision: 'f'.repeat(40) }, bytes = Buffer.from(stableJSON(index));
      p.files.set('ksf-core-release.json', bytes); Object.assign(p.release.assets[0], { size: bytes.length, digest: `sha256:${sha256(bytes)}` });
      expected = 'RELEASE_TAG_CONFLICT';
    }
    if (kind === 'wrong-index-hash') { p.release.assets[0].digest = 'sha256:' + 'f'.repeat(64); expected = 'CHECKSUM_MISMATCH'; }
    if (kind === 'tampered-core') { p.files.set(f.first.index.platforms[fixtureTarget].core.name, Buffer.from('bad')); expected = 'CHECKSUM_MISMATCH'; }
    if (kind === 'duplicate') p.release.assets.push(p.release.assets[1]);
    if (kind === 'unsafe-name') {
      const index = structuredClone(f.first.index); index.platforms[fixtureTarget].core.name = '../outside';
      const bytes = Buffer.from(stableJSON(index)); p.files.set('ksf-core-release.json', bytes);
      Object.assign(p.release.assets[0], { size: bytes.length, digest: `sha256:${sha256(bytes)}` });
    }
    if (kind === 'changed-tag') {
      const original = p.api.request; let tagReads = 0;
      p.api.request = async (method, path) => path.includes('/git/ref/tags/') && ++tagReads > 1 ?
        { object: { type: 'commit', sha: 'f'.repeat(40) } } : original(method, path);
      expected = 'RELEASE_TAG_CONFLICT';
    }
    await assert.rejects(recoverPublishedBundle({ root: f.root, directory: output, tag, ...p }), { code: expected });
    assert.ok(p.calls.every(call => call.method === 'GET'));
    if (!['changed-tag'].includes(kind)) assert.equal(existsSync(output), false);
  });
}

test('new template bundles forbid reintroducing any self-publisher workflow', async t => {
  const f = await distributionFixture(t);
  assert.equal(inspectReleaseDirectory(f.root, f.first.output).workspaces[0].entries.has('.github/workflows/sync-template.yml'), false);
  rewriteWorkspace(f, entries => entries.set('.github/workflows/sync-template.yml', { path: '.github/workflows/sync-template.yml', mode: 0o644, bytes: Buffer.from('unsafe workflow') }));
  assert.throws(() => inspectReleaseDirectory(f.root, f.first.output), { code: 'RELEASE_INVALID' });
});
test('legacy workflow bundles remain strictly tied to their archived source', async t => {
  const f = await distributionFixture(t);
  const workflow = 'name: Legacy template mirror\n# __KSF_TEMPLATE_REPOSITORY__\n';
  const next = await f.next('0.1.1', { '.agents/core/distribution/template-workflow.yml': workflow });
  // Reconstruct the former bundle shape. The current builder never emits this workflow.
  f.first = next;
  rewriteWorkspace(f, entries => entries.set('.github/workflows/sync-template.yml', { path: '.github/workflows/sync-template.yml', mode: 0o644,
    bytes: Buffer.from(workflow.replaceAll('__KSF_TEMPLATE_REPOSITORY__', 'yinbaiyuan/ksf-workspace')) }));
  assert.equal(inspectReleaseDirectory(f.root, next.output).workspaces[0].entries.has('.github/workflows/sync-template.yml'), true);
  f.first.index = JSON.parse(readFileSync(join(next.output, 'ksf-core-release.json')));
  rewriteWorkspace(f, entries => { entries.get('.github/workflows/sync-template.yml').bytes = Buffer.from('tampered'); });
  assert.throws(() => inspectReleaseDirectory(f.root, next.output), { code: 'RELEASE_INVALID' });
});

test('publication report separates Core success from a failed or unverified template', async t => {
  const f = await distributionFixture(t), identity = inspectHandoff({ root: f.root, directory: f.first.output });
  const base = { root: f.root, directory: f.first.output, revision: identity.revision, indexHash: identity.index_sha256 };
  assert.equal(reportPublication({ ...base, phase: 'core', result: { ok: true, data: { version: identity.version, published: true } } }).published, true);
  assert.throws(() => reportPublication({ ...base, phase: 'template', result: { ok: true, data: { version: identity.version } } }), { code: 'RELEASE_VERIFY_FAILED' });
});

test('Core Actions contract uses one artifact ID, pinned publisher, gated template recovery and scoped App tokens', t => {
  const path = join(repository, '.github/workflows/release.yml');
  // CI belongs only to Core; installed instances intentionally do not inherit its root .github.
  if (!existsSync(path)) { t.skip('Core-only Actions contract; runtime suites still cover the shared bridge.'); return; }
  const workflow = YAML.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(Object.keys(workflow.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.push.tags, ['v*']);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.operation.options, ['release', 'template-only']);
  assert.equal(workflow.permissions.contents, 'read'); assert.equal(workflow.jobs.release.permissions.contents, 'write');
  assert.deepEqual(workflow.jobs.template.needs, ['prepare', 'release']);
  assert.match(workflow.jobs.template.if, /!cancelled\(\).*needs.prepare.result == 'success'/s);
  assert.match(workflow.jobs.template.if, /inputs.operation == 'template-only'/);
  assert.equal(workflow.jobs.prepare.outputs.publisher, '${{ github.sha }}');
  assert.equal(workflow.jobs.template.env.KSF_EXPECTED_REVISION, '${{ needs.prepare.outputs.revision }}');
  const upload = workflow.jobs.prepare.steps.find(step => step.id === 'upload');
  assert.match(upload.with.path, /ksf-core-release.json/); assert.match(upload.with.path, /\*\.tar\.gz/);
  for (const name of ['release', 'template']) {
    const steps = workflow.jobs[name].steps;
    assert.equal(steps.find(step => step.uses?.startsWith('actions/checkout')).with.ref, name === 'template' ? '${{ needs.prepare.outputs.publisher }}' : '${{ needs.prepare.outputs.revision }}');
    assert.equal(steps.find(step => step.uses?.startsWith('actions/download-artifact')).with['artifact-ids'], '${{ needs.prepare.outputs.artifact }}');
    assert.equal(workflow.jobs[name].env.KSF_EXPECTED_INDEX, '${{ needs.prepare.outputs.index }}');
  }
  for (const name of ['prepare', 'template']) {
    const step = workflow.jobs[name].steps.find(step => step.id === 'app');
    assert.equal(step.with.repositories, 'ksf-workspace'); assert.equal(step.with['permission-contents'], 'write');
    assert.equal(step.with['permission-workflows'], 'write'); assert.equal(step.with['skip-token-revoke'], undefined);
  }
  assert.ok(workflow.jobs.prepare.steps.some(step => step.run?.includes(' preflight')));
  assert.ok(!readFileSync(path, 'utf8').includes('release mirror'));
});


test('Actions bridge really executes through macOS temporary-directory aliases and propagates failures', async t => {
  const f = await distributionFixture(t), output = join(f.directory, 'github-output'), summary = join(f.directory, 'summary');
  const run = more => spawnSync(process.execPath, [join(f.root, '.agents/core/runtime/src/distribution/release-actions.js'), 'inspect'], {
    encoding: 'utf8', env: { ...process.env, KSF_RELEASE_DIRECTORY: f.first.output, KSF_EXPECTED_REVISION: f.first.coreRevision,
      GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, ...more },
  });
  const imported = spawnSync(process.execPath, ['--input-type=module', '-'], { encoding: 'utf8',
    input: `const module=await import(${JSON.stringify('file://' + join(f.root, '.agents/core/runtime/src/distribution/release-actions.js'))}); console.log(typeof module.inspectHandoff);` });
  assert.equal(imported.status, 0, imported.stderr); assert.equal(imported.stdout.trim(), 'function');
  const success = run({}); assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).revision, f.first.coreRevision);
  assert.match(readFileSync(output, 'utf8'), /index_sha256=[a-f0-9]{64}/);
  const failed = run({ KSF_EXPECTED_INDEX: 'f'.repeat(64) });
  assert.equal(failed.status, 1); assert.equal(JSON.parse(failed.stderr).code, 'RELEASE_INPUT_CHANGED');
  assert.match(readFileSync(summary, 'utf8'), /Release stage failed: RELEASE_INPUT_CHANGED/);
});
