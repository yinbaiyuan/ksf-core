import { join, relative } from 'node:path';
import { validateInput, equalValues } from '../metadata/input.js';
import { parseFrontmatter, createFrontmatter, encodeFrontmatter, setField } from '../metadata/frontmatter.js';
import { portable } from '../shared/paths.js';
import { types, validateObject, fail } from './schema.js';
import { problems, referenceResults, resolveObject } from './references.js';
import { rebaseMarkdown } from './markdown.js';

export function validateObjectInput(value) {
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

// Validate before the loader reads a derived object's baseline: retain the
// established error ordering without giving the planner an IO callback.
export function validateObjectWrite({ base, id }, input) {
  if (base?.errors.length) fail('OBJECT_INVALID', 'Repair the object metadata before using object write.', { id, target: base.path });
  if (['user_revision', 'upstream'].some(field => Object.hasOwn(input.metadata ?? {}, field))) fail('OBJECT_MANAGED_FIELD', 'user_revision and upstream are maintained by object commands.');
  if (Object.hasOwn(input.metadata ?? {}, 'id') && input.metadata.id !== id) fail('OBJECT_ID_IMMUTABLE', 'Object ID cannot be changed through write.');
}

export function selectObjectState(c, { root, type, operation, id }) {
  const existing = one(c, id, 'user'), system = one(c, id, 'system');
  if (operation === 'remove' && !existing) fail('OBJECT_NOT_FOUND', 'There is no user object to remove.', { id });
  const unrelated = problems(c).filter(e => e.id !== id);
  if (unrelated.length) fail('OBJECT_CATALOG_INVALID', 'Fix catalog errors before modifying objects.', { errors: unrelated });
  const base = existing ?? system;
  const directory = existing ? join(root, existing.directory) : join(root, types[type].user, id);
  const sourceDirectory = base ? join(root, base.directory) : null;
  return { c, root, type, operation, id, existing, system, base, directory, sourceDirectory };
}

export function planObjectChange(state, { input = {}, dryRun = false } = {}) {
  const { c, root, type, operation, id, existing, system, base, directory, sourceDirectory, tree, origin } = state;
  if (operation === 'remove') {
    guardReferences(c, { ...c, rows: c.rows.filter(r => r !== existing) });
    return { changed: true, result: { id, source: 'user', directory: existing.directory, dryRun, changed: false, removedFromCatalog: false } };
  }
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
  if (!changed) return { result, changed: false };
  // Plan the complete derived directory even for previews; unsupported assets
  // must not fail only after the caller switches off --dry-run.
  const derivedFiles = derived ? tree.files.map(f => ({ ...f, bytes: f.path.toLowerCase().endsWith('.md') ? rebaseMarkdown(f.bytes, join(sourceDirectory, f.path), join(directory, f.path), sourceDirectory) : f.bytes })) : null;
  if (derived && [...tree.directories, ...tree.files].some(d => d.path === '.upstream')) fail('OBJECT_BASELINE_INVALID', 'System object contains the reserved .upstream name.');
  const originalEntry = base ? (derived ? derivedFiles.find(f => f.path === types[type].entry).bytes : base.snapshot.bytes) : null;
  const actualBody = derived && !Object.hasOwn(input, 'body') ? parseFrontmatter(originalEntry, path).body.toString('utf8') : body;
  const encoded = editEntry(originalEntry, candidate, actualBody, path);
  return { result, changed, encoded, derivedFiles, derived, proposed };
}
