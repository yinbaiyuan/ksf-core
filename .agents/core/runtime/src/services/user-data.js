import { namespaces, encode, fail, userDataRoot } from '../user-data/schema.js';
import { recordDefinition, objectDataDirectory } from '../user-data/records.js';
import { snapshot, unknownEntries, withLock, expect, publish, objectEntries, readObjectEntry } from '../user-data/storage.js';
export { UserDataError, userDataRoot } from '../user-data/schema.js';

function result(record, store) {
  return { ...store.identity, path: record.path, state: record.state, etag: record.etag,
    schemaVersion: store.schemaVersion, revision: record.document?.revision ?? null,
    values: record.document?.values ?? {} };
}
export function readUserData({ root, namespace, objectId }) {
  const store = recordDefinition(namespace, objectId);
  return result(snapshot(root, namespace, objectId), store);
}
export function checkUserData(options) {
  const data = readUserData(options);
  return { ...data, valid: data.state === 'missing' ? null : true };
}
export function listUserData({ root, objects = false }) {
  if (objects) return listObjectData(root);
  const entries = [], errors = [];
  for (const [namespace, schema] of Object.entries(namespaces)) {
    try {
      const { values, ...data } = readUserData({ root, namespace });
      entries.push({ ...data, kind: schema.kind, description: schema.description });
    } catch (error) {
      entries.push({ namespace, state: 'invalid', kind: schema.kind });
      errors.push({ code: error.code ?? 'USER_DATA_READ_FAILED', message: error.message, namespace });
    }
  }
  try {
    for (const name of unknownEntries(root)) errors.push({ code: 'USER_DATA_UNKNOWN_ENTRY', message: 'Unregistered or sync-conflict entry; preserve and inspect it.', target: `${userDataRoot}/${name}` });
  } catch (error) { errors.push({ code: error.code ?? 'USER_DATA_READ_FAILED', message: error.message }); }
  return { complete: errors.length === 0, entries, errors };
}
function listObjectData(root) {
  const entries = [], errors = [];
  try {
    for (const name of objectEntries(root)) {
      const path = `${objectDataDirectory}/${name}`;
      try {
        const record = readObjectEntry(root, name);
        if (record.state === 'missing') fail('USER_DATA_CONFLICT', 'Object data entry disappeared while listing.');
        const { values, ...data } = result(record, recordDefinition(undefined, record.document.object_id));
        entries.push(data);
      } catch (error) {
        entries.push({ path, state: 'invalid' });
        errors.push({ code: error.code ?? 'USER_DATA_READ_FAILED', message: error.message, target: path });
      }
    }
  } catch (error) { errors.push({ code: error.code ?? 'USER_DATA_READ_FAILED', message: error.message, target: objectDataDirectory }); }
  entries.sort((a, b) => {
    const left = a.objectId ?? a.path, right = b.objectId ?? b.path;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { complete: errors.length === 0, entries, errors };
}
function nextDocument(store, values, revision) {
  const document = store.document(values, revision);
  // The limit applies to the complete persisted envelope, including previews.
  if (Buffer.byteLength(encode(document)) > 1024 * 1024) fail('USER_DATA_INVALID', 'User data exceeds 1 MiB.');
  return document;
}
export function writeUserData({ root, namespace, objectId, values, ifMatch, dryRun = false, beforePublish, removeFields = [] }) {
  const store = recordDefinition(namespace, objectId); store.validateValues(values);
  const mutate = () => {
    const before = snapshot(root, namespace, objectId); expect(before, ifMatch);
    const retained=Object.fromEntries(Object.entries(before.document?.values??{}).filter(([key])=>!removeFields.includes(key)));
    const merged = { ...retained, ...values };
    store.validateValues(merged);
    const changed = encode(merged) !== encode(before.document?.values ?? {});
    const revision = changed ? (before.document?.revision ?? 0) + 1 : before.document?.revision ?? null;
    if (revision !== null && !Number.isSafeInteger(revision)) fail('USER_DATA_INVALID', 'Revision limit reached; preserve the file.');
    const document = changed ? nextDocument(store, merged, revision) : before.document;
    const etag = changed && !dryRun ? publish(root, namespace, before, document, { beforePublish, objectId }) : before.etag;
    return { ...store.identity, path: before.path, dryRun, changed: changed && !dryRun, wouldChange: changed,
      beforeEtag: before.etag, etag, revision, before: before.document?.values ?? {}, values: merged };
  };
  return dryRun ? mutate() : withLock(root, namespace, mutate, objectId);
}
export function removeUserData({ root, namespace, objectId, fields, ifMatch, dryRun = false, beforePublish }) {
  const store = recordDefinition(namespace, objectId);
  if (fields !== undefined) {
    if (objectId === undefined || !Array.isArray(fields) || !fields.length || fields.some(field => typeof field !== 'string')) {
      fail('INVALID_ARGUMENTS', '--fields requires one or more top-level object field names.', {}, 2);
    }
    fields = [...new Set(fields)];
  }
  const mutate = () => {
    const before = snapshot(root, namespace, objectId); expect(before, ifMatch);
    const values = fields ? { ...(before.document?.values ?? {}) } : {};
    const removed = fields?.filter(field => Object.hasOwn(values, field));
    for (const field of removed ?? []) delete values[field];
    const changed = fields ? removed.length > 0 : before.state === 'present';
    const currentRevision = before.document?.revision ?? null;
    const revision = fields ? (changed ? currentRevision + 1 : currentRevision) : null;
    if (revision !== null && !Number.isSafeInteger(revision)) fail('USER_DATA_INVALID', 'Revision limit reached; preserve the file.');
    const document = fields && changed ? nextDocument(store, values, revision) : null;
    const etag = changed && !dryRun ? publish(root, namespace, before, document, { beforePublish, objectId }) : before.etag;
    return { ...store.identity, path: before.path, dryRun, changed: changed && !dryRun, wouldChange: changed,
      beforeEtag: before.etag, etag, values,
      ...(fields ? { revision, removedFields: removed, missingFields: fields.filter(field => !removed.includes(field)) } : {}) };
  };
  // Missing removal is a no-op, including no creation of local lock directories.
  const before = snapshot(root, namespace, objectId); expect(before, ifMatch);
  return dryRun || before.state === 'missing' ? mutate() : withLock(root, namespace, mutate, objectId);
}
