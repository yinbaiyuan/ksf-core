import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Object.assign(new Error(message), { code: 'WEB_BUILD_INVALID' }); };
const sourceEntries = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'src', 'scripts'];
export function webSourceDigest(directory) {
  const sum = createHash('sha256');
  function walk(relative) {
    const path = join(directory, relative), stat = lstatSync(path);
    if (stat.isSymbolicLink()) fail('Frontend source cannot contain symlinks.');
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(`${relative}/${name}`);
    else if (stat.isFile()) sum.update(JSON.stringify([relative, hash(readFileSync(path))]));
    else fail('Unsupported frontend source entry.');
  }
  for (const name of sourceEntries) walk(name);
  for (const name of ['route-evolution.js', 'view-targets.js']) {
    const path = join(directory, '../src/routing', name);
    if (lstatSync(path).isSymbolicLink()) fail('Shared frontend source cannot contain symlinks.');
    sum.update(JSON.stringify([`shared/${name}`, hash(readFileSync(path))]));
  }
  const sdk=join(directory,'../../applications/sdk/src');
  function shared(path,label){const stat=lstatSync(path);if(stat.isSymbolicLink())fail('Shared SDK source cannot contain symlinks.');if(stat.isDirectory())for(const name of readdirSync(path).sort())shared(join(path,name),`${label}/${name}`);else if(stat.isFile())sum.update(JSON.stringify([label,hash(readFileSync(path))]));}
  if(existsSync(sdk)){shared(sdk,'application-sdk');const metadata=join(sdk,'../package.json');if(existsSync(metadata))shared(metadata,'application-sdk/package.json');}
  return sum.digest('hex');
}
const safeAsset = name => typeof name === 'string' && /^(?:index\.html|THIRD_PARTY_NOTICES\.txt|assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg|jpg|woff2?|ttf))$/.test(name);
export function verifyWebBuild(directory, { optional = false } = {}) {
  if (optional && !['package.json', 'index.html', 'src', 'dist'].some(name => existsSync(join(directory, name)))) return null;
  try {
    const dist = join(directory, 'dist');
    if (lstatSync(dist).isSymbolicLink()) fail('Frontend output cannot be a symlink.');
    const infoPath = join(dist, 'build.json');
    if (!lstatSync(infoPath).isFile() || lstatSync(infoPath).isSymbolicLink()) fail('Invalid frontend build metadata.');
    const info = JSON.parse(readFileSync(infoPath, 'utf8'));
    if (info.protocol !== 'ksf-web-build-v1' || !info.files || typeof info.files !== 'object' || Array.isArray(info.files) ||
        !info.files['index.html'] || !info.files['THIRD_PARTY_NOTICES.txt'] || !Object.keys(info.files).some(p => p.endsWith('.js')) ||
        info.sourceDigest !== webSourceDigest(directory)) fail('Frontend build is missing or stale. Run npm ci and npm run build in runtime/web with the bundled Node.');
    const assets = new Map();
    for (const [name, digest] of Object.entries(info.files)) {
      if (!safeAsset(name) || !/^[a-f0-9]{64}$/.test(digest)) fail('Invalid frontend asset manifest.');
      let current = dist;
      for (const part of name.split('/')) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink()) fail('Frontend assets cannot contain symlinks.');
      }
      if (!lstatSync(current).isFile()) fail('Invalid frontend asset.');
      const bytes = readFileSync(current);
      if (hash(bytes) !== digest) fail('Frontend asset checksum mismatch. Rebuild the frontend.');
      if (name === 'THIRD_PARTY_NOTICES.txt') continue;
      const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.ttf') ? 'font/ttf' : name.endsWith('.woff') ? 'font/woff' : 'font/woff2';
      assets.set(`/${name}`, { bytes, type: /\.(?:jpg|ttf|woff2?)$/.test(name) ? type : `${type}; charset=utf-8` });
    }
    assets.set('/', assets.get('/index.html'));
    return assets;
  } catch (error) {
    if (error.code === 'WEB_BUILD_INVALID') throw error;
    fail('Cannot verify the packaged frontend. Run npm run build in runtime/web before building Core.');
  }
}
