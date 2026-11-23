import { platform, replaceFileSync as renameSync } from '../platform/index.js';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withTemporaryFile } from '../shared/files.js';
import { stableJSON } from '../shared/hash.js';
import { fail } from './errors.js';
import { validRelative } from './paths.js';

export function checkedPath(root, relative) {
  if (!validRelative(relative)) fail('UNSAFE_PATH', `Invalid relative path: ${JSON.stringify(relative)}.`);
  let current = resolve(root);
  for (const part of relative.split('/')) {
    current = join(current, part);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) fail('UNSAFE_PATH', `Unsupported filesystem entry: ${relative}.`);
    } else {
      // existsSync is false for a dangling symlink.
      try { if (lstatSync(current).isSymbolicLink()) fail('UNSAFE_PATH', `Dangling symlink: ${relative}.`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  return current;
}
export function readRegular(root, relative, optional = false) {
  const path = checkedPath(root, relative);
  if (!existsSync(path)) {
    if (optional) return null;
    fail('FILE_MISSING', `Missing file: ${relative}.`);
  }
  if (!lstatSync(path).isFile()) fail('UNSAFE_PATH', `Expected a regular file: ${relative}.`);
  return readFileSync(path);
}
// Read bytes and mode from the same open entry. Containment and type checks
// remain fresh for every call; no directory or validity cache crosses reads.
export function readRegularRecord(root, relative, { optional = false, declared } = {}) {
  const path = checkedPath(root, relative);
  let entry;
  try { entry = lstatSync(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (optional) return null;
    fail('FILE_MISSING', `Missing file: ${relative}.`);
  }
  return readCheckedRecord(path, relative, entry, declared);
}
function readCheckedRecord(path, relative, entry, declared) {
  if (!entry.isFile()) fail('UNSAFE_PATH', `Expected a regular file: ${relative}.`);
  let descriptor;
  try { descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); }
  catch (error) { if (error.code === 'ELOOP') fail('UNSAFE_PATH', `Unsupported filesystem entry: ${relative}.`); throw error; }
  try {
    const actual = fstatSync(descriptor);
    if (!actual.isFile()) fail('UNSAFE_PATH', `Expected a regular file: ${relative}.`);
    return { bytes: readFileSync(descriptor), mode: platform.fileMode(path, actual.mode, declared) };
  } finally { closeSync(descriptor); }
}
// Every leaf is checked immediately before opening. No cached containment
// check authorizes a subsequent file read.
export function* walkRegularRecords(root, prefix, { exclude = () => false } = {}) {
  function* visit(relative) {
    if (exclude(relative)) return;
    const path = checkedPath(root, relative), entry = lstatSync(path);
    if (entry.isDirectory()) {
      for (const name of readdirSync(path).sort()) yield* visit(`${relative}/${name}`);
    } else if (entry.isFile()) yield [relative, readCheckedRecord(path, relative, entry)];
    else fail('UNSAFE_PATH', `Unsupported file: ${relative}.`);
  }
  yield* visit(prefix);
}
export function writeAtomic(path, bytes, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  return withTemporaryFile(temporary, bytes, { mode, cleanup(path) { rmSync(path, { force: true }); } }, () => renameSync(temporary, path));
}

export function writeJSON(path, data) { writeAtomic(path, stableJSON(data)); }
export function parseJSON(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail('INVALID_JSON', `Invalid JSON: ${label}.`); }
}
export function readJSON(root, path, optional = false) {
  const bytes = readRegular(root, path, optional); return bytes === null ? null : parseJSON(bytes, path);
}
export function walkFiles(root, prefix, { exclude = () => false } = {}) {
  const found = [];
  function visit(relative) {
    if (exclude(relative)) return;
    const path = checkedPath(root, relative), stat = lstatSync(path);
    if (stat.isDirectory()) for (const child of readdirSync(path).sort()) visit(`${relative}/${child}`);
    else if (stat.isFile()) found.push(relative);
    else fail('UNSAFE_PATH', `Unsupported file: ${relative}.`);
  }
  visit(prefix); return found;
}
export function fileMode(path, declared) { return platform.fileMode(path, lstatSync(path).mode, declared); }
export function textBytes(bytes) {
  if (bytes.length > 2 * 1024 * 1024 || bytes.includes(0)) return false;
  return Buffer.from(bytes.toString('utf8')).equals(bytes);
}
