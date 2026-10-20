import { constants, realpathSync, renameSync, accessSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSnapshot, sameIdentity, withExclusiveLock, withTemporaryFile } from '../shared/files.js';
import { MetadataError } from './errors.js';

function fileError(error, target, write = false) {
  if (error instanceof MetadataError) return error;
  return new MetadataError(error.code === 'ENOENT' ? 'FILE_NOT_FOUND' : write ? 'FILE_WRITE_FAILED' : 'FILE_READ_FAILED',
    error.code === 'ENOENT' ? 'File or parent directory does not exist.' : write ? 'Cannot update file.' : 'Cannot read file.', { target });
}

export function readSnapshot(target) {
  try {
    return readFileSnapshot(target, {
      validateEntry(entry) {
        if (entry.isSymbolicLink()) throw new MetadataError('FILE_UNSUPPORTED', 'Target symbolic links are not supported.', { target });
        if (!entry.isFile()) throw new MetadataError('FILE_UNSUPPORTED', 'Target must be a regular file.', { target });
      },
      validateOpen(entry, stat) {
        if (!stat.isFile() || stat.dev !== entry.dev || stat.ino !== entry.ino) throw new MetadataError('FILE_CONFLICT', 'File changed while opening.', { target });
      },
      validateRead(before, after) {
        if (!sameIdentity(before, after)) throw new MetadataError('FILE_CONFLICT', 'File changed while reading.', { target });
      },
    });
  } catch (error) { throw fileError(error, target); }
}

export function withWriteLock(target, action) {
  try {
    // Resolve the parent only; never follow the target file itself.
    const canonical = join(realpathSync(dirname(target)), basename(target));
    const id = createHash('sha256').update(canonical).digest('hex').slice(0, 24);
    const lock = join(dirname(canonical), `.ksf-metadata-${id}.lock`);
    return withExclusiveLock(lock, { pid: process.pid, target: canonical }, action, {
      onLocked() { throw new MetadataError('FILE_LOCKED', 'Metadata lock exists; inspect its owner before removing a stale lock.', { target }); },
      onReplaced() { process.stderr.write('FILE_LOCK_CLEANUP: Metadata lock was replaced; it was left untouched.\n'); },
      onCleanup() { process.stderr.write('FILE_LOCK_CLEANUP: Could not remove metadata lock; inspect it before retrying.\n'); },
    });
  } catch (error) { throw fileError(error, target, true); }
}

export function publishFile(snapshot, bytes, { beforeCheck } = {}) {
  const { target } = snapshot;
  const temporary = join(dirname(target), `.ksf-metadata-${randomUUID()}.tmp`);
  try {
    accessSync(target, constants.W_OK);
    return withTemporaryFile(temporary, bytes, { permissions: snapshot.stat.mode & 0o7777 }, () => {
      beforeCheck?.({ temporary });
      let current;
      try { current = readSnapshot(target); }
      catch { throw new MetadataError('FILE_CONFLICT', 'Target changed before publication.', { target }); }
      if (!sameIdentity(snapshot.stat, current.stat) || !snapshot.bytes.equals(current.bytes)) {
        throw new MetadataError('FILE_CONFLICT', 'Target changed before publication.', { target });
      }
      renameSync(temporary, target);
    });
  } catch (error) { throw fileError(error, target, true); }
}
