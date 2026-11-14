import { MetadataError } from '../metadata/errors.js';
import {validId} from '../objects/schema.js';

export const declarationFile = 'ksf-source.yaml';
export const reservedSources = new Set(['system', 'user', 'effective', 'all']);
export const validSourceId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id) && !reservedSources.has(id);
export const sourceFailure = (code, message, details = {}) => { throw new MetadataError(code, message, details); };
export function validateDeclaration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'ksf-ability-source') sourceFailure('SOURCE_DECLARATION_INVALID', 'Expected a ksf-ability-source declaration.');
  if (value.schema_version !== 2) sourceFailure('SOURCE_VERSION_UNSUPPORTED', 'Cooperation requires ability-source protocol 2. Migrate protocol 1 with ksf cooperation migrate --apply; preserve unknown versions.', { schemaVersion: value.schema_version });
  if (Object.keys(value).some(key => !['kind', 'schema_version', 'id', 'name', 'description', 'distribution'].includes(key)) || !validSourceId(value.id) ||
      typeof value.name !== 'string' || !value.name.trim() || /\p{Cc}/u.test(value.name) ||
      (value.description !== undefined && typeof value.description !== 'string')) sourceFailure('SOURCE_DECLARATION_INVALID', 'Invalid source identity or declaration fields.');
  if (value.distribution !== undefined) {
    const d = value.distribution;
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some(k => k !== 'entries') ||
        !Array.isArray(d.entries) || !d.entries.length || d.entries.length > 1000 ||
        d.entries.some(id => !validId(id)) || new Set(d.entries).size !== d.entries.length)
      sourceFailure('SOURCE_DISTRIBUTION_INVALID', 'distribution.entries must list unique public ability IDs.');
  }
  return value;
}
