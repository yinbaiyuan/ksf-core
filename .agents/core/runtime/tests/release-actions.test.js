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
