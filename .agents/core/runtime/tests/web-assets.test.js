import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { webSourceDigest, verifyWebBuild } from '../src/web/assets.js';
import { developmentPath, managedPath } from '../src/distribution/paths.js';
function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'ksf-web-assets-')); t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const root = join(workspace, 'web');
  mkdirSync(join(workspace, 'src/routing'), { recursive: true });
  for (const name of ['route-evolution.js', 'view-targets.js']) writeFileSync(join(workspace, 'src/routing', name), 'export {};');
  for (const d of ['src', 'scripts', 'dist/assets']) mkdirSync(join(root, d), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html']) writeFileSync(join(root, name), '{}');
  const files = { 'index.html': '<html></html>', 'THIRD_PARTY_NOTICES.txt': 'notice', 'assets/index-a.js': 'console.log("bundled")' };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'dist', name), text);
  const manifest = { protocol: 'ksf-web-build-v1', sourceDigest: webSourceDigest(root), files: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, createHash('sha256').update(text).digest('hex')])) };
  const publish = () => writeFileSync(join(root, 'dist/build.json'), JSON.stringify(manifest)); publish();
  return { root, manifest, publish };
}
test('bundled assets verify without node_modules and reject stale source, bad hashes and unlisted paths', t => {
  const f = fixture(t); const assets = verifyWebBuild(f.root);
  assert.deepEqual([...assets.keys()].sort(), ['/', '/assets/index-a.js', '/index.html']);
  assert.equal(assets.has('/THIRD_PARTY_NOTICES.txt'), false);
  writeFileSync(join(f.root, 'src/main.tsx'), 'source changed');
  assert.throws(() => verifyWebBuild(f.root), { code: 'WEB_BUILD_INVALID' });
  f.manifest.sourceDigest = webSourceDigest(f.root); f.publish();
  writeFileSync(join(f.root, '../src/routing/route-evolution.js'), 'export const changed = true;');
  assert.throws(() => verifyWebBuild(f.root), { code: 'WEB_BUILD_INVALID' });
  f.manifest.sourceDigest = webSourceDigest(f.root); f.publish();
  writeFileSync(join(f.root, 'dist/assets/index-a.js'), 'tampered');
  assert.throws(() => verifyWebBuild(f.root), { code: 'WEB_BUILD_INVALID' });
  f.manifest.files['../../USER.md'] = 'a'.repeat(64); f.publish();
  assert.throws(() => verifyWebBuild(f.root), { code: 'WEB_BUILD_INVALID' });
});
test('bundled paths reject symlinks and unsupported metadata', t => {
  const f = fixture(t);
  rmSync(join(f.root, 'dist/assets'), { recursive: true }); symlinkSync(tmpdir(), join(f.root, 'dist/assets'));
  assert.throws(() => verifyWebBuild(f.root), { code: 'WEB_BUILD_INVALID' });
  f.manifest.protocol = 'unknown'; f.publish();
  assert.throws(() => verifyWebBuild(f.root), { code: 'WEB_BUILD_INVALID' });
});
test('bundled wallpaper is served only when its exact bytes are in the verified manifest', t => {
  const f = fixture(t), name = 'assets/workbench-a.jpg', bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  writeFileSync(join(f.root, 'dist', name), bytes);
  assert.equal(verifyWebBuild(f.root).has(`/${name}`), false);
  f.manifest.files[name] = createHash('sha256').update(bytes).digest('hex'); f.publish();
  const asset = verifyWebBuild(f.root).get(`/${name}`);
  assert.equal(asset.type, 'image/jpeg'); assert.deepEqual(asset.bytes, bytes);
  writeFileSync(join(f.root, 'dist', name), Buffer.from('changed'));
  assert.throws(() => verifyWebBuild(f.root), { code: 'WEB_BUILD_INVALID' });
});
test('Core build refuses missing frontend inputs instead of treating a damaged frontend as absent', t => {
  const f = fixture(t); rmSync(join(f.root, 'package.json'));
  assert.throws(() => verifyWebBuild(f.root, { optional: true }), { code: 'WEB_BUILD_INVALID' });
});
test('frontend installations and caches are excluded from every managed Core inventory', () => {
  for (const folder of ['node_modules', '.vite', 'coverage', 'test-results', '.impeccable/review']) {
    for (const suffix of ['', '/nested/file.js']) {
      const path = `.agents/core/runtime/web/${folder}${suffix}`;
      assert.equal(developmentPath(path), true, path); assert.equal(managedPath(path), false, path);
    }
  }
  for (const path of ['.agents/core/runtime/web/package-lock.json', '.agents/core/runtime/web/src/app.tsx', '.agents/core/runtime/web/dist/assets/main.js']) assert.equal(managedPath(path), true, path);
});
