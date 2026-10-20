import { lstatSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { sha256 as sha } from '../shared/hash.js';
import { portable } from '../shared/paths.js';
import { parseFrontmatter } from '../metadata/frontmatter.js';
import { readSnapshot } from '../metadata/files.js';
import { types, protectedPaths, validId, validateObject, fail, compare } from './schema.js';
import { configuredSources, readDeclaration } from '../sources/storage.js';

export { sha256 as sha } from '../shared/hash.js';
export { portable } from '../shared/paths.js';
export const skipped = name => name === '.upstream' || name.startsWith('.ksf-object-') || name.startsWith('.ksf-metadata-');

export function catalog(root, { linked = true, sourceFilter, extraSources = [] } = {}) {
  const rows = [], errors = [], scopes = [];
  const sources = [];
  let scanRoot = root;
  // Core sources have no user skeleton; installed workspaces still require it.
  const optionalUserScopes = existsSync(join(root, '.agents/core/build.json')) &&
    existsSync(join(root, '.agents/core/distribution.json')) && !existsSync(join(root, '.agents/core/release.json')) && !existsSync(join(root, 'ksf'));
  function load(file, type, source) {
    const external = !['system', 'user'].includes(source);
    const path = external ? file : portable(relative(root, file));
    const fixedId = external ? undefined : Object.keys(protectedPaths).find(id => protectedPaths[id] === path);
    const folderId = validId(basename(join(file, '..')), type) ? basename(join(file, '..')) : undefined;
    const designatedId = fixedId ?? (source !== 'system' ? folderId : undefined);
    const id = designatedId;
    const row = { type, source, path, directory: external ? join(file, '..') : portable(relative(root, join(file, '..'))), ...(external ? { sourceRoot: scanRoot } : {}), id, errors: [] };
    try {
      row.snapshot = readSnapshot(file);
      row.digest = sha(row.snapshot.bytes);
      row.parsed = parseFrontmatter(row.snapshot.bytes, file);
      row.metadata = row.parsed.values;
      if (!row.id && validId(row.metadata.id)) row.id = row.metadata.id;
      row.errors = validateObject(row.metadata, { type, source, path });
      if (external && !row.parsed.body.toString('utf8').trim()) row.errors.push({ code: 'OBJECT_BODY_REQUIRED', message: 'Published objects require a nonempty body.', target: path });
      if (external && !folderId) row.errors.push({ code: 'OBJECT_ID_LOCATION_MISMATCH', message: 'Published object directories must use the complete object ID.', target: path, id: row.id });
      if (designatedId && row.metadata.id !== designatedId) row.errors.push({ code: 'OBJECT_ID_LOCATION_MISMATCH', message: 'Object identity does not match its designated directory or entry.', target: path, id: designatedId });
    } catch (error) {
      row.errors.push({ code: error.code ?? 'OBJECT_READ_FAILED', message: 'Cannot parse object entry.', target: path, ...(error.details?.line ? { line: error.details.line, column: error.details.column } : {}) });
    }
    rows.push(row);
    return row;
  }
  function inspect(path) {
    // Check every scope component so a linked capability root is not traversed.
    let current = scanRoot;
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
      const invalid = cores.length !== 1 || cores[0].name !== types[type].entry || portable(relative(scanRoot, directory)) === (types[type][source] ?? types[type].user);
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
  let entries = [];
  if (linked) {
    try { entries = configuredSources(root); }
    catch (error) { errors.push({ code: error.code ?? 'SOURCE_REGISTRY_INVALID', message: error.message, source: '@registry' }); }
  }
  entries = [...entries.filter(entry => !sourceFilter || entry.id === sourceFilter), ...extraSources];
  for (const entry of entries) {
    sources.push(entry);
    scanRoot = entry.root;
    try {
      const declaration = readDeclaration(entry.root, entry.id);
      scanRoot = declaration.root;
      Object.assign(entry, { root: scanRoot, name: declaration.name });
      for (const [type, definition] of Object.entries(types)) {
        const path = definition.user;
        try {
          if (existsSync(join(scanRoot, path))) scan(inspect(path), type, entry.id);
          scopes.push({ type, source: entry.id, path: join(scanRoot, path), complete: true });
        } catch (error) {
          errors.push({ code: error.code ?? 'OBJECT_SCOPE_UNREADABLE', message: error.message, target: join(scanRoot, path), type, source: entry.id });
          scopes.push({ type, source: entry.id, path: join(scanRoot, path), complete: false });
        }
      }
    } catch (error) {
      for (const type of Object.keys(types)) {
        errors.push({ code: error.code ?? 'SOURCE_UNREADABLE', message: error.message, target: entry.root, type, source: entry.id });
        scopes.push({ type, source: entry.id, path: entry.root, complete: false });
      }
    }
  }
  const groups = new Map();
  for (const row of rows) {
    if (!row.id) continue;
    const key = `${row.source}:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) if (group.length > 1) for (const row of group) row.errors.push({ code: 'OBJECT_ID_CONFLICT', message: 'Duplicate ID within one source.', target: row.path, id: row.id });
  return { root, rows, errors, scopes, sources };
}

export { problems, resolveObject, referenceResults } from './references.js';

export function fingerprint(c) {
  return sha(JSON.stringify({ rows: c.rows.map(r => [r.path, r.digest, r.snapshot?.stat.ino, r.snapshot?.stat.mtimeMs, r.errors]), errors: c.errors, scopes: c.scopes }));
}

export function summary(row) {
  const m = row.metadata;
  return { id: m.id, name: m.name, description: m.description, status: m.status, version: m.version,
    user_revision: m.user_revision ?? null, source: row.source, path: row.path, directory: row.directory,
    ...(row.sourceRoot ? { source_root: row.sourceRoot } : {}),
    protected: Object.hasOwn(protectedPaths, m.id) };
}
