import { sha256 as sha } from '../shared/hash.js';
import { locations, publicProject, validateWrite, encodeProject, planProjectWrite, planProjectRemoval } from '../projects/plan.js';
import { withExclusiveLock, withTemporaryFile } from '../shared/files.js';
import {
  lstatSync, readdirSync, mkdirSync, rmdirSync, unlinkSync, linkSync, renameSync, rmSync, realpathSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MetadataError, invalid } from '../metadata/errors.js';
import { readSnapshot, withWriteLock, publishFile } from '../metadata/files.js';
import { parseFrontmatter } from '../metadata/frontmatter.js';

const fail = (code, message, details) => { throw new MetadataError(code, message, details); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function stat(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function directory(path, { missing = false, create = false } = {}) {
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

function validName(name) {
  return typeof name === 'string' && !!name.trim() && !['.', '..'].includes(name) &&
    !/[/\\\x00-\x1f\x7f]/.test(name) && !name.startsWith('.ksf-project-');
}

function validateName(name) {
  if (!validName(name)) {
    invalid('Project target must be one directory name, not a path; .ksf-project- is reserved.');
  }
}

function guardPaths(scope, folder) {
  const paths = [scope, folder].map(path => ({ path, entry: directory(path) }));
  return () => {
    for (const { path, entry } of paths) {
      const current = directory(path, { missing: true });
      if (!current || current.dev !== entry.dev || current.ino !== entry.ino) {
        fail('PROJECT_CONFLICT', 'Project path changed during the operation.', { target: path });
      }
    }
  };
}

function load(root, name, { optional = false } = {}) {
  const paths = locations(root, name);
  const scope = directory(paths.scope, { missing: optional });
  const folder = scope && directory(paths.folder, { missing: true });
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

function titleOf(parsed, fallback) {
  if (typeof parsed.values.name === 'string' && parsed.values.name.trim()) return parsed.values.name;
  let fence = null;
  for (const line of parsed.body.toString('utf8').split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (!fence) {
      const heading = /^ {0,3}#\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
      if (heading) return heading[1];
    }
  }
  return fallback;
}

function list(root, check = false) {
  const projects = [], errors = [];
  const scope = join(root, '项目');
  try {
    directory(scope);
    for (const name of readdirSync(scope).sort(compare)) {
      if (name.startsWith('.ksf-project-')) continue;
      const { folder, target } = locations(root, name);
      try {
        const entry = lstatSync(folder);
        if (entry.isSymbolicLink()) fail('PROJECT_PATH_INVALID', 'Linked project directories are not supported.', { target: folder });
        if (!entry.isDirectory() || !stat(target)) continue;
        if (!validName(name)) fail('PROJECT_PATH_INVALID', 'Stored project name is not supported by project commands.', { target: folder });
        const { parsed } = load(root, name);
        projects.push(check ? { name, path: relative(root, target), valid: true, state: parsed.state } : {
          name, title: titleOf(parsed, name), description: parsed.values.description ?? null,
          status: parsed.values.status ?? null, path: relative(root, target),
        });
      } catch (error) {
        if (check) projects.push({ name, path: relative(root, target), valid: false });
        errors.push(errorItem(error, folder));
      }
    }
  } catch (error) { errors.push(errorItem(error, scope)); }
  return { data: { complete: errors.length === 0, ...(check ? { valid: errors.length === 0 } : {}), projects }, errors };
}

export function errorItem(error, target) {
  if (error instanceof MetadataError) return { code: error.code, message: error.message, ...error.details };
  return { code: 'PROJECT_IO_FAILED', message: 'Cannot access project files.', ...(target ? { target } : {}) };
}

function withProjectLock(root, action) {
  directory(join(root, '.agents'), { create: true });
  const runtime = join(root, '.agents/runtime-data');
  directory(runtime, { create: true });
  const locks = join(runtime, 'projects');
  directory(locks, { create: true });
  const lock = join(locks, 'write.lock');
  return withExclusiveLock(lock, { pid: process.pid }, () => action(), {
    onLocked() { fail('PROJECT_LOCKED', 'Project write lock exists; inspect its owner before retrying.', { target: lock }); },
    onReplaced() { process.stderr.write('PROJECT_LOCK_CLEANUP: Replaced lock left untouched.\n'); },
    onCleanup() { process.stderr.write('PROJECT_LOCK_CLEANUP: Inspect remaining write lock.\n'); },
  });
}

function publishNew(current, bytes, beforeCheck) {
  const temporary = join(current.folder, `.ksf-project-writing-${randomUUID()}`);
  return withTemporaryFile(temporary, bytes, { mode: 0o644, cleanup(path) {
    try { unlinkSync(path); }
    catch (error) { if (error.code !== 'ENOENT') process.stderr.write('PROJECT_FILE_CLEANUP: Inspect remaining temporary root card.\n'); }
  } }, () => {
    beforeCheck?.(); current.guard();
    try { linkSync(temporary, current.target); }
    catch (error) {
      if (error.code === 'EEXIST') fail('PROJECT_CONFLICT', 'Project root card was created concurrently.', { target: current.target });
      throw error;
    }
  });
}

function tree(folder, exclude) {
  const entries = [];
  const visit = path => {
    const entry = lstatSync(path);
    if (path === exclude) return;
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      fail('PROJECT_RESOURCE_UNSUPPORTED', 'Removal supports ordinary files and directories only.', { target: path });
    }
    const name = relative(folder, path);
    if (name.split('/').some(segment => segment.startsWith('.ksf-metadata-') || segment.startsWith('.ksf-project-'))) {
      fail('PROJECT_RESOURCE_BUSY', 'Project contains a locked or temporary resource.', { target: path });
    }
    entries.push({ path: name, dev: entry.dev, ino: entry.ino, mode: entry.mode,
      ...(entry.isFile() ? { digest: sha(readSnapshot(path).bytes), mtime: entry.mtimeMs, ctime: entry.ctimeMs } : {}) });
    if (entry.isDirectory()) for (const child of readdirSync(path).sort(compare)) visit(join(path, child));
  };
  visit(folder);
  return { fingerprint: sha(JSON.stringify(entries)), entries: entries.map(entry => entry.path).filter(Boolean) };
}

// Read/transform/publish under the same project lock. Callers can update a
// metadata collection without losing another project's or metadata writer's work.
export function updateProjectMetadata({ root, name, dryRun = false }, transform, hooks = {}) {
  validateName(name);
  if (typeof root !== 'string' || typeof dryRun !== 'boolean' || typeof transform !== 'function') invalid('Invalid project metadata update.');
  root = realpathSync(root);
  const execute = () => {
    const current = load(root, name);
    const data = { metadata: transform(structuredClone(current.parsed.values)) };
    validateWrite(data);
    const { result, bytes, wouldChange } = planProjectWrite(current, { root, name, data, dryRun }, { metadataOnly: true });
    if (!dryRun && wouldChange) {
      withWriteLock(current.target, () => (hooks.publish ?? publishFile)(current.snapshot, bytes, {
        beforeCheck: () => { hooks.beforeCheck?.(); current.guard(); },
      }));
      result.changed = true;
    }
    return result;
  };
  return dryRun ? execute() : withProjectLock(root, execute);
}

export function project({ root, operation, name, part = 'all', data, dryRun = false }, hooks = {}) {
  if (typeof root !== 'string' || !['list', 'read', 'write', 'remove', 'check'].includes(operation) ||
      !['metadata', 'body', 'all'].includes(part) || typeof dryRun !== 'boolean') invalid('Invalid project service request.');
  if (name !== undefined) validateName(name);
  if (operation === 'list' && name !== undefined) invalid('Project list does not accept a target.');
  if (!['list', 'check'].includes(operation) && name === undefined) invalid('A project name is required.');
  root = realpathSync(root);
  if (operation === 'list' || (operation === 'check' && name === undefined)) return list(root, operation === 'check');
  if (['read', 'check'].includes(operation)) {
    const current = load(root, name);
    return { data: operation === 'read' ? { project: publicProject(root, name, current.parsed, part) }
      : { name, path: relative(root, current.target), valid: true, state: current.parsed.state }, errors: [] };
  }
  if (operation === 'write') {
    validateWrite(data);
    const before = load(root, name, { optional: true });
    if (!before.snapshot && !Object.hasOwn(data, 'body')) invalid('Creating a project requires body in the write input.');
    // Validate serialization before creating directories or acquiring a lock.
    encodeProject(before, data);
  }
  const execute = () => {
    const current = load(root, name, { optional: true });
    if (operation === 'remove') {
      const result = planProjectRemoval(current, { root, name, dryRun });
      if (!current.snapshot) return { data: result, errors: [] };
      const remove = exclude => {
        const baseline = tree(current.folder, exclude);
        result.entries = baseline.entries;
        if (!dryRun) commitProjectRemoval(current, baseline, exclude, result, hooks);
        return { data: result, errors: [] };
      };
      return dryRun ? remove() : withWriteLock(current.target, ({ lock }) => remove(lock));
    }
    if (!current.snapshot && !Object.hasOwn(data, 'body')) invalid('Creating a project requires body in the write input.');
    const { result, bytes, wouldChange } = planProjectWrite(current, { root, name, data, dryRun });
    if (dryRun || !wouldChange) return { data: result, errors: [] };
    commitProjectWrite(current, bytes, hooks);
    Object.assign(result, { changed: true, created: !current.snapshot });
    return { data: result, errors: [] };
  };
  return dryRun ? execute() : withProjectLock(root, execute);
}

function commitProjectWrite(current, bytes, hooks) {
  directory(current.scope, { create: true });
  const createdDirectory = !directory(current.folder, { missing: true });
  if (createdDirectory) mkdirSync(current.folder);
  const ownDirectory = createdDirectory ? lstatSync(current.folder) : null;
  current.guard = guardPaths(current.scope, current.folder);
  try {
    withWriteLock(current.target, () => {
      if (current.snapshot) {
        (hooks.publish ?? publishFile)(current.snapshot, bytes, { beforeCheck: () => {
          hooks.beforeCheck?.(); current.guard();
        } });
      } else publishNew(current, bytes, hooks.beforeCheck);
    });
  } catch (error) {
    if (ownDirectory) {
      try {
        const latest = lstatSync(current.folder);
        if (latest.dev === ownDirectory.dev && latest.ino === ownDirectory.ino) rmdirSync(current.folder);
      } catch { /* Preserve concurrent contents and replacement directories. */ }
    }
    throw error;
  }
}

function commitProjectRemoval(current, baseline, exclude, result, hooks) {
  hooks.beforeCheck?.(); current.guard();
  if (tree(current.folder, exclude).fingerprint !== baseline.fingerprint) {
    fail('PROJECT_CONFLICT', 'Project resources changed before removal.', { target: current.folder });
  }
  const recoveryPath = join(current.scope, `.ksf-project-deleting-${randomUUID()}`);
  renameSync(current.folder, recoveryPath);
  Object.assign(result, { changed: true, removed: true });
  try { (hooks.cleanup ?? rmSync)(recoveryPath, { recursive: true, force: false }); }
  catch {
    fail('PROJECT_CLEANUP_FAILED', 'Project was detached but cleanup failed; inspect the recovery path.', {
      data: { ...result, recoveryPath }, target: current.folder,
    });
  }
}
