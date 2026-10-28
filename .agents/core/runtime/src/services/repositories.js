import {portable} from '../shared/paths.js';
import { platform,gitExecutable } from '../platform/index.js';
import { withExclusiveLock } from '../shared/files.js';
import { lstatSync, realpathSync, readdirSync, mkdirSync, rmdirSync } from 'node:fs';
import { resolve, join, relative, dirname, basename, isAbsolute, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MetadataError, invalid } from '../metadata/errors.js';
import { project, updateProjectMetadata } from './projects.js';

const fail = (code, message, target) => { throw new MetadataError(code, message, target ? { target } : {}); };
const binary = gitExecutable;
// Local, non-mutating status for callers preparing a targeted contribution.
export function repositoryWorktreeChanges(path, paths) {
  const result = git(path, ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored', '--', ...paths]);
  if (result.status !== 0) fail('REPOSITORY_GIT_FAILED', 'Cannot inspect existing repository changes.', path);
  return result.stdout;
}
export function repositoryErrorItem(error, target) {
  if (error instanceof MetadataError) return { code: error.code, message: error.message, ...error.details };
  return { code: 'REPOSITORY_IO_FAILED', message: 'Cannot access repository files.', ...(target ? { target } : {}) };
}
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)); };
const display = (root, path) => inside(root, path) ? portable(relative(root, path)) || '.' : path;
function stat(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directory(path, optional = false) {
  const entry = stat(path);
  if (!entry && optional) return null;
  if (!entry) fail('REPOSITORY_NOT_FOUND', 'Repository directory does not exist.', path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) fail('REPOSITORY_PATH_INVALID', 'Managed paths must be ordinary directories.', path);
  return entry;
}
function git(path, args, run = spawnSync) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' };
  for (const key of Object.keys(env)) if (/^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|SHALLOW_FILE|NAMESPACE|CONFIG.*|.*PATHSPECS)$/.test(key)) delete env[key];
  // check-ignore accepts literal paths directly and rejects pathspec magic.
  const result = run(binary, ['--no-replace-objects', ...(args[0] === 'ls-files' ? ['--literal-pathspecs'] : []), '-C', path, ...args], { encoding: 'utf8', env, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') fail('REPOSITORY_GIT_REQUIRED', 'Install Git to manage project repositories.');
  if (result.error || result.signal) fail('REPOSITORY_GIT_FAILED', 'Git could not complete the local operation.', path);
  return result;
}
function scopeOf(root) {
  const scope = join(root, 'repositories');
  directory(scope, true);
  if (stat(join(scope, '.git'))) fail('REPOSITORY_SCOPE_INVALID', 'repositories is a container; initialize Git only in its child projects.', scope);
  return scope;
}
function parentIsolation(root, run) {
  const scope = scopeOf(root);
  const parent = git(root, ['rev-parse', '--show-toplevel'], run);
  if (parent.status !== 0) return null; // A plain-folder KSF has no outer Git index.
  const tracked = git(root, ['ls-files', '-z', '--', scope], run);
  if (tracked.status !== 0) fail('REPOSITORY_GIT_FAILED', 'Cannot inspect the outer Git index.', scope);
  if (tracked.stdout.length) fail('REPOSITORY_PARENT_TRACKED', 'The outer Git index already tracks repositories content; inspect it before continuing.', scope);
  const ignored = git(root, ['check-ignore', '--quiet', '--no-index', '--', scope + sep], run);
  if (ignored.status !== 0) fail('REPOSITORY_NOT_IGNORED', 'Add /repositories/ to the KSF root .gitignore before creating or linking managed repositories.', scope);
  return true;
}
function commonDirectory(path, run, optional = false) {
  const result = git(path, ['rev-parse', '--git-common-dir'], run);
  if (result.status !== 0) {
    if (optional) return null; // A plain-folder KSF has no outer Git history.
    fail('REPOSITORY_GIT_FAILED', 'Cannot inspect the repository Git storage.', path);
  }
  // Git may return a relative path; worktrees can also point through symlinks.
  const value = result.stdout.replace(/\r?\n$/, '');
  if (!value) fail('REPOSITORY_GIT_FAILED', 'Cannot inspect the repository Git storage.', path);
  return realpathSync.native(resolve(path, value));
}
function identity(root, path, run) {
  directory(path);
  const real = realpathSync(path), scope = scopeOf(root), managed = inside(scope, real) && real !== scope;
  if (managed) {
    if (dirname(real) !== scope) fail('REPOSITORY_PATH_INVALID', 'Managed repositories must be direct children of repositories.', path);
    parentIsolation(root, run);
  }
  const top = git(real, ['rev-parse', '--show-toplevel'], run);
  if (top.status !== 0 || realpathSync.native(top.stdout.replace(/\r?\n$/, '')) !== realpathSync.native(real)) fail('REPOSITORY_ROOT_MISMATCH', 'The selected directory must itself be a Git working-tree root, not inherit its parent repository.', path);
  const outerCommon = commonDirectory(root, run, true);
  if (outerCommon && commonDirectory(real, run) === outerCommon) fail('REPOSITORY_SHARED_GIT', 'The engineering repository must not share Git history with the outer KSF repository; use an independent repository.', path);
  const branch = git(real, ['symbolic-ref', '--quiet', '--short', 'HEAD'], run);
  return { name: basename(real), path: display(root, real), gitRoot: display(root, real), managed, branch: branch.status === 0 ? branch.stdout.trim() : null, valid: true };
}
function pathsFrom(metadata, folder, projectName) {
  const values = Object.hasOwn(metadata, 'repositories') ? metadata.repositories : [];
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/.test(value))) {
    fail('REPOSITORY_LINKS_INVALID', 'Project repositories metadata must be an array of nonempty local paths.', projectName);
  }
  return values.map(value => ({ value, absolute: resolve(folder, value) }));
}
function withRepositoryLock(root, action) {
  const folder = join(root, '.agents/runtime-data/repositories');
  for (const path of [join(root, '.agents'), join(root, '.agents/runtime-data'), folder]) {
    if (!directory(path, true)) mkdirSync(path);
  }
  const lock = join(folder, 'write.lock');
  return withExclusiveLock(lock, { pid: process.pid }, () => action(), {
    onLocked() { fail('REPOSITORY_LOCKED', 'Repository write lock exists; inspect its owner before retrying.', lock); },
    onCleanup() { process.stderr.write('REPOSITORY_LOCK_CLEANUP: Inspect the remaining repository lock.\n'); },
  });
}

function create(root, name, dryRun, hooks) {
  if (typeof name !== 'string' || !name.trim() || ['.', '..'].includes(name) || /[/\\\x00-\x1f\x7f]/.test(name) || name.startsWith('.ksf-')) invalid('Repository creation requires one ordinary directory name.');
  if(!platform.validSegment(name))invalid('Repository name is not supported by the native filesystem.');
  // Reserve case variants, Windows trailing dots/spaces and HFS+ ignored characters.
  const gitName = name.replace(/[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/g, '').replace(/[. ]+$/, '').toLowerCase();
  if (gitName === '.git') invalid('The name .git and its filesystem-equivalent forms are reserved for Git metadata.');
  const scope = scopeOf(root), target = join(scope, name);
  const execute = () => {
    parentIsolation(root, hooks.run);
    const existing = directory(target, true);
    if (existing) return { name, path: display(root, target), dryRun, changed: false, wouldChange: false, created: false,
      repository: identity(root, target, hooks.run) };
    git(root, ['--version'], hooks.run);
    const result = { name, path: display(root, target), dryRun, changed: false, wouldChange: true, created: false, branch: 'main' };
    if (dryRun) return result;
    if (!directory(scope, true)) mkdirSync(scope);
    const scopeEntry = directory(scope);
    mkdirSync(target); // Exclusive creation never adopts or replaces existing files.
    const own = lstatSync(target);
    try {
      hooks.beforeInit?.();
      const now = directory(target), parent = directory(scope);
      if (own.dev !== now.dev || own.ino !== now.ino || scopeEntry.dev !== parent.dev || scopeEntry.ino !== parent.ino) fail('REPOSITORY_CONFLICT', 'Repository path changed before initialization.', target);
      const initialized = git(target, ['init', '--template=', '--initial-branch=main'], hooks.run);
      if (initialized.status !== 0) fail('REPOSITORY_GIT_FAILED', 'Git initialization failed; inspect the reported directory before retrying.', target);
      result.repository = identity(root, target, hooks.run);
      return { ...result, changed: true, created: true };
    } catch (error) {
      // Remove only an empty directory we still own; partial Git state or any
      // concurrent contents remain available for inspection and recovery.
      try { const latest = lstatSync(target); if (latest.dev === own.dev && latest.ino === own.ino) rmdirSync(target); } catch { /* Preserve nonempty or replaced directories. */ }
      if (error instanceof MetadataError) error.details = { ...error.details, data: { ...result, changed: !!stat(target), recoveryPath: stat(target) ? display(root, target) : null } };
      throw error;
    }
  };
  return dryRun ? execute() : withRepositoryLock(root, execute);
}
export function repository({ root, operation, target, projectName, scope = 'current', dryRun = false }, hooks = {}) {
  if (typeof root !== 'string' || !['create', 'link', 'unlink', 'list', 'check'].includes(operation) || typeof dryRun !== 'boolean') invalid('Invalid repository service request.');
  if (!['current', 'archived'].includes(scope) || (scope !== 'current' && projectName === undefined)) invalid('Project scope requires --project.');
  root = realpathSync(root);
  if (['create', 'link', 'unlink'].includes(operation) && !target) invalid('A repository target is required.');
  if (target !== undefined && (typeof target !== 'string' || !target.trim() || /[\x00-\x1f\x7f]/.test(target))) invalid('Expected a nonempty local repository target.');
  if (['link', 'unlink'].includes(operation) && !projectName) invalid('Select a project with --project.');
  if (operation === 'create' && projectName !== undefined) invalid('Create and project association are separate operations.');
  if (operation === 'list' && target !== undefined) invalid('Repository list does not accept a target.');
  if (operation === 'check' && target !== undefined && projectName !== undefined) invalid('Choose either a repository path or --project.');
  if (dryRun && ['list', 'check'].includes(operation)) invalid('Only modifying operations support --dry-run.');
  if (operation === 'create') return { data: create(root, target, dryRun, hooks), errors: [] };
  if (['link', 'unlink'].includes(operation)) {
    if (typeof target !== 'string' || !target.trim() || /[\x00-\x1f\x7f]/.test(target)) invalid('Expected a local repository path.');
    let path = resolve(root, target);
    // Validate the project before querying Git or taking a mutation lock.
    const card = project({ root, operation: 'read', name: projectName, scope }).data.project;
    const folder = resolve(root, card.directory);
    let linked;
    if (operation === 'link') { linked = identity(root, path, hooks.run); path = realpathSync(path); }
    const updated = updateProjectMetadata({ root, name: projectName, scope, dryRun }, metadata => {
      const before = pathsFrom(metadata, folder, projectName);
      const remaining = before.filter(entry => entry.absolute !== path).map(entry => entry.value);
      const exists = before.some(entry => entry.absolute === path);
      if (operation === 'link') {
        return { repositories: exists ? before.map(entry => entry.value) : [...remaining, inside(root, path) ? portable(relative(folder, path)) : path] };
      }
      return exists ? { repositories: remaining } : {};
    }, hooks);
    return { data: { project: projectName, scope, path: display(root, path), dryRun, changed: updated.changed, wouldChange: updated.wouldChange,
      repositories: updated.project.metadata.repositories ?? [], ...(linked ? { repository: linked } : {}) }, errors: [] };
  }
  let candidates;
  if (projectName !== undefined) {
    const card = project({ root, operation: 'read', name: projectName, scope }).data.project;
    candidates = pathsFrom(card.metadata, resolve(root, card.directory), projectName).map(entry => entry.absolute);
  } else if (target !== undefined) candidates = [resolve(root, target)];
  else {
    const scope = scopeOf(root);
    if (!directory(scope, true)) return { data: { complete: true, repositories: [], ...(operation === 'check' ? { valid: true } : {}) }, errors: [] };
    candidates = readdirSync(scope).sort().map(name => join(scope, name));
  }
  const repositories = [], errors = [];
  // Check the container even when it currently contains no projects.
  if (projectName === undefined && target === undefined) {
    try { parentIsolation(root, hooks.run); } catch (error) { errors.push(repositoryErrorItem(error)); }
  }
  for (const path of candidates) {
    try { repositories.push(identity(root, path, hooks.run)); }
    catch (error) { repositories.push({ name: basename(path), path: display(root, path), valid: false }); errors.push(repositoryErrorItem(error, path)); }
  }
  return { data: { complete: errors.length === 0, repositories, ...(operation === 'check' ? { valid: errors.length === 0 } : {}) }, errors };
}
