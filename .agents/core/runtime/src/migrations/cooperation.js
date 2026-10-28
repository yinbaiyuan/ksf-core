import {portable} from '../shared/paths.js';
import {syncDirectorySync as syncDirectory,replaceFileSync} from '../platform/index.js';
import { existsSync, lstatSync, readdirSync, readFileSync, mkdirSync, unlinkSync, rmdirSync, realpathSync, linkSync, chmodSync } from 'node:fs';
import { join, dirname, relative, resolve, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256 } from '../shared/hash.js';
import { withExclusiveLock, withTemporaryFile, writeDurably } from '../shared/files.js';
import { parseFrontmatter, encodeFrontmatter, setField } from '../metadata/frontmatter.js';
import { MetadataError } from '../metadata/errors.js';
import { configuredSources, ordinaryDirectory } from '../sources/storage.js';
import { validateDeclaration } from '../sources/schema.js';
import { validateObjectDocument } from '../user-data/records.js';
import { validate as validateChat } from '../chat-state/storage.js';
import { currentObjectId, currentObjectPath } from '../objects/legacy.js';
import { validateObject } from '../objects/schema.js';
import { validateRouting } from '../projects/routing-schema.js';
export { assertNoCooperationMigration } from './guard.js';

export const migrationDirectory = '.agents/runtime-data/cooperation-migration';
const fail = (code, message, details = {}) => { throw new MetadataError(code, message, details); };
const json = bytes => { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('MIGRATION_DATA_INVALID', 'Invalid JSON was preserved.'); } };
const digest = path => existsSync(path) ? sha256(readFileSync(path)) : null;
const inside = (root, path) => { const p = relative(root, path); return !isAbsolute(p) && p !== '..' && !p.startsWith('..' + sep); };
function safe(path, roots) {
  path = resolve(path);
  const root = roots.filter(r => inside(r, path)).sort((a, b) => b.length - a.length)[0];
  if (!root) fail('MIGRATION_PATH_INVALID', 'Migration path is outside the selected roots.', { path });
  let p = root;
  for (const part of relative(root, path).split(sep).filter(Boolean)) {
    p = join(p, part);
    if (existsSync(p)) { const s = lstatSync(p); if (s.isSymbolicLink() || !s.isDirectory() && !s.isFile()) fail('MIGRATION_PATH_INVALID', 'Migration refuses symbolic links or special files.', { path: p }); }
    else { try { lstatSync(p); } catch (e) { if (e.code !== 'ENOENT') throw e; continue; } fail('MIGRATION_PATH_INVALID', 'Migration refuses dangling symbolic links.', { path: p }); }
  }
  return path;
}
function files(path, roots) {
  if (!existsSync(path)) return [];
  safe(path, roots);
  const s = lstatSync(path);
  if (s.isFile()) return [path];
  return readdirSync(path).sort().flatMap(name => files(join(path, name), roots));
}
const exactUpdates = {
  'cooperation.ksf.entry@0.1.25': 'cooperation.ksf.entry@0.1.26',
  'partner.ksf.runtime@0.1.24': 'partner.ksf.runtime@0.1.25',
  'partner.ksf.object-designer@0.1.5': 'partner.ksf.object-designer@0.1.6',
  'competency.ksf.cooperation-design@0.1.2': 'competency.ksf.cooperation-design@0.1.3',
  'competency.ksf.ability-route@0.1.5': 'competency.ksf.ability-route@0.1.6',
  'competency.ksf.project-route@0.1.8': 'competency.ksf.project-route@0.1.9',
  'competency.ksf.asset-maintenance@0.1.10': 'competency.ksf.asset-maintenance@0.1.11',
  'competency.ksf.partner-design@0.1.2': 'competency.ksf.partner-design@0.1.3',
  'competency.ksf.competency-design@0.1.2': 'competency.ksf.competency-design@0.1.3',
};
export function rewriteCooperationText(text, { terminology = false, baseline = false } = {}) {
  let next = text.replace(/\bworkflow\.[\p{L}\p{N}\p{S}_-]+\.[\p{L}\p{N}\p{S}_-]+/gu, (id, at, input) => input.slice(at + id.length).match(/^\s*\(/) ? id : currentObjectId(id))
    .replace(/\bcompetency\.ksf\.workflow-design\b/g, 'competency.ksf.cooperation-design')
    .replace(/(competencies\/)workflow-design(?=\/|\b)/g, '$1cooperation-design')
    .replace(/能力\/工作流/g, '能力/协同').replace(/abilities\/workflows/g, 'abilities/cooperations')
    .replace(/\bworkflow\.md\b/g, 'cooperation.md').replace(/\bksf workflow\b/g, 'ksf cooperation')
    .replace(/\brouting\.workflows\b/g, 'routing.cooperations');
  if (terminology) next = next.split('\n').map(line => /GitHub Actions|\.github\/workflows|\bgh workflow\b/i.test(line) ? line : line.replace(/Workflow/g, 'Cooperation').replace(/工作流/g, '协同')).join('\n');
  if (!baseline) for (const [old, value] of Object.entries(exactUpdates)) next = next.replaceAll(old, value);
  return next;
}
function plan(root) {
  const sources = configuredSources(root).map(s => ({ ...s, root: ordinaryDirectory(s.root) }));
  const roots = [root, ...sources.map(s => s.root)], actions = new Map(), cleanup = new Set(), origins = new Set(), directories = new Map();
  function movedDirectories(path, base) {
    safe(path, roots);
    if (!lstatSync(path).isDirectory()) return;
    const target = join(base, currentObjectPath(relative(base, path).split(sep).join('/')));
    if (path !== target) { directories.set(path, { source: path, target, existed: existsSync(target), mode: lstatSync(path).mode & 0o777 }); cleanup.add(path); }
    for (const name of readdirSync(path)) { const child = join(path, name); safe(child, roots); if (lstatSync(child).isDirectory()) movedDirectories(child, base); }
  }
  function add(source, target, bytes) {
    safe(source, roots); safe(target, roots);
    const original = readFileSync(source);
    if (source === target && original.equals(bytes)) return;
    if (source !== target && existsSync(target)) fail('MIGRATION_CONFLICT', 'Both old and new destinations exist; neither was changed.', { source, target });
    if ([...actions.values()].some(a => a.target === target && a.source !== source)) fail('MIGRATION_CONFLICT', 'Multiple old files map to one destination.', { target });
    actions.set(source, { source, target, before: sha256(original), after: sha256(bytes), mode: lstatSync(source).mode & 0o777, original, bytes });
    if (source !== target) { let p = dirname(source); while (roots.every(r => p !== r) && roots.some(r => inside(r, p))) { cleanup.add(p); p = dirname(p); } }
  }
  function markdown(file, target, terminology, baseline = false) {
    const original = readFileSync(file), parsed = parseFrontmatter(original, file);
    let next = rewriteCooperationText(original.toString('utf8'), { terminology, baseline });
    if (file === join(root, 'AGENTS.md') && parsed.values.id === 'workflow.ksf.entry' && parsed.values.version === '0.1.25') {
      const entry = parseFrontmatter(Buffer.from(next), file); setField(entry.doc, 'version', '0.1.26'); next = encodeFrontmatter(entry).toString('utf8');
    }
    if (parsed.values.routing?.workflows !== undefined && parsed.values.routing?.cooperations !== undefined) fail('MIGRATION_CONFLICT', 'Project has both old and new routing fields.', { file });
    if (portable(file).endsWith('/project.md') && parsed.values.routing?.workflows !== undefined) {
      const entry = parseFrontmatter(Buffer.from(next), file), routing = entry.doc.get('routing', true);
      const pair = routing.items.find(item => item.key?.value === 'workflows');
      pair.key.value = 'cooperations'; delete pair.key.source;
      next = encodeFrontmatter(entry).toString('utf8');
      validateRouting(parseFrontmatter(Buffer.from(next), file).values.routing);
    }
    if (next !== original.toString('utf8') && parsed.values.user_revision !== undefined && !baseline) {
      if (!Number.isSafeInteger(parsed.values.user_revision) || parsed.values.user_revision < 1 || parsed.values.user_revision === Number.MAX_SAFE_INTEGER) fail('MIGRATION_DATA_INVALID', 'Invalid user revision.', { file });
      const changed = parseFrontmatter(Buffer.from(next), file); setField(changed.doc, 'user_revision', parsed.values.user_revision + 1); next = encodeFrontmatter(changed).toString('utf8');
    }
    const changed = parseFrontmatter(Buffer.from(next), file);
    if (!baseline && (file === join(root, 'AGENTS.md') || /\/(?:workflow|cooperation|partner|competency|datapackage)\.md$/.test(portable(file)))) {
      const identity = changed.values.id;
      const errors = validateObject(changed.values, { type: identity?.split('.')[0], source: file === join(root, 'AGENTS.md') ? 'system' : sources.find(s => inside(s.root, file))?.id ?? 'user', path: relative(roots.filter(r => inside(r, file)).sort((a,b)=>b.length-a.length)[0], target).split(sep).join('/') });
      if (errors.length) fail('MIGRATION_DATA_INVALID', 'Invalid active definition was preserved.', { file, errors });
    }
    add(file, target, Buffer.from(next));
  }
  for (const base of roots) {
    const source = sources.find(s => s.root === base);
    if (source) {
      const declaration = join(base, 'ksf-source.yaml'); safe(declaration, roots);
      const parsed = parseFrontmatter(Buffer.concat([Buffer.from('---\n'), readFileSync(declaration), Buffer.from('\n---\n')]), declaration);
      if (parsed.body.length || ![1, 2].includes(parsed.values.schema_version) || parsed.values.id !== source.id) fail('MIGRATION_DATA_INVALID', 'Source declaration version or identity is invalid.', { declaration });
      validateDeclaration({ ...parsed.values, schema_version: 2 });
      if (parsed.values.schema_version === 1) {
        setField(parsed.doc, 'schema_version', 2);
        add(declaration, declaration, Buffer.from(parsed.doc.toString({ lineWidth: 0 })));
      }
      for (const name of ['AGENTS.md', 'README.md']) if (existsSync(join(base, name))) markdown(join(base, name), join(base, name), true);
    } else for (const name of ['AGENTS.md', 'BOT.md', 'README.md']) if (existsSync(join(base, name))) markdown(join(base, name), join(base, name), true);
    for (const category of ['工作流', '协同', '搭档', '基本功', '数据包']) {
      const directory = join(base, '能力', category);
      if (!existsSync(directory)) continue;
      safe(directory, roots);
      if (category === '工作流') {
        for (const name of readdirSync(directory)) {
          const child = join(directory, name); safe(child, roots);
          const target = join(base, currentObjectPath(relative(base, child).split(sep).join('/')));
          if (lstatSync(child).isDirectory() && existsSync(target)) fail('MIGRATION_CONFLICT', 'Both old and new object directories exist; directory merging is not automatic.', { source: child, target });
        }
        movedDirectories(directory, base);
      }
      const selected = category === '工作流' ? files(directory, roots) : readdirSync(directory).flatMap(name => {
        const child = join(directory, name);
        safe(child, roots);
        if (!lstatSync(child).isDirectory()) return [];
        const renamed = currentObjectPath(relative(base, child).split(sep).join('/')) !== relative(base, child).split(sep).join('/');
        if (renamed) {
          const target = join(base, currentObjectPath(relative(base, child).split(sep).join('/')));
          if (existsSync(target)) fail('MIGRATION_CONFLICT', 'Both old and new object directories exist.', { source: child, target });
          movedDirectories(child, base); return files(child, roots);
        }
        return ['cooperation.md', 'partner.md', 'competency.md', 'datapackage.md'].map(name => join(child, name)).filter(existsSync)
          .concat(files(join(child, '.upstream'), roots));
      });
      for (const file of selected) {
        if (portable(file).endsWith('/.upstream/origin.json')) origins.add(file);
        const rel = relative(base, file).split(sep).join('/'), target = join(base, currentObjectPath(rel));
        const baseline = rel.includes('/.upstream/');
        const definition = /\/(?:workflow|cooperation|partner|competency|datapackage)\.md$/.test(rel);
        if (file.endsWith('.md') && (category === '工作流' || definition || baseline)) markdown(file, target, category === '工作流' || !source, baseline);
        else if (file !== target) add(file, target, readFileSync(file));
      }
    }
  }
  for (const scope of ['项目', '档案/项目']) {
    const directory = join(root, scope);
    if (!existsSync(directory)) continue;
    safe(directory, roots);
    for (const child of readdirSync(directory)) {
      const file = join(directory, child, 'project.md');
      if (existsSync(file)) markdown(file, file, false);
    }
  }
  // Baselines remain verifiable after a type/path rename; originals stay in the
  // migration backup, not in the new object as a falsely unchanged checksum.
  for (const origin of origins) {
    const base = roots.filter(r => inside(r, origin)).sort((a,b)=>b.length-a.length)[0];
    const old = json(readFileSync(origin)), snapshotRoot = join(dirname(origin), 'snapshot');
    const snapshotFiles = files(snapshotRoot, roots);
    const oldFiles = snapshotFiles.map(f => ({ path: relative(snapshotRoot, f).split(sep).join('/'), sha256: sha256(readFileSync(f)) })).sort((a,b)=>a.path.localeCompare(b.path,'en'));
    const actualDirectories = [];
    const visit = path => { actualDirectories.push(relative(snapshotRoot, path).split(sep).join('/')); for (const name of readdirSync(path)) if (lstatSync(join(path, name)).isDirectory()) visit(join(path, name)); };
    visit(snapshotRoot);
    const order = list => [...list].sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (!Array.isArray(old.files) || !Array.isArray(old.directories) || JSON.stringify([...old.directories].sort()) !== JSON.stringify(actualDirectories.sort()) || JSON.stringify(order(old.files)) !== JSON.stringify(order(oldFiles)) || old.digest !== sha256(JSON.stringify({ files: old.files, directories: old.directories }))) fail('MIGRATION_BASELINE_INVALID', 'Derived baseline failed verification; originals were preserved.', { origin });
    const newOrigin = join(base, currentObjectPath(relative(base, origin).split(sep).join('/')));
    const newSnapshotRoot = join(dirname(newOrigin), 'snapshot');
    const updatedFiles = order(snapshotFiles.map(f => {
      const a = actions.get(f), target = a?.target ?? f;
      return { path: relative(newSnapshotRoot, target).split(sep).join('/'), sha256: a?.after ?? sha256(readFileSync(f)) };
    }));
    const directories = old.directories.map(currentObjectPath).sort();
    const updated = { ...old, id: currentObjectId(old.id), sourcePath: currentObjectPath(old.sourcePath), files: updatedFiles, directories, digest: sha256(JSON.stringify({ files: updatedFiles, directories })) };
    if (JSON.stringify(updated) !== JSON.stringify(old) || origin !== newOrigin) add(origin, newOrigin, Buffer.from(JSON.stringify(updated, null, 2) + '\n'));
  }
  for (const directory of [join(root, '.agents/user-data/abilities'), join(root, '.agents/user-data/chats')]) {
    for (const file of files(directory, roots)) {
      if (!file.endsWith('.json') || !file.includes(`${sep}abilities${sep}`)) continue;
      const old = json(readFileSync(file)), key = old.object_id !== undefined ? 'object_id' : 'objectId';
      const id = old[key], nextId = currentObjectId(id);
      if (id === nextId) continue;
      if (typeof id !== 'string' || !file.endsWith(sha256(id) + '.json')) fail('MIGRATION_DATA_INVALID', 'Object state filename and identity disagree.', { file });
      const next = { ...old, [key]: nextId, revision: old.revision + 1 };
      if (key === 'object_id') validateObjectDocument(next, nextId); else validateChat(next, 'scope', next.chatId, nextId);
      add(file, join(dirname(file), sha256(nextId) + '.json'), Buffer.from(JSON.stringify(next, null, 2) + '\n'));
    }
  }
  return { roots, actions: [...actions.values()], directories: [...directories.values()], cleanup: [...cleanup].sort((a,b)=>b.length-a.length) };
}
function atomic(path, bytes, mode = 0o600, create = false) {
  mkdirSync(dirname(path), { recursive: true });
  withTemporaryFile(`${path}.${randomUUID()}.tmp`, bytes, { mode, permissions: mode }, temporary => {
    if (create) linkSync(temporary, path); else replaceFileSync(temporary, path);
    syncDirectory(dirname(path));
  });
}
function writeJournal(file, data) { atomic(file, Buffer.from(JSON.stringify(data, null, 2) + '\n')); }
function verifyTrees(state, preparing = false) {
  const dirs = state.directories ?? [];
  const categories = state.roots.map(root => join(root, '能力/工作流'));
  const objects = dirs.filter(d => !categories.includes(d.source) && !dirs.some(parent => parent !== d && !categories.includes(parent.source) && inside(parent.source, d.source)));
  const allowedFiles = new Set(state.actions.map(a => a.target)), allowedDirs = new Set(dirs.map(d => d.target));
  for (const d of dirs) if (preparing && !d.existed && existsSync(d.target)) fail('MIGRATION_CONFLICT', 'A target directory appeared during preparation.', { target: d.target });
  function visit(path) {
    safe(path, state.roots);
    if (!existsSync(path)) return;
    const directory = lstatSync(path).isDirectory();
    if (!(directory ? allowedDirs : allowedFiles).has(path)) fail('MIGRATION_CONFLICT', 'An unplanned target entry appeared; preserve it and reconcile before resuming.', { target: path });
    if (directory) for (const name of readdirSync(path)) visit(join(path, name));
  }
  for (const d of objects) visit(d.target);
}
function noWriters(roots) {
  for (const root of roots) for (const name of ['objects', 'user-data', 'chat-state', 'projects']) {
    const locks = files(join(root, '.agents/runtime-data', name), roots).filter(file => file.endsWith('.lock'));
    if (locks.length) fail('MIGRATION_BUSY', 'A related writer holds a lock; let it finish or inspect the stale lock before resuming.', { locks });
  }
}
function pending(root) {
  const file = join(root, migrationDirectory, 'state.json');
  safe(file, [root]);
  if (!existsSync(file)) return null;
  const state = json(readFileSync(file));
  if (state.schemaVersion !== 1 || state.root !== root || !/^[a-f0-9-]{36}$/.test(state.id ?? '') || !['applying', 'complete'].includes(state.status) || !Array.isArray(state.actions) || !Array.isArray(state.roots) || !Array.isArray(state.cleanup) || state.actions.some(a => typeof a.source !== 'string' || typeof a.target !== 'string' || !/^[a-f0-9]{64}$/.test(a.before) || !/^[a-f0-9]{64}$/.test(a.after) || !Number.isSafeInteger(a.mode) || a.mode < 0 || a.mode > 0o777)) fail('MIGRATION_DATA_INVALID', 'Invalid migration journal; preserve it.', { file });
  if (state.directories !== undefined && (!Array.isArray(state.directories) || state.directories.some(d => typeof d?.source !== 'string' || typeof d?.target !== 'string' || d.mode !== undefined && (!Number.isSafeInteger(d.mode) || d.mode < 0 || d.mode > 0o777)))) fail('MIGRATION_DATA_INVALID', 'Invalid migration directory journal.', { file });
  if (state.status === 'applying') {
    const allowed = [root, ...configuredSources(root).map(s => ordinaryDirectory(s.root))];
    if (JSON.stringify(state.roots) !== JSON.stringify(allowed)) fail('MIGRATION_CONFLICT', 'The selected source roots changed during migration.', { file });
  }
  return state.status === 'applying' ? state : null;
}
export function migrateCooperation({ root, apply = false }, hooks = {}) {
  root = realpathSync(root);
  let state = pending(root), proposed = state ?? plan(root);
  const resumed = Boolean(state);
  const summary = () => ({ dryRun: !apply, changed: false, wouldChange: proposed.actions.length > 0 || (proposed.directories?.length ?? 0) > 0, resumed, directories: proposed.directories ?? [], files: proposed.actions.map(a => ({ source: a.source, target: a.target })), count: proposed.actions.length });
  if (!apply || !summary().wouldChange) return summary();
  const directory = join(root, migrationDirectory); safe(directory, [root]); mkdirSync(directory, { recursive: true });
  const lock = join(directory, 'write.lock');
  // A dead migration owner may be recovered. Unknown/live owners stay locked.
  if (existsSync(lock)) {
    const before = lstatSync(lock), owner = json(readFileSync(lock));
    if (before.isSymbolicLink()) fail('MIGRATION_PATH_INVALID', 'Migration lock cannot be a symbolic link.');
    if (Number.isSafeInteger(owner.pid) && owner.pid > 0) try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') { const after = lstatSync(lock); if (after.dev === before.dev && after.ino === before.ino) unlinkSync(lock); } else throw e; }
  }
  return withExclusiveLock(lock, { pid: process.pid }, () => {
    state = pending(root);
    if (!state) {
      proposed = plan(root); hooks.beforePublish?.(proposed);
      noWriters(proposed.roots);
      verifyTrees(proposed, true);
      for (const a of proposed.actions) { if (digest(a.source) !== a.before || a.source !== a.target && existsSync(a.target)) fail('MIGRATION_CONFLICT', 'A migration input changed during preparation.', { source: a.source }); }
      const id = randomUUID(), backup = join(directory, 'backups', id); mkdirSync(backup, { recursive: true });
      state = { schemaVersion: 1, root, id, status: 'applying', roots: proposed.roots, directories: proposed.directories, cleanup: proposed.cleanup, completed: 0, actions: proposed.actions.map((a, index) => {
        writeDurably(join(backup, `${index}.before`), a.original); writeDurably(join(backup, `${index}.after`), a.bytes);
        return { source: a.source, target: a.target, before: a.before, after: a.after, mode: a.mode };
      }) };
      writeDurably(join(backup, 'manifest.json'), Buffer.from(JSON.stringify(state, null, 2) + '\n'));
      syncDirectory(backup); syncDirectory(dirname(backup));
      writeJournal(join(directory, 'state.json'), state);
    }
    const backup = join(directory, 'backups', state.id);
    safe(backup, [root]);
    noWriters(state.roots);
    verifyTrees(state);
    // Preflight the entire remaining transaction before touching any one file.
    for (const a of state.actions) {
      safe(a.source, state.roots); safe(a.target, state.roots);
      const source = digest(a.source), target = digest(a.target);
      if (a.source === a.target ? ![a.before, a.after].includes(source) : ![null, a.before].includes(source) || ![null, a.after].includes(target) || source === null && target === null) fail('MIGRATION_CONFLICT', 'Concurrent edits prevent migration recovery.', { source: a.source, target: a.target });
    }
    for (const d of state.directories ?? []) { safe(d.source, state.roots); safe(d.target, state.roots); }
    for (const d of state.directories ?? []) { const created = mkdirSync(d.target, { recursive: true, mode: d.mode ?? 0o755 }); if (created && d.mode !== undefined) chmodSync(d.target, d.mode); syncDirectory(dirname(d.target)); }
    for (let index = 0; index < state.actions.length; index++) {
      const a = state.actions[index]; hooks.beforeOperation?.(index, a);
      const staged = join(backup, `${index}.after`); safe(staged, [root]);
      const bytes = readFileSync(staged);
      if (sha256(bytes) !== a.after) fail('MIGRATION_DATA_INVALID', 'Staged migration bytes failed their digest.', { index });
      if (digest(a.target) !== a.after) {
        if (digest(a.source) !== a.before || a.source !== a.target && existsSync(a.target)) fail('MIGRATION_CONFLICT', 'File changed before publication.', { source: a.source });
        atomic(a.target, bytes, a.mode, a.source !== a.target);
      }
      if (a.source !== a.target && existsSync(a.source)) {
        if (digest(a.source) !== a.before) fail('MIGRATION_CONFLICT', 'Old file changed before removal.', { source: a.source });
        unlinkSync(a.source);
        syncDirectory(dirname(a.source));
      }
      state.completed = index + 1; writeJournal(join(directory, 'state.json'), state); hooks.afterOperation?.(index, a);
    }
    verifyTrees(state);
    for (const path of state.cleanup) try { safe(path, state.roots); rmdirSync(path); } catch (e) {
      if (['ENOTEMPTY', 'EEXIST'].includes(e.code) && state.directories?.some(d => d.source === path)) fail('MIGRATION_CONFLICT', 'The old directory contains a concurrent addition; preserve it before resuming.', { source: path });
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e;
    }
    state.status = 'complete'; writeJournal(join(directory, 'state.json'), state);
    return { ...summary(), changed: true, backupDirectory: backup, migrationId: state.id };
  }, { onLocked() { fail('MIGRATION_LOCKED', 'Another migration owns the lock; preserve it.'); } });
}
