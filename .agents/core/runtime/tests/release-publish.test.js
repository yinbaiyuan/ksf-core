import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishRelease, publishTemplate, mirrorTemplate } from '../src/distribution/publish.js';
import { sha256, stableJSON } from '../src/distribution/common.js';
import { distributionFixture } from './helpers/distribution-fixture.js';

class PublicationAPI {
  constructor({ wrongTemplate = false, failUpload = false } = {}) {
    this.calls = []; this.tag = null; this.release = null; this.head = 'd'.repeat(40);
    this.commits = new Map([[this.head, { sha: this.head, tree: { sha: 'e'.repeat(40) } }]]);
    this.wrongTemplate = wrongTemplate; this.failUpload = failUpload;
  }
  async request(method, path, body, options) {
    this.calls.push({ method, path, body, options });
    if (path === '/repos/yinbaiyuan/ksf-workspace' && method === 'GET') return { default_branch: 'main', is_template: true };
    if (path.includes('/contents/.ksf-template.json')) return { content: Buffer.from(stableJSON({ generated_from: this.wrongTemplate ? 'someone/else' : 'yinbaiyuan/ksf-core' })).toString('base64') };
    if (path.includes('/git/commits/') && method === 'GET') return this.commits.get(path.split('/').at(-1)) ?? { sha: path.split('/').at(-1), tree: { sha: 'a'.repeat(40) } };
    if (path.includes('/git/ref/tags/') && method === 'GET') return this.tag;
    if (path.endsWith('/git/refs') && method === 'POST') return this.tag = { object: { type: 'commit', sha: body.sha } };
    if (path.includes('/releases/tags/') && method === 'GET') return this.release;
    if (path.endsWith('/releases') && method === 'POST') return this.release = { id: 7, draft: true, html_url: 'https://github.com/yinbaiyuan/ksf-core/releases/tag/v0.1.0', assets: [] };
    if (options?.upload) {
      const name = new URL('https://uploads.github.com' + path).searchParams.get('name');
      const asset = { id: this.release.assets.length + 1, name, size: body.length, digest: `sha256:${sha256(body)}` };
      this.release.assets.push(asset);
      if (this.failUpload) { this.failUpload = false; throw Object.assign(new Error('unknown upload response'), { code: 'GITHUB_REQUEST_FAILED' }); }
      return asset;
    }
    if (path.endsWith('/releases/7') && method === 'PATCH') { this.release.draft = body.draft; return this.release; }
    if (path.includes('/git/ref/heads/') && method === 'GET') return { object: { sha: this.head } };
    if (path.endsWith('/git/blobs')) return { sha: 'f'.repeat(40) };
    if (path.endsWith('/git/trees')) return { sha: 'b'.repeat(40) };
    if (path.endsWith('/git/commits') && method === 'POST') {
      const result = { sha: 'c'.repeat(40), tree: { sha: body.tree } }; this.commits.set(result.sha, result); return result;
    }
    if (path.includes('/git/refs/heads/') && method === 'PATCH') { this.head = body.sha; return { object: { sha: body.sha } }; }
    throw new Error(`Unexpected publication fixture call: ${method} ${path}`);
  }
}
test('release publication uploads verified assets, updates only the generated template, then publishes', async t => {
  const f = await distributionFixture(t), api = new PublicationAPI();
  const result = await publishRelease({ root: f.root, directory: f.first.output, api });
  assert.equal(result.published, true); assert.equal(api.release.draft, false); assert.equal(api.release.assets.length, 3);
  assert.equal(result.template.product, 'ksf-workspace');
  assert.equal(result.template.instanceDefaultName, 'ksf');
  assert.equal(api.calls.find(c => c.path.endsWith('/releases') && c.method === 'POST').body.name, 'ksf-core 0.1.0');
  const tree = api.calls.find(c => c.path === '/repos/yinbaiyuan/ksf-workspace/git/trees').body;
  assert.ok(tree.tree.some(e => e.path === '.github/workflows/sync-template.yml'));
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
