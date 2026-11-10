import { MetadataError } from '../metadata/errors.js';
import { currentReference } from './legacy.js';

export const types = {
  cooperation: { system: '.agents/core/abilities/cooperations', user: '能力/协同', entry: 'cooperation.md' },
  partner: { system: '.agents/core/abilities/partners', user: '能力/搭档', entry: 'partner.md' },
  competency: { system: '.agents/core/abilities/competencies', user: '能力/基本功', entry: 'competency.md' },
  'data-package': { system: '.agents/core/abilities/data-packages', user: '能力/数据包', entry: 'datapackage.md' },
};
export const protectedPaths = {
  'cooperation.ksf.entry': 'AGENTS.md',
  'partner.ksf.runtime': '.agents/core/abilities/partners/ksf-runtime/partner.md',
  'competency.ksf.ability-route': '.agents/core/abilities/competencies/ability-route/competency.md',
  'competency.ksf.project-route': '.agents/core/abilities/competencies/project-route/competency.md',
};
export const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const statuses = new Set(['draft', 'active', 'archived']);
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const fail = (code, message, details = {}) => { throw new MetadataError(code, message, details); };

export function validId(id, type) {
  if (typeof id !== 'string' || /[\s\p{Cc}@<>:"/\\|?*]/u.test(id)) return false;
  const parts = id.split('.');
  return parts.length === 3 && parts.every(Boolean) && Object.hasOwn(types, parts[0]) && (!type || parts[0] === type);
}

export function parseReference(reference, type, { exact = false } = {}) {
  if (typeof reference !== 'string') fail('OBJECT_REFERENCE_INVALID', 'Expected an object ID or ID@version.', { exitCode: 2 });
  const replacement = currentReference(reference);
  if (replacement !== reference) fail('OBJECT_RENAMED', reference.split('@')[0] === 'partner.ksf.object-designer' ? 'Use partner.ksf.ability-manager; migrate current state with ksf ability-manager migrate --apply.' : 'Workflow abilities are now Cooperation. Use the new identity; migrate existing data with ksf cooperation migrate --apply.', { replacement, exitCode: 2 });
  const parts = reference.split('@');
  if (parts.length > 2 || !validId(parts[0], type) || (exact && parts.length !== 2) ||
      (parts.length === 2 && !versionPattern.test(parts[1]))) {
    fail('OBJECT_REFERENCE_INVALID', 'Expected a three-part object ID and an optional exact x.y.z version.', { exitCode: 2 });
  }
  return { id: parts[0], version: parts[1] };
}

// Expansion belongs to a dependency declaration, never to an object selector.
export function parseDependencyReference(reference) {
  const prefix = typeof reference === 'string' && ['+', '#'].includes(reference[0]) ? reference[0] : '';
  const value = prefix ? reference.slice(1) : reference;
  let parsed;
  if (typeof value === 'string' && /^(?:\/|\.\.?\/)/.test(value)) {
    if (value.length > 4096 || value === '/' || value.endsWith('/') || value.startsWith('//') || /[\\:\x00-\x1f\x7f]/.test(value)) {
      fail('OBJECT_REFERENCE_INVALID', 'Expected a portable file path starting with ./, ../ or /.', { exitCode: 2 });
    }
    parsed = { kind: 'file', path: value };
  } else parsed = parseReference(value, undefined, { exact: true });
  return { ...parsed, prefix, expansion: prefix === '#' ? 'recursive' : prefix === '+' ? 'shallow' : 'none' };
}

export function parseStoredReference(reference) {
  const parsed = parseReference(currentReference(reference));
  return { id: reference.split('@')[0], version: parsed.version };
}

export function parseStoredDependencyReference(reference) {
  const parsed = parseDependencyReference(currentReference(reference));
  if (parsed.kind === 'file') return parsed;
  return { ...parsed, id: reference.slice(parsed.prefix.length).split('@')[0] };
}

export function validateObject(metadata, { type, source, path }) {
  const errors = [];
  const issue = (field, message, code = 'OBJECT_METADATA_INVALID') => errors.push({ code, message, target: path, field });
  for (const field of ['id', 'name', 'status', 'description', 'version']) {
    if (typeof metadata[field] !== 'string' || !metadata[field].trim()) issue(field, 'Required object field must be a nonempty string.');
  }
  if (typeof metadata.id === 'string' && currentReference(metadata.id) !== metadata.id) issue('id', `Use ${currentReference(metadata.id)}; migrate existing data with ksf ${metadata.id === 'partner.ksf.object-designer' ? 'ability-manager' : 'cooperation'} migrate --apply.`, 'OBJECT_RENAMED');
  else if (!validId(metadata.id, type)) issue('id', 'ID must match the storage type and use three safe path segments.');
  if (!statuses.has(metadata.status)) issue('status', 'Expected draft, active or archived.');
  if (!versionPattern.test(metadata.version ?? '')) issue('version', 'Expected an exact x.y.z version.');
  if (source === 'user' && (!Number.isSafeInteger(metadata.user_revision) || metadata.user_revision < 1)) issue('user_revision', 'User objects require a positive integer revision.');
  if (source === 'system' && Object.hasOwn(metadata, 'user_revision')) issue('user_revision', 'System definitions do not carry user revisions.');
  if (!['system', 'user'].includes(source) && (Object.hasOwn(metadata, 'user_revision') || Object.hasOwn(metadata, 'upstream'))) issue('user_revision', 'Published source objects do not carry personal revision or derivation fields.');
  if (Object.hasOwn(metadata, 'upstream')) {
    const u = metadata.upstream;
    if (source !== 'user' || !u || typeof u !== 'object' || Array.isArray(u) ||
        Object.keys(u).length !== 2 || u.id !== metadata.id || u.version !== metadata.version) issue('upstream', 'Managed upstream identity must match the derived object ID and version.');
  }
  if (Object.hasOwn(metadata, 'references')) {
    if (!Array.isArray(metadata.references)) issue('references', 'References must be an array of exact ability IDs or explicit file paths, optionally prefixed with + or #.');
    else for (const reference of metadata.references) {
      try { parseDependencyReference(reference); }
      catch (error) { issue('references', error.code === 'OBJECT_RENAMED' ? error.message : 'Each reference must be exact ID@version or a ./, ../, / file path, optionally prefixed with one + or #.', error.code === 'OBJECT_RENAMED' ? error.code : 'OBJECT_REFERENCE_INVALID'); }
    }
  }
  const fixed = protectedPaths[metadata.id];
  if (fixed && (source !== 'system' || path !== fixed)) issue('id', 'Fixed entry identity is only valid at its designated system path.', 'OBJECT_PROTECTED');
  const expectedId = Object.keys(protectedPaths).find(id => protectedPaths[id] === path);
  if (expectedId && metadata.id !== expectedId) issue('id', 'Fixed system entry identity cannot be changed.', 'OBJECT_PROTECTED');
  return errors;
}
