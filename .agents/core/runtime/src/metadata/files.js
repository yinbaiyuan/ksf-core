import {
  constants, openSync, closeSync, fstatSync, readFileSync, lstatSync, realpathSync,
  writeFileSync, fsyncSync, fchmodSync, renameSync, unlinkSync, accessSync,
} from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MetadataError } from './errors.js';

function fileError(error, target, write = false) {
  if (error instanceof MetadataError) return error;
  return new MetadataError(error.code === 'ENOENT' ? 'FILE_NOT_FOUND' : write ? 'FILE_WRITE_FAILED' : 'FILE_READ_FAILED',
    error.code === 'ENOENT' ? 'File or parent directory does not exist.' : write ? 'Cannot update file.' : 'Cannot read file.', { target });
}

export function readSnapshot(target) {
  let fd;
  try {
    const entry = lstatSync(target);
    if (entry.isSymbolicLink()) throw new MetadataError('FILE_UNSUPPORTED', 'Target symbolic links are not supported.', { target });
    if (!entry.isFile()) throw new MetadataError('FILE_UNSUPPORTED', 'Target must be a regular file.', { target });
    fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== entry.dev || stat.ino !== entry.ino) throw new MetadataError('FILE_CONFLICT', 'File changed while opening.', { target });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (!sameIdentity(stat, after)) throw new MetadataError('FILE_CONFLICT', 'File changed while reading.', { target });
    return { target, bytes, stat: after };
  } catch (error) {
    throw fileError(error, target);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function sameIdentity(a, b) {
  return ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'uid', 'gid'].every(key => a[key] === b[key]);
}

export function withWriteLock(target, action) {
  let lock, fd;
  try {
    // Resolve the parent only; never follow the target file itself.
    const canonical = join(realpathSync(dirname(target)), basename(target));
    const id = createHash('sha256').update(canonical).digest('hex').slice(0, 24);
    lock = join(dirname(canonical), `.ksf-metadata-${id}.lock`);
    try { fd = openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new MetadataError('FILE_LOCKED', 'Metadata lock exists; inspect its owner before removing a stale lock.', { target });
      throw error;
    }
    writeFileSync(fd, JSON.stringify({ pid: process.pid, target: canonical }) + '\n');
    return action({ lock });
  } catch (error) {
    throw fileError(error, target, true);
  } finally {
    if (fd !== undefined) {
      // Cleanup failures must not turn an already published update into a false
      // "unchanged" result, or remove a lock replaced by another process.
      const owned = fstatSync(fd);
      closeSync(fd);
      try {
        const current = lstatSync(lock);
        if (current.dev === owned.dev && current.ino === owned.ino) unlinkSync(lock);
        else process.stderr.write('FILE_LOCK_CLEANUP: Metadata lock was replaced; it was left untouched.\n');
      } catch (error) {
        if (error.code !== 'ENOENT') process.stderr.write('FILE_LOCK_CLEANUP: Could not remove metadata lock; inspect it before retrying.\n');
      }
    }
  }
}

export function publishFile(snapshot, bytes, { beforeCheck } = {}) {
  const { target } = snapshot;
  const temporary = join(dirname(target), `.ksf-metadata-${randomUUID()}.tmp`);
  let fd;
  try {
    accessSync(target, constants.W_OK);
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, bytes);
    fchmodSync(fd, snapshot.stat.mode & 0o7777);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    // Optional dependency hook enables deterministic conflict/failure tests.
    beforeCheck?.({ temporary });
    let current;
    try { current = readSnapshot(target); }
    catch { throw new MetadataError('FILE_CONFLICT', 'Target changed before publication.', { target }); }
    if (!sameIdentity(snapshot.stat, current.stat) || !snapshot.bytes.equals(current.bytes)) {
      throw new MetadataError('FILE_CONFLICT', 'Target changed before publication.', { target });
    }
    renameSync(temporary, target);
  } catch (error) {
    throw fileError(error, target, true);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw fileError(error, target, true); }
  }
}
