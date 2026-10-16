import {
  existsSync, lstatSync, readdirSync, mkdirSync, openSync, closeSync, writeFileSync,
  fstatSync, unlinkSync, renameSync, rmSync, chmodSync, fsyncSync, realpathSync,
} from 'node:fs';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readSnapshot } from '../metadata/files.js';
import { sha, portable } from './catalog.js';
import { fail, compare } from './schema.js';

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
  const directory = safeDirectory(root, '.agents/runtime-data/objects', { create: true });
  const lock = join(directory, 'write.lock');
  let fd;
  try {
    try { fd = openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') fail('OBJECT_LOCKED', 'Object write lock exists; inspect its owner before retrying.');
      throw error;
    }
    writeFileSync(fd, JSON.stringify({ pid: process.pid }) + '\n');
    return action();
  } finally {
    if (fd !== undefined) {
      const owner = fstatSync(fd); closeSync(fd);
      try {
        const current = lstatSync(lock);
        if (owner.dev === current.dev && owner.ino === current.ino) unlinkSync(lock);
        else process.stderr.write('OBJECT_LOCK_CLEANUP: Replaced lock left untouched.\n');
      } catch (error) { if (error.code !== 'ENOENT') process.stderr.write('OBJECT_LOCK_CLEANUP: Inspect remaining write lock.\n'); }
    }
  }
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

export function writeDurably(path, bytes, { mode = 0o600, exclusive = true } = {}) {
  const fd = openSync(path, exclusive ? 'wx' : 'w', mode);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

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

// Rebase only actual Markdown destinations, not prose examples or fenced code.
// Directory-internal links remain relative to the copied object; external links
// keep pointing at their original assets through the new relative location.
export function rebaseMarkdown(bytes, oldFile, newFile, objectDirectory) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) fail('ENCODING_INVALID', 'Markdown resource must be UTF-8.', { target: oldFile });
  const rebase = destination => {
    const raw = destination.startsWith('<') && destination.endsWith('>') ? destination.slice(1, -1) : destination;
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(raw)) return destination;
    const split = raw.search(/[?#]/);
    const pathPart = split === -1 ? raw : raw.slice(0, split);
    const suffix = split === -1 ? '' : raw.slice(split);
    let decoded;
    try { decoded = decodeURIComponent(pathPart.replace(/\\([\\`*{}\[\]()#+.!<> _-])/g, '$1')); } catch { return destination; }
    const target = join(dirname(oldFile), decoded);
    const relObject = relative(objectDirectory, target);
    if (!relObject.startsWith('..' + '/') && relObject !== '..' && !isAbsolute(relObject)) return destination;
    const next = portable(relative(dirname(newFile), target)) + suffix;
    return destination.startsWith('<') ? `<${next}>` : next.replace(/ /g, '%20');
  };
  // Locate a Markdown destination, including balanced/escaped parentheses.
  function destinationAt(line, start) {
    if (line[start] === '<') {
      for (let i = start + 1; i < line.length; i++) {
        if (line[i] === '\\') { i++; continue; }
        if (line[i] === '>') return i + 1;
        if (line[i] === '\n') return null;
      }
      return null;
    }
    let depth = 0;
    for (let i = start; i < line.length; i++) {
      const char = line[i];
      if (char === '\\') { i++; continue; }
      if (char === '(') depth++;
      else if (char === ')') { if (!depth) return i; depth--; }
      else if (/\s/.test(char)) return depth ? null : i;
    }
    return depth ? null : line.length;
  }
  function inlineLinks(line) {
    let output = '', cursor = 0, brackets = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] === '`') {
        const run = /^`+/.exec(line.slice(i))[0];
        const end = line.indexOf(run, i + run.length);
        if (end !== -1) { i = end + run.length - 1; continue; }
      }
      if (line[i] === '[') brackets++;
      if (line[i] !== ']' || !brackets) continue;
      brackets--;
      if (line[i + 1] !== '(') continue;
      let start = i + 2;
      while (/[ \t]/.test(line[start] ?? '') && start < line.length) start++;
      const end = destinationAt(line, start);
      if (end === null || end <= start || !/^\s*(?:["'][^\n]*?["']\s*|\([^\n]*?\)\s*)?\)/.test(line.slice(end))) continue;
      output += line.slice(cursor, start) + rebase(line.slice(start, end));
      cursor = end; i = end - 1;
    }
    return output + line.slice(cursor);
  }
  let fenced = null;
  const lines = text.split(/(?<=\n)/);
  return Buffer.from(lines.map(line => {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!fenced) fenced = { char: fence[1][0], length: fence[1].length };
      else if (fence[1][0] === fenced.char && fence[1].length >= fenced.length) fenced = null;
      return line;
    }
    if (fenced || /^(?: {4}|\t)/.test(line)) return line;
    const definition = /^(\s{0,3}\[[^\]]+\]:[ \t]*)/.exec(line);
    if (definition) {
      const start = definition[0].length, end = destinationAt(line, start);
      if (end !== null && end > start) return line.slice(0, start) + rebase(line.slice(start, end)) + line.slice(end);
    }
    return inlineLinks(line);
  }).join(''));
}

export function canonicalRoot(root) { return realpathSync(root); }
