import {readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {filePolicy} from '../../shared/file-policy.js';
import {stat} from '../storage.js';
import {fail, safePath} from './model.js';
import {contextCode, documentKind} from './layout.js';

const order = new Intl.Collator('zh-CN', {numeric: true});

function directoryEntries(root, path, overlay = new Map()) {
  const absolute = safePath(root, path, {missing: true});
  const entries = new Map();
  try {
    for (const entry of readdirSync(absolute, {withFileTypes: true})) {
      if (entry.isFile() || entry.isDirectory()) {
        entries.set(entry.name, {name: entry.name, path: path + '/' + entry.name, kind: entry.isDirectory() ? 'directory' : 'file'});
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const prefix = path + '/';
  for (const [target, bytes] of overlay) {
    if (!target.startsWith(prefix)) continue;
    const [name, child] = target.slice(prefix.length).split('/');
    if (bytes === null) {
      if (!child) entries.delete(name);
    } else {
      entries.set(name, {name, path: prefix + name, kind: child ? 'directory' : 'file'});
    }
  }
  return [...entries.values()].filter(entry => filePolicy(entry.path) !== 'blocked')
    .sort((a, b) => order.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function contextEntries(root, state) {
  const project = state.project;
  if (state.format !== 'documents' || !project) return [];
  const {overlay} = state.graph;
  const result = [];
  for (const owner of state.documents) {
    const {kind, id} = owner.metadata;
    if (!['project', 'milestone', 'task'].includes(kind) || documentKind(owner.path) !== kind) continue;
    if (kind === 'project' ? owner.path !== project.path : owner.metadata.project?.path !== project.path) continue;
    for (const entry of directoryEntries(root, dirname(owner.path), overlay)) {
      const code = contextCode(kind, entry.name);
      if (!code) continue;
      if (kind === 'milestone' && entry.kind === 'directory') {
        const marker = entry.path + '/task.md';
        if (overlay.get(marker) || stat(join(root, marker))) continue;
      }
      result.push({...entry, code, owner: {id, path: owner.path, kind}});
    }
  }
  return result;
}

export function listContextDirectory(root, entries, path) {
  if (typeof path !== 'string' || filePolicy(path) === 'blocked' ||
      !entries.some(entry => entry.kind === 'directory' && (path === entry.path || path.startsWith(entry.path + '/')))) {
    fail('PROJECT_CONTEXT_PATH', '请选择本项目编号上下文中的目录。', {target: path});
  }
  const absolute = safePath(root, path);
  if (!stat(absolute)?.isDirectory()) fail('PROJECT_CONTEXT_PATH', '上下文入口不是目录。', {target: path});
  return {path, entries: directoryEntries(root, path)};
}
