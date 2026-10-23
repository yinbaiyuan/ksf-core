import { lstatSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { MetadataError, decodeUtf8 } from '../metadata/errors.js';
import { readSnapshot } from '../metadata/files.js';
import { objectQuery } from '../services/objects.js';
import { locations } from './plan.js';
import { abilityFields, fields, mapping, entryProblems, routingProblems } from './routing-schema.js';

function knowledgeEntry(root, folder, reference) {
  const target = resolve(folder, reference), scope = join(root, '知识');
  const nested = relative(scope, target);
  if (!nested || nested === '..' || nested.startsWith('../') || isAbsolute(nested)) {
    throw new MetadataError('PROJECT_KNOWLEDGE_PATH_INVALID', 'Knowledge entry escapes the current knowledge directory.');
  }
  const directories = [scope];
  for (const segment of nested.split('/').slice(0, -1)) directories.push(join(directories.at(-1), segment));
  const parents = directories.map(path => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new MetadataError('PROJECT_KNOWLEDGE_PATH_INVALID', 'Knowledge parents must be ordinary directories.', { target: path });
    }
    return { path, stat };
  });
  decodeUtf8(readSnapshot(target).bytes, target);
  for (const { path, stat } of parents) {
    const after = lstatSync(path);
    if (after.isSymbolicLink() || !after.isDirectory() || stat.dev !== after.dev || stat.ino !== after.ino) {
      throw new MetadataError('PROJECT_KNOWLEDGE_PATH_INVALID', 'Knowledge parent changed while reading.', { target: path });
    }
  }
  return relative(root, target);
}

// Deterministic availability only. No suitability decisions, body projection,
// personal-setting reads, dependency installation or persistent index.
export function checkRouting({ root, name, values, scope = 'current' }) {
  if (!Object.hasOwn(values, 'routing')) return { errors: [] };
  const { folder, target } = locations(root, name, scope);
  const errors = routingProblems(values.routing, scope).map(error => ({ ...error, target }));
  const entries = [];
  if (mapping(values.routing)) for (const field of fields) {
    if (!Array.isArray(values.routing[field])) continue;
    values.routing[field].forEach((entry, index) => {
      const location = `routing.${field}[${index}]`;
      const reference = field === 'knowledge' ? entry : mapping(entry) ? entry.ref : undefined;
      const result = { field: location, valid: false,
        ...(typeof reference === 'string' ? { reference } : {}),
        ...(field !== 'knowledge' && mapping(entry) && (entry.source === undefined || typeof entry.source === 'string')
          ? { requestedSource: entry.source ?? 'effective' } : {}) };
      entries.push(result);
      const malformed = entryProblems(field, entry, index, scope);
      if (malformed.length) { result.errors = malformed.map(error => ({ ...error, target })); return; }
      try {
        if (field === 'knowledge') result.path = knowledgeEntry(root, folder, entry);
        else {
          const response = objectQuery({ root, type: abilityFields[field], operation: 'check', reference: entry.ref, source: entry.source ?? 'effective' });
          if (response.data.object) result.object = response.data.object;
          result.references = response.data.references;
          const problems = [...response.errors];
          if (response.data.object?.status === 'archived') problems.push({ code: 'PROJECT_ROUTING_ARCHIVED', message: 'Archived objects cannot be adopted as project presets.' });
          if (problems.length) {
            result.errors = problems.map(error => ({ ...error, field: location, project: name }));
            errors.push(...result.errors); return;
          }
        }
        result.valid = true;
      } catch (error) {
        const item = error instanceof MetadataError
          ? { code: error.code, message: error.message, ...error.details }
          : { code: error.code === 'ENOENT' ? 'PROJECT_KNOWLEDGE_NOT_FOUND' : 'PROJECT_ROUTING_CHECK_FAILED', message: 'Cannot check the configured routing entry.' };
        result.errors = [{ ...item, field: location, project: name }];
        errors.push(...result.errors);
      }
    });
  }
  return { routing: { valid: errors.length === 0, entries }, errors };
}
