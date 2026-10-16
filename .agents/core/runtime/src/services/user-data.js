import { namespaces, definition, validateValues, encode, fail, userDataRoot } from '../user-data/schema.js';
import { snapshot, unknownEntries, withLock, expect, publish } from '../user-data/storage.js';
export { UserDataError, userDataRoot } from '../user-data/schema.js';

function result(record, namespace) {
  return { namespace, path: record.path, state: record.state, etag: record.etag,
    schemaVersion: definition(namespace).schemaVersion, revision: record.document?.revision ?? null,
    values: record.document?.values ?? {} };
}
export function readUserData({ root, namespace }) { return result(snapshot(root, namespace), namespace); }
export function checkUserData(options) {
  const data = readUserData(options);
  return { ...data, valid: data.state === 'missing' ? null : true };
}
export function listUserData({ root }) {
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
export function writeUserData({ root, namespace, values, ifMatch, dryRun = false, beforePublish }) {
  definition(namespace); validateValues(namespace, values);
  const mutate = () => {
    const before = snapshot(root, namespace); expect(before, ifMatch);
    const merged = { ...(before.document?.values ?? {}), ...values };
    validateValues(namespace, merged);
    const changed = encode(merged) !== encode(before.document?.values ?? {});
    const revision = changed ? (before.document?.revision ?? 0) + 1 : before.document?.revision ?? null;
    if (revision !== null && !Number.isSafeInteger(revision)) fail('USER_DATA_INVALID', 'Revision limit reached; preserve the file.');
    const document = changed ? { schema_version: definition(namespace).schemaVersion, namespace, revision, values: merged } : before.document;
    const etag = changed && !dryRun ? publish(root, namespace, before, document, { beforePublish }) : before.etag;
    return { namespace, path: before.path, dryRun, changed: changed && !dryRun, wouldChange: changed,
      beforeEtag: before.etag, etag, revision, before: before.document?.values ?? {}, values: merged };
  };
  return dryRun ? mutate() : withLock(root, namespace, mutate);
}
export function removeUserData({ root, namespace, ifMatch, dryRun = false, beforePublish }) {
  definition(namespace);
  const mutate = () => {
    const before = snapshot(root, namespace); expect(before, ifMatch);
    const changed = before.state === 'present';
    if (changed && !dryRun) publish(root, namespace, before, null, { beforePublish });
    return { namespace, path: before.path, dryRun, changed: changed && !dryRun, wouldChange: changed,
      beforeEtag: before.etag, etag: changed && !dryRun ? 'missing' : before.etag, values: {} };
  };
  // Missing removal is a no-op, including no creation of local lock directories.
  const before = snapshot(root, namespace); expect(before, ifMatch);
  return dryRun || before.state === 'missing' ? mutate() : withLock(root, namespace, mutate);
}
