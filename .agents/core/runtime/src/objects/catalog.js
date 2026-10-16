import { lstatSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { parseFrontmatter } from '../metadata/frontmatter.js';
import { readSnapshot } from '../metadata/files.js';
import { types, protectedPaths, validId, validateObject, fail, compare } from './schema.js';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const portable = path => path.split(sep).join('/');
export const skipped = name => name === '.upstream' || name.startsWith('.ksf-object-') || name.startsWith('.ksf-metadata-');

export function catalog(root) {
  const rows = [], errors = [], scopes = [];
  // Core sources have no user skeleton; installed workspaces still require it.
  const optionalUserScopes = existsSync(join(root, '.agents/core/build.json')) &&
    existsSync(join(root, '.agents/core/distribution.json')) && !existsSync(join(root, '.agents/core/release.json')) && !existsSync(join(root, 'ksf'));
  function load(file, type, source) {
    const path = portable(relative(root, file));
    const fixedId = Object.keys(protectedPaths).find(id => protectedPaths[id] === path);
    const folderId = validId(basename(join(file, '..')), type) ? basename(join(file, '..')) : undefined;
    const designatedId = fixedId ?? (source === 'user' ? folderId : undefined);
    const id = designatedId;
    const row = { type, source, path, directory: portable(relative(root, join(file, '..'))), id, errors: [] };
    try {
      row.snapshot = readSnapshot(file);
      row.digest = sha(row.snapshot.bytes);
      row.parsed = parseFrontmatter(row.snapshot.bytes, file);
      row.metadata = row.parsed.values;
      if (!row.id && validId(row.metadata.id)) row.id = row.metadata.id;
      row.errors = validateObject(row.metadata, { type, source, path });
      if (designatedId && row.metadata.id !== designatedId) row.errors.push({ code: 'OBJECT_ID_LOCATION_MISMATCH', message: 'Object identity does not match its designated directory or entry.', target: path, id: designatedId });
    } catch (error) {
      row.errors.push({ code: error.code ?? 'OBJECT_READ_FAILED', message: 'Cannot parse object entry.', target: path, ...(error.details?.line ? { line: error.details.line, column: error.details.column } : {}) });
    }
    rows.push(row);
    return row;
  }
  function inspect(path) {
    // Check every scope component so a linked capability root is not traversed.
    let current = root;
    for (const segment of path.split('/')) {
      current = join(current, segment);
      if (lstatSync(current).isSymbolicLink()) fail('OBJECT_UNSUPPORTED', 'Capability directories cannot be symbolic links.');
    }
    if (!lstatSync(current).isDirectory()) fail('OBJECT_SCOPE_INVALID', 'Capability scope must be a directory.');
    return current;
  }
  function scan(directory, type, source) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name));
    const coreNames = Object.values(types).map(t => t.entry);
    const cores = entries.filter(e => coreNames.includes(e.name));
    if (cores.length) {
      const invalid = cores.length !== 1 || cores[0].name !== types[type].entry || portable(relative(root, directory)) === types[type][source];
      for (const e of cores) {
        const row = load(join(directory, e.name), type, source);
        if (invalid) row.errors.push({ code: 'OBJECT_ENTRY_INVALID', message: 'Object must own a subdirectory with exactly one matching core entry.', target: row.path });
      }
      return; // Nested files belong to this directory object, not separate candidates.
    }
    for (const entry of entries) {
      if (skipped(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) errors.push({ code: 'OBJECT_UNSUPPORTED', message: 'Symbolic link was not scanned.', target: portable(relative(root, path)), source, type });
      else if (entry.isDirectory()) scan(path, type, source);
    }
  }
  for (const [type, definition] of Object.entries(types)) {
    for (const source of ['system', 'user']) {
      const path = definition[source];
      try { scan(inspect(path), type, source); scopes.push({ type, source, path, complete: true }); }
      catch (error) {
        if (source === 'user' && optionalUserScopes && error.code === 'ENOENT' && !existsSync(join(root, path))) {
          scopes.push({ type, source, path, complete: true });
          continue;
        }
        errors.push({ code: error.code ?? 'OBJECT_SCOPE_UNREADABLE', message: 'Capability scope is missing, unreadable or unsupported.', target: path, type, source });
        scopes.push({ type, source, path, complete: false });
      }
    }
  }
  if (existsSync(join(root, 'AGENTS.md'))) load(join(root, 'AGENTS.md'), 'workflow', 'system');
  const groups = new Map();
  for (const row of rows) {
    if (!row.id) continue;
    const key = `${row.source}:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) if (group.length > 1) for (const row of group) row.errors.push({ code: 'OBJECT_ID_CONFLICT', message: 'Duplicate ID within one source.', target: row.path, id: row.id });
  return { root, rows, errors, scopes };
}

export function problems(c, { type, source } = {}) {
  const match = r => (!type || r.type === type) && (!source || source === 'effective' || source === 'all' || r.source === source);
  return [...c.errors.filter(match), ...c.rows.filter(match).flatMap(r => r.errors.map(e => ({ ...e, source: r.source, type: r.type, ...(r.id ? { id: r.id } : {}) })))];
}

export function resolveObject(c, { id, version }, source = 'effective') {
  const type = id.split('.')[0];
  if (Object.hasOwn(protectedPaths, id) && source === 'user') fail('OBJECT_PROTECTED', 'Fixed entries cannot use user definitions.', { id });
  const sources = source === 'effective' ? Object.hasOwn(protectedPaths, id) ? ['system'] : ['user', 'system'] : [source];
  // An unidentifiable damaged object may shadow this ID; do not assume absence.
  for (const s of sources) {
    const scopeErrors = c.errors.filter(e => e.source === s && e.type === type);
    const unknown = c.rows.filter(r => r.type === type && r.source === s && !r.id && r.errors.length);
    if (scopeErrors.length || unknown.length) fail('OBJECT_SCOPE_INCOMPLETE', 'Object scope cannot be resolved completely.', { id, source: s });
    const matches = c.rows.filter(r => r.id === id && r.source === s);
    if (matches.length > 1) fail('OBJECT_ID_CONFLICT', 'Duplicate ID within one source.', { id, source: s });
    if (!matches.length) continue;
    const row = matches[0];
    if (source === 'effective' && row.metadata?.status === 'archived') continue;
    if (row.errors.length) fail('OBJECT_INVALID', 'Selected object has invalid metadata or identity.', { id, source: s, target: row.path });
    if (Object.hasOwn(protectedPaths, id) && s !== 'system') fail('OBJECT_PROTECTED', 'Fixed entries cannot use user definitions.', { id });
    if (!version || row.metadata.version === version) return row;
  }
  const present = c.rows.some(r => r.id === id && sources.includes(r.source));
  fail(version && present ? 'OBJECT_VERSION_MISMATCH' : 'OBJECT_NOT_FOUND', version ? 'No eligible object matches the requested version.' : 'Object is not available in the requested source.', { id, ...(version ? { version } : {}) });
}

export function referenceResults(c, row) {
  return (row.metadata.references ?? []).map(reference => {
    const [id, version] = reference.split('@');
    try {
      const target = resolveObject(c, { id, version });
      return { reference, id, version, source: target.source, path: target.path, user_revision: target.metadata.user_revision ?? null };
    } catch (error) {
      return { reference, error: { code: error.code, message: error.message, target: row.path, id } };
    }
  });
}

export function fingerprint(c) {
  return sha(JSON.stringify({ rows: c.rows.map(r => [r.path, r.digest, r.snapshot?.stat.ino, r.snapshot?.stat.mtimeMs, r.errors]), errors: c.errors, scopes: c.scopes }));
}

export function summary(row) {
  const m = row.metadata;
  return { id: m.id, name: m.name, description: m.description, status: m.status, version: m.version,
    user_revision: m.user_revision ?? null, source: row.source, path: row.path, directory: row.directory,
    protected: Object.hasOwn(protectedPaths, m.id) };
}
