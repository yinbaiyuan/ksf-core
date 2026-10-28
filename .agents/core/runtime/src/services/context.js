import { objectQuery } from './objects.js';
import { MetadataError } from '../metadata/errors.js';

// The object service owns effective identity, ordering and override rules.
// This projection only selects the information needed for Agent discovery.
export function contextCapabilities(root, { source } = {}) {
  const data = { complete: true };
  const errors = [];
  for (const [type, group] of [['cooperation', 'cooperations'], ['partner', 'partners']]) {
    try {
      const result = objectQuery({ root, type, operation: 'list', sourceScope: source });
      data[group] = {
        complete: result.data.complete,
        objects: result.data.objects.map(({ id, name, description, path, source: origin, source_root, protected: fixed }) =>
          ({ id, name, description, path, protected: fixed, source: origin, ...(source_root ? { source_root } : {}) })),
      };
      errors.push(...result.errors.map(error => ({ ...error, type })));
    } catch (failure) {
      data[group] = { complete: false, objects: [] };
      errors.push(failure instanceof MetadataError
        ? { code: failure.code, message: failure.message, ...failure.details, type }
        : { code: 'CONTEXT_QUERY_FAILED', message: 'Cannot obtain capability objects.', type });
    }
    data.complete &&= data[group].complete;
  }
  return { data, errors };
}
