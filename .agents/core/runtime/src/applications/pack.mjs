import { readdir, lstat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodePackage, checksum, validPath } from './protocol.js';

export async function packApplication(directory, output) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')), files = {};
  async function walk(path) {
    const stat = await lstat(join(directory, path));
    if (!validPath(path) || stat.isSymbolicLink()) throw new Error(`Unsupported app path: ${path}`);
    if (stat.isDirectory()) for (const name of (await readdir(join(directory, path))).sort()) await walk(`${path}/${name}`);
    else if (stat.isFile()) { const bytes = await readFile(join(directory, path)); files[path] = { content: bytes.toString('base64'), sha256: checksum(bytes), mode: stat.mode & 0o111 ? 0o755 : 0o644 }; }
    else throw new Error(`Unsupported app entry: ${path}`);
  }
  await walk('frontend'); if (manifest.backend) await walk('backend');
  const bytes = encodePackage(manifest, files); await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes);
  return { manifest, package: { url: output.split('/').at(-1), sha256: checksum(bytes), size: bytes.length } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , directory, output] = process.argv;
  if (!directory || !output) { console.error('Usage: node pack.mjs <built-app-directory> <output.ksfapp>'); process.exitCode = 2; }
  else console.log(JSON.stringify(await packApplication(resolve(directory), resolve(output)), null, 2));
}
