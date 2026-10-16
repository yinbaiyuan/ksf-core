import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishRelease, publishTemplate, mirrorTemplate } from '../src/distribution/publish.js';
import { sha256, stableJSON } from '../src/distribution/common.js';
import { distributionFixture } from './helpers/distribution-fixture.js';
import { systemUpdate } from '../src/distribution/system.js';

import { PublicationAPI } from './helpers/publication-api.js';

test('release publication uploads verified assets, updates only the generated template, then publishes', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI();
  const result = await publishRelease({ root: f.root, directory: f.first.output, api });
  assert.equal(result.published, true); assert.equal(api.release.draft, false); assert.equal(api.release.assets.length, 3);
  assert.equal(result.template.product, 'ksf-workspace');
  assert.equal(result.template.instanceDefaultName, 'ksf');
  assert.equal(api.calls.find(c => c.path.endsWith('/releases') && c.method === 'POST').body.name, 'ksf-core 0.1.0');
  const tree = api.calls.find(c => c.path === '/repos/yinbaiyuan/ksf-workspace/git/trees').body;
  assert.ok(!tree.tree.some(e => e.path.startsWith('.github/')));
  assert.equal(result.template.verified, true); assert.equal(result.template.coreRevision, f.first.coreRevision);
  assert.ok(tree.tree.every(e => !e.path.startsWith('知识/') || e.path === '知识/.gitkeep'));
  const finalIndex = api.calls.findIndex(c => c.path.endsWith('/releases/7') && c.method === 'PATCH');
  const templateIndex = api.calls.findIndex(c => c.path.includes('/git/refs/heads/') && c.method === 'PATCH');
  assert.ok(finalIndex > templateIndex);
  const previousCommits = api.calls.filter(c => c.method === 'POST' && c.path.endsWith('/git/commits')).length;
  await publishRelease({ root: f.root, directory: f.first.output, api });
  assert.equal(api.release.assets.length, 3);
  assert.equal(api.calls.filter(c => c.method === 'POST' && c.path.endsWith('/git/commits')).length, previousCommits);
});
test('a failed template update keeps the release in draft, protecting an unrelated target repository', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI({ wrongTemplate: true });
  await assert.rejects(publishRelease({ root: f.root, directory: f.first.output, api }), { code: 'TEMPLATE_NOT_GENERATED' });
  assert.equal(api.release.draft, true);
  assert.equal(api.calls.some(c => c.path === '/repos/yinbaiyuan/ksf-workspace/git/trees'), false);
});
test('an unknown asset upload response reuses its checksum-verified asset on retry', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI({ failUpload: true });
  await assert.rejects(publishRelease({ root: f.root, directory: f.first.output, api, releaseOnly: true }), { code: 'GITHUB_REQUEST_FAILED' });
  const result = await publishRelease({ root: f.root, directory: f.first.output, api, releaseOnly: true });
  assert.equal(result.published, true); assert.equal(api.release.assets.length, 3);
  assert.equal(new Set(api.release.assets.map(a => a.name)).size, 3);
  assert.equal(api.calls.some(c => c.path === '/repos/yinbaiyuan/ksf-workspace'), false);
});
test('publication preview checks artifacts without authenticating or writing remote state', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI();
  assert.equal((await publishRelease({ root: f.root, directory: f.first.output, dryRun: true, api })).wouldPublish, true);
  assert.equal((await publishTemplate({ root: f.root, directory: f.first.output, dryRun: true, api })).wouldPublish, true);
  assert.equal(api.calls.length, 0);
});
test('template mirror skips an already installed release and verifies a newer public release before publication', async t => {
  const f = await distributionFixture(t), next = await f.next(), api = new PublicationAPI();
  const currentFetcher = async () => new Response(stableJSON(f.first.index));
  const skipped = await mirrorTemplate({ root: f.workspace, source: 'https://release.invalid/index.json', fetcher: currentFetcher, api });
  assert.equal(skipped.skipped, 'up-to-date'); assert.equal(api.calls.length, 0);
  const index = JSON.parse(readFileSync(join(next.output, 'ksf-core-release.json')));
  const fetcher = async url => {
    const name = new URL(url).pathname.split('/').at(-1);
    return new Response(name === 'index.json' ? stableJSON(index) : readFileSync(join(next.output, name)));
  };
  const result = await mirrorTemplate({ root: f.workspace, source: 'https://release.invalid/index.json', fetcher, api });
  assert.equal(result.version, '0.1.1'); assert.equal(result.repository, 'yinbaiyuan/ksf-workspace');
});

test('template mirror refuses a platform-derived filename that escapes its staging directory', async t => {
  const f = await distributionFixture(t), next = await f.next(), index = structuredClone(next.index);
  index.platforms['../../escape'] = { core: { ...index.platforms['darwin-arm64'].core,
    name: 'ksf-core-0.1.1-../../escape.tar.gz', url: 'https://release.invalid/escape' } };
  let unsafeDownload = false;
  const fetcher = async url => {
    const name = new URL(url).pathname.split('/').at(-1);
    if (name === 'escape') unsafeDownload = true;
    return new Response(name === 'index.json' ? stableJSON(index) : readFileSync(join(next.output, name)));
  };
  await assert.rejects(mirrorTemplate({ root: f.workspace, source: 'https://release.invalid/index.json', dryRun: true, fetcher }), { code: 'RELEASE_INVALID' });
  assert.equal(unsafeDownload, false);
});

for (const [version, revision, code] of [
  ['0.2.0', 'f'.repeat(40), 'TEMPLATE_VERSION_OLDER'],
  ['0.1.0', 'f'.repeat(40), 'TEMPLATE_VERSION_CONFLICT'],
]) test(`template publication rejects remote provenance ${version} (${code}) before writes`, async t => {
  const f = await distributionFixture(t), api = new PublicationAPI({ provenance: { generated_from: 'yinbaiyuan/ksf-core', version, revision } });
  await assert.rejects(publishTemplate({ root: f.root, directory: f.first.output, api }), { code });
  assert.ok(api.calls.every(c => c.method === 'GET'));
});
test('template publication refuses a concurrent branch change without a forced update', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI({ concurrent: true });
  await assert.rejects(publishTemplate({ root: f.root, directory: f.first.output, api }), { code: 'TEMPLATE_CHANGED' });
  assert.ok(!api.calls.some(c => c.method === 'PATCH'));
});
test('mirror refuses an older feed than the installed template (F02) without remote writes or artifact downloads', async t => {
  const f = await distributionFixture(t), next = await f.next(), api = new PublicationAPI();
  await systemUpdate({ root: f.workspace, from: next.coreArchive });
  let downloads = 0;
  const fetcher = async () => { downloads++; return new Response(stableJSON(f.first.index)); };
  const result = await mirrorTemplate({ root: f.workspace, source: 'https://release.invalid/index.json', fetcher, api });
  assert.equal(result.skipped, 'older-release'); assert.equal(downloads, 1); assert.equal(api.calls.length, 0);
});
test('mirror rejects a same-version release from another revision before downloads', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI();
  const index = { ...f.first.index, core_revision: 'f'.repeat(40) };
  await assert.rejects(mirrorTemplate({ root: f.workspace, source: 'https://release.invalid/index.json', fetcher: async () => new Response(stableJSON(index)), api }), { code: 'RELEASE_REPLACED' });
  assert.equal(api.calls.length, 0);
});


test('release-only reports that template publication was not requested or scheduled', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI();
  const result = await publishRelease({ root: f.root, directory: f.first.output, api, releaseOnly: true });
  assert.deepEqual(result.template, { status: 'not-requested', published: false, scheduled: false, repository: 'yinbaiyuan/ksf-workspace' });
  assert.equal(api.calls.some(c => c.path.startsWith('/repos/yinbaiyuan/ksf-workspace')), false);
});
test('Core stays published while an old template update loses its ref response; retry does not republish Core', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI({ failRef: true, provenance: {
    generated_from: 'yinbaiyuan/ksf-core', version: '0.0.9', revision: '0'.repeat(40) } });
  const published = await publishRelease({ root: f.root, directory: f.first.output, api, releaseOnly: true });
  assert.equal(published.published, true); assert.equal(api.release.draft, false);
  const coreRequests = api.calls.filter(c => c.method !== 'GET' && c.path.includes('/releases')).length;
  await assert.rejects(publishTemplate({ root: f.root, directory: f.first.output, api }), { code: 'GITHUB_REQUEST_FAILED' });
  const writes = api.calls.filter(c => c.method === 'POST' && c.path.endsWith('/git/commits')).length;
  const result = await publishTemplate({ root: f.root, directory: f.first.output, api });
  assert.equal(result.verified, true); assert.equal(result.version, f.first.version);
  assert.equal(api.release.draft, false); assert.equal(api.release.assets.length, 3);
  assert.equal(api.calls.filter(c => c.method !== 'GET' && c.path.includes('/releases')).length, coreRequests);
  assert.equal(api.calls.filter(c => c.method === 'POST' && c.path.endsWith('/git/commits')).length, writes);
  assert.ok(api.calls.filter(c => c.method === 'PATCH' && c.path.includes('/git/refs/heads/')).every(c => c.body.force === false));
  assert.ok(api.calls.filter(c => c.path.endsWith('/git/trees')).every(c => !c.body.base_tree && !c.body.tree.some(e => e.path.startsWith('.github/'))));
});
test('template publication verifies actual remote receipt before reporting success', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI({ badReceipt: true });
  await assert.rejects(publishTemplate({ root: f.root, directory: f.first.output, api }), { code: 'TEMPLATE_VERIFY_FAILED' });
  api.badReceipt = false;
  assert.equal((await publishTemplate({ root: f.root, directory: f.first.output, api })).verified, true);
});
