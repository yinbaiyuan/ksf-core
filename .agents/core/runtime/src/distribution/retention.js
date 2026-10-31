import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gitExecutable, removePathSync as rmSync } from '../platform/index.js';
import { assertNoCooperationMigration } from '../migrations/guard.js';
import { writeAtomic, walkFiles, readRegular, fileMode, checkedPath } from './files.js';
import { developmentPath } from './paths.js';
import { fail } from './errors.js';

// Runtime data also contains durable business state. Only these owned artifact
// layouts are eligible; unknown directories and unreadable records stay put.
const home = '.agents/runtime-data';
const digest = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9-]{27}$/;
function safe(root, path) {
  const full = resolve(root, path), rel = relative(root, full);
  if (!rel.startsWith(`.agents${sep}runtime-data${sep}`)) fail('CLEANUP_PATH_INVALID', 'Cleanup targets must be owned runtime artifacts.');
  let at = resolve(root);
  for (const part of rel.split(sep)) {
    at = join(at, part);
    if (existsSync(at) && lstatSync(at).isSymbolicLink()) fail('CLEANUP_PATH_INVALID', 'Cleanup cannot traverse a symlink.');
  }
  return full;
}
function children(root, path) {
  const full = safe(root, path);
  return existsSync(full) ? readdirSync(full, { withFileTypes: true }).filter(item => item.isDirectory() && !item.isSymbolicLink()).map(item => item.name).sort() : [];
}
function record(root, path, warnings) {
  const full = safe(root, path);
  if (!existsSync(full)) return null;
  try { if (!lstatSync(full).isFile() || lstatSync(full).size > 8 * 1024 * 1024) throw Error('Not a bounded regular record.'); return JSON.parse(readFileSync(full, 'utf8')); }
  catch (error) { warnings.push({ path, reason: 'unreadable-record', message: error.message }); return null; }
}
function tree(root, path) {
  const full = safe(root, path), rows = []; let bytes = 0;
  function visit(at) {
    const s = lstatSync(at);
    if (s.dev !== lstatSync(full).dev) fail('CLEANUP_PATH_INVALID', 'Cleanup cannot cross a filesystem boundary.');
    rows.push([relative(full, at), s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs, s.mode, s.isSymbolicLink() ? readlinkSync(at) : null]);
    if (s.isDirectory()) for (const name of readdirSync(at).sort()) visit(join(at, name));
    else bytes += s.size;
  }
  visit(full); return { bytes, fingerprint: digest(JSON.stringify(rows)) };
}
function assertIdle(root) {
  assertNoCooperationMigration(root);
  for (const path of [`${home}/service/deployment.json`, `${home}/system/transaction`, `${home}/cooperation-migration/active.json`])
    if (existsSync(safe(root, path))) fail('CLEANUP_BUSY', 'An installation or recovery is active; its artifacts were preserved.', { path });
}
// Age and a completed receipt prove that a rollback is obsolete, not that its
// local edits are backed up. Unknown source stays until explicitly preserved.
function sourceProtection(root) {
  let committed;
  const gitObjects = () => {
    if (committed) return committed;
    committed = new Set();
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' });
    const run = args => spawnSync(gitExecutable, ['--no-replace-objects', '-c', 'core.quotePath=false', '-C', root, ...args], { env, encoding: 'utf8', timeout: 10000, maxBuffer: 32 * 1024 * 1024 });
    const top = run(['rev-parse', '--show-toplevel']);
    if (top.status !== 0 || realpathSync.native(top.stdout.trim()) !== realpathSync.native(root)) return committed;
    const reachable = run(['rev-list', '--objects', 'HEAD']), stored = run(['cat-file', '--batch-all-objects', '--batch-check=%(objectname)', '--unordered']);
    if (reachable.status !== 0 || stored.status !== 0) return committed;
    const available = new Set(stored.stdout.trim().split(/\r?\n/));
    for (const row of reachable.stdout.split(/\r?\n/)) {
      const space = row.indexOf(' '), oid = row.slice(0, space);
      if (space > 0 && available.has(oid)) committed.add(row);
    }
    return committed;
  };
  return path => {
    const prefix = /\/(?:old-root|new-root)$/.test(path) ? '' : '.agents/core/';
    const unprotected = [];
    function visit(at) {
      const rel = relative(safe(root, path), at).split(sep).join('/'), current = `${prefix}${rel}`, s = lstatSync(at);
      if (rel.split('/').includes('.git')) { unprotected.push(rel); return; }
      if (at.endsWith(`${sep}.DS_Store`) || developmentPath(current)) return;
      if (s.isDirectory()) { for (const name of readdirSync(at)) visit(join(at, name)); return; }
      if (s.isFile()) {
        const bytes = readFileSync(at);
        try { if (readRegular(root, current, true)?.equals(bytes)) return; } catch { /* Unreadable primary is not proof. */ }
        const oid = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        if (gitObjects().has(`${oid} ${current}`)) return;
      }
      unprotected.push(rel);
    }
    visit(safe(root, path));
    return unprotected;
  };
}
export function planRuntimeCleanup(root, { scope = 'all', keepRunId } = {}) {
  root = resolve(root); assertIdle(root);
  const candidates = [], retained = [], warnings = [];
  const protect = sourceProtection(root);
  const add = (path, reason, guard) => {
    if (!existsSync(safe(root, path))) return;
    if (reason.includes('rollback') || reason === 'superseded-prepared-switch') {
      const unique = protect(path);
      if (unique.length) { warnings.push({ path, reason: 'source-not-preserved', count: unique.length, files: unique.slice(0, 20) }); retained.push({ path, reason: 'source-not-preserved' }); return; }
    }
    candidates.push({ path, reason, guard, ...tree(root, path) });
  };
  if (scope !== 'tests') {
    const base = `${home}/t15-switch`, records = children(root, base).filter(id => uuid.test(id)).flatMap(id => {
      const path = `${base}/${id}/switch.json`, r = record(root, path, warnings);
      return r?.schemaVersion === 1 && r.id === id && resolve(r.root ?? '') === root && Number.isFinite(Date.parse(r.at)) ? [{ id, path, r }] : [];
    }).sort((a, b) => Date.parse(b.r.at) - Date.parse(a.r.at) || b.id.localeCompare(a.id));
    // A pending recovery, including a failed service restoration, blocks all
    // switch pruning. Prepared candidates are deliberately left for review.
    const inFlight = records.filter(({ r }) => !['complete', 'prepared'].includes(r.phase) || r.phase === 'complete' && r.wasRunning && !r.serviceRestored);
    if (inFlight.length) warnings.push({ reason: 'switch-recovery-pending', ids: inFlight.map(x => x.id) });
    else {
      const complete = records.filter(x => x.r.phase === 'complete'), latest = complete[0];
      const rollback = complete.find(x => existsSync(safe(root, `${base}/${x.id}/previous-core`)) && !existsSync(safe(root, `${base}/${x.id}/retention.json`)));
      if (rollback) retained.push({ path: `${base}/${rollback.id}/previous-core`, reason: 'latest-matched-rollback' });
      for (const item of complete.filter(x => x !== rollback)) add(`${base}/${item.id}/previous-core`, 'superseded-matched-rollback', { path: item.path, digest: digest(readFileSync(safe(root, item.path))) });
      const stale = latest ? records.filter(item => item.r.phase === 'prepared' && Date.parse(item.r.at) < Date.parse(latest.r.at) && typeof item.r.beforeCoreEtag === 'string') : [];
      if (stale.length) {
        const current = digest(JSON.stringify(walkFiles(root, '.agents/core', { exclude: path => developmentPath(path) || path.endsWith('/.DS_Store') }).sort().map(path => [path, digest(readRegular(root, path)), fileMode(checkedPath(root, path))])));
        for (const item of stale) if (item.r.beforeCoreEtag !== current) add(`${base}/${item.id}/core`, 'superseded-prepared-switch', { path: item.path, digest: digest(readFileSync(safe(root, item.path))) });
      }
    }
    const backups = `${home}/system/backups`, official = children(root, backups).flatMap(id => {
      const path = `${backups}/${id}/meta.json`, r = record(root, path, warnings);
      return r && ['update', 'rollback'].includes(r.operation) && Number.isFinite(Date.parse(r.createdAt)) && existsSync(safe(root, `${backups}/${id}/committed`)) ? [{ id, path, r }] : [];
    }).sort((a, b) => Date.parse(b.r.createdAt) - Date.parse(a.r.createdAt) || b.id.localeCompare(a.id));
    const rollback = official.find(x => existsSync(safe(root, `${backups}/${x.id}/old-core`)) && !existsSync(safe(root, `${backups}/${x.id}/retention.json`)));
    if (rollback) retained.push({ path: `${backups}/${rollback.id}`, reason: 'latest-official-rollback' });
    for (const item of official.filter(x => x !== rollback)) for (const name of ['old-core', 'old-root', 'new-root']) add(`${backups}/${item.id}/${name}`, 'superseded-official-rollback', { path: item.path, digest: digest(readFileSync(safe(root, item.path))) });
  }
  if (scope !== 'switches') {
    const base = `${home}/tests`, runs = children(root, base).filter(id => uuid.test(id)).flatMap(id => {
      const r = record(root, `${base}/${id}/report.json`, warnings);
      return r?.schemaVersion === 1 && r.runId === id && Number.isFinite(Date.parse(r.finishedAt)) && ['passed', 'failed', 'cancelled', 'inputs-changed', 'not-applicable'].includes(r.status) ? [{ id, r }] : [];
    }).sort((a, b) => Date.parse(b.r.finishedAt) - Date.parse(a.r.finishedAt) || b.id.localeCompare(a.id));
    const keep = new Set([...runs.slice(0, 10), ...runs.filter(x => !['passed', 'not-applicable'].includes(x.r.status)).slice(0, 5)].map(x => x.id));
    if (keepRunId) keep.add(keepRunId);
    for (const item of runs) if (!keep.has(item.id)) add(`${base}/${item.id}`, 'test-run-count-limit', { path: `${base}/${item.id}/report.json`, digest: digest(readFileSync(safe(root, `${base}/${item.id}/report.json`))) });
    const cache = `${base}/cache`, full = safe(root, cache);
    const entries = existsSync(full) ? readdirSync(full).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).flatMap(name => {
      const path = `${cache}/${name}`, r = record(root, path, warnings);
      return r?.schemaVersion === 1 && r.key === name.slice(0, -5) && r.result?.status === 'passed' ? [{ path, stat: lstatSync(safe(root, path)) }] : [];
    }).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || a.path.localeCompare(b.path)) : [];
    let bytes = 0;
    entries.forEach((item, i) => { bytes += item.stat.size; if (i >= 256 || bytes > 64 * 1024 * 1024) add(item.path, 'test-cache-budget', null); });
  }
  return { schemaVersion: 1, root, scope, policy: { matchedRollbacks: 1, officialRollbacks: 1, testRuns: 10, additionalFailedRuns: 5, cacheEntries: 256, cacheBytes: 64 * 1024 * 1024 }, candidates, retained, warnings, reclaimableBytes: candidates.reduce((n, c) => n + c.bytes, 0) };
}
export function cleanupRuntimeArtifacts({ root, apply = false, scope = 'all', keepRunId }) {
  const plan = planRuntimeCleanup(root, { scope, keepRunId }), removed = [], errors = [];
  if (apply) for (const candidate of plan.candidates) {
    try {
      assertIdle(root);
      if (candidate.guard && digest(readFileSync(safe(root, candidate.guard.path))) !== candidate.guard.digest) fail('CLEANUP_CHANGED', 'Artifact receipt changed during cleanup.');
      if (tree(root, candidate.path).fingerprint !== candidate.fingerprint) fail('CLEANUP_CHANGED', 'Artifact changed during cleanup.');
      if (candidate.reason.includes('rollback') || candidate.reason === 'superseded-prepared-switch') {
        if (sourceProtection(root)(candidate.path).length) fail('CLEANUP_SOURCE_UNPROTECTED', 'Source preservation changed; retain this artifact for review.');
      }
      // Mark the loss of rollback material before removal. An interrupted prune
      // remains explicit; it can never be mistaken for a complete backup.
      if (candidate.reason.includes('rollback') || candidate.reason === 'superseded-prepared-switch') {
        const folder = candidate.guard.path.slice(0, candidate.guard.path.lastIndexOf('/'));
        writeAtomic(safe(root, `${folder}/retention.json`), JSON.stringify({ schemaVersion: 1, materialRetired: true, rollbackRetired: candidate.reason.includes('rollback'), at: new Date().toISOString(), reason: candidate.reason }) + '\n', 0o600);
      }
      rmSync(safe(root, candidate.path), { recursive: true, force: false }); removed.push(candidate.path);
    } catch (error) { errors.push({ path: candidate.path, code: error.code ?? 'CLEANUP_FAILED', message: error.message }); }
  }
  return { ...plan, apply, removed, errors, changed: removed.length > 0, reclaimedBytes: plan.candidates.filter(c => removed.includes(c.path)).reduce((n, c) => n + c.bytes, 0) };
}
export function retainRuntimeArtifacts(root, scope = 'all', options = {}) {
  try { return cleanupRuntimeArtifacts({ root, apply: true, scope, ...options }); }
  catch (error) { return { changed: false, errors: [{ code: error.code ?? 'CLEANUP_FAILED', message: error.message }] }; }
}
