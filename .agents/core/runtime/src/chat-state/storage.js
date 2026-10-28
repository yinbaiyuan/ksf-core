import { replaceFileSync as renameSync } from '../platform/index.js';
import { lstatSync, opendirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { safePath } from '../user-data/storage.js';
import { readFileSnapshot, sameIdentity, withExclusiveLock, withTemporaryFile } from '../shared/files.js';
import { sha256 } from '../shared/hash.js';
import { validateJSONMapping } from '../shared/json.js';
import { validId, parseReference } from '../objects/schema.js';
import { currentObjectId } from '../objects/legacy.js';
import { assertNoCooperationMigration } from '../migrations/guard.js';
import { isToken, isKey } from '../routing/schema.js';

export const DIRECTORY = '.agents/user-data/chats';
export const CONFIG = `${DIRECTORY}/config.json`;
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export function fail(code, message, exitCode = 1) { throw Object.assign(new Error(message), { code, exitCode }); }
export const invalid = message => fail('INVALID_ARGUMENTS', message, 2);
const sorted = value => Array.isArray(value) ? value.map(sorted) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const encode = value => JSON.stringify(sorted(value)) + '\n';
export function values(value) { return validateJSONMapping(value, () => invalid('Variables must be a JSON mapping with finite safe numbers.')); }
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const fields = (value, names) => plain(value) && Object.keys(value).every(key => names.includes(key));
const ids = value => Array.isArray(value) && value.every(isToken) && new Set(value).size === value.length;
export function location(chatId, objectId) {
  if (!isKey(chatId)) invalid('Invalid chat identity.');
  if (objectId !== undefined) { if (currentObjectId(objectId) !== objectId) parseReference(objectId); if (!validId(objectId)) invalid('Supply a full capability ID without @version.'); }
  return `${DIRECTORY}/${chatId}/${objectId === undefined ? 'shared.json' : `abilities/${sha256(objectId)}.json`}`;
}
export const turnsPath = chatId => { location(chatId); return `${DIRECTORY}/${chatId}/turns.json`; };
export function validate(document, kind, chatId, objectId) {
  if (!plain(document)) fail('CHAT_DATA_INVALID', 'Invalid chat document; preserve the original.');
  if (document.schemaVersion !== 1) fail('CHAT_VERSION_UNSUPPORTED', 'Unsupported chat format; preserve the original.');
  if (kind === 'config') {
    if (!fields(document, ['schemaVersion', 'kind', 'enabled', 'activatedAt']) || document.kind !== kind || typeof document.enabled !== 'boolean' || !date(document.activatedAt)) fail('CHAT_DATA_INVALID', 'Invalid chat configuration.');
    return document;
  }
  if (document.kind !== kind || document.chatId !== chatId || !Number.isSafeInteger(document.revision) || document.revision < 1) fail('CHAT_DATA_INVALID', 'Invalid chat identity or revision.');
  if (kind === 'turns') {
    if (!fields(document, ['schemaVersion', 'kind', 'chatId', 'revision', 'host', 'countingSince', 'turnIds']) || document.host !== 'codex' || !date(document.countingSince) || !ids(document.turnIds) || !document.turnIds.length) fail('CHAT_DATA_INVALID', 'Invalid native turn ledger.');
  } else {
    if (!fields(document, ['schemaVersion', 'kind', 'chatId', 'revision', 'objectId', 'runId', 'turnIds', 'values']) || document.objectId !== (objectId ?? null) || !ids(document.turnIds) || (objectId === undefined ? document.runId !== null || document.turnIds.length : !isToken(document.runId))) fail('CHAT_DATA_INVALID', 'Invalid variable scope.');
    try { values(document.values); } catch { fail('CHAT_DATA_INVALID', 'Invalid stored variables; preserve the original.'); }
  }
  return document;
}
function boundedSnapshot(root, path, maximum) {
  const target = safePath(root, path);
  let entry;
  try { entry = lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return { path, target, etag: 'missing', document: null }; throw error; }
  if (!entry.isFile() || entry.size > maximum) fail('CHAT_DATA_INVALID', 'Expected a bounded ordinary JSON file.');
  const conflict = () => fail('CHAT_CONFLICT', 'Chat data changed while reading; read again.');
  const result = readFileSnapshot(target, { entry,
    validateOpen(a, b) { if (!sameIdentity(a, b)) conflict(); },
    validateRead(a, b, bytes) { if (!sameIdentity(a, b) || bytes.length > maximum) conflict(); },
  });
  let document;
  try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)); } catch { fail('CHAT_DATA_INVALID', 'Invalid UTF-8 JSON; preserve the original.'); }
  return { path, target, etag: sha256(result.bytes), document, stat: result.stat };
}
export function snapshot(root, path, kind, chatId, objectId) {
  const result = boundedSnapshot(root, path, kind === 'turns' ? 4 * 1024 * 1024 : 1024 * 1024);
  if (result.etag !== 'missing') validate(result.document, kind, chatId, objectId);
  return result;
}
export function abilitySnapshots(root, chatId, maximum = 128) {
  location(chatId);
  const directory = `${DIRECTORY}/${chatId}/abilities`, records = [], issues = [];
  let handle;
  try { handle = opendirSync(safePath(root, directory)); }
  catch (error) { if (error.code === 'ENOENT') return { records, issues }; throw error; }
  try {
    let entry, scanned = 0;
    while ((entry = handle.readSync())) {
      if (++scanned > maximum) fail('CHAT_CONTEXT_CAPACITY', 'Capability discovery exceeds the context scan limit; use an explicit object read.');
      if (!/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
      try {
        const path = `${directory}/${entry.name}`, before = boundedSnapshot(root, path, 1024 * 1024);
        if (before.etag === 'missing') fail('CHAT_CONFLICT', 'Capability state disappeared during discovery.');
        const objectId = before.document?.objectId;
        if (!validId(objectId) || location(chatId, objectId) !== path) fail('CHAT_DATA_INVALID', 'Capability filename does not match its identity.');
        validate(before.document, 'scope', chatId, objectId);
        records.push({ objectId, before });
      } catch (error) { issues.push({ code: error.code ?? 'CHAT_CONTEXT_UNAVAILABLE', file: entry.name }); }
    }
  } finally { handle.closeSync(); }
  return { records, issues };
}
export function expect(before, etag) {
  if (etag !== 'missing' && !isKey(etag)) invalid('Supply --if-match with the etag returned by read, or missing.');
  if (before.etag !== etag) fail('CHAT_CONFLICT', 'Chat state differs from the expected version; read and reconcile.');
}
export function publish(root, before, document, kind, chatId, objectId, beforePublish) {
  validate(document, kind, chatId, objectId);
  const bytes = Buffer.from(encode(document)), maximum = kind === 'turns' ? 4 * 1024 * 1024 : 1024 * 1024;
  if (bytes.length > maximum) fail('CHAT_CAPACITY', 'Chat record exceeds its size limit; no data was truncated.');
  const target = safePath(root, before.path, { createParents: true });
  return withTemporaryFile(`${target}.${randomUUID()}.tmp`, bytes, {}, temporary => {
    beforePublish?.();
    const latest = snapshot(root, before.path, kind, chatId, objectId);
    if (latest.etag !== before.etag || (before.stat && !sameIdentity(before.stat, latest.stat ?? {}))) fail('CHAT_CONFLICT', 'Chat state changed before publication; current data was preserved.');
    renameSync(temporary, target);
    return sha256(bytes);
  });
}
export function locked(root, chatId, action) {
  assertNoCooperationMigration(root);
  if (chatId !== 'configuration' && !isKey(chatId)) invalid('Invalid chat lock identity.');
  const path = safePath(root, `.agents/runtime-data/chat-state/${chatId}.lock`, { createParents: true });
  return withExclusiveLock(path, { pid: process.pid }, () => { assertNoCooperationMigration(root); return action(); }, {
    onLocked() { fail('CHAT_LOCKED', 'Another writer holds the chat lock; preserve it and retry after reconciliation.'); },
    onReplaced() { process.stderr.write('CHAT_LOCK_CLEANUP: Replaced lock was preserved.\n'); },
  });
}
