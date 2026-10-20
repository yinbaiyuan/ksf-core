import { protectedPaths, fail } from './schema.js';

export function problems(c, { type, source } = {}) {
  const match = r => (!type || !r.type || r.type === type) && (!source || source === 'effective' || source === 'all' || r.source === source || r.source === '@registry');
  return [...c.errors.filter(match), ...c.rows.filter(match).flatMap(r => r.errors.map(e => ({ ...e, source: r.source, type: r.type, ...(r.id ? { id: r.id } : {}) })))];
}

export function resolveObject(c, { id, version }, source = 'effective') {
  const type = id.split('.')[0];
  if (Object.hasOwn(protectedPaths, id) && !['effective', 'system'].includes(source)) fail('OBJECT_PROTECTED', 'Fixed entries cannot use external definitions.', { id });
  const pick = s => {
    const scopeErrors = c.errors.filter(e => e.source === s && (!e.type || e.type === type));
    const unknown = c.rows.filter(r => r.type === type && r.source === s && !r.id && r.errors.length);
    if (scopeErrors.length || unknown.length) fail('OBJECT_SCOPE_INCOMPLETE', 'Object scope cannot be resolved completely.', { id, source: s });
    const matches = c.rows.filter(r => r.id === id && r.source === s);
    if (matches.length > 1) fail('OBJECT_ID_CONFLICT', 'Duplicate ID within one source.', { id, source: s });
    const row = matches[0];
    if (!row || (source === 'effective' && row.metadata?.status === 'archived')) return;
    if (row.errors.length) fail('OBJECT_INVALID', 'Selected object has invalid metadata or identity.', { id, source: s, target: row.path });
    if (!version || row.metadata.version === version) return row;
  };
  if (source !== 'effective') {
    const row = pick(source); if (row) return row;
  } else if (Object.hasOwn(protectedPaths, id)) {
    const row = pick('system'); if (row) return row;
  } else {
    const user = pick('user'); if (user) return user;
    if (c.errors.some(e => e.source === '@registry')) fail('OBJECT_SCOPE_INCOMPLETE', 'Ability-source registry is invalid.', { id });
    const linked = (c.sources ?? []).map(s => pick(s.id)).filter(Boolean);
    if (linked.length > 1) fail('SOURCE_AMBIGUOUS', 'Multiple ability sources match; select --source explicitly.', { id, candidates: linked.map(r => ({ source: r.source, path: r.path, version: r.metadata.version })) });
    if (linked.length) return linked[0];
    const system = pick('system'); if (system) return system;
  }
  const present = c.rows.some(r => r.id === id && (source === 'effective' || r.source === source));
  fail(version && present ? 'OBJECT_VERSION_MISMATCH' : 'OBJECT_NOT_FOUND', version ? 'No eligible object matches the requested version.' : 'Object is not available in the requested source.', { id, ...(version ? { version } : {}) });
}

export function referenceResults(c, row) {
  return (row.metadata.references ?? []).map(reference => {
    const [id, version] = reference.split('@');
    try {
      let target;
      if (row.sourceRoot) {
        // Repository dependencies bind to this repository or Core, never to
        // another repository or a reader's private overrides.
        if (!Object.hasOwn(protectedPaths, id)) {
          try { target = resolveObject(c, { id, version }, row.source); }
          catch (error) { if (!['OBJECT_NOT_FOUND', 'OBJECT_VERSION_MISMATCH'].includes(error.code)) throw error; }
        }
        if (target?.metadata.status === 'archived') target = undefined;
        target ??= resolveObject(c, { id, version }, 'system');
        if (target.metadata.status === 'archived') fail('OBJECT_NOT_FOUND', 'Archived dependencies are not active.', { id });
      } else target = resolveObject(c, { id, version });
      return { reference, id, version, source: target.source, path: target.path, ...(target.sourceRoot ? { source_root: target.sourceRoot } : {}), user_revision: target.metadata.user_revision ?? null };
    } catch (error) {
      return { reference, error: { code: error.code, message: error.message, target: row.path, id } };
    }
  });
}
