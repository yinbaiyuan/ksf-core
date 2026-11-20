import { constants, lstatSync, openSync, closeSync, fstatSync, readFileSync, readSync,
  writeFileSync, fchmodSync, fsyncSync, unlinkSync } from 'node:fs';
import { uptime } from 'node:os';
import {createHash} from 'node:crypto';

// Callers own path policy, identity fields and domain errors. These operations
// only own descriptors, durable staging and cleanup of files they opened.
export function sameIdentity(a, b, fields = ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'uid', 'gid']) {
  return fields.every(key => a[key] === b[key]);
}

export function readFileSnapshot(target, { entry = lstatSync(target), noFollow = constants.O_NOFOLLOW ?? 0,
  validateEntry, validateOpen, validateRead,consume=fd=>readFileSync(fd) } = {}) {
  validateEntry?.(entry);
  let fd;
  try {
    fd = openSync(target, constants.O_RDONLY | noFollow);
    const before = fstatSync(fd);
    validateOpen?.(entry, before);
    const bytes = consume(fd), after = fstatSync(fd);
    validateRead?.(before, after, bytes);
    return { target, bytes, stat: after };
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function readFileDigestSnapshot(target,options={}){
  const result=readFileSnapshot(target,{...options,consume(fd){
    const hash=createHash('sha256'),chunk=Buffer.allocUnsafe(64*1024);let size;
    while((size=readSync(fd,chunk,0,chunk.length,null))>0)hash.update(chunk.subarray(0,size));
    return hash.digest('hex');
  }});
  return {target,digest:result.bytes,stat:result.stat};
}

// A lock is stale only when its recorded owner certainly no longer runs: the
// PID is gone (ESRCH; EPERM means alive) or the file predates this boot. A
// reused PID keeps the lock, which is the conservative failure. Removal happens
// under a short reclaim lock and only for the exact file that was inspected, so
// two reclaimers cannot delete a fresh lock taken in between.
function staleOwner(path) {
  let entry, owner;
  try { entry = lstatSync(path); if (!entry.isFile()) return null; owner = JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
  if (entry.mtimeMs < Date.now() - uptime() * 1000) return entry;
  if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 || owner.pid === process.pid) return null;
  try { process.kill(owner.pid, 0); return null; }
  catch (error) { return error.code === 'ESRCH' ? entry : null; }
}
const RECLAIM_GRACE_MS = 30_000;
function reclaimStaleLock(path) {
  const guard = `${path}.reclaim`;
  let fd;
  try { fd = openSync(guard, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') return false;
    // A reclaimer killed mid-way leaves only this short-lived guard behind.
    try { if (lstatSync(guard).mtimeMs < Date.now() - RECLAIM_GRACE_MS) unlinkSync(guard); } catch {}
    return false;
  }
  try {
    closeSync(fd); fd = undefined;
    const stale = staleOwner(path);
    if (!stale) return false;
    const current = lstatSync(path);
    if (current.dev !== stale.dev || current.ino !== stale.ino) return false;
    unlinkSync(path);
    return true;
  } catch { return false; }
  finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(guard); } catch {} }
}

export function withExclusiveLock(path, owner, action, { onLocked, onReplaced, onCleanup, reclaimStale = false } = {}) {
  let fd, owned;
  const release = () => {
    if (fd !== undefined) closeSync(fd);
    if (!owned) return;
    try {
      const current = lstatSync(path);
      if (owned.dev === current.dev && owned.ino === current.ino) unlinkSync(path);
      else onReplaced?.();
    } catch (error) {
      if (error.code !== 'ENOENT') { if (onCleanup) onCleanup(error); else throw error; }
    }
  };
  let result;
  try {
    try { fd = openSync(path, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(reclaimStale && reclaimStaleLock(path))) { onLocked?.(); throw error; }
      try { fd = openSync(path, 'wx', 0o600); }
      catch (retry) { if (retry.code === 'EEXIST') onLocked?.(); throw retry; }
    }
    owned = fstatSync(fd);
    writeFileSync(fd, JSON.stringify(owner) + '\n');
    // Exclusivity belongs to the atomically created name. Retaining its file
    // handle is unnecessary and blocks parent-directory publication on Windows.
    closeSync(fd); fd = undefined;
    result = action({ lock: path });
  } catch (error) {
    release();
    throw error;
  }
  if (result instanceof Promise) return result.finally(release);
  release();
  return result;
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
