import { resolve } from 'node:path';
import { equalValues, parseInput, validateInput } from '../metadata/input.js';
import { MetadataError, decodeUtf8 } from '../metadata/errors.js';
import { readSnapshot, withWriteLock, publishFile } from '../metadata/files.js';
import { parseFrontmatter, encodeFrontmatter, createFrontmatter, setField } from '../metadata/frontmatter.js';

export { equalValues, parseInput, validateInput } from '../metadata/input.js';

export function readInputFile(root, path) {
  const target = resolve(root, path);
  return parseInput(decodeUtf8(readSnapshot(target).bytes, target), target);
}

export function metadata({ root, operation, target: path, fields = [], data, all = false, dryRun = false }, { publish = publishFile } = {}) {
  if (typeof root !== 'string' || typeof path !== 'string' || !path || !['read', 'write', 'remove', 'check'].includes(operation) ||
      !Array.isArray(fields) || fields.some(f => typeof f !== 'string') || typeof all !== 'boolean' || typeof dryRun !== 'boolean') {
    throw new MetadataError('INVALID_ARGUMENTS', 'Invalid metadata service request.', { exitCode: 2 });
  }
  fields = [...new Set(fields)];
  if (operation === 'write') validateInput(data);
  if (operation === 'remove' && (all === (fields.length > 0))) throw new MetadataError('INVALID_ARGUMENTS', 'Select fields or all for removal.', { exitCode: 2 });
  const target = resolve(root, path);
  function execute() {
    const snapshot = readSnapshot(target);
    const parsed = parseFrontmatter(snapshot.bytes, target);
    const values = parsed.values;
    if (operation === 'check') return { target, state: parsed.state, valid: parsed.state === 'absent' ? null : true };
    if (operation === 'read') {
      const selected = fields.length ? fields : Object.keys(values);
      return {
        target, state: parsed.state,
        values: Object.fromEntries(selected.filter(f => Object.hasOwn(values, f)).map(f => [f, values[f]])),
        missingFields: selected.filter(f => !Object.hasOwn(values, f)),
      };
    }
    const result = { target, beforeState: parsed.state, afterState: parsed.state, dryRun, changed: false, changes: [] };
    if (operation === 'remove') result.missingFields = all ? [] : fields.filter(f => !Object.hasOwn(values, f));
    const names = operation === 'write' ? Object.keys(data) : all ? Object.keys(values) : fields;
    const current = parsed.state === 'absent' ? createFrontmatter(parsed) : parsed;
    const expected = Object.fromEntries(Object.entries(values));
    for (const field of names) {
      const exists = Object.hasOwn(values, field);
      const before = exists ? { exists: true, value: values[field] } : { exists: false };
      if (operation === 'write') {
        if (exists && equalValues(values[field], data[field])) continue;
        result.changes.push({ type: exists ? 'updated' : 'added', field, before, after: { exists: true, value: data[field] } });
        setField(current.doc, field, data[field]);
        Object.defineProperty(expected, field, { value: data[field], enumerable: true, configurable: true, writable: true });
      } else if (exists) {
        result.changes.push({ type: 'removed', field, before, after: { exists: false } });
        current.doc.delete(field);
        delete expected[field];
      }
    }
    const removeAll = operation === 'remove' && all;
    const needsWrite = result.changes.length > 0 || (removeAll && parsed.state === 'present');
    if (!needsWrite) return result;
    result.afterState = removeAll ? 'absent' : 'present';
    const bytes = encodeFrontmatter(current, { removeAll });
    // Verify serialized types and values before touching the file.
    if (!removeAll) {
      const verified = parseFrontmatter(bytes, target);
      if (verified.state !== result.afterState || !equalValues(verified.values, expected)) {
        throw new MetadataError('SERIALIZATION_FAILED', 'Encoded metadata did not preserve the requested values.', { target });
      }
    }
    if (!dryRun) { publish(snapshot, bytes); result.changed = true; }
    return result;
  }
  if (['write', 'remove'].includes(operation) && !dryRun) {
    // Reject missing/non-regular targets before creating a lock.
    readSnapshot(target);
    return withWriteLock(target, execute);
  }
  return execute();
}
