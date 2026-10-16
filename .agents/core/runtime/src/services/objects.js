import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import YAML from '../vendor/yaml/dist/index.js';
import { parseInput, validateInput, equalValues } from './metadata.js';
import { decodeUtf8 } from '../metadata/errors.js';
import { readSnapshot, publishFile } from '../metadata/files.js';
import { parseFrontmatter, createFrontmatter, encodeFrontmatter, setField } from '../metadata/frontmatter.js';
import { types, protectedPaths, parseReference, validateObject, fail, compare } from '../objects/schema.js';
import { catalog, resolveObject, referenceResults, problems, fingerprint, summary, sha, portable } from '../objects/catalog.js';
import { safeDirectory, withObjectLock, readTree, copyTree, writeDurably, stageDirectory, rebaseMarkdown, removeDirectory, canonicalRoot } from '../objects/storage.js';

export function parseObjectInput(text, target) {
  return validateObjectInput(parseInput(text, target));
}

function validateObjectInput(value) {
  validateInput(value);
  if (Object.keys(value).some(k => !['metadata', 'body'].includes(k)) ||
      (Object.hasOwn(value, 'metadata') && (value.metadata === null || typeof value.metadata !== 'object' || Array.isArray(value.metadata))) ||
      (Object.hasOwn(value, 'body') && typeof value.body !== 'string')) {
    fail('INPUT_INVALID', 'Object input accepts a metadata mapping and/or a body string.', { exitCode: 2 });
  }
  return value;
}

function one(c, id, source) {
  const rows = c.rows.filter(r => r.id === id && r.source === source);
  if (rows.length > 1) fail('OBJECT_ID_CONFLICT', 'Duplicate object ID within one source.', { id, source });
  return rows[0];
}

function upstream(root, row, { verify = false } = {}) {
  const directory = join(root, row.directory, '.upstream');
  const declared = row.metadata.upstream;
  if (!declared && !existsSync(directory)) return null;
  if (!declared || !existsSync(directory)) fail('OBJECT_BASELINE_INVALID', 'Derived identity and baseline directory must both be present.', { id: row.id });
  safeDirectory(root, portable(relative(root, directory)));
  let origin;
  try { origin = JSON.parse(decodeUtf8(readSnapshot(join(directory, 'origin.json')).bytes, 'origin.json')); }
  catch { fail('OBJECT_BASELINE_INVALID', 'Cannot read the user object baseline manifest.', { id: row.id }); }
  if (origin.id !== row.id || origin.version !== row.metadata.version || !Array.isArray(origin.files) || !Array.isArray(origin.directories) || typeof origin.digest !== 'string') {
    fail('OBJECT_BASELINE_INVALID', 'Baseline identity or version does not match the user definition.', { id: row.id });
  }
  if (verify) {
    const snapshot = readTree(join(directory, 'snapshot'));
    const files = snapshot.files.map(f => ({ path: f.path, sha256: f.digest }));
    const directories = snapshot.directories.map(d => d.path);
    if (!equalValues(origin.files, files) || !equalValues(origin.directories, directories) || origin.digest !== sha(JSON.stringify({ files, directories }))) {
      fail('OBJECT_BASELINE_INVALID', 'System baseline snapshot changed or is incomplete.', { id: row.id });
    }
  }
  return origin;
}

function ksfVersion(root) {
  const path = join(root, '.agents/core/manifest.yaml');
  if (!existsSync(path)) return null;
  const doc = YAML.parseDocument(decodeUtf8(readSnapshot(path).bytes, path), { version: '1.2', schema: 'core', uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) fail('OBJECT_BASELINE_INVALID', 'KSF manifest cannot be read for baseline provenance.');
  return doc.get('version') ?? null;
}

function guardReferences(before, after, changedRow) {
  if (changedRow && changedRow.metadata.status !== 'archived') {
    const failed = referenceResults(after, changedRow).find(r => r.error);
    if (failed) fail('OBJECT_DEPENDENCY_INVALID', 'Changed object has an unresolved exact reference.', { reference: failed.reference, cause: failed.error.code });
  }
  for (const row of before.rows) {
    if (!row.metadata || row.errors.length || row.metadata.status === 'archived') continue;
    // Replaced/removed owners no longer impose their old dependency declaration.
    const owner = after.rows.find(r => r.source === row.source && r.path === row.path);
    if (!owner || owner.metadata?.status === 'archived') continue;
    for (const reference of row.metadata.references ?? []) {
      if (!(owner.metadata.references ?? []).includes(reference)) continue;
      const [id, version] = reference.split('@');
      try { resolveObject(before, { id, version }); } catch { continue; }
      try { resolveObject(after, { id, version }); }
      catch { fail('OBJECT_DEPENDENTS_BLOCKED', 'Change would break an existing exact reference.', { id: owner.id, reference }); }
    }
  }
}

function editEntry(base, metadata, body, target) {
  const parsed = base ? parseFrontmatter(base, target) : createFrontmatter(parseFrontmatter(Buffer.alloc(0), target));
  if (parsed.state === 'absent' && !parsed.doc) Object.assign(parsed, createFrontmatter(parsed));
  for (const key of Object.keys(parsed.values)) if (!Object.hasOwn(metadata, key)) parsed.doc.delete(key);
  for (const [key, value] of Object.entries(metadata)) {
    if (!Object.hasOwn(parsed.values, key) || !equalValues(parsed.values[key], value)) setField(parsed.doc, key, value);
  }
  parsed.body = Buffer.from(body);
  const bytes = encodeFrontmatter(parsed);
  const verified = parseFrontmatter(bytes, target);
  if (!equalValues(verified.values, metadata) || verified.body.toString('utf8') !== body) fail('SERIALIZATION_FAILED', 'Object serialization changed requested content.');
  return { bytes, parsed: verified };
}

function view(row, part) {
  const result = { id: row.id, source: row.source, path: row.path, directory: row.directory,
    version: row.metadata.version, user_revision: row.metadata.user_revision ?? null, protected: Object.hasOwn(protectedPaths, row.id) };
  if (part !== 'body') result.metadata = row.metadata;
  if (part !== 'metadata') result.body = row.parsed.body.toString('utf8');
  return result;
}

export function objectQuery({ root, type, operation, reference, source = 'effective', part = 'all' }) {
  if (!Object.hasOwn(types, type) || !['list', 'read', 'check'].includes(operation) ||
      !['effective', 'system', 'user', ...(operation === 'list' ? ['all'] : [])].includes(source) || !['metadata', 'body', 'all'].includes(part)) fail('INVALID_ARGUMENTS', 'Invalid object query.', { exitCode: 2 });
  root = canonicalRoot(root);
  const c = catalog(root);
  if (operation === 'list') {
    const errors = problems(c, { type, source });
    let selected;
    if (source !== 'effective') selected = c.rows.filter(r => r.type === type && !r.errors.length && (source === 'all' || r.source === source));
    else {
      selected = [];
      for (const id of new Set(c.rows.filter(r => r.type === type && r.id).map(r => r.id))) {
        try { selected.push(resolveObject(c, { id })); }
        catch (error) { if (error.code !== 'OBJECT_NOT_FOUND') errors.push({ code: error.code, message: error.message, id }); }
      }
    }
    selected.sort((a, b) => compare(a.id, b.id) || compare(a.source, b.source) || compare(a.path, b.path));
    return { data: { complete: errors.length === 0, scopes: c.scopes.filter(s => s.type === type && (source === 'all' || source === 'effective' || s.source === source)), objects: selected.map(row => {
      let effective = false;
      try { effective = resolveObject(c, { id: row.id }).path === row.path; } catch { /* invalid competing definition */ }
      return { ...summary(row), effective };
    }) }, errors };
  }
  const parsedReference = parseReference(reference, type);
  if (operation === 'check') {
    const rows = c.rows.filter(r => r.id === parsedReference.id && (source === 'effective' || r.source === source));
    const localErrors = problems(c, { type, source }).filter(e => !e.id || e.id === parsedReference.id);
    let row;
    try { row = resolveObject(c, parsedReference, source); }
    catch (error) { localErrors.push({ code: error.code, message: error.message, ...error.details }); }
    const references = row ? referenceResults(c, row) : [];
    localErrors.push(...references.filter(r => r.error).map(r => r.error));
    if (row?.source === 'user') {
      try { upstream(root, row, { verify: true }); }
      catch (error) { localErrors.push({ code: error.code, message: error.message }); }
    }
    return { data: { id: parsedReference.id, valid: localErrors.length === 0 && !!row, ...(row ? { object: summary(row) } : {}), checkedPaths: rows.map(r => r.path), references }, errors: localErrors };
  }
  const row = resolveObject(c, parsedReference, source);
  const references = referenceResults(c, row);
  return { data: { object: view(row, part), references }, errors: references.filter(r => r.error).map(r => r.error) };
}

export function objectMutation({ root, type, operation, id, input = {}, dryRun = false }, { beforePublish, cleanup } = {}) {
  if (!Object.hasOwn(types, type) || !['write', 'remove'].includes(operation) || typeof dryRun !== 'boolean') fail('INVALID_ARGUMENTS', 'Invalid object mutation.', { exitCode: 2 });
  if (operation === 'write') validateObjectInput(input);
  root = canonicalRoot(root);
  const parsedId = parseReference(id, type);
  if (parsedId.version) fail('INVALID_ARGUMENTS', 'write/remove accept a plain ID.', { exitCode: 2 });
  if (Object.hasOwn(protectedPaths, id)) fail('OBJECT_PROTECTED', 'Fixed system entries cannot be derived, modified or deleted by object commands.', { id });
  const action = () => {
    const c = catalog(root);
    const before = fingerprint(c);
    const existing = one(c, id, 'user');
    const system = one(c, id, 'system');
    if (operation === 'remove' && !existing) fail('OBJECT_NOT_FOUND', 'There is no user object to remove.', { id });
    const unrelated = problems(c).filter(e => e.id !== id);
    if (unrelated.length) fail('OBJECT_CATALOG_INVALID', 'Fix catalog errors before modifying objects.', { errors: unrelated });
    const base = existing ?? system;
    const directory = existing ? join(root, existing.directory) : join(root, types[type].user, id);
    const sourceDirectory = base ? join(root, base.directory) : null;
    const tree = sourceDirectory ? readTree(sourceDirectory) : null;
    const verify = ({ temporary } = {}) => {
      beforePublish?.();
      if (fingerprint(catalog(root)) !== before || (tree && readTree(sourceDirectory, { exclude: temporary ? [temporary] : [] }).fingerprint !== tree.fingerprint)) fail('OBJECT_CONFLICT', 'Objects or resources changed before publication.', { id });
    };
    if (operation === 'remove') {
      const after = { ...c, rows: c.rows.filter(r => r !== existing) };
      guardReferences(c, after);
      const result = { id, source: 'user', directory: existing.directory, dryRun, changed: false, removedFromCatalog: false };
      if (!dryRun) {
        removeDirectory(directory, verify, { ...(cleanup ? { cleanup } : {}) });
        result.changed = true; result.removedFromCatalog = true;
      }
      return { data: result, errors: [] };
    }
    if (base?.errors.length) fail('OBJECT_INVALID', 'Repair the object metadata before using object write.', { id, target: base.path });
    if (['user_revision', 'upstream'].some(field => Object.hasOwn(input.metadata ?? {}, field))) fail('OBJECT_MANAGED_FIELD', 'user_revision and upstream are maintained by object commands.');
    if (Object.hasOwn(input.metadata ?? {}, 'id') && input.metadata.id !== id) fail('OBJECT_ID_IMMUTABLE', 'Object ID cannot be changed through write.');
    const origin = existing ? upstream(root, existing, { verify: true }) : null;
    const derived = !existing && !!system;
    if ((origin || derived) && Object.hasOwn(input.metadata ?? {}, 'version') && input.metadata.version !== base.metadata.version) fail('OBJECT_BASE_VERSION_IMMUTABLE', 'A derived object retains its system baseline version.');
    const current = existing?.metadata ?? (system ? { ...system.metadata, status: 'draft' } : { id });
    const candidate = { ...current, ...(input.metadata ?? {}), id, ...(derived ? { upstream: { id, version: system.metadata.version } } : {}) };
    const originalBody = base?.parsed.body.toString('utf8') ?? '';
    const body = input.body ?? originalBody;
    const changed = !existing || !equalValues(candidate, current) || body !== originalBody;
    if (changed && existing?.metadata.user_revision === Number.MAX_SAFE_INTEGER) fail('OBJECT_REVISION_EXHAUSTED', 'User revision exceeds its safe integer range.');
    candidate.user_revision = existing ? existing.metadata.user_revision + (changed ? 1 : 0) : 1;
    const path = portable(relative(root, join(directory, types[type].entry)));
    const errors = validateObject(candidate, { type, source: 'user', path });
    if (!body.trim()) errors.push({ code: 'OBJECT_BODY_REQUIRED', message: 'Object body must be nonempty.', target: path });
    if (errors.length) fail('OBJECT_INVALID', 'Object write would produce an invalid definition.', { errors });
    const proposed = { type, source: 'user', id, path, directory: portable(relative(root, directory)), metadata: candidate, errors: [] };
    const after = { ...c, rows: [...c.rows.filter(r => r !== existing), proposed] };
    guardReferences(c, after, proposed);
    const result = { id, source: 'user', path, directory: proposed.directory, dryRun, changed: false, created: !existing, derived, user_revision: candidate.user_revision, version: candidate.version };
    if (!changed) return { data: result, errors: [] };
    // Plan the complete derived directory even for previews; unsupported assets
    // must not fail only after the caller switches off --dry-run.
    const derivedFiles = derived ? tree.files.map(f => ({ ...f, bytes: f.path.toLowerCase().endsWith('.md') ? rebaseMarkdown(f.bytes, join(sourceDirectory, f.path), join(directory, f.path), sourceDirectory) : f.bytes })) : null;
    if (derived && [...tree.directories, ...tree.files].some(d => d.path === '.upstream')) fail('OBJECT_BASELINE_INVALID', 'System object contains the reserved .upstream name.');
    const originalEntry = base ? (derived ? derivedFiles.find(f => f.path === types[type].entry).bytes : base.snapshot.bytes) : null;
    const actualBody = derived && !Object.hasOwn(input, 'body') ? parseFrontmatter(originalEntry, path).body.toString('utf8') : body;
    const encoded = editEntry(originalEntry, candidate, actualBody, path);
    if (dryRun) return { data: result, errors: [] };
    if (existing) {
      verify();
      publishFile(existing.snapshot, encoded.bytes, { beforeCheck: verify });
      result.changed = true;
    } else {
      const parent = safeDirectory(root, types[type].user);
      if (existsSync(directory)) fail('OBJECT_PATH_CONFLICT', 'Destination directory already exists.', { target: proposed.directory });
      const staging = stageDirectory(parent);
      try {
        if (derived) {
          copyTree({ ...tree, files: derivedFiles }, staging, { writable: true });
          const upstreamDirectory = join(staging, '.upstream'); mkdirSync(upstreamDirectory);
          copyTree(tree, join(upstreamDirectory, 'snapshot'));
          const files = tree.files.map(f => ({ path: f.path, sha256: f.digest }));
          const directories = tree.directories.map(d => d.path);
          const baseline = { id, version: system.metadata.version, ksf_version: ksfVersion(root), sourcePath: system.directory, files, directories, digest: sha(JSON.stringify({ files, directories })) };
          writeDurably(join(upstreamDirectory, 'origin.json'), JSON.stringify(baseline, null, 2) + '\n');
        }
        writeDurably(join(staging, types[type].entry), encoded.bytes, { exclusive: !derived });
        verify();
        if (existsSync(directory)) fail('OBJECT_PATH_CONFLICT', 'Destination appeared during object preparation.');
        renameSync(staging, directory); result.changed = true;
      } finally { if (existsSync(staging)) rmSync(staging, { recursive: true, force: true }); }
    }
    return { data: result, errors: [] };
  };
  return dryRun ? action() : withObjectLock(root, action);
}
