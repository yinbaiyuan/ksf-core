import { MetadataError } from '../metadata/errors.js';

export const types = {
  workflow: { system: '.agents/core/abilities/workflows', user: '能力/工作流', entry: 'workflow.md' },
  partner: { system: '.agents/core/abilities/partners', user: '能力/搭档', entry: 'partner.md' },
  competency: { system: '.agents/core/abilities/competencies', user: '能力/基本功', entry: 'competency.md' },
  'data-package': { system: '.agents/core/abilities/data-packages', user: '能力/数据包', entry: 'datapackage.md' },
};
export const protectedPaths = {
  'workflow.ksf.entry': 'AGENTS.md',
  'partner.ksf.runtime': '.agents/core/abilities/partners/ksf-runtime/partner.md',
  'competency.ksf.ability-route': '.agents/core/abilities/competencies/ability-route/competency.md',
  'competency.ksf.project-route': '.agents/core/abilities/competencies/project-route/competency.md',
  'competency.ksf.knowledge-route': '.agents/core/abilities/competencies/knowledge-route/competency.md',
  'competency.ksf.asset-maintenance': '.agents/core/abilities/competencies/asset-maintenance/competency.md',
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
  const parts = reference.split('@');
  if (parts.length > 2 || !validId(parts[0], type) || (exact && parts.length !== 2) ||
      (parts.length === 2 && !versionPattern.test(parts[1]))) {
    fail('OBJECT_REFERENCE_INVALID', 'Expected a three-part object ID and an optional exact x.y.z version.', { exitCode: 2 });
  }
  return { id: parts[0], version: parts[1] };
}

export function validateObject(metadata, { type, source, path }) {
  const errors = [];
  const issue = (field, message, code = 'OBJECT_METADATA_INVALID') => errors.push({ code, message, target: path, field });
  for (const field of ['id', 'name', 'status', 'description', 'version']) {
    if (typeof metadata[field] !== 'string' || !metadata[field].trim()) issue(field, 'Required object field must be a nonempty string.');
  }
  if (!validId(metadata.id, type)) issue('id', 'ID must match the storage type and use three safe path segments.');
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
    if (!Array.isArray(metadata.references)) issue('references', 'References must be an array of ID@version strings.');
    else for (const reference of metadata.references) {
      try { parseReference(reference, undefined, { exact: true }); }
      catch { issue('references', 'Each reference must contain a valid ID and exact version.', 'OBJECT_REFERENCE_INVALID'); }
    }
  }
  const fixed = protectedPaths[metadata.id];
  if (fixed && (source !== 'system' || path !== fixed)) issue('id', 'Fixed entry identity is only valid at its designated system path.', 'OBJECT_PROTECTED');
  const expectedId = Object.keys(protectedPaths).find(id => protectedPaths[id] === path);
  if (expectedId && metadata.id !== expectedId) issue('id', 'Fixed system entry identity cannot be changed.', 'OBJECT_PROTECTED');
  return errors;
}
