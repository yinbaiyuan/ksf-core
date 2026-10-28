import { lstatSync, readdirSync } from 'node:fs';
import { setImmediate as yieldThread } from 'node:timers/promises';
import { managedPath } from '../routing/storage.js';
import { isToken } from '../routing/schema.js';
import { taskIds, taskPath, turnPath, readTurn, readJSON, config, PROTOCOL } from '../task-capture/storage.js';
import { ownedTargets, primaryTarget } from '../task-capture/targets.js';

const short = (value, limit = 160) => typeof value === 'string' ? [...value.replace(/\s+/g, ' ').trim()].slice(0, limit).join('') : '';
function projection(turn) {
  const user = turn.messages.find(message => message.role === 'user' && message.content.some(block =>
    ['text', 'input_text'].includes(block.type) ? typeof block.text === 'string' && !!block.text.trim() : !!block.type));
  if (turn.policy !== 'capture' || turn.capturePolicyHeld || turn.chatPolicyHeld || turn.explicitExcluded || turn.status === 'excluded' || !user) return null;
  const last = turn.routes.at(-1)?.snapshot;
  return { taskId: turn.taskId, turnId: turn.turnId, startedAt: new Date(turn.startedAt).toISOString(),
    title: short(last?.summary) || short(user.content.filter(block => ['text', 'input_text'].includes(block.type)).map(block => block.text).join('\n').split(/\r?\n/).find(line => line.trim())) || '附件对话',
    navigationTarget: last ? primaryTarget(last).key : 'unreported',
    primaryTargets: ownedTargets(turn).filter(item => item.target).map(item => ({ key: item.key, kind: item.target.kind, label: short(item.label), lifecycle: item.target.lifecycle ?? 'existing' })) };
}
export function createTaskActivitySource(root,{onRead=()=>{}}={}){
  const files = new Map();
  const issue = (error, ids = {}) => ({ ...ids, code: error.code ?? 'WORK_STATS_READ_FAILED', message: '部分工作记录无法读取，已保留原件。' });
  function cached(path, load) {
    const entry = lstatSync(managedPath(root, path));
    if (!entry.isFile()) throw Object.assign(new Error(), { code: 'TASK_DATA_INVALID' });
    const stamp = [entry.dev, entry.ino, entry.size, entry.mtimeMs, entry.ctimeMs].join(':');
    const previous = files.get(path);
    if (previous?.stamp === stamp) { if (previous.error) throw previous.error; return previous.value; }
    onRead(path);
    try { const value = load(); files.set(path, { stamp, value }); return value; }
    catch (error) { files.set(path, { stamp, error }); throw error; }
  }
  async function build() {
    const activity = [], errors = [], seen = new Set(); let inspected = 0;
    for (const id of taskIds(root)) {
      let title = '';
      const metadataPath = `${taskPath(id)}/task.json`; seen.add(metadataPath);
      try { title = cached(metadataPath, () => { const value = readJSON(root, metadataPath); if (value?.protocol !== PROTOCOL || value.taskId !== id) throw Object.assign(new Error(), { code: 'TASK_DATA_INVALID' }); return short(value.title, 200); }); }
      catch (error) { if (error.code !== 'ENOENT') errors.push(issue(error, { taskId: id })); }
      let names;
      try { names = readdirSync(managedPath(root, `${taskPath(id)}/turns`)); }
      catch (error) { if (error.code !== 'ENOENT') errors.push(issue(error, { taskId: id })); continue; }
      for (const name of names) {
        if (!name.endsWith('.json') || !isToken(name.slice(0, -5))) continue;
        const turnId = name.slice(0, -5), path = turnPath(id, turnId); seen.add(path);
        try {
          const row = cached(path, () => projection(readTurn(root, id, turnId)));
          if (row) activity.push({ ...row, taskTitle: title || row.title });
        } catch (error) { errors.push(issue(error, { taskId: id, turnId })); }
        if (++inspected % 8 === 0) await yieldThread();
      }
    }
    for (const path of files.keys()) if (!seen.has(path)) files.delete(path);
    let capture = { enabled: false, activatedAt: null };
    try { const settings = config(root); capture = { enabled: settings?.enabled ?? false, activatedAt: settings?.activatedAt ?? null }; }
    catch (error) { errors.push(issue(error)); }
    activity.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.taskId.localeCompare(b.taskId) || a.turnId.localeCompare(b.turnId));
    return { activity, errors, capture };
  }
  return {read:build};
}
