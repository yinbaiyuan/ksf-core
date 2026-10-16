import {
  lstatSync, readdirSync, mkdirSync, rmdirSync, openSync, closeSync, writeFileSync,
  fstatSync, fsyncSync, unlinkSync, linkSync, renameSync, rmSync, realpathSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MetadataError, invalid } from '../metadata/errors.js';
import { readSnapshot, withWriteLock, publishFile } from '../metadata/files.js';
import { parseFrontmatter, createFrontmatter, encodeFrontmatter, setField } from '../metadata/frontmatter.js';
import { validateInput, equalValues } from './metadata.js';

const fail = (code, message, details) => { throw new MetadataError(code, message, details); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
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

function locations(root, name) {
  const scope = join(root, '项目');
  return { scope, folder: join(scope, name), target: join(scope, name, 'project.md') };
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

function publicProject(root, name, parsed, part = 'all') {
  const { folder, target } = locations(root, name);
  return {
    name, path: relative(root, target), directory: relative(root, folder), state: parsed.state,
    ...(part !== 'body' ? { metadata: parsed.values } : {}),
    ...(part !== 'metadata' ? { body: parsed.body.toString('utf8') } : {}),
  };
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

function validateWrite(data) {
  validateInput(data);
  if (!Object.keys(data).length || Object.keys(data).some(key => !['metadata', 'body'].includes(key))) {
    invalid('Project write accepts metadata and/or body only.');
  }
  if (Object.hasOwn(data, 'metadata')) validateInput(data.metadata);
  if (Object.hasOwn(data, 'body') && typeof data.body !== 'string') invalid('Project body must be a string.');
}

function encode(current, input) {
  let parsed = current.parsed ?? parseFrontmatter(Buffer.alloc(0), current.target);
  const expected = Object.fromEntries(Object.entries(parsed.values));
  const fields = Object.keys(input.metadata ?? {}).filter(key =>
    !Object.hasOwn(expected, key) || !equalValues(expected[key], input.metadata[key]));
  const bodyChanged = Object.hasOwn(input, 'body') && input.body !== parsed.body.toString('utf8');
  const body = bodyChanged ? Buffer.from(input.body) : parsed.body;
  let bytes;
  if (fields.length) {
    if (parsed.state === 'absent') parsed = createFrontmatter(parsed);
    for (const field of fields) {
      setField(parsed.doc, field, input.metadata[field]);
      Object.defineProperty(expected, field, { value: input.metadata[field], enumerable: true, configurable: true, writable: true });
    }
    bytes = encodeFrontmatter({ ...parsed, body });
  } else {
    const prefix = parsed.bytes.subarray(0, parsed.bytes.length - parsed.body.length);
    bytes = Buffer.concat([prefix, body]);
  }
  const verified = parseFrontmatter(bytes, current.target);
  if (!equalValues(verified.values, expected) || !verified.body.equals(body) ||
      (Object.hasOwn(input, 'body') && verified.body.toString('utf8') !== input.body)) {
    fail('PROJECT_SERIALIZATION_FAILED', 'Root card did not preserve the requested metadata and body.', { target: current.target });
  }
  return { bytes, parsed: verified, changes: { metadata: fields, body: bodyChanged } };
}

function withProjectLock(root, action) {
  directory(join(root, '.agents'), { create: true });
  const runtime = join(root, '.agents/runtime-data');
  directory(runtime, { create: true });
  const locks = join(runtime, 'projects');
  directory(locks, { create: true });
  const lock = join(locks, 'write.lock');
  let fd;
  try {
    try { fd = openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') fail('PROJECT_LOCKED', 'Project write lock exists; inspect its owner before retrying.', { target: lock });
      throw error;
    }
    writeFileSync(fd, JSON.stringify({ pid: process.pid }) + '\n');
    return action();
  } finally {
    if (fd !== undefined) {
      const owner = fstatSync(fd); closeSync(fd);
      try {
        const current = lstatSync(lock);
        if (current.dev === owner.dev && current.ino === owner.ino) unlinkSync(lock);
        else process.stderr.write('PROJECT_LOCK_CLEANUP: Replaced lock left untouched.\n');
      } catch (error) { if (error.code !== 'ENOENT') process.stderr.write('PROJECT_LOCK_CLEANUP: Inspect remaining write lock.\n'); }
    }
  }
}

function publishNew(current, bytes, beforeCheck) {
  const temporary = join(current.folder, `.ksf-project-writing-${randomUUID()}`);
  let fd;
  try {
    fd = openSync(temporary, 'wx', 0o644);
    writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    beforeCheck?.(); current.guard();
    try { linkSync(temporary, current.target); }
    catch (error) {
      if (error.code === 'EEXIST') fail('PROJECT_CONFLICT', 'Project root card was created concurrently.', { target: current.target });
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); }
    catch (error) { if (error.code !== 'ENOENT') process.stderr.write('PROJECT_FILE_CLEANUP: Inspect remaining temporary root card.\n'); }
  }
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
    encode(before, data);
  }
  const execute = () => {
    const current = load(root, name, { optional: true });
    if (operation === 'remove') {
      const result = { name, path: relative(root, current.folder), dryRun, changed: false,
        wouldChange: !!current.snapshot, removed: false, entries: [] };
      if (!current.snapshot) return { data: result, errors: [] };
      const remove = exclude => {
        const baseline = tree(current.folder, exclude);
        result.entries = baseline.entries;
        if (!dryRun) {
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
        return { data: result, errors: [] };
      };
      return dryRun ? remove() : withWriteLock(current.target, ({ lock }) => remove(lock));
    }
    if (!current.snapshot && !Object.hasOwn(data, 'body')) invalid('Creating a project requires body in the write input.');
    const encoded = encode(current, data);
    const wouldChange = !current.snapshot || !encoded.bytes.equals(current.snapshot.bytes);
    const result = { name, path: relative(root, current.target), dryRun, changed: false, wouldChange,
      created: false, wouldCreate: !current.snapshot, changes: encoded.changes,
      project: publicProject(root, name, encoded.parsed) };
    if (dryRun || !wouldChange) return { data: result, errors: [] };
    directory(current.scope, { create: true });
    const createdDirectory = !directory(current.folder, { missing: true });
    if (createdDirectory) mkdirSync(current.folder);
    const ownDirectory = createdDirectory ? lstatSync(current.folder) : null;
    current.guard = guardPaths(current.scope, current.folder);
    try {
      withWriteLock(current.target, () => {
        if (current.snapshot) {
          (hooks.publish ?? publishFile)(current.snapshot, encoded.bytes, { beforeCheck: () => {
            hooks.beforeCheck?.(); current.guard();
          } });
        } else publishNew(current, encoded.bytes, hooks.beforeCheck);
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
    Object.assign(result, { changed: true, created: !current.snapshot });
    return { data: result, errors: [] };
  };
  return dryRun ? execute() : withProjectLock(root, execute);
}
