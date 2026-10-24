import { MetadataError } from '../metadata/errors.js';
import { objectQuery } from '../services/objects.js';
import { locations } from './plan.js';
import { abilityFields, fields, mapping, entryProblems, routingProblems } from './routing-schema.js';

// Deterministic availability only. No suitability decisions, body projection,
// personal-setting reads, dependency installation or persistent index.
export function checkRouting({ root, name, values, scope = 'current' }) {
  if (!Object.hasOwn(values, 'routing')) return { errors: [] };
  const { target } = locations(root, name, scope);
  const errors = routingProblems(values.routing, scope).map(error => ({ ...error, target }));
  const entries = [];
  if (mapping(values.routing)) for (const field of fields) {
    if (!Array.isArray(values.routing[field])) continue;
    values.routing[field].forEach((entry, index) => {
      const location = `routing.${field}[${index}]`;
      const reference = mapping(entry) ? entry.ref : undefined;
      const result = { field: location, valid: false,
        ...(typeof reference === 'string' ? { reference } : {}),
        ...(mapping(entry) && (entry.source === undefined || typeof entry.source === 'string')
          ? { requestedSource: entry.source ?? 'effective' } : {}) };
      entries.push(result);
      const malformed = entryProblems(field, entry, index, scope);
      if (malformed.length) { result.errors = malformed.map(error => ({ ...error, target })); return; }
      try {
        {
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
          : { code: 'PROJECT_ROUTING_CHECK_FAILED', message: 'Cannot check the configured routing entry.' };
        result.errors = [{ ...item, field: location, project: name }];
        errors.push(...result.errors);
      }
    });
  }
  return { routing: { valid: errors.length === 0, entries }, errors };
}
