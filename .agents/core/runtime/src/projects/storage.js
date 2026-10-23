import { lstatSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { locations } from './plan.js';
import { MetadataError, invalid } from '../metadata/errors.js';
import { readSnapshot } from '../metadata/files.js';
import { parseFrontmatter } from '../metadata/frontmatter.js';
import { withExclusiveLock } from '../shared/files.js';
const fail = (code, message, details) => { throw new MetadataError(code, message, details); };
export function assertNoPending(root) {
  const path = join(root, '.agents/runtime-data/projects/pending.json');
  if (stat(path)) fail('PROJECT_TRANSITION_PENDING', 'Recover the pending project transition before another mutation.', { target: path });
}
export function stat(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function directory(path, { missing = false, create = false } = {}) {
  let entry = stat(path);
  if (!entry && create) {
    try { mkdirSync(path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    entry = lstatSync(path);
  }
  if (!entry && missing) return null;
  if (!entry) fail('PROJECT_DIRECTORY_MISSING', 'Project directory does not exist.', { target: path });
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    fail('PROJECT_PATH_INVALID', 'Managed paths must be ordinary directories.', { target: path });
  }
  return entry;
}

export function validName(name) {
  return typeof name === 'string' && !!name.trim() && !['.', '..'].includes(name) &&
    !/[/\\\x00-\x1f\x7f]/.test(name) && !name.startsWith('.ksf-project-');
}

export function validateName(name) {
  if (!validName(name)) {
    invalid('Project target must be one directory name, not a path; .ksf-project- is reserved.');
  }
}

export function guardPaths(scope, folder) {
  const paths = [...new Set([...(scope.endsWith('/档案/项目') ? [join(scope, '..')] : []), scope, folder])].map(path => ({ path, entry: directory(path) }));
  return () => {
    for (const { path, entry } of paths) {
      const current = directory(path, { missing: true });
      if (!current || current.dev !== entry.dev || current.ino !== entry.ino) {
        fail('PROJECT_CONFLICT', 'Project path changed during the operation.', { target: path });
      }
    }
  };
}

export function load(root, name, { optional = false, scope = 'current' } = {}) {
  const paths = locations(root, name, scope);
  if (scope === 'archived' && stat(join(root, '档案'))) directory(join(root, '档案'));
  const scopeEntry = directory(paths.scope, { missing: optional });
  const folder = scopeEntry && directory(paths.folder, { missing: true });
  if (!folder || !stat(paths.target)) {
    if (optional) return { ...paths, snapshot: null };
    fail('PROJECT_NOT_FOUND', 'Project root card does not exist.', { target: paths.target });
  }
  const guard = guardPaths(paths.scope, paths.folder);
  const snapshot = readSnapshot(paths.target);
  const parsed = parseFrontmatter(snapshot.bytes, paths.target);
  guard();
  return { ...paths, snapshot, parsed, guard };
}

export function withProjectLock(root, action, { allowPending = false, recoverStale = false } = {}) {
  directory(join(root, '.agents'), { create: true });
  const runtime = join(root, '.agents/runtime-data');
  directory(runtime, { create: true });
  const locks = join(runtime, 'projects');
  directory(locks, { create: true });
  const lock = join(locks, 'write.lock');
  if (recoverStale && stat(lock)) {
    const before = lstatSync(lock), owner = JSON.parse(readSnapshot(lock).bytes.toString('utf8'));
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) fail('PROJECT_LOCKED', 'Invalid project lock owner.', { target: lock });
    try { process.kill(owner.pid, 0); fail('PROJECT_LOCKED', 'Project lock owner is still running.', { target: lock }); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    const after = lstatSync(lock);
    if (before.dev !== after.dev || before.ino !== after.ino) fail('PROJECT_CONFLICT', 'Project lock changed.', { target: lock });
    unlinkSync(lock);
  }
  if (!allowPending) assertNoPending(root);
  return withExclusiveLock(lock, { pid: process.pid }, () => action(), {
    onLocked() { fail('PROJECT_LOCKED', 'Project write lock exists; inspect its owner before retrying.', { target: lock }); },
    onReplaced() { process.stderr.write('PROJECT_LOCK_CLEANUP: Replaced lock left untouched.\n'); },
    onCleanup() { process.stderr.write('PROJECT_LOCK_CLEANUP: Inspect remaining write lock.\n'); },
  });
}
