import { MetadataError } from '../metadata/errors.js';
import { parseReference, protectedPaths } from '../objects/schema.js';
import { validSourceId } from '../sources/schema.js';

export const abilityFields = { cooperations: 'cooperation', partners: 'partner', competencies: 'competency', data_packages: 'data-package' };
export const fields = Object.keys(abilityFields);
export const mapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const issue = (field, message, code = 'PROJECT_ROUTING_INVALID') => ({ code, message, field });

export function entryProblems(field, entry, index, scope = 'current') {
  const target = `routing.${field}[${index}]`;
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
  const errors = Object.keys(value).filter(key => !fields.includes(key)).map(key => key === 'workflows'
    ? issue('routing.workflows', 'Use routing.cooperations and cooperation.* references; run ksf cooperation migrate --apply for existing projects.', 'PROJECT_ROUTING_FIELD_RENAMED') : key === 'knowledge'
    ? issue('routing.knowledge', 'routing.knowledge has been removed. Remove this field; link project facts from the project body and declare reusable materials in the adopted ability.', 'PROJECT_ROUTING_KNOWLEDGE_REMOVED')
    : issue(`routing.${key}`, 'Unknown routing field.'));
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
