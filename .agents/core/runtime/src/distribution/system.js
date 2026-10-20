import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkedPath, fileMode, parseJSON, readJSON, readRegular, textBytes, walkFiles, writeAtomic, writeJSON } from './files.js';
import { compareVersions, versionParts } from './versions.js';
import { configuration } from './configuration.js';
import { digestObject, isSHA, sha256, stableJSON } from '../shared/hash.js';
import { fail } from './errors.js';
import { installedManifest, validateManifest, releaseReceipt, validateProducts } from './manifests.js';
import { checkSourceCompatibility } from '../sources/compatibility.js';
import { isRepository, isRevision } from './git-values.js';
import { matchesBaseline, resolveBaseline } from './baseline.js';
import { download, releaseIndex } from './network.js';
import { inspectCoreArchive } from './release.js';
import { rootFiles, launcherProtocol } from './products.js';

const generated = new Set(['.agents/core/manifest.yaml']);
const modeOf = (root, path) => existsSync(checkedPath(root, path)) ? fileMode(checkedPath(root, path)) : null;
const equals = matchesBaseline;
function localFile(root, path) {
  const bytes = readRegular(root, path, true);
  return bytes === null ? null : { bytes, mode: fileMode(checkedPath(root, path)) };
}
export function systemFingerprint(root) {
  const paths = walkFiles(root, '.agents/core').concat(rootFiles).sort();
  return digestObject(paths.map(path => [path, sha256(readRegular(root, path)), fileMode(checkedPath(root, path))]));
}
export async function systemRead({ root, api, fetcher }) {
  const receipt = installedManifest(root, true), config = configuration(root, { user: true });
  const backups = backupRecords(root);
  if (!receipt) return { mode: 'development', installed: false, coreRepository: config.core_repository,
    releaseSource: config.release_source, automaticUpdates: false, backups: [] };
  if (receipt.schema_version === 4 && receipt.development) return { mode: 'workspace', installed: true,
    version: receipt.version, platform: receipt.platform, core: receipt.core, developmentPackage: true,
    releaseSource: config.release_source, automaticUpdates: false, checkIntervalSeconds: config.check_interval_seconds,
    requestTimeoutSeconds: config.request_timeout_seconds, changes: null, baselineVerified: false,
    baselineStatus: 'development-package', backups: backups.map(b => ({ id: b.id, from: b.from, to: b.to, operation: b.operation })) };
  const manifest = await resolveBaseline(receipt, { api, fetcher });
  const changes = [];
  for (const [path, base] of Object.entries(manifest.files)) {
    if (generated.has(path)) continue;
    const file = localFile(root, path);
    if (!equals(file, base)) changes.push({ path, state: file === null ? 'deleted' : 'modified' });
  }
  for (const path of walkFiles(root, '.agents/core').concat(rootFiles)) {
    if (path !== '.agents/core/release.json' && !generated.has(path) && !Object.hasOwn(manifest.files, path) && !/\.tmp$/.test(path) && localFile(root, path) !== null) changes.push({ path, state: 'added' });
  }
  return { mode: 'workspace', installed: true, version: manifest.version, platform: manifest.platform,
    core: manifest.core, developmentPackage: manifest.development === true, releaseSource: config.release_source,
    automaticUpdates: false, checkIntervalSeconds: config.check_interval_seconds, requestTimeoutSeconds: config.request_timeout_seconds, changes, backups: backups.map(b => ({ id: b.id, from: b.from, to: b.to, operation: b.operation })) };
}
export function validateIndex(index, manifest) {
  if (!index || index.schema_version !== 1 || !isRepository(index.core_repository) || !isRevision(index.core_revision) ||
      index.core_repository !== manifest.core.repository || !index.platforms || Array.isArray(index.platforms)) fail('RELEASE_INVALID', 'Release index identity is invalid.');
  versionParts(index.version);
  validateProducts(index.products);
  if (index.development === true) fail('RELEASE_INVALID', 'Development packages cannot be installed from a release feed.');
  const selected = index.platforms[manifest.platform];
  if (!selected?.core) fail('PLATFORM_UNSUPPORTED', `Release has no Core package for ${manifest.platform}.`);
  for (const item of [selected.core, selected.workspace].filter(Boolean)) {
    if (typeof item.url !== 'string' || !isSHA(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 1 || item.size > 256 * 1024 * 1024) fail('RELEASE_INVALID', 'Invalid release artifact descriptor.');
  }
  return selected;
}
function sourceAtRoot(root, source) {
  return source && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(source) ? resolve(root, source) : source;
}
export async function systemCheck({ root, source, fetcher }) {
  const current = installedManifest(root), config = configuration(root, { user: true });
  const resolvedSource = sourceAtRoot(root, source) ?? config.release_source;
  const { index, url } = await releaseIndex(resolvedSource, { timeout: config.request_timeout_seconds * 1000, fetcher });
  const artifacts = validateIndex(index, current), comparison = compareVersions(index.version, current.version);
  if (comparison === 0 && index.core_revision !== current.core.revision) fail('RELEASE_REPLACED', 'The installed version was republished with a different Core revision.');
  return { current: current.version, latest: index.version, platform: current.platform, available: comparison > 0,
    source: resolvedSource, indexURL: url, index, artifacts };
}
export function mergeText(base, local, incoming) {
  const dir = mkdtempSync(join(tmpdir(), 'ksf-merge-'));
  try {
    const files = ['local', 'base', 'incoming'].map(name => join(dir, name));
    [local, base, incoming].forEach((bytes, i) => writeAtomic(files[i], bytes));
    const response = spawnSync('/usr/bin/diff3', ['-m', '-L', 'local', '-L', 'base', '-L', 'release', ...files], {
      encoding: 'buffer', timeout: 10000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' },
    });
    if (![0, 1].includes(response.status)) fail('MERGE_FAILED', 'The platform diff3 tool could not complete the merge.');
    return { bytes: response.stdout, conflict: response.status === 1 };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
export async function planUpdate(root, current, incoming, entries) {
  const result = { files: new Map(), changes: [], conflicts: [] };
  const paths = [...new Set([...Object.keys(current.files), ...Object.keys(incoming.files)])].sort();
  for (const path of paths) {
    const base = current.files[path] ?? null, next = incoming.files[path] ?? null, local = localFile(root, path);
    const remote = next ? entries.get(path) : null;
    let chosen;
    if (generated.has(path)) chosen = remote;
    else if (equals(local, next)) chosen = local;
    else if (equals(local, base)) chosen = remote;
    else if ((base === null && next === null) || (base && next && equals(remote, base))) chosen = local;
    else if (base && next && local && textBytes(local.bytes) && textBytes(remote.bytes)) {
      const original = await current.read(path);
      if (!textBytes(original)) { result.conflicts.push({ path, kind: 'binary' }); continue; }
      const merged = mergeText(original, local.bytes, remote.bytes);
      if (merged.conflict) result.conflicts.push({ path, kind: 'text', merged: merged.bytes.toString('utf8') });
      else chosen = { bytes: merged.bytes, mode: local.mode === base.mode ? next.mode : local.mode };
    } else result.conflicts.push({ path, kind: !base ? 'add-add' : !next ? 'delete-modify' : !local ? 'modify-delete' : 'binary' });
    if (chosen !== undefined) {
      result.files.set(path, chosen);
      if ((chosen === null) !== (local === null) || (chosen && local && (!chosen.bytes.equals(local.bytes) || chosen.mode !== local.mode))) {
        result.changes.push({ path, operation: chosen === null ? 'delete' : local === null ? 'add' : 'update', preservesLocalChanges: !!base && !equals(local, base) });
      }
    }
  }
  return result;
}
function backupRecords(root) {
  const path = checkedPath(root, '.agents/runtime-data/system/backups');
  if (!existsSync(path)) return [];
  return readdirSync(path).sort().reverse().flatMap(id => {
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return [];
    const record = readJSON(root, `.agents/runtime-data/system/backups/${id}/meta.json`, true);
    return record ? [{ ...record, id }] : [];
  });
}
function verifyCandidate(candidate, changedPaths = []) {
  const verify = spawnSync('/bin/sh', [join(candidate, '.agents/ksf'), 'runtime', 'verify', '--json'], {
    cwd: candidate, encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024,
    env: { ...process.env, KSF_SKIP_AUTO_UPDATE: '1', KSF_INSTALLED_LAUNCHER: '1' },
  });
  if (verify.status !== 0) fail('CANDIDATE_INVALID', 'Updated system did not pass its bundled runtime verification.', { stderr: verify.stderr?.slice(0, 4000), stdout: verify.stdout?.slice(0, 4000) });
  const binaries = walkFiles(candidate, '.agents/runtime-data/runtime/node').filter(p => p.endsWith('/bin/node'));
  if (binaries.length !== 1) fail('CANDIDATE_INVALID', 'Candidate runtime installation is ambiguous.');
  const definitions = spawnSync(join(candidate, binaries[0]), [fileURLToPath(new URL('../services/validate-system.js', import.meta.url)), candidate], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  if (definitions.status !== 0) fail('CANDIDATE_INVALID', 'Updated system definitions or exact references are invalid.', { stderr: definitions.stderr?.slice(0, 4000) });
  for (const path of changedPaths.filter(p => /\.(?:js|mjs|cjs)$/.test(p) && existsSync(checkedPath(candidate, p)))) {
    const checked = spawnSync(join(candidate, binaries[0]), ['--check', checkedPath(candidate, path)], { encoding: 'utf8', timeout: 10000 });
    if (checked.status !== 0) fail('CANDIDATE_INVALID', `Updated JavaScript does not parse: ${path}.`, { stderr: checked.stderr?.slice(0, 4000) });
  }
}
function ownerStart() {
  const ps = spawnSync('/bin/ps', ['-p', String(process.pid), '-o', 'lstart='], { encoding: 'utf8' });
  if (ps.status !== 0 || !ps.stdout.trim()) fail('TRANSACTION_FAILED', 'Cannot record update owner identity.');
  return ps.stdout.trim().replace(/\s+/g, ' ');
}
export function recoverTransaction(root) {
  const path = checkedPath(root, '.agents/runtime-data/system/transaction');
  if (!existsSync(path)) return { recovered: false };
  const launcher = checkedPath(root, '.agents/ksf');
  const result = spawnSync('/bin/sh', [launcher, 'launcher', 'recover'], {
    cwd: root, encoding: 'utf8', timeout: 30000, env: { ...process.env, KSF_SKIP_AUTO_UPDATE: '1' },
  });
  if (result.status !== 0) fail('UPDATE_BUSY', 'An update is active or its recovery needs attention.', { stderr: result.stderr?.slice(0, 2000) });
  return { recovered: true };
}
function restoreCandidate(root, transaction) {
  const pending = rootFiles.filter(path => existsSync(join(transaction, 'root-intent', path)));
  const same = (first, second) => existsSync(first) && existsSync(second) && readFileSync(first).equals(readFileSync(second));
  // Preflight all roots before changing Core or restoring any one root.
  for (const path of pending) {
    const live = checkedPath(root, path), old = checkedPath(transaction, `old-root/${path}`), next = checkedPath(transaction, `new-root/${path}`);
    if (!same(live, old) && !same(live, next)) fail('RECOVERY_CONFLICT', `Concurrent edit at ${path}; files and transaction were preserved.`);
  }
  if (existsSync(join(transaction, 'old-core'))) {
    if (existsSync(join(root, '.agents/core'))) renameSync(join(root, '.agents/core'), join(transaction, 'failed-core'));
    renameSync(join(transaction, 'old-core'), join(root, '.agents/core'));
  }
  for (const path of pending) {
    const old = join(transaction, 'old-root', path), live = checkedPath(root, path);
    if (!same(live, old)) writeAtomic(live, readFileSync(old), fileMode(old));
  }
}
function commitCandidate(root, candidate, { before, from, to, operation = 'update', fault } = {}) {
  checkSourceCompatibility(root, candidate);
  const system = checkedPath(root, '.agents/runtime-data/system'); mkdirSync(system, { recursive: true });
  const transaction = checkedPath(root, '.agents/runtime-data/system/transaction');
  if (existsSync(transaction)) fail('UPDATE_BUSY', 'Another update transaction exists; use .agents/ksf to recover it.');
  const id = `${Date.now()}-${randomUUID()}`, preparation = checkedPath(root, `.agents/runtime-data/system/prepare-${id}`);
  mkdirSync(preparation);
  writeAtomic(join(preparation, 'protocol'), `${launcherProtocol}\n`);
  writeAtomic(join(preparation, 'owner'), String(process.pid) + '\n');
  writeAtomic(join(preparation, 'owner.start'), ownerStart() + '\n');
  writeAtomic(join(preparation, 'name'), id + '\n');
  try { renameSync(preparation, transaction); }
  catch { rmSync(preparation, { recursive: true, force: true }); fail('UPDATE_BUSY', 'Another update acquired the transaction.'); }
  let committed = false;
  try {
    // Staging is copied onto the same filesystem before changing live files.
    cpSync(join(candidate, '.agents/core'), join(transaction, 'new-core'), { recursive: true, errorOnExist: true, force: false });
    mkdirSync(join(transaction, 'old-root'));
    mkdirSync(join(transaction, 'new-root'));
    const changedRoots = rootFiles.filter(path => !readRegular(root, path).equals(readRegular(candidate, path)) || modeOf(root, path) !== modeOf(candidate, path));
    for (const path of changedRoots) {
      writeAtomic(join(transaction, 'old-root', path), readRegular(root, path), modeOf(root, path));
      writeAtomic(join(transaction, 'new-root', path), readRegular(candidate, path), modeOf(candidate, path));
    }
    const after = systemFingerprint(candidate);
    writeJSON(join(transaction, 'meta.json'), { from, to, operation, afterFingerprint: after, createdAt: new Date().toISOString() });
    if (systemFingerprint(root) !== before) fail('SYSTEM_CHANGED', 'System files changed after the update preview.');
    fault?.('prepared', transaction);
    renameSync(checkedPath(root, '.agents/core'), join(transaction, 'old-core'));
    fault?.('old-renamed', transaction);
    renameSync(join(transaction, 'new-core'), join(root, '.agents/core'));
    fault?.('new-renamed', transaction);
    for (const path of changedRoots) {
      if (!readRegular(root, path).equals(readRegular(transaction, `old-root/${path}`))) fail('SYSTEM_CHANGED', `Root changed before replacement: ${path}.`);
      writeAtomic(join(transaction, 'root-intent', path), '1\n');
      writeAtomic(join(root, path), readRegular(transaction, `new-root/${path}`), modeOf(candidate, path));
      fault?.(`root-installed:${path}`, transaction);
    }
    fault?.('roots-installed', transaction);
    writeAtomic(join(transaction, 'committed'), id + '\n'); committed = true;
    fault?.('committed', transaction);
    const backups = checkedPath(root, '.agents/runtime-data/system/backups'); mkdirSync(backups, { recursive: true });
    renameSync(transaction, join(backups, id));
    return { backup: id, from, to, changed: true };
  } catch (error) {
    if (error?.simulateCrash) throw error;
    if (!committed && existsSync(transaction)) {
      restoreCandidate(root, transaction);
      const failed = checkedPath(root, '.agents/runtime-data/system/failed'); mkdirSync(failed, { recursive: true });
      renameSync(transaction, join(failed, id));
    }
    throw error;
  }
}
export async function systemUpdate({ root, source, from, dryRun = false, fetcher, fault, api }) {
  const receipt = installedManifest(root), config = configuration(root, { user: true }), before = systemFingerprint(root);
  let current = receipt;
  let archive, check;
  if (from) {
    archive = (await download(sourceAtRoot(root, from), { timeout: config.request_timeout_seconds * 1000, fetcher })).bytes;
  } else {
    check = await systemCheck({ root, source, fetcher });
    if (!check.available) return { current: current.version, latest: check.latest, changed: false, dryRun };
    archive = (await download(check.artifacts.core.url, { base: check.indexURL, timeout: config.request_timeout_seconds * 1000, fetcher })).bytes;
    if (archive.length !== check.artifacts.core.size || sha256(archive) !== check.artifacts.core.sha256) fail('CHECKSUM_MISMATCH', 'Downloaded Core archive does not match the Release index.');
  }
  const { manifest: incoming, entries } = inspectCoreArchive(archive, { expectedPlatform: current.platform, expectedRepository: current.core.repository, expectedVersion: check?.latest });
  if (incoming.development) fail('RELEASE_INVALID', 'Cannot install a development package as an official update.');
  if (check && incoming.core.revision !== check.index.core_revision) fail('RELEASE_INVALID', 'Release source revision differs from the index.');
  if (compareVersions(incoming.version, current.version) <= 0) fail('VERSION_NOT_NEWER', 'Updates require a newer version; use rollback to return to a previous installed version.');
  current = await resolveBaseline(receipt, { api, fetcher });
  const plan = await planUpdate(root, current, incoming, entries);
  const result = { current: current.version, latest: incoming.version, dryRun, changed: false, changes: plan.changes, conflicts: plan.conflicts };
  if (plan.conflicts.length) fail('UPDATE_CONFLICT', 'Core changes conflict with local edits; the current system was preserved.', result);
  const staging = mkdtempSync(join(tmpdir(), 'ksf-update-'));
  try {
    cpSync(checkedPath(root, '.agents/core'), join(staging, '.agents/core'), { recursive: true });
    for (const [path, file] of plan.files) {
      const target = checkedPath(staging, path);
      if (file === null) rmSync(target, { force: true });
      else writeAtomic(target, file.bytes, file.mode);
    }
    writeAtomic(join(staging, '.agents/core/release.json'), stableJSON(releaseReceipt(incoming)));
    verifyCandidate(staging, plan.changes.map(c => c.path));
    checkSourceCompatibility(root, staging);
    if (systemFingerprint(root) !== before) fail('SYSTEM_CHANGED', 'System files changed during update validation.');
    if (dryRun) return { ...result, wouldChange: true };
    return { ...result, ...commitCandidate(root, staging, { before, from: current.version, to: incoming.version, fault }) };
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
export async function systemRollback({ root, dryRun = false, fault }) {
  const current = installedManifest(root), records = backupRecords(root), latest = records[0];
  if (!latest) fail('BACKUP_MISSING', 'No previous system version is available.');
  const before = systemFingerprint(root);
  if (latest.afterFingerprint !== before) fail('ROLLBACK_LOCAL_CHANGES', 'Core files changed after the last upgrade; preserve or contribute those edits before rollback.');
  const backup = checkedPath(root, `.agents/runtime-data/system/backups/${latest.id}`);
  const old = validateManifest(parseJSON(readFileSync(join(backup, 'old-core/release.json')), 'backup manifest'));
  const staging = mkdtempSync(join(tmpdir(), 'ksf-rollback-'));
  try {
    cpSync(join(backup, 'old-core'), join(staging, '.agents/core'), { recursive: true });
    for (const path of rootFiles) {
      const old = join(backup, 'old-root', path);
      const source = existsSync(old) ? old : checkedPath(root, path);
      writeAtomic(join(staging, path), readFileSync(source), fileMode(source));
    }
    verifyCandidate(staging);
    checkSourceCompatibility(root, staging);
    if (dryRun) return { current: current.version, target: old.version, changed: false, wouldChange: true, dryRun };
    return { ...commitCandidate(root, staging, { before, from: current.version, to: old.version, operation: 'rollback', fault }), dryRun };
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
export async function systemSync({ root, now = Date.now(), fetcher }) {
  const manifest = installedManifest(root, true);
  if (!manifest) return { skipped: true, reason: 'development', changed: false };
  if (manifest.development) return { skipped: true, reason: 'development-package', changed: false };
  const config = configuration(root, { user: true }), cachePath = '.agents/runtime-data/system/check.json';
  let cache;
  try { cache = readJSON(root, cachePath, true); }
  catch (error) {
    if (error.code !== 'INVALID_JSON') throw error;
    renameSync(checkedPath(root, cachePath), checkedPath(root, `.agents/runtime-data/system/check-corrupt-${randomUUID()}.json`));
    cache = null;
  }
  if (cache?.lastAttempt && now >= cache.lastAttempt && now - cache.lastAttempt < config.check_interval_seconds * 1000) return { skipped: true, reason: 'not-due', changed: false };
  if (existsSync(checkedPath(root, '.agents/runtime-data/system/transaction'))) return { skipped: true, reason: 'busy', changed: false };
  try {
    const response = await systemUpdate({ root, fetcher });
    writeJSON(checkedPath(root, cachePath), { lastAttempt: now, lastSuccess: now, version: response.latest, changed: response.changed });
    return response;
  } catch (error) {
    writeJSON(checkedPath(root, cachePath), { lastAttempt: now, error: { code: error.code ?? 'UPDATE_FAILED', message: error.message } });
    throw error;
  }
}
