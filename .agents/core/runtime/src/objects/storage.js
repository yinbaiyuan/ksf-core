import { replaceFileSync as renameSync } from '../platform/index.js';
import { writeDurably, withExclusiveLock } from '../shared/files.js';
import {
  existsSync, lstatSync, readdirSync, mkdirSync, rmSync, chmodSync, realpathSync,
} from 'node:fs';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readSnapshot } from '../metadata/files.js';
import { sha256 as sha } from '../shared/hash.js';
import { portable } from '../shared/paths.js';
import { fail, compare } from './schema.js';
import { assertNoCooperationMigration } from '../migrations/guard.js';

export function safeDirectory(root, relativePath, { create = false } = {}) {
  if (isAbsolute(relativePath) || relativePath.split('/').some(s => s === '..')) fail('OBJECT_PATH_INVALID', 'Expected a path below KSF root.');
  let path = root;
  for (const segment of relativePath.split('/').filter(Boolean)) {
    path = join(path, segment);
    if (create && !existsSync(path)) mkdirSync(path);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('OBJECT_PATH_INVALID', 'Managed path must contain ordinary directories.', { target: portable(relative(root, path)) });
  }
  return path;
}

export function withObjectLock(root, action) {
  assertNoCooperationMigration(root);
  const directory = safeDirectory(root, '.agents/runtime-data/objects', { create: true });
  const lock = join(directory, 'write.lock');
  return withExclusiveLock(lock, { pid: process.pid }, () => { assertNoCooperationMigration(root); return action(); }, {
    onLocked() { fail('OBJECT_LOCKED', 'Object write lock exists; inspect its owner before retrying.'); },
    onReplaced() { process.stderr.write('OBJECT_LOCK_CLEANUP: Replaced lock left untouched.\n'); },
    onCleanup() { process.stderr.write('OBJECT_LOCK_CLEANUP: Inspect remaining write lock.\n'); },
  });
}

export function readTree(directory, { exclude = [] } = {}) {
  const files = [], directories = [];
  const visit = path => {
    const stat = lstatSync(path);
    const name = portable(relative(directory, path));
    if (stat.isSymbolicLink()) fail('OBJECT_RESOURCE_UNSUPPORTED', 'Symbolic links cannot be copied or removed as object resources.', { target: path });
    if (stat.isDirectory()) {
      directories.push({ path: name, mode: stat.mode & 0o777, ino: stat.ino });
      for (const child of readdirSync(path).sort(compare)) {
        if (exclude.includes(join(path, child))) continue;
        if (child.startsWith('.ksf-metadata-') || child.startsWith('.ksf-object-')) fail('OBJECT_RESOURCE_BUSY', 'Object contains a temporary or locked resource.', { target: path });
        visit(join(path, child));
      }
    } else if (stat.isFile()) {
      const snapshot = readSnapshot(path);
      files.push({ path: name, bytes: snapshot.bytes, mode: stat.mode & 0o777, ino: stat.ino, mtime: stat.mtimeMs, ctime: stat.ctimeMs, digest: sha(snapshot.bytes) });
    } else fail('OBJECT_RESOURCE_UNSUPPORTED', 'Only ordinary files and directories are supported.', { target: path });
  };
  visit(directory);
  return { files, directories, fingerprint: sha(JSON.stringify({ directories, files: files.map(({ bytes, ...f }) => f) })) };
}

export function copyTree(tree, destination, { writable = false } = {}) {
  for (const item of tree.directories) mkdirSync(join(destination, item.path), { recursive: true });
  for (const item of tree.files) writeDurably(join(destination, item.path), item.bytes, { mode: item.mode | (writable ? 0o200 : 0) });
  // Directory permissions are applied after contents have been copied.
  for (const item of [...tree.directories].reverse()) chmodSync(join(destination, item.path), item.mode | (writable ? 0o700 : 0));
}

export { writeDurably } from '../shared/files.js';

export function stageDirectory(parent) {
  const path = join(parent, `.ksf-object-staging-${randomUUID()}`);
  mkdirSync(path, { mode: 0o700 });
  return path;
}

export function removeDirectory(directory, verify, { cleanup = rmSync } = {}) {
  const temporary = join(dirname(directory), `.ksf-object-deleting-${randomUUID()}`);
  verify();
  renameSync(directory, temporary);
  try { cleanup(temporary, { recursive: true, force: false }); }
  catch {
    fail('OBJECT_CLEANUP_FAILED', 'Object was detached but directory cleanup failed; inspect the recovery path.', {
      data: { changed: true, removedFromCatalog: true, recoveryPath: temporary },
    });
  }
}

export { rebaseMarkdown } from './markdown.js';

export function canonicalRoot(root) { return realpathSync(root); }
