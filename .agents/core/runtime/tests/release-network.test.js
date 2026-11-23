import {fixtureTarget} from './helpers/distribution-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync,writeFileSync,mkdtempSync,rmSync,readdirSync } from 'node:fs';
import {tmpdir} from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { download, releaseIndex, resourceURL,downloadVerifiedArchive } from '../src/distribution/network.js';
import {sha256} from '../src/shared/hash.js';
import { systemUpdate } from '../src/distribution/system.js';
import { configuration, installedManifest, stableJSON } from '../src/distribution/common.js';
import { distributionFixture } from './helpers/distribution-fixture.js';

test('new users check the public index asset without an anonymous REST API request', async () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url)), config = configuration(root);
  assert.equal(config.release_source, `https://github.com/${config.core_repository}/releases/latest/download/${config.index_asset}`);
  const requested = [], index = { schema_version: 1, version: '0.1.3' };
  const result = await releaseIndex(config.release_source, { fetcher: async url => {
    requested.push(url.href);
    assert.equal(url.hostname, 'github.com');
    return new Response(stableJSON(index));
  } });
  assert.deepEqual(result.index, index);
  assert.deepEqual(requested, [config.release_source]);
});

test('a real HTTP Release API/index/archive chain upgrades a copied workspace on loopback', async t => {
  const f = await distributionFixture(t), next = await f.next();
  const index = JSON.parse(readFileSync(join(next.output, 'ksf-core-index.json')));
  let origin;
  const server = createServer((request, response) => {
    if (request.url === '/latest') response.end(stableJSON({ draft: false, prerelease: false, assets: [{ name: 'ksf-core-index.json', browser_download_url: origin + '/index.json' }] }));
    else if (request.url === '/index.json') response.end(stableJSON(index));
    else if (request.url === '/core.tar.gz') response.end(readFileSync(next.coreArchive));
    else { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  origin = `http://127.0.0.1:${server.address().port}`;
  index.platforms[fixtureTarget].core.url = origin + '/core.tar.gz';
  const result = await systemUpdate({ root: f.workspace, source: origin + '/latest' });
  assert.equal(result.to, '0.1.1'); assert.equal(installedManifest(f.workspace).version, '0.1.1');
});
test('release discovery requires one unambiguous ksf-core index asset', async () => {
  const base = 'https://example.invalid', index = { version: '0.1.2' };
  const assets = [{ name: 'ksf-core-index.json', browser_download_url: base + '/index' }];
  const fetcher = async url => new Response(stableJSON(url.pathname === '/latest' ? { assets } : index));
  assert.deepEqual((await releaseIndex(base + '/latest', { fetcher })).index, index);
  assets.length = 0;
  await assert.rejects(releaseIndex(base + '/latest', { fetcher }), { code: 'RELEASE_INVALID' });
  assets.unshift({ name: 'ksf-core-index.json' }, { name: 'ksf-core-index.json' });
  await assert.rejects(releaseIndex(base + '/latest', { fetcher }), { code: 'RELEASE_INVALID' });
});
test('downloads reject public plaintext HTTP, credentials, unsafe redirects and oversized streaming bodies', async () => {
  assert.throws(() => resourceURL('http://example.com/index.json'), { code: 'SOURCE_INVALID' });
  assert.throws(() => resourceURL('https://user:password@example.com/'), { code: 'SOURCE_INVALID' });
  assert.throws(() => resourceURL('/local-file', 'https://example.com/index.json'), { code: 'SOURCE_INVALID' });
  await assert.rejects(download('https://example.invalid/index', { fetcher: async () => new Response(null, { status: 302, headers: { Location: 'file:///etc/passwd' } }) }), { code: 'SOURCE_INVALID' });
  await assert.rejects(download('https://example.invalid/index', { limit: 3, fetcher: async () => new Response('oversized') }), { code: 'DOWNLOAD_TOO_LARGE' });
  await assert.rejects(releaseIndex('https://example.invalid/index', { fetcher: async () => new Response('{invalid') }), { code: 'INVALID_JSON' });
});

test('archive body has a separate bounded deadline and reports interrupted reads consistently',async t=>{
 const server=createServer((request,response)=>{response.writeHead(200);response.write('first');setTimeout(()=>response.end('second'),150);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const url=`http://127.0.0.1:${server.address().port}/archive`;
 assert.equal((await download(url,{timeout:100,bodyTimeout:1000})).bytes.toString(),'firstsecond');
 await assert.rejects(download(url,{timeout:1000,bodyTimeout:30}),{code:'DOWNLOAD_FAILED'});
 await assert.rejects(download(url,{limit:4,timeout:1000}),{code:'DOWNLOAD_TOO_LARGE'});
 await assert.rejects(download(url,{fetcher:async()=>new Response(new ReadableStream({start(controller){controller.error(Error('interrupted'));}}))}),{code:'DOWNLOAD_FAILED'});
});

test('preview and install reuse only exact verified package bytes in one bounded replaceable cache',async t=>{
 const root=mkdtempSync(join(tmpdir(),'ksf-core-download-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const bytes=Buffer.from('first package'),artifact={url:'https://example.invalid/core',size:bytes.length,sha256:sha256(bytes)};
 let requests=0;
 const options={fetcher:async()=>{requests++;return new Response(bytes);}};
 assert.deepEqual(await downloadVerifiedArchive(root,artifact,options),bytes);
 assert.deepEqual(await downloadVerifiedArchive(root,artifact,options),bytes);assert.equal(requests,1);
 await assert.rejects(downloadVerifiedArchive(root,{...artifact,url:'http://example.invalid/core'},options),{code:'SOURCE_INVALID'});
 await assert.rejects(downloadVerifiedArchive(root,{...artifact,url:'/local-package'},{...options,base:'https://example.invalid/index'}),{code:'SOURCE_INVALID'});
 assert.equal(requests,1);
 const path=join(root,'.agents/runtime-data/system/core-download.tar.gz');
 writeFileSync(path,Buffer.alloc(bytes.length,120));
 assert.deepEqual(await downloadVerifiedArchive(root,artifact,options),bytes);assert.equal(requests,2);
 await assert.rejects(downloadVerifiedArchive(root,{...artifact,sha256:'0'.repeat(64)},options),{code:'CHECKSUM_MISMATCH'});
 assert.deepEqual(readFileSync(path),bytes);
 const next=Buffer.from('other package'),changed={...artifact,sha256:sha256(next),size:next.length};
 assert.deepEqual(await downloadVerifiedArchive(root,changed,{fetcher:async()=>new Response(next)}),next);
 assert.deepEqual(readdirSync(join(root,'.agents/runtime-data/system')),['core-download.tar.gz']);
 await assert.rejects(downloadVerifiedArchive(root,{...artifact,size:0},options),{code:'RELEASE_INVALID'});
});
