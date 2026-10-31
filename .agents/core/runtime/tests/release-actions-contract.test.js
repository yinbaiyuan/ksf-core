import {fixtureTarget} from './helpers/distribution-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {pathToFileURL} from 'node:url';
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
  // Reusing a proof skips verification. Descendants must override GitHub's
  // implicit success() condition and gate on the actual preparation result.
  assert.match(workflow.jobs.prepare.if, /!cancelled\(\)/);
  assert.match(workflow.jobs.release.if, /!cancelled\(\).*needs.prepare.result == 'success'/s);
  assert.match(workflow.jobs.release.if, /inputs.operation != 'template-only'/);
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
    input: `const module=await import(${JSON.stringify(pathToFileURL(join(f.root, '.agents/core/runtime/src/distribution/release-actions.js')).href)}); console.log(typeof module.inspectHandoff);` });
  assert.equal(imported.status, 0, imported.stderr); assert.equal(imported.stdout.trim(), 'function');
  const success = run({}); assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).revision, f.first.coreRevision);
  assert.match(readFileSync(output, 'utf8'), /index_sha256=[a-f0-9]{64}/);
  const failed = run({ KSF_EXPECTED_INDEX: 'f'.repeat(64) });
  assert.equal(failed.status, 1); assert.equal(JSON.parse(failed.stderr).code, 'RELEASE_INPUT_CHANGED');
  assert.match(readFileSync(summary, 'utf8'), /Release stage failed: RELEASE_INPUT_CHANGED/);
});
