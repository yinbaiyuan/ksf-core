import { build } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webSourceDigest } from '../../src/web/assets.js';
const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(directory);
await build();
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const included = new Set(), pending = Object.keys(root.dependencies);
function locate(name, from = '') {
  let prefix = from;
  while (true) {
    const key = prefix ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
    if (lock.packages[key]) return key;
    if (!prefix) return null;
    const cut = prefix.lastIndexOf('/node_modules/');
    prefix = cut < 0 ? '' : prefix.slice(0, cut);
  }
}
for (const name of pending) { const key = locate(name); if (key) included.add(key); }
for (const key of included) for (const name of Object.keys(lock.packages[key].dependencies ?? {})) {
  const dependency = locate(name, key); if (dependency) included.add(dependency);
}
const notices = [readFileSync('scripts/licenses/shadcn-ui.txt', 'utf8')];
for (const key of [...included].sort()) {
  const pkg = JSON.parse(readFileSync(join(key, 'package.json'), 'utf8'));
  const licenses = readdirSync(key).filter(name => /^(licen[sc]e|copying|notice)(?:[._-]|$)/i.test(name) && statSync(join(key, name)).isFile());
  const supplement = pkg.name === 'react-remove-scroll-bar' && pkg.version === '2.3.8' ? 'scripts/licenses/react-remove-scroll-bar.txt' : null;
  if (!licenses.length && !supplement) throw new Error(`Missing license notice for ${key}; inspect before distributing.`);
  notices.push(`## ${pkg.name}@${pkg.version} (${pkg.license ?? 'see notice'})\n` +
    (licenses.length ? licenses.map(name => readFileSync(join(key, name), 'utf8')).join('\n') : readFileSync(supplement, 'utf8')));
}
writeFileSync('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n').replace(/\r\n?/g, '\n'));
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const names = new Set(['index.html', 'THIRD_PARTY_NOTICES.txt']);
for (const item of Object.values(manifest)) for (const name of [item.file, ...(item.css ?? []), ...(item.assets ?? [])]) if (name) names.add(name);
const files = Object.fromEntries([...names].sort().map(name => {
  if (!existsSync(join('dist', name))) throw new Error(`Missing bundled asset ${name}`);
  return [name, createHash('sha256').update(readFileSync(join('dist', name))).digest('hex')];
}));
writeFileSync('dist/build.json', JSON.stringify({ protocol: 'ksf-web-build-v1', sourceDigest: webSourceDigest(directory), files }, null, 2) + '\n');
console.log(`Verified ${names.size} assets; ${included.size} runtime dependency license notices.`);
