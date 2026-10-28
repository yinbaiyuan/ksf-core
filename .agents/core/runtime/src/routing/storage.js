import { replaceFileSync as renameSync } from '../platform/index.js';
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { readFileSnapshot, sameIdentity, withExclusiveLock, withTemporaryFile } from '../shared/files.js';
import { sha256 } from '../shared/hash.js';
import { ROUTE_DIRECTORY, RECORD_LIMIT, fail, isKey, plain, text, keys, invalid, validateRecord, encode } from './schema.js';

export function managedPath(root, path, create = false) {
  let current = realpathSync(root);
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i] || parts[i] === '.' || parts[i] === '..' || /[\\:\x00-\x1f]/.test(parts[i])) fail('ROUTE_PATH_INVALID', 'Invalid routing path.');
    current = join(current, parts[i]);
    let entry;
    try { entry = lstatSync(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create || i === parts.length - 1) continue;
      try { mkdirSync(current, { mode: 0o700 }); } catch (created) { if (created.code !== 'EEXIST') throw created; }
      entry = lstatSync(current);
    }
    if (entry.isSymbolicLink() || (i < parts.length - 1 ? !entry.isDirectory() : !entry.isFile() && !entry.isDirectory())) fail('ROUTE_PATH_INVALID', 'Routing paths must use ordinary files and directories.');
  }
  return current;
}
function bytes(root, path, maximum) {
  const target = managedPath(root, path);
  let entry;
  try { entry = lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!entry.isFile() || entry.size > maximum) fail('ROUTE_RECORD_INVALID', 'Expected a bounded ordinary routing file.');
  return readFileSnapshot(target, { entry,
    validateOpen(a, b) { if (!sameIdentity(a, b)) fail('ROUTE_CONFLICT', 'Routing data changed while opening.'); },
    validateRead(a, b, value) { if (!sameIdentity(a, b) || value.length > maximum) fail('ROUTE_CONFLICT', 'Routing data changed while reading.'); },
  }).bytes;
}
function secret(root, create) {
  const path = `${ROUTE_DIRECTORY}/identity.key`;
  let value = bytes(root, path, 32);
  if (!value) {
    const archive = managedPath(root, '档案/对话/Codex');
    const chats = managedPath(root, '.agents/user-data/chats');
    if (recordKeys(root).length || (existsSync(archive) && readdirSync(archive).some(isKey)) || (existsSync(chats) && readdirSync(chats).some(name => isKey(name) || name === 'config.json'))) fail('ROUTE_KEY_INVALID', 'Routing identity key is missing while routing, task or chat state remains; preserve the store.');
  }
  if (!value && create) {
    const target = managedPath(root, path, true);
    withTemporaryFile(`${target}.${randomUUID()}.tmp`, randomBytes(32), {}, temporary => {
      try { linkSync(temporary, target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    });
    value = bytes(root, path, 32);
  }
  if (value && value.length !== 32) fail('ROUTE_KEY_INVALID', 'Invalid local routing identity key; preserve it and existing records.');
  return value;
}
export function hostIdentity(input, env = process.env) {
  const identity = input ?? (env.CODEX_THREAD_ID ? { host: 'codex', sessionId: env.CODEX_THREAD_ID } : null);
  if (!plain(identity)) fail('ROUTE_IDENTITY_REQUIRED', 'Provide a native host/session identity through stdin or CODEX_THREAD_ID.');
  keys(identity, ['host', 'sessionId'], 'identity');
  if (!text(identity.host, 64) || !/^[a-z][a-z0-9-]*$/.test(identity.host) || !text(identity.sessionId, 1024)) invalid('Invalid host/session identity.');
  return identity;
}
export function sessionKey(root, identity, create = false) {
  const key = secret(root, create);
  return key ? createHmac('sha256', key).update(JSON.stringify([identity.host, identity.sessionId])).digest('hex') : null;
}
export function loadRecord(root, key) {
  if (!isKey(key)) invalid('Invalid session key.');
  const value = bytes(root, `${ROUTE_DIRECTORY}/${key}.json`, RECORD_LIMIT);
  if (!value) return { document: null, digest: null };
  let document;
  try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value)); }
  catch { fail('ROUTE_RECORD_INVALID', 'Invalid UTF-8 JSON routing record; preserve the original file.'); }
  return { document: validateRecord(document, key), digest: sha256(value) };
}
export function recordKeys(root) {
  const folder = managedPath(root, ROUTE_DIRECTORY);
  let entry;
  try { entry = lstatSync(folder); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  if (!entry.isDirectory()) fail('ROUTE_PATH_INVALID', 'Routing store must be a directory.');
  return readdirSync(folder).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort().map(name => name.slice(0, -5));
}
export function withRecordLock(root, key, action) {
  const target = managedPath(root, `${ROUTE_DIRECTORY}/${key}.lock`, true);
  return withExclusiveLock(target, { pid: process.pid, sessionKey: key }, action, {
    onLocked() { fail('ROUTE_LOCKED', 'Another writer holds the routing lock; inspect a stale lock before removing it.'); },
    onReplaced() { process.stderr.write('ROUTE_LOCK_CLEANUP: Replaced lock was preserved.\n'); },
  });
}
export function publishRecord(root, key, before, document, beforePublish) {
  validateRecord(document, key);
  const value = Buffer.from(encode(document) + '\n');
  if (value.length > RECORD_LIMIT) fail('ROUTE_CAPACITY', 'Routing record exceeds 4 MiB; preserve and inspect it.');
  const target = managedPath(root, `${ROUTE_DIRECTORY}/${key}.json`, true);
  withTemporaryFile(`${target}.${randomUUID()}.tmp`, value, {}, temporary => {
    beforePublish?.();
    if (loadRecord(root, key).digest !== before.digest) fail('ROUTE_CONFLICT', 'Routing data changed before publication; current data was preserved.');
    renameSync(temporary, target);
  });
}
