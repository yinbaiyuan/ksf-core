import { replaceFileSync as renameSync } from '../platform/index.js';
import { recordDefinition, objectDataDirectory, validateObjectDocument } from './records.js';
import { assertNoCooperationMigration } from '../migrations/guard.js';
import { sha256 as hash } from '../shared/hash.js';
import { readFileSnapshot, sameIdentity, withExclusiveLock, withTemporaryFile } from '../shared/files.js';
import { existsSync, lstatSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { userDataRoot, namespaces, encode, fail } from './schema.js';

const maximum = 1024 * 1024;

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
const identity = (a, b) => sameIdentity(a, b, ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode']);
export function snapshot(root, namespace, objectId) {
  const store = recordDefinition(namespace, objectId);
  return readRecord(root, store.path, store.identity, store.validateDocument);
}
function readRecord(root, path, details, validate) {
  const target = safePath(root, path);
  let entry;
  try { entry = lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return { path, target, ...(details.objectId !== undefined ? { objectId: details.objectId } : {}), state: 'missing', etag: 'missing', document: null }; throw error; }
  if (!entry.isFile() || entry.size > maximum) fail('USER_DATA_INVALID', 'Expected a JSON file no larger than 1 MiB.', { ...details, target: path });
  const { bytes, stat: after } = readFileSnapshot(target, { entry,
    validateOpen(entry, before) {
      if (!identity(entry, before)) fail('USER_DATA_CONFLICT', 'User data changed while opening.', details);
    },
    validateRead(before, after, bytes) {
      if (!identity(before, after) || bytes.length > maximum) fail('USER_DATA_CONFLICT', 'User data changed while reading.', details);
    },
  });
  let document;
  try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')); }
  catch { fail('USER_DATA_INVALID', 'Invalid UTF-8 JSON; the original file was preserved.', { ...details, target: path }); }
  validate(document);
  return { path, target, ...(details.objectId !== undefined ? { objectId: details.objectId } : {}), state: 'present', etag: hash(bytes), document, stat: after };
}

export function unknownEntries(root) {
  const path = safePath(root, userDataRoot);
  if (!existsSync(path)) return [];
  if (!lstatSync(path).isDirectory()) fail('USER_DATA_PATH_INVALID', 'user-data must be an ordinary directory.');
  objectEntries(root); // Validate the reserved directory, without reading its records.
  const chats = safePath(root, `${userDataRoot}/chats`);
  if (existsSync(chats) && !lstatSync(chats).isDirectory()) fail('USER_DATA_PATH_INVALID', 'chats must be an ordinary directory.');
  return readdirSync(path).filter(name => name !== '.gitkeep' && name !== 'abilities' && name !== 'chats' && !Object.keys(namespaces).some(namespace => name === `${namespace}.json`));
}
export function withLock(root, namespace, action, objectId) {
  assertNoCooperationMigration(root);
  const store = recordDefinition(namespace, objectId), details = store.identity;
  const path = safePath(root, `.agents/runtime-data/user-data/${store.lockName}.lock`, { createParents: true });
  return withExclusiveLock(path, { pid: process.pid, ...details }, () => { assertNoCooperationMigration(root); return action(); }, {
    onLocked() { fail('USER_DATA_LOCKED', 'A local writer holds this namespace lock; inspect stale locks before retrying.', details); },
    onReplaced() { process.stderr.write('USER_DATA_LOCK_CLEANUP: Replaced lock was preserved.\n'); },
    onCleanup() { process.stderr.write('USER_DATA_LOCK_CLEANUP: Inspect the remaining local lock.\n'); },
  });
}
export function expect(snapshot, ifMatch) {
  if (ifMatch !== 'missing' && (typeof ifMatch !== 'string' || !/^[a-f0-9]{64}$/.test(ifMatch))) fail('INVALID_ARGUMENTS', 'Supply --if-match missing or the exact etag returned by read.', {}, 2);
  if (snapshot.etag !== ifMatch) fail('USER_DATA_CONFLICT', 'User data differs from the expected version; read and reconcile before retrying.', { ...(snapshot.objectId !== undefined ? { objectId: snapshot.objectId } : { namespace: snapshot.document?.namespace }), expected: ifMatch, actual: snapshot.etag });
}
export function publish(root, namespace, before, document, { beforePublish, objectId } = {}) {
  const store = recordDefinition(namespace, objectId), details = store.identity;
  const bytes = document === null ? null : Buffer.from(encode(store.validateDocument(document)));
  if (bytes && bytes.length > maximum) fail('USER_DATA_INVALID', 'User data exceeds 1 MiB.');
  const target = safePath(root, before.path, { createParents: document !== null });
  const commit = temporary => {
    beforePublish?.();
    const current = snapshot(root, namespace, objectId);
    if (current.etag !== before.etag || (before.stat && !identity(before.stat, current.stat ?? {}))) fail('USER_DATA_CONFLICT', 'User data changed before publication; the current file was preserved.', details);
    if (document === null) unlinkSync(target); else renameSync(temporary, target);
    return bytes ? hash(bytes) : 'missing';
  };
  if (!bytes) return commit();
  const temporary = `${target}.${randomUUID()}.tmp`;
  return withTemporaryFile(temporary, bytes, { mode: before.stat ? before.stat.mode & 0o777 : 0o600, cleanup(path) {
    try { unlinkSync(path); }
    catch (error) { if (error.code !== 'ENOENT') process.stderr.write('USER_DATA_TEMP_CLEANUP: Inspect the local temporary file.\n'); }
  } }, commit);
}

export function objectEntries(root) {
  const path = safePath(root, objectDataDirectory);
  if (!existsSync(path)) return [];
  if (!lstatSync(path).isDirectory()) fail('USER_DATA_PATH_INVALID', 'abilities must be an ordinary directory.', { target: objectDataDirectory });
  return readdirSync(path).sort();
}
export function readObjectEntry(root, name) {
  if (!/^[a-f0-9]{64}\.json$/.test(name)) fail('USER_DATA_UNKNOWN_ENTRY', 'Unrecognized object data entry; preserve and inspect it.', { target: `${objectDataDirectory}/${name}` });
  const path = `${objectDataDirectory}/${name}`;
  return readRecord(root, path, {}, document => {
    validateObjectDocument(document);
    if (recordDefinition(undefined, document.object_id).path !== path) fail('USER_DATA_INVALID', 'Object data filename does not match its identity.', { target: path });
  });
}
