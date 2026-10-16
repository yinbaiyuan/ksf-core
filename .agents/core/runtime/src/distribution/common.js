import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, openSync, closeSync, fsyncSync, readFileSync,
  readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { products, releaseIndexName } from './products.js';

export class DistributionError extends Error {
  constructor(code, message, data, exitCode = 1) {
    super(message); this.code = code; this.data = data; this.exitCode = exitCode;
  }
}
export function fail(code, message, data) { throw new DistributionError(code, message, data); }
export function invalid(message) { throw new DistributionError('INVALID_ARGUMENTS', message, undefined, 2); }
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const stableJSON = value => JSON.stringify(value, null, 2) + '\n';
export const digestObject = value => sha256(stableJSON(value));
export const isSHA = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isRevision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export const isRepository = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
export const isBranch = value => typeof value === 'string' && value.length > 0 && value !== '@' &&
  !value.startsWith('-') && !value.includes('..') && !value.includes('@{') &&
  !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) &&
  value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock'));

export function validRelative(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 1000 && !isAbsolute(path) &&
    !/[\\\x00-\x1f\x7f:]/.test(path) && path.split('/').every(p => p && p !== '.' && p !== '..' && p !== '.git');
}
export function managedPath(path) {
  return validRelative(path) && (path === 'AGENTS.md' || path === '.agents/bin/ksf' ||
    (path.startsWith('.agents/core/') && !path.split('/').some(p => ['.agents/runtime-data', '.DS_Store'].includes(p)) &&
      !/^\.agents\/core\/(?:release\.json|\.manifest\.yaml\..*\.tmp)$/.test(path)));
}
export function checkedPath(root, relative) {
  if (!validRelative(relative)) fail('UNSAFE_PATH', `Invalid relative path: ${JSON.stringify(relative)}.`);
  let current = resolve(root);
  for (const part of relative.split('/')) {
    current = join(current, part);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) fail('UNSAFE_PATH', `Unsupported filesystem entry: ${relative}.`);
    } else {
      // existsSync is false for a dangling symlink.
      try { if (lstatSync(current).isSymbolicLink()) fail('UNSAFE_PATH', `Dangling symlink: ${relative}.`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  return current;
}
export function readRegular(root, relative, optional = false) {
  const path = checkedPath(root, relative);
  if (!existsSync(path)) {
    if (optional) return null;
    fail('FILE_MISSING', `Missing file: ${relative}.`);
  }
  if (!lstatSync(path).isFile()) fail('UNSAFE_PATH', `Expected a regular file: ${relative}.`);
  return readFileSync(path);
}
export function writeAtomic(path, bytes, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, 'wx', mode); writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}
export function writeJSON(path, data) { writeAtomic(path, stableJSON(data)); }
export function parseJSON(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail('INVALID_JSON', `Invalid JSON: ${label}.`); }
}
export function readJSON(root, path, optional = false) {
  const bytes = readRegular(root, path, optional); return bytes === null ? null : parseJSON(bytes, path);
}
export function walkFiles(root, prefix, { exclude = () => false } = {}) {
  const found = [];
  function visit(relative) {
    if (exclude(relative)) return;
    const path = checkedPath(root, relative), stat = lstatSync(path);
    if (stat.isDirectory()) for (const child of readdirSync(path).sort()) visit(`${relative}/${child}`);
    else if (stat.isFile()) found.push(relative);
    else fail('UNSAFE_PATH', `Unsupported file: ${relative}.`);
  }
  visit(prefix); return found;
}
export function fileMode(path) { return lstatSync(path).mode & 0o111 ? 0o755 : 0o644; }
export function textBytes(bytes) {
  if (bytes.length > 2 * 1024 * 1024 || bytes.includes(0)) return false;
  return Buffer.from(bytes.toString('utf8')).equals(bytes);
}
export function versionParts(value) {
  if (typeof value !== 'string') fail('VERSION_INVALID', 'Version must be a string.');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*))?$/.exec(value);
  if (!match || match.slice(1, 4).some(p => !Number.isSafeInteger(Number(p))) ||
      match[4]?.split('.').some(p => /^\d+$/.test(p) && p.length > 1 && p[0] === '0')) fail('VERSION_INVALID', `Invalid version: ${value}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ''];
}
export function compareVersions(a, b) {
  const ap = versionParts(a), bp = versionParts(b);
  for (let i = 0; i < 3; i++) if (ap[i] !== bp[i]) return ap[i] > bp[i] ? 1 : -1;
  if (ap[3] === bp[3]) return 0;
  if (!ap[3]) return 1; if (!bp[3]) return -1;
  const aa = ap[3].split('.'), bb = bp[3].split('.');
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (aa[i] === undefined) return -1; if (bb[i] === undefined) return 1;
    if (aa[i] === bb[i]) continue;
    const an = /^\d+$/.test(aa[i]), bn = /^\d+$/.test(bb[i]);
    if (an && bn) return BigInt(aa[i]) > BigInt(bb[i]) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return aa[i] > bb[i] ? 1 : -1;
  }
  return 0;
}
export function configuration(root) {
  const config = readJSON(root, '.agents/core/distribution.json');
  if (config.schema_version !== 1 || !isRepository(config.core_repository) || !isRepository(config.template_repository) ||
      !isBranch(config.core_branch) || typeof config.release_source !== 'string' || config.index_asset !== releaseIndexName ||
      !Number.isInteger(config.check_interval_seconds) || config.check_interval_seconds < 60 ||
      !Number.isInteger(config.request_timeout_seconds) || config.request_timeout_seconds < 1 || config.request_timeout_seconds > 60) {
    fail('DISTRIBUTION_CONFIG_INVALID', 'Invalid .agents/core/distribution.json.');
  }
  return config;
}
export function validateProducts(value) {
  if (!value || Array.isArray(value) ||
      Object.keys(value).length !== Object.keys(products).length ||
      Object.entries(products).some(([key, name]) => value[key] !== name)) {
    fail('RELEASE_INVALID', 'Release products must identify ksf-core, ksf-workspace and the default ksf instance.');
  }
}
export function validateManifest(manifest) {
  if (!manifest || manifest.schema_version !== 2 || manifest.name !== products.core || manifest.product !== products.core ||
      !isRepository(manifest.core?.repository) || !isRevision(manifest.core?.revision) ||
      !isBranch(manifest.core.branch) || typeof manifest.development !== 'boolean' ||
      !['darwin-arm64', 'darwin-x64'].includes(manifest.platform) || !manifest.files || Array.isArray(manifest.files)) {
    fail('RELEASE_INVALID', 'Invalid Core release manifest.');
  }
  versionParts(manifest.version);
  const entries = Object.entries(manifest.files);
  if (entries.length === 0 || entries.length > 20000) fail('RELEASE_INVALID', 'Invalid managed file count.');
  for (const [path, entry] of entries) {
    if (!managedPath(path) || !entry || !isSHA(entry.sha256) || ![0o644, 0o755].includes(entry.mode) || !managedPath(entry.source_path)) {
      fail('RELEASE_INVALID', `Invalid managed file: ${path}.`);
    }
    if (entry.baseline !== undefined) {
      if (typeof entry.baseline !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.baseline)) fail('RELEASE_INVALID', `Invalid text baseline: ${path}.`);
      const bytes = Buffer.from(entry.baseline, 'base64');
      if (!textBytes(bytes) || sha256(bytes) !== entry.sha256) fail('RELEASE_INVALID', `Baseline checksum mismatch: ${path}.`);
    }
  }
  const sorted = Object.keys(manifest.files).sort();
  for (let i = 0; i + 1 < sorted.length; i++) {
    if (sorted[i + 1].startsWith(`${sorted[i]}/`)) fail('RELEASE_INVALID', `File/directory collision: ${sorted[i]}.`);
  }
  for (const required of ['AGENTS.md', '.agents/bin/ksf', '.agents/core/build.json', '.agents/core/manifest.yaml', '.agents/core/distribution.json']) {
    if (!Object.hasOwn(manifest.files, required)) fail('RELEASE_INVALID', `Required file absent: ${required}.`);
  }
  if (manifest.files['.agents/bin/ksf'].mode !== 0o755) fail('RELEASE_INVALID', 'Release launcher must be executable.');
  return manifest;
}
export function installedManifest(root, optional = false) {
  const data = readJSON(root, '.agents/core/release.json', optional);
  return data === null ? null : validateManifest(data);
}
