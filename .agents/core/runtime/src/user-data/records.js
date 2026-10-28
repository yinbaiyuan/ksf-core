import { validId } from '../objects/schema.js';
import { currentObjectId } from '../objects/legacy.js';
import { sha256 } from '../shared/hash.js';
import { validateJSONMapping } from '../shared/json.js';
import { userDataRoot, definition, validateValues, validateDocument, plain, fail } from './schema.js';

export const objectDataDirectory = `${userDataRoot}/abilities`;
export function validateObjectValues(values) {
  return validateJSONMapping(values, () => fail('USER_DATA_INVALID', 'Object values must be a JSON mapping with finite, safe numbers.'));
}
export function validateObjectDocument(document, expectedId) {
  if (!plain(document) || Object.keys(document).some(key => !['schema_version', 'object_id', 'revision', 'values'].includes(key))) {
    fail('USER_DATA_INVALID', 'Invalid object data envelope.');
  }
  if (document.schema_version !== 1) fail('USER_DATA_VERSION_UNSUPPORTED', 'The object data format is not supported; preserve the original file.', { schemaVersion: document.schema_version });
  if (!validId(document.object_id) || (expectedId !== undefined && document.object_id !== expectedId) ||
      !Number.isSafeInteger(document.revision) || document.revision < 1) fail('USER_DATA_INVALID', 'Invalid object identity or revision.');
  validateObjectValues(document.values);
  return document;
}

// Only record identity and validation vary. File access, locks and publication
// are shared by Core namespaces and object records, without catalog discovery.
export function recordDefinition(namespace, objectId) {
  if (objectId !== undefined) {
    if (currentObjectId(objectId) !== objectId) fail('OBJECT_RENAMED', 'Use the Cooperation identity and run ksf cooperation migrate --apply for existing values.', { replacement: currentObjectId(objectId) }, 2);
    if (namespace !== undefined || !validId(objectId)) fail('INVALID_ARGUMENTS', 'Supply one plain object ID, without a namespace target or @version.', {}, 2);
    const digest = sha256(objectId);
    return {
      identity: { objectId }, schemaVersion: 1, path: `${objectDataDirectory}/${digest}.json`, lockName: `abilities/${digest}`,
      validateValues: validateObjectValues,
      validateDocument: document => validateObjectDocument(document, objectId),
      document: (values, revision) => ({ schema_version: 1, object_id: objectId, revision, values }),
    };
  }
  const schema = definition(namespace);
  return {
    identity: { namespace }, schemaVersion: schema.schemaVersion, path: `${userDataRoot}/${namespace}.json`, lockName: namespace,
    validateValues: values => validateValues(namespace, values),
    validateDocument: document => validateDocument(namespace, document),
    document: (values, revision) => ({ schema_version: schema.schemaVersion, namespace, revision, values }),
  };
}
