import { replaceFileSync as renameSync } from '../platform/index.js';
import { existsSync, lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { managedPath } from '../routing/storage.js';
import { withExclusiveLock, withTemporaryFile, readFileSnapshot, sameIdentity } from '../shared/files.js';
import { encode, fail, isKey, isToken, validateStoredTargets, validateTargetFacts } from '../routing/schema.js';

export const CAPTURE = '.agents/runtime-data/task-capture';
export const ARCHIVE = '档案/对话/Codex';
export const PROTOCOL = 'ksf-task-archive-v1';
export function readJSON(root, path) {
  const target = managedPath(root, path);
  if (!existsSync(target)) return null;
  const conflict = () => fail('TASK_CONFLICT', 'Task data changed while reading; retry.');
  const bytes = readFileSnapshot(target, { entry: lstatSync(target),
    validateOpen(a, b) { if (!sameIdentity(a, b) || !b.isFile()) conflict(); },
    validateRead(a, b) { if (!sameIdentity(a, b)) conflict(); },
  }).bytes;
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('TASK_DATA_INVALID', `Invalid JSON; preserve ${path}.`); }
}
export function writeJSON(root, path, value) {
  const target = managedPath(root, path, true);
  withTemporaryFile(`${target}.${randomUUID()}.tmp`, Buffer.from(encode(value) + '\n'), {}, file => renameSync(file, target));
}
export function locked(root, key, action) {
  if (!isKey(key) && key !== 'configuration') fail('INVALID_ARGUMENTS', 'Invalid task key.');
  const path = `${CAPTURE}/locks/${key}.lock`, target = managedPath(root, path, true);
  // Recover only a provably dead local writer. An alive/reused PID or unknown owner stays locked.
  if (existsSync(target)) {
    let before, owner;
    try { before = lstatSync(target); owner = readJSON(root, path); }
    catch (error) { if (!['ENOENT', 'TASK_DATA_INVALID', 'TASK_CONFLICT'].includes(error.code)) throw error; }
    // A creator may have opened the lock but not flushed its owner yet. Unknown ownership remains locked.
    if (before && Number.isSafeInteger(owner?.pid) && owner.pid > 0) {
      try { process.kill(owner.pid, 0); }
      catch (error) { if (error.code === 'ESRCH') { try { if (sameIdentity(before, lstatSync(target))) unlinkSync(target); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; } } }
    }
  }
  return withExclusiveLock(target, { pid: process.pid }, action, {
    onLocked() { fail('TASK_LOCKED', 'Another capture is writing; retry later. A stale lock must be inspected before removal.'); },
  });
}
export function taskPath(taskId) {
  if (!isKey(taskId)) fail('INVALID_ARGUMENTS', 'Invalid taskId.');
  return `${ARCHIVE}/${taskId}`;
}
export function turnPath(taskId, turnId) {
  if (!isToken(turnId)) fail('INVALID_ARGUMENTS', 'Invalid native turnId.');
  return `${taskPath(taskId)}/turns/${turnId}.json`;
}
export function readTurn(root, taskId, turnId) {
  const value = readJSON(root, turnPath(taskId, turnId));
  if (value && (value.protocol !== PROTOCOL || value.taskId !== taskId || value.turnId !== turnId ||
      !Array.isArray(value.messages) || !Array.isArray(value.routes) || !Array.isArray(value.declarations) ||
      !Array.isArray(value.issues) || !Number.isSafeInteger(value.revision))) fail('TASK_DATA_INVALID', 'Unsupported or damaged turn archive; preserve the original.');
  if (value && (!['capture', 'pending', 'exclude'].includes(value.policy) ||
      !['completed', 'interrupted', 'pending', 'partial', 'excluded'].includes(value.status) ||
      !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.updatedAt)) ||
      value.messages.some(m => !m || typeof m.id !== 'string' || !['user', 'assistant'].includes(m.role) || !Array.isArray(m.content) || !Array.isArray(m.revisions)) ||
      value.routes.some(r => !r || !r.snapshot || !Array.isArray(r.snapshot.abilities) || !Array.isArray(r.snapshot.references) || !r.snapshot.project) ||
      (value.policy !== 'capture' && (value.messages.length || value.routes.length)))) fail('TASK_DATA_INVALID', 'Invalid archived turn fields; preserve the original.');
  if (value) { try { validateTargetFacts(value.targetFacts); } catch { fail('TASK_DATA_INVALID', 'Invalid target facts; preserve the original.'); } }
  if (value) for (const event of value.routes) {
    try { validateStoredTargets(event.snapshot); } catch { fail('TASK_DATA_INVALID', 'Invalid archived ownership; preserve the original.'); }
  }
  return value;
}
export function taskIds(root) {
  const folder = managedPath(root, ARCHIVE);
  return existsSync(folder) ? readdirSync(folder).filter(isKey).sort() : [];
}
export function turns(root, taskId, { onError } = {}) {
  const folder = managedPath(root, `${taskPath(taskId)}/turns`);
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter(name => name.endsWith('.json') && isToken(name.slice(0, -5)))
    .map(name => { try { return readTurn(root, taskId, name.slice(0, -5)); } catch (error) { if (!onError) throw error; onError(error, name.slice(0, -5)); return null; } }).filter(Boolean)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.turnId.localeCompare(b.turnId));
}
export function config(root) {
  const value = readJSON(root, `${CAPTURE}/config.json`);
  if (value && (value.protocol !== PROTOCOL || !Number.isFinite(Date.parse(value.activatedAt)) || typeof value.enabled !== 'boolean')) fail('TASK_CONFIG_INVALID', 'Unsupported task capture configuration.');
  return value;
}
export function summarizeTurn(value) {
  const route = value.routes.at(-1);
  return { turnId: value.turnId, roundId: value.roundId, revision: value.revision, startedAt: value.startedAt,
    updatedAt: value.updatedAt, status: value.status, policy: value.policy, messageCount: value.messages.length,
    routeCount: value.routes.length, route: route?.snapshot ?? null, issues: value.issues,
    preview: value.messages.find(m => m.role === 'user')?.content?.filter(c => c.type === 'input_text' || c.type === 'text').map(c => c.text).join('\n').slice(0, 200) ?? '' };
}
export function rebuildTask(root, taskId, title) {
  const all = turns(root, taskId);
  if (!all.length) return null;
  const old = readJSON(root, `${taskPath(taskId)}/task.json`);
  if (old && (old.protocol !== PROTOCOL || old.taskId !== taskId)) fail('TASK_DATA_INVALID', 'Unsupported task metadata.');
  const last = all.at(-1), route = last.routes.at(-1);
  const titleSource = title || old?.titleSource === 'host' ? 'host' : 'captured-input';
  const next = { protocol: PROTOCOL, taskId, host: 'codex', titleSource,
    title: title || (old?.titleSource === 'host' ? old.title : null) || all.map(summarizeTurn).find(t => t.preview)?.preview || 'Codex 任务',
    createdAt: all[0].startedAt, updatedAt: all.reduce((v, t) => v > t.updatedAt ? v : t.updatedAt, ''),
    turnCount: all.length, lastTurn: summarizeTurn(last), lastRouteAt: route?.at ?? null, route: route?.snapshot ?? null };
  if (encode(old) !== encode(next)) writeJSON(root, `${taskPath(taskId)}/task.json`, next);
  return next;
}
