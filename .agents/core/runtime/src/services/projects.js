import { sha256 as sha } from '../shared/hash.js';
import { locations, publicProject, validateWrite, encodeProject, planProjectWrite, planProjectRemoval } from '../projects/plan.js';
import { withTemporaryFile } from '../shared/files.js';
import {
  lstatSync, readdirSync, mkdirSync, rmdirSync, unlinkSync, linkSync, renameSync, rmSync, realpathSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MetadataError, invalid } from '../metadata/errors.js';
import { readSnapshot, withWriteLock, publishFile } from '../metadata/files.js';
import { directory, stat, validName, validateName, guardPaths, load, withProjectLock, assertNoPending } from '../projects/storage.js';
import { projectTransition, recoverProjectTransition } from './project-transitions.js';
import { checkRouting } from '../projects/routing.js';

const fail = (code, message, details) => { throw new MetadataError(code, message, details); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

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

function list(root, check = false, projectScope = 'current') {
  const projects = [], errors = [];
  const { scope } = locations(root, '', projectScope);
  try {
    if (projectScope === 'archived' && stat(join(root, '档案'))) directory(join(root, '档案'));
    if (projectScope === 'archived' && !stat(scope)) return { data: { complete: true, ...(check ? { valid: true } : {}), projects }, errors };
    directory(scope);
    for (const name of readdirSync(scope).sort(compare)) {
      if (name.startsWith('.ksf-project-')) continue;
      const { folder, target } = locations(root, name, projectScope);
      try {
        const entry = lstatSync(folder);
        if (entry.isSymbolicLink()) fail('PROJECT_PATH_INVALID', 'Linked project directories are not supported.', { target: folder });
        if (!entry.isDirectory() || !stat(target)) continue;
        if (!validName(name)) fail('PROJECT_PATH_INVALID', 'Stored project name is not supported by project commands.', { target: folder });
        const { parsed } = load(root, name, { scope: projectScope });
        const checked = check ? checkProject(root, name, parsed, projectScope) : null;
        if (checked) errors.push(...checked.errors);
        projects.push(check ? checked.data : {
          name, scope: projectScope, title: titleOf(parsed, name), description: parsed.values.description ?? null,
          status: parsed.values.status ?? null, path: relative(root, target),
        });
      } catch (error) {
        if (check) projects.push({ name, scope: projectScope, path: relative(root, target), valid: false });
        errors.push(errorItem(error, folder));
      }
    }
  } catch (error) { errors.push(errorItem(error, scope)); }
  return { data: { complete: errors.length === 0, ...(check ? { valid: errors.length === 0 } : {}), projects }, errors };
}

function checkProject(root, name, parsed, scope = 'current') {
  const result = checkRouting({ root, name, values: parsed.values, scope });
  return { data: { name, scope, path: relative(root, locations(root, name, scope).target), valid: result.errors.length === 0,
    state: parsed.state, ...(result.routing ? { routing: result.routing } : {}) }, errors: result.errors };
}

export function errorItem(error, target) {
  if (error instanceof MetadataError) return { code: error.code, message: error.message, ...error.details };
  return { code: 'PROJECT_IO_FAILED', message: 'Cannot access project files.', ...(target ? { target } : {}) };
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
export function updateProjectMetadata({ root, name, scope = 'current', dryRun = false }, transform, hooks = {}) {
  validateName(name);
  if (!['current', 'archived'].includes(scope)) invalid('Invalid project scope.');
  if (typeof root !== 'string' || typeof dryRun !== 'boolean' || typeof transform !== 'function') invalid('Invalid project metadata update.');
  root = realpathSync(root);
  const execute = () => {
    assertNoPending(root);
    const current = load(root, name, { scope });
    const data = { metadata: transform(structuredClone(current.parsed.values)) };
    validateWrite(data, { previousMetadata: current.parsed.values, scope });
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

export function project({ root, operation, name, scope = 'current', part = 'all', data, reason, status, dryRun = false }, hooks = {}) {
  if (typeof root !== 'string' || !['list', 'read', 'write', 'remove', 'check', 'archive', 'restore', 'recover'].includes(operation) ||
      !['metadata', 'body', 'all'].includes(part) || typeof dryRun !== 'boolean') invalid('Invalid project service request.');
  if (!['current', 'archived', 'all'].includes(scope) || (scope === 'all' && !['list', 'check'].includes(operation))) invalid('Invalid project scope.');
  if (['archive', 'restore', 'recover'].includes(operation)) return operation === 'recover'
    ? recoverProjectTransition({ root, operationId: name, dryRun }, hooks)
    : projectTransition({ root, operation, name, reason, status, dryRun }, hooks);
  if (name !== undefined) validateName(name);
  if (operation === 'list' && name !== undefined) invalid('Project list does not accept a target.');
  if (!['list', 'check'].includes(operation) && name === undefined) invalid('A project name is required.');
  root = realpathSync(root);
  if (operation === 'list' || (operation === 'check' && name === undefined)) {
    const results = (scope === 'all' ? ['current', 'archived'] : [scope]).map(selected => list(root, operation === 'check', selected));
    const errors = results.flatMap(result => result.errors);
    return { data: { complete: !errors.length, ...(operation === 'check' ? { valid: !errors.length } : {}), projects: results.flatMap(result => result.data.projects) }, errors };
  }
  if (['read', 'check'].includes(operation)) {
    const current = load(root, name, { scope });
    return operation === 'read' ? { data: { project: publicProject(root, name, current.parsed, part, scope) }, errors: [] }
      : checkProject(root, name, current.parsed, scope);
  }
  if (operation === 'write') {
    validateWrite(data, { scope });
    const before = load(root, name, { optional: true, scope });
    if (!before.snapshot && (scope === 'archived' || stat(locations(root, name, 'archived').folder))) fail('PROJECT_ARCHIVED_EXISTS', 'Restore the existing archived project before creating a current project.', { target: before.target });
    if (!before.snapshot && !Object.hasOwn(data, 'body')) invalid('Creating a project requires body in the write input.');
    // Validate serialization before creating directories or acquiring a lock.
    encodeProject(before, data);
  }
  const execute = () => {
    assertNoPending(root);
    const current = load(root, name, { optional: true, scope });
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
    if (!current.snapshot && (scope === 'archived' || stat(locations(root, name, 'archived').folder))) fail('PROJECT_ARCHIVED_EXISTS', 'An archived project cannot be silently recreated.', { target: current.target });
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
