import { randomUUID, createHash } from 'node:crypto';
import { open, rename, rm, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireAI, sha256 } from './schema.js';
import { atomicJSON, readJSON, syncDirectory } from './store.js';

export async function registerMaterial(store, caller, chunks, metadata) {
  requireAI(typeof metadata.name === 'string' && metadata.name.length > 0 && metadata.name.length <= 256 && typeof metadata.mimeType === 'string' && /^(?:text\/[a-z0-9.+-]+|application\/json|audio\/[a-z0-9.+-]+)$/.test(metadata.mimeType), 'AI_REQUEST_INVALID', '材料需要名称及支持的 MIME。');
  const materialId = randomUUID(), path = join(store.home, 'materials', materialId + '.bin'), temporary = path + '.tmp';
  const hash = createHash('sha256'); let size = 0, handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    for await (const chunk of chunks) { const bytes = Buffer.from(chunk); size += bytes.length; requireAI(size <= 128 * 1024 * 1024, 'AI_INPUT_TOO_LARGE', '材料超过 128 MiB 上限。'); hash.update(bytes); await handle.writeFile(bytes); }
    await handle.sync(); await handle.close(); handle = undefined;
    await rename(temporary, path); await syncDirectory(join(store.home, 'materials'));
    const material = { schemaVersion: 1, materialId, version: 1, appId: caller.appId, sha256: hash.digest('hex'), size, mimeType: metadata.mimeType, name: metadata.name };
    await atomicJSON(path + '.json', material); return material;
  } finally { await handle?.close(); await rm(temporary, { force: true }); }
}
export async function materialSnapshot(store, caller, reference) {
  const path = join(store.home, 'materials', reference.materialId + '.bin');
  const material = await readJSON(path + '.json');
  requireAI(material.schemaVersion === 1 && material.materialId === reference.materialId && material.appId === caller.appId && material.sha256 === reference.sha256, 'AI_MATERIAL_INVALID', '材料归属或摘要不匹配。');
  const stat = await lstat(path);
  requireAI(stat.isFile() && !stat.isSymbolicLink() && stat.size === material.size, 'AI_MATERIAL_INVALID', '材料内容已变化。');
  const handle = await open(path, 'r'); const hash = createHash('sha256');
  try { for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk); } finally { await handle.close(); }
  requireAI(hash.digest('hex') === material.sha256, 'AI_MATERIAL_INVALID', '材料内容校验失败。');
  return material;
}
export async function readMaterial(store, material) {
  const path = join(store.home, 'materials', material.materialId + '.bin');
  const stat = await lstat(path);
  requireAI(stat.isFile() && !stat.isSymbolicLink() && stat.size === material.size, 'AI_MATERIAL_INVALID', '材料内容已变化。');
  const bytes = await readFile(path);
  requireAI(sha256(bytes) === material.sha256, 'AI_MATERIAL_INVALID', '材料摘要不匹配。'); return bytes;
}
