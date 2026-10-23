import { isAbsolute, win32, posix } from 'node:path';
import { MetadataError } from '../metadata/errors.js';
import { parseReference, protectedPaths } from '../objects/schema.js';
import { validSourceId } from '../sources/schema.js';

export const abilityFields = { workflows: 'workflow', partners: 'partner', competencies: 'competency', data_packages: 'data-package' };
export const fields = [...Object.keys(abilityFields), 'knowledge'];
export const mapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const issue = (field, message, code = 'PROJECT_ROUTING_INVALID') => ({ code, message, field });

// Root cards use one of the two supported project scopes. Check the portable
// reference here without touching the filesystem or requiring a knowledge tree.
function validKnowledgeReference(value, scope) {
  if (typeof value !== 'string' || !value.trim() || /[\\\p{Cc}]/u.test(value) ||
      isAbsolute(value) || win32.isAbsolute(value) || !/\.md$/i.test(value)) return false;
  const folder = scope === 'archived' ? '/instance/档案/项目/project' : '/instance/项目/project';
  return posix.resolve(folder, value).startsWith('/instance/知识/');
}

export function entryProblems(field, entry, index, scope = 'current') {
  const target = `routing.${field}[${index}]`;
  if (field === 'knowledge') return validKnowledgeReference(entry, scope) ? [] :
    [issue(target, 'Expected a relative Markdown path into the current instance 知识 directory.')];
  if (!mapping(entry) || Object.keys(entry).some(key => !['ref', 'source'].includes(key))) {
    return [issue(target, 'Expected {ref: ID@version, source?: effective|user|system|source-id}.')];
  }
  const errors = [];
  try {
    const parsed = parseReference(entry.ref, abilityFields[field], { exact: true });
    if (Object.hasOwn(protectedPaths, parsed.id)) errors.push(issue(`${target}.ref`, 'Fixed runtime entries cannot be project presets.'));
  } catch { errors.push(issue(`${target}.ref`, 'Expected the matching object type and an exact ID@x.y.z reference.')); }
  if (Object.hasOwn(entry, 'source') && !['effective', 'user', 'system'].includes(entry.source) && !validSourceId(entry.source)) {
    errors.push(issue(`${target}.source`, 'Expected effective, user, system or an ability-source ID.'));
  }
  return errors;
}

export function routingProblems(value, scope = 'current') {
  if (!mapping(value)) return [issue('routing', 'Expected an optional routing mapping.')];
  const errors = Object.keys(value).filter(key => !fields.includes(key)).map(key => issue(`routing.${key}`, 'Unknown routing field.'));
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) continue;
    if (!Array.isArray(value[field])) errors.push(issue(`routing.${field}`, 'Expected a routing list.'));
    else value[field].forEach((entry, index) => errors.push(...entryProblems(field, entry, index, scope)));
  }
  return errors;
}

export function validateRouting(value, scope = 'current') {
  const errors = routingProblems(value, scope);
  if (errors.length) throw new MetadataError('PROJECT_ROUTING_INVALID', 'Invalid project routing configuration.',
    { exitCode: 2, field: errors[0].field, issues: errors });
}
