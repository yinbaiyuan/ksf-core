import { MetadataError } from '../metadata/errors.js';

export const declarationFile = 'ksf-source.yaml';
export const reservedSources = new Set(['system', 'user', 'effective', 'all']);
export const validSourceId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id) && !reservedSources.has(id);
export const sourceFailure = (code, message, details = {}) => { throw new MetadataError(code, message, details); };
export function validateDeclaration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'ksf-ability-source') sourceFailure('SOURCE_DECLARATION_INVALID', 'Expected a ksf-ability-source declaration.');
  if (value.schema_version !== 1) sourceFailure('SOURCE_VERSION_UNSUPPORTED', 'Unsupported ability-source protocol; preserve the repository.', { schemaVersion: value.schema_version });
  if (Object.keys(value).some(key => !['kind', 'schema_version', 'id', 'name', 'description'].includes(key)) || !validSourceId(value.id) ||
      typeof value.name !== 'string' || !value.name.trim() || /\p{Cc}/u.test(value.name) ||
      (value.description !== undefined && typeof value.description !== 'string')) sourceFailure('SOURCE_DECLARATION_INVALID', 'Invalid source identity or declaration fields.');
  return value;
}
