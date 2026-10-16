import { constants, existsSync, lstatSync, mkdirSync, openSync, closeSync, fstatSync, readFileSync,
  writeFileSync, fsyncSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { userDataRoot, namespaces, definition, validateDocument, encode, fail } from './schema.js';

const maximum = 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function safePath(root, relative, { createParents = false } = {}) {
  let current = resolve(root);
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part === '.' || part === '..' || /[\\:\x00-\x1f]/.test(part)) fail('USER_DATA_PATH_INVALID', 'Invalid managed path.');
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (createParents && i < parts.length - 1) {
        try { mkdirSync(current); } catch (created) { if (created.code !== 'EEXIST') throw created; }
        stat = lstatSync(current);
      }
      else continue;
    }
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isDirectory() && !stat.isFile())) {
      fail('USER_DATA_PATH_INVALID', 'System user-data paths must use ordinary files and directories.', { target: relative });
    }
  }
  return current;
}
function identity(a, b) { return ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode'].every(key => a[key] === b[key]); }
export function snapshot(root, namespace) {
  definition(namespace);
  const path = `${userDataRoot}/${namespace}.json`, target = safePath(root, path);
  let entry;
  try { entry = lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return { path, target, state: 'missing', etag: 'missing', document: null }; throw error; }
  if (!entry.isFile() || entry.size > maximum) fail('USER_DATA_INVALID', 'Expected a JSON file no larger than 1 MiB.', { namespace, target: path });
  let fd;
  try {
    fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd);
    if (!identity(entry, before)) fail('USER_DATA_CONFLICT', 'User data changed while opening.', { namespace });
    const bytes = readFileSync(fd), after = fstatSync(fd);
    if (!identity(before, after) || bytes.length > maximum) fail('USER_DATA_CONFLICT', 'User data changed while reading.', { namespace });
    let document;
    try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')); }
    catch { fail('USER_DATA_INVALID', 'Invalid UTF-8 JSON; the original file was preserved.', { namespace, target: path }); }
    validateDocument(namespace, document);
    return { path, target, state: 'present', etag: hash(bytes), document, stat: after };
  } finally { if (fd !== undefined) closeSync(fd); }
}
export function unknownEntries(root) {
  const path = safePath(root, userDataRoot);
  if (!existsSync(path)) return [];
  if (!lstatSync(path).isDirectory()) fail('USER_DATA_PATH_INVALID', 'user-data must be an ordinary directory.');
  return readdirSync(path).filter(name => name !== '.gitkeep' && !Object.keys(namespaces).some(namespace => name === `${namespace}.json`));
}
export function withLock(root, namespace, action) {
  const path = safePath(root, `.agents/runtime-data/user-data/${namespace}.lock`, { createParents: true });
  let fd;
  try {
    try { fd = openSync(path, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') fail('USER_DATA_LOCKED', 'A local writer holds this namespace lock; inspect stale locks before retrying.', { namespace }); throw error; }
    writeFileSync(fd, JSON.stringify({ pid: process.pid, namespace }) + '\n');
    return action();
  } finally {
    if (fd !== undefined) {
      const owned = fstatSync(fd); closeSync(fd);
      try {
        const current = lstatSync(path);
        if (current.dev === owned.dev && current.ino === owned.ino) unlinkSync(path);
        else process.stderr.write('USER_DATA_LOCK_CLEANUP: Replaced lock was preserved.\n');
      } catch (error) { if (error.code !== 'ENOENT') process.stderr.write('USER_DATA_LOCK_CLEANUP: Inspect the remaining local lock.\n'); }
    }
  }
}
export function expect(snapshot, ifMatch) {
  if (ifMatch !== 'missing' && (typeof ifMatch !== 'string' || !/^[a-f0-9]{64}$/.test(ifMatch))) fail('INVALID_ARGUMENTS', 'Supply --if-match missing or the exact etag returned by read.', {}, 2);
  if (snapshot.etag !== ifMatch) fail('USER_DATA_CONFLICT', 'User data differs from the expected version; read and reconcile before retrying.', { namespace: snapshot.document?.namespace, expected: ifMatch, actual: snapshot.etag });
}
export function publish(root, namespace, before, document, { beforePublish } = {}) {
  const bytes = document === null ? null : Buffer.from(encode(validateDocument(namespace, document)));
  if (bytes && bytes.length > maximum) fail('USER_DATA_INVALID', 'User data exceeds 1 MiB.');
  const target = safePath(root, before.path, { createParents: document !== null });
  let temporary, fd;
  try {
    if (bytes) {
      temporary = `${target}.${randomUUID()}.tmp`;
      fd = openSync(temporary, 'wx', before.stat ? before.stat.mode & 0o777 : 0o600);
      writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    }
    beforePublish?.();
    const current = snapshot(root, namespace);
    if (current.etag !== before.etag || (before.stat && !identity(before.stat, current.stat ?? {}))) fail('USER_DATA_CONFLICT', 'User data changed before publication; the current file was preserved.', { namespace });
    if (document === null) unlinkSync(target); else renameSync(temporary, target);
    return bytes ? hash(bytes) : 'missing';
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (temporary) try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') process.stderr.write('USER_DATA_TEMP_CLEANUP: Inspect the local temporary file.\n'); }
  }
}
