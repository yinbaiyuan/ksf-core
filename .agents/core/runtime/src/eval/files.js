import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const inside = (root, path) => path === root || path.startsWith(root + sep);
export const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
export function put(root, path, bytes, options = {}) {
  const target = resolve(root, path);
  if (!inside(resolve(root), target)) fail('EVAL_PATH_INVALID', 'Path escapes the evaluation directory.');
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, options);
}
export const json = (root, path, value) => put(root, path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
export function copyTree(source, target, accept = () => true, path = '') {
  if (!existsSync(source)) return;
  if (!accept(path)) return;
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) fail('EVAL_FIXTURE_SYMLINK', `Snapshot requires a regular path: ${path}`);
  if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(source).sort()) copyTree(join(source, name), join(target, name), accept, path ? `${path}/${name}` : name);
  } else if (stat.isFile()) {
    mkdirSync(dirname(target), { recursive: true }); copyFileSync(source, target, constants.COPYFILE_FICLONE);
  }
}
export function inventory(root, accept = () => true, { recordLinks = false } = {}) {
  const files = {};
  function walk(path = '') {
    if (!accept(path)) return;
    const full = join(root, path), st = lstatSync(full);
    if (st.isSymbolicLink()) {
      if (!recordLinks) fail('EVAL_FIXTURE_SYMLINK', `Unexpected link: ${path}`);
      files[path] = { sha256: hash(readlinkSync(full)), size: st.size, mode: st.mode & 0o777, type: 'symlink' }; return;
    }
    if (st.isDirectory()) for (const name of readdirSync(full).sort()) walk(path ? `${path}/${name}` : name);
    else if (st.isFile()) files[path] = { sha256: hash(readFileSync(full)), size: st.size, mode: st.mode & 0o777 };
  }
  walk(); return files;
}
export function changes(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter(p =>
    before[p]?.sha256 !== after[p]?.sha256 || before[p]?.mode !== after[p]?.mode).map(path => ({ path,
    kind: !before[path] ? 'created' : !after[path] ? 'removed' : 'modified', before: before[path] ?? null, after: after[path] ?? null }));
}
export const businessFiles = p => !p.startsWith('.agents/runtime-data') && !/(?:^|\/)\.git(?:\/|$)/.test(p);
export function relativePath(root, file) { const p = relative(root, file); return inside(resolve(root), resolve(file)) ? p : null; }
export function regularFile(root, path) {
  const full = resolve(root, path);
  if (!inside(resolve(root), full)) return false;
  let current = resolve(root);
  try {
    for (const name of relative(current, full).split(sep)) { current = join(current, name); if (lstatSync(current).isSymbolicLink()) return false; }
    return lstatSync(full).isFile();
  } catch { return false; }
}
