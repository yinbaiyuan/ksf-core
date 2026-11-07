import {taskFolder} from './task-codes.js';
import {dirname} from 'node:path';

export const milestoneDirectory = /^M\d+-[^/]+$/;
export const taskDirectory = /^[A-Z][1-9]\d{0,8}-[^/]+$/;
const inspirationName = '灵感闪现.md';

export function inspirationPath(ownerPath) {
  const kind = documentKind(ownerPath);
  return kind && kind !== 'review' ? dirname(ownerPath) + '/' + inspirationName : null;
}

export function projectRelative(path) {
  if (typeof path !== 'string') return null;
  const match = /^((?:项目|档案\/项目)\/[^/]+)\/(.+)$/.exec(path);
  return match ? {project: match[1], parts: match[2].split('/')} : null;
}

export function documentKind(path) {
  const relative = projectRelative(path);
  if (!relative) return null;
  const {parts} = relative;
  const [first, second] = parts;
  if (parts.length === 1) {
    if (first === 'project.md') return 'project';
    if (first === '项目复盘.md') return 'review';
  }
  if (!milestoneDirectory.test(first)) return null;
  if (parts.length === 2) {
    if (second === 'milestone.md') return 'milestone';
    if (second === '复盘.md') return 'review';
  }
  if (parts.length === 3 && taskFolder.test(parts.slice(1).join('/'))) return 'task';
  return null;
}

const contextPatterns = {
  project: /^(P\d{2,})-(.+)$/,
  milestone: /^(M\d{2,})-(.+)$/,
  task: /^(\d{2,})-(.+)$/,
};

export function contextCode(kind, name) {
  return contextPatterns[kind]?.exec(name)?.[1] ?? null;
}

// A milestone context package can look like a task directory. Its direct
// task.md is reserved for the task index, never for opaque file writes.
export function resourceOwner(path, hasTask) {
  const relative = projectRelative(path);
  if (!relative || documentKind(path)) return null;
  const {project, parts} = relative;
  const [first, second, third] = parts;
  if (parts.length === 1 && first === inspirationName) return project + '/project.md';
  if (contextCode('project', first)) return project + '/project.md';
  if (!milestoneDirectory.test(first) || !second) return null;
  const milestone = project + '/' + first;
  if (parts.length === 2 && second === inspirationName) return milestone + '/milestone.md';
  if (parts.length === 3 && third === 'task.md') return null;
  if (taskDirectory.test(second) && third) {
    const task = milestone + '/' + second + '/task.md';
    if (hasTask(task)) return contextCode('task', third) || (parts.length === 3 && third === inspirationName) ? task : null;
  }
  return contextCode('milestone', second) ? milestone + '/milestone.md' : null;
}
