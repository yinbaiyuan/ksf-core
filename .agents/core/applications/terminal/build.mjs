import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, rm, chmod, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { packApplication } from '../../runtime/src/applications/pack.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const out = join(root, '.build'); await rm(out, { recursive: true, force: true }); await mkdir(join(out, 'frontend'), { recursive: true });
await build({ entryPoints: [join(root, 'frontend.js')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: join(out, 'frontend/index.js'), minify: true, legalComments: 'eof' });
await mkdir(join(out, 'backend/node_modules/node-pty'), { recursive: true });
await cp(join(root, 'backend.mjs'), join(out, 'backend/index.mjs'));
const pty = join(root, 'node_modules/node-pty'), dest = join(out, 'backend/node_modules/node-pty');
for (const name of ['lib', 'package.json', 'LICENSE']) await cp(join(pty, name), join(dest, name), { recursive: true });
const notices = await Promise.all(['@xterm/xterm', '@xterm/addon-fit', 'node-pty'].map(async name => `## ${name}\n${await readFile(join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`));
await writeFile(join(out, 'frontend/THIRD_PARTY_NOTICES.txt'), notices.join('\n\n'));
const store = join(root, '../store');
let previous = []; try { previous = JSON.parse(await readFile(join(store, 'index.json'), 'utf8')).apps; } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const target of (await readdir(join(pty, 'prebuilds'))).sort()) {
  // Preserve upstream platform artifacts; do not claim execution of foreign binaries.
  await rm(join(dest, 'prebuilds'), { recursive: true, force: true });
  await cp(join(pty, 'prebuilds', target), join(dest, 'prebuilds', target), { recursive: true, filter: path => !path.endsWith('.pdb') });
  if (!target.startsWith('win32')) await chmod(join(dest, 'prebuilds', target, 'spawn-helper'), 0o755);
  const manifest = { ...JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')), target };
  // node-pty 1.1 prebuilds use Node-API, so no Node module ABI pin is needed.
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const name = `terminal-${manifest.version}-${target}.ksfapp`, entry = await packApplication(out, join(store, name));
  previous = [...previous.filter(a => !(a.manifest.id === manifest.id && a.manifest.version === manifest.version && a.manifest.target === target)), entry];
  console.log(`Built ${name}: ${entry.package.size} bytes, SHA256 ${entry.package.sha256}`);
}
await writeFile(join(store, 'index.json'), JSON.stringify({ protocol: 'ksf-app-registry-v1', name: 'KSF 应用', apps: previous }, null, 2) + '\n');
