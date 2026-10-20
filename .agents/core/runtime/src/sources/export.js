import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withExclusiveLock } from '../shared/files.js';
import { catalog, fingerprint, summary } from '../objects/catalog.js';
import { resolveObject, referenceResults, problems } from '../objects/references.js';
import { types, parseReference, protectedPaths, validateObject, validId, versionPattern } from '../objects/schema.js';
import { parseFrontmatter, encodeFrontmatter } from '../metadata/frontmatter.js';
import { readTree, copyTree } from '../objects/storage.js';
import { rebaseMarkdown } from '../objects/markdown.js';
import { objectQuery } from '../services/objects.js';
import { repositoryWorktreeChanges } from '../services/repositories.js';
import { configuredSources, readDeclaration, ordinaryDirectory, within } from './storage.js';
import { sourceFailure } from './schema.js';

const missing = error => ['OBJECT_NOT_FOUND', 'OBJECT_VERSION_MISMATCH'].includes(error.code);
// Compare Git-persisted content: owner permission bits and empty directories
// change across clones and are not publication-version changes.
const sameTree = (a, b) => a && a.files.length === b.files.length &&
  a.files.every((file, i) => file.path === b.files[i].path && file.bytes.equals(b.files[i].bytes) && Boolean(file.mode & 0o111) === Boolean(b.files[i].mode & 0o111));

export function exportObjects({ root, sourceId, reference, versions = {}, dryRun }, hooks = {}) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions) || Object.entries(versions).some(([id, value]) => !validId(id) || typeof value !== 'string' || !versionPattern.test(value))) sourceFailure('INVALID_ARGUMENTS', 'Invalid publication version mapping.', { exitCode: 2 });
  const registered = configuredSources(root).find(entry => entry.id === sourceId);
  if (!registered) sourceFailure('SOURCE_NOT_FOUND', 'Export requires a linked target source.', { id: sourceId });
  const declaration = readDeclaration(registered.root, sourceId), destination = declaration.root;
  const perform = () => {
    const c = catalog(root), before = fingerprint(c), parsed = parseReference(reference);
    if (Object.hasOwn(protectedPaths, parsed.id)) sourceFailure('OBJECT_PROTECTED', 'Fixed system entries cannot be published to ability sources.');
    const targetErrors = problems(c, { source: sourceId });
    if (targetErrors.length) sourceFailure('SOURCE_INVALID', 'Repair target source errors before exporting.', { errors: targetErrors });
    const selected = new Map();
    const personal = ref => {
      if (Object.hasOwn(protectedPaths, ref.id)) return;
      try { return resolveObject(c, ref, 'user'); }
      catch (error) { if (!missing(error)) throw error; }
    };
    const visit = row => {
      const previous = selected.get(row.id);
      if (previous) {
        if (previous.metadata.version !== row.metadata.version) sourceFailure('SOURCE_DEPENDENCY_INVALID', 'Export requires incompatible versions of one object.', { id: row.id });
        return;
      }
      if (row.metadata.status === 'archived') sourceFailure('SOURCE_DEPENDENCY_INVALID', 'Archived personal objects cannot be exported.', { id: row.id });
      if (!row.parsed.body.toString('utf8').trim()) sourceFailure('SOURCE_EXPORT_INVALID', 'Published objects require a nonempty body.', { id: row.id });
      const checked = objectQuery({ root, type: row.type, operation: 'check', reference: row.id + '@' + row.metadata.version, source: 'user' });
      // Baseline and personal metadata must be intact; dependencies are resolved
      // below against this contribution rather than other linked repositories.
      const invalid = checked.errors.filter(error => !['SOURCE_AMBIGUOUS', 'OBJECT_NOT_FOUND', 'OBJECT_VERSION_MISMATCH'].includes(error.code));
      if (invalid.length) sourceFailure('SOURCE_EXPORT_INVALID', 'Personal object validation failed.', { id: row.id, errors: invalid });
      selected.set(row.id, row);
      for (const value of row.metadata.references ?? []) {
        const ref = parseReference(value), local = personal(ref);
        if (local && local.metadata.status !== 'archived') { visit(local); continue; }
        let satisfied = false;
        for (const provider of [sourceId, 'system']) {
          try {
            const dependency = resolveObject(c, ref, provider);
            if (dependency.metadata.status !== 'archived') { satisfied = true; break; }
          } catch (error) { if (!missing(error) && error.code !== 'OBJECT_PROTECTED') throw error; }
        }
        if (!satisfied) sourceFailure('SOURCE_DEPENDENCY_INVALID', 'Dependency must be provided by the target source, Core, or an explicitly exported personal object.', { id: row.id, reference: value });
      }
    };
    const original = personal(parsed);
    if (!original) sourceFailure('OBJECT_NOT_FOUND', 'Export selects a personal object; other sources are not copied automatically.', { id: parsed.id });
    visit(original);
    if (Object.keys(versions).some(id => !selected.has(id))) sourceFailure('INVALID_ARGUMENTS', 'Publication version mappings must select objects in this contribution.', { exitCode: 2 });
    const plans = [...selected.values()].sort((a, b) => a.id.localeCompare(b.id)).map(row => {
      const sourceDirectory = join(root, row.directory);
      const tree = readTree(sourceDirectory, { exclude: [join(sourceDirectory, '.upstream')] });
      if ([...tree.directories, ...tree.files].some(item => item.path.split('/').some(part => ['.git', '.upstream'].includes(part)))) sourceFailure('SOURCE_RESOURCE_INVALID', 'Object resources cannot contain repository history or nested personal baselines.', { id: row.id });
      return { row, sourceDirectory, tree, target: join(destination, types[row.type].user, row.id) };
    });
    for (const plan of plans) {
      const metadata = { ...plan.row.metadata }; delete metadata.user_revision; delete metadata.upstream;
      if (Object.hasOwn(versions, plan.row.id)) metadata.version = versions[plan.row.id];
      if (metadata.references) metadata.references = metadata.references.map(value => {
        const ref = parseReference(value);
        return Object.hasOwn(versions, ref.id) && selected.get(ref.id)?.metadata.version === ref.version ? ref.id + '@' + versions[ref.id] : value;
      });
      const mapped = plan.tree.files.map(file => {
        let bytes = file.bytes;
        if (file.path.toLowerCase().endsWith('.md')) bytes = rebaseMarkdown(bytes, join(plan.sourceDirectory, file.path), join(plan.target, file.path), plan.sourceDirectory, {
          mapExternal(path) {
            const owner = plans.find(item => within(item.sourceDirectory, path));
            if (!owner) sourceFailure('SOURCE_RESOURCE_EXTERNAL', 'Relative resource is outside the selected contribution; package it explicitly before sharing.', { id: plan.row.id, target: path });
            return join(owner.target, relative(owner.sourceDirectory, path));
          },
        });
        if (file.path === types[plan.row.type].entry) {
          const parsed = parseFrontmatter(bytes, file.path);
          parsed.doc.delete('user_revision'); parsed.doc.delete('upstream');
          parsed.doc.set('version', metadata.version);
          if (metadata.references) parsed.doc.set('references', metadata.references);
          bytes = encodeFrontmatter(parsed);
        }
        return { ...file, bytes, mode: file.mode & 0o111 ? 0o755 : 0o644 };
      });
      plan.exported = { ...plan.tree, files: mapped, directories: plan.tree.directories.map(item => ({ ...item, mode: 0o755 })) };
      plan.previous = existsSync(plan.target) ? readTree(plan.target) : null;
      plan.changed = !sameTree(plan.previous, plan.exported);
      const old = c.rows.find(row => row.source === sourceId && row.id === plan.row.id);
      if (old && old.directory !== plan.target) sourceFailure('SOURCE_PATH_CONFLICT', 'Existing target object is outside its standard ID directory.', { id: plan.row.id });
      const versionOrder = old ? metadata.version.split('.').map(BigInt).reduce((order, part, i) => order || (part > BigInt(old.metadata.version.split('.')[i]) ? 1 : part < BigInt(old.metadata.version.split('.')[i]) ? -1 : 0), 0) : 1;
      if (old && plan.changed && versionOrder <= 0) sourceFailure('SOURCE_VERSION_REQUIRED', 'Changed published content requires a newer object version.', { id: plan.row.id, version: metadata.version });
      const entry = mapped.find(file => file.path === types[plan.row.type].entry);
      plan.candidate = { type: plan.row.type, id: plan.row.id, source: sourceId, sourceRoot: destination,
        path: join(plan.target, types[plan.row.type].entry), directory: plan.target, metadata,
        parsed: parseFrontmatter(entry.bytes, entry.path), errors: validateObject(metadata, { type: plan.row.type, source: sourceId, path: plan.target }) };
    }
    const after = { ...c, rows: [...c.rows.filter(row => row.source !== sourceId || !selected.has(row.id)), ...plans.map(plan => plan.candidate)] };
    const dependencyErrors = after.rows.filter(row => row.source === sourceId && row.metadata?.status !== 'archived').flatMap(row => referenceResults(after, row).filter(ref => ref.error).map(ref => ref.error));
    // Preserve references from personal objects to the old published versions.
    for (const row of c.rows.filter(row => row.source !== sourceId && row.metadata?.status !== 'archived' && !row.errors.length)) {
      for (const ref of referenceResults(c, row).filter(ref => !ref.error)) {
        if (referenceResults(after, row).some(next => next.reference === ref.reference && next.error)) dependencyErrors.push({ code: 'OBJECT_DEPENDENTS_BLOCKED', message: 'Export would break an existing reference.', id: row.id, reference: ref.reference });
      }
    }
    if (dependencyErrors.length) sourceFailure('SOURCE_DEPENDENCY_INVALID', 'Contribution has unresolved or broken exact references.', { errors: dependencyErrors });
    for (const plan of plans.filter(plan => plan.previous && plan.changed)) {
      if (repositoryWorktreeChanges(destination, [relative(destination, plan.target)])) sourceFailure('SOURCE_TARGET_DIRTY', 'The selected target object has existing Git changes; preserve or merge them before exporting.', { id: plan.row.id, target: plan.target });
    }
    const data = { id: sourceId, path: destination, dryRun, changed: false, wouldChange: plans.some(plan => plan.changed),
      objects: plans.map(plan => ({ ...summary(plan.candidate), changed: plan.changed,
        files: plan.exported.files.map(file => relative(destination, join(plan.target, file.path)).split('\\').join('/')),
        removed_files: (plan.previous?.files ?? []).filter(file => !plan.exported.files.some(next => next.path === file.path)).map(file => relative(destination, join(plan.target, file.path)).split('\\').join('/')) })),
      next: 'Review the target Git diff; commit the selected paths and open a draft PR using the normal repository workflow.' };
    if (dryRun || !data.wouldChange) return { data, errors: [] };
    const verify = () => {
      hooks.beforePublish?.();
      if (fingerprint(catalog(root)) !== before || readDeclaration(destination, sourceId).declarationSnapshot.bytes.compare(declaration.declarationSnapshot.bytes) !== 0) sourceFailure('SOURCE_CONFLICT', 'Objects or source registration changed before publication.');
      for (const plan of plans) {
        if (readTree(plan.sourceDirectory, { exclude: [join(plan.sourceDirectory, '.upstream')] }).fingerprint !== plan.tree.fingerprint ||
            (existsSync(plan.target) ? readTree(plan.target).fingerprint : null) !== (plan.previous?.fingerprint ?? null)) sourceFailure('SOURCE_CONFLICT', 'Contribution inputs or target resources changed before publication.', { id: plan.row.id });
      }
    };
    const staged = [], applied = [];
    try {
      for (const plan of plans.filter(plan => plan.changed)) {
        const parent = join(destination, types[plan.row.type].user);
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        ordinaryDirectory(parent);
        plan.staging = join(parent, '.ksf-object-staging-' + randomUUID());
        staged.push(plan); copyTree(plan.exported, plan.staging);
      }
      verify();
      for (const plan of staged) {
        if (plan.previous) { plan.backup = join(dirname(plan.target), '.ksf-object-replacing-' + randomUUID()); renameSync(plan.target, plan.backup); }
        applied.push(plan); renameSync(plan.staging, plan.target); plan.published = true;
        hooks.afterObjectPublish?.(plan.row.id);
      }
    } catch (error) {
      for (const plan of [...applied].reverse()) {
        try { if (plan.published) rmSync(plan.target, { recursive: true }); if (plan.backup) renameSync(plan.backup, plan.target); }
        catch { sourceFailure('SOURCE_RECOVERY_REQUIRED', 'Publication rollback needs inspection; preserved recovery directory.', { recoveryPath: plan.backup, changed: true }); }
      }
      throw error;
    } finally {
      for (const plan of staged) if (existsSync(plan.staging)) rmSync(plan.staging, { recursive: true });
    }
    data.changed = true;
    for (const plan of applied) if (plan.backup) {
      try { rmSync(plan.backup, { recursive: true }); }
      catch { sourceFailure('SOURCE_CLEANUP_FAILED', 'Contribution is published locally; an old directory needs cleanup.', { data, recoveryPath: plan.backup }); }
    }
    return { data, errors: [] };
  };
  return dryRun ? perform() : withExclusiveLock(join(destination, '.ksf-source-write.lock'), { pid: process.pid }, perform, {
    onLocked() { sourceFailure('SOURCE_LOCKED', 'Another source writer holds the repository lock.'); },
  });
}
