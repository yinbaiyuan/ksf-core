import { join, relative } from 'node:path';
import { MetadataError, invalid } from '../metadata/errors.js';
import { validateInput, equalValues } from '../metadata/input.js';
import { parseFrontmatter, createFrontmatter, encodeFrontmatter, setField } from '../metadata/frontmatter.js';
import { validateRouting } from './routing-schema.js';
const fail = (code, message, details) => { throw new MetadataError(code, message, details); };

export function locations(root, name, projectScope = 'current') {
  if (!['current', 'archived'].includes(projectScope)) invalid('Expected current or archived project scope.');
  const scope = projectScope === 'current' ? join(root, '项目') : join(root, '档案', '项目');
  return { scope, projectScope, folder: join(scope, name), target: join(scope, name, 'project.md') };
}

export function publicProject(root, name, parsed, part = 'all', projectScope = 'current') {
  const { folder, target } = locations(root, name, projectScope);
  return {
    name, scope: projectScope, path: relative(root, target), directory: relative(root, folder), state: parsed.state,
    ...(part !== 'body' ? { metadata: parsed.values } : {}),
    ...(part !== 'metadata' ? { body: parsed.body.toString('utf8') } : {}),
  };
}

export function validateWrite(data, { previousMetadata, scope = 'current' } = {}) {
  validateInput(data);
  if (!Object.keys(data).length || Object.keys(data).some(key => !['metadata', 'body'].includes(key))) {
    invalid('Project write accepts metadata and/or body only.');
  }
  if (Object.hasOwn(data, 'metadata')) validateInput(data.metadata);
  if (Object.hasOwn(data.metadata ?? {}, 'routing') &&
      (!previousMetadata || !equalValues(data.metadata.routing, previousMetadata.routing))) validateRouting(data.metadata.routing, scope);
  if (Object.hasOwn(data, 'body') && typeof data.body !== 'string') invalid('Project body must be a string.');
}

export function encodeProject(current, input) {
  let parsed = parseFrontmatter(current.parsed?.bytes ?? Buffer.alloc(0), current.target);
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

export function planProjectWrite(current, { root, name, data, dryRun = false }, { metadataOnly = false } = {}) {
  const encoded = encodeProject(current, data);
  const wouldChange = !current.snapshot || !encoded.bytes.equals(current.snapshot.bytes);
  const result = { name, scope: current.projectScope ?? 'current', path: relative(root, current.target), dryRun, changed: false, wouldChange,
    ...(!metadataOnly ? { created: false, wouldCreate: !current.snapshot, changes: encoded.changes } : {}),
    project: publicProject(root, name, encoded.parsed, 'all', current.projectScope) };
  return { result, bytes: encoded.bytes, wouldChange };
}

export function planProjectRemoval(current, { root, name, dryRun = false }, entries = []) {
  return { name, scope: current.projectScope ?? 'current', path: relative(root, current.folder), dryRun, changed: false,
    wouldChange: !!current.snapshot, removed: false, entries };
}
