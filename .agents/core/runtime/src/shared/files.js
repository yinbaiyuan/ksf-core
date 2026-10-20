import { constants, lstatSync, openSync, closeSync, fstatSync, readFileSync,
  writeFileSync, fchmodSync, fsyncSync, unlinkSync } from 'node:fs';

// Callers own path policy, identity fields and domain errors. These operations
// only own descriptors, durable staging and cleanup of files they opened.
export function sameIdentity(a, b, fields = ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'uid', 'gid']) {
  return fields.every(key => a[key] === b[key]);
}

export function readFileSnapshot(target, { entry = lstatSync(target), noFollow = constants.O_NOFOLLOW ?? 0,
  validateEntry, validateOpen, validateRead } = {}) {
  validateEntry?.(entry);
  let fd;
  try {
    fd = openSync(target, constants.O_RDONLY | noFollow);
    const before = fstatSync(fd);
    validateOpen?.(entry, before);
    const bytes = readFileSync(fd), after = fstatSync(fd);
    validateRead?.(before, after, bytes);
    return { target, bytes, stat: after };
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function withExclusiveLock(path, owner, action, { onLocked, onReplaced, onCleanup } = {}) {
  let fd;
  try {
    try { fd = openSync(path, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') onLocked?.(); throw error; }
    writeFileSync(fd, JSON.stringify(owner) + '\n');
    return action({ lock: path });
  } finally {
    if (fd !== undefined) {
      const owned = fstatSync(fd); closeSync(fd);
      try {
        const current = lstatSync(path);
        if (owned.dev === current.dev && owned.ino === current.ino) unlinkSync(path);
        else onReplaced?.();
      } catch (error) { if (error.code !== 'ENOENT') { if (onCleanup) onCleanup(error); else throw error; } }
    }
  }
}

export function writeDurably(path, bytes, { mode = 0o600, exclusive = true } = {}) {
  const fd = openSync(path, exclusive ? 'wx' : 'w', mode);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

// Publication itself stays with the caller: replace, create without clobber,
// conflict checks and deletion have different business contracts.
export function withTemporaryFile(path, bytes, { mode = 0o600, permissions, cleanup = unlinkSync } = {}, publish) {
  let fd;
  try {
    fd = openSync(path, 'wx', mode);
    writeFileSync(fd, bytes);
    if (permissions !== undefined) fchmodSync(fd, permissions);
    fsyncSync(fd); closeSync(fd); fd = undefined;
    return publish(path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { cleanup(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
