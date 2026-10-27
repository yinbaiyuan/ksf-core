import { lstatSync, readdirSync } from 'node:fs';
import { setImmediate as yieldThread } from 'node:timers/promises';
import { managedPath } from '../routing/storage.js';
import { isToken } from '../routing/schema.js';
import { taskIds, taskPath, turnPath, readTurn, readJSON, config, PROTOCOL } from '../task-capture/storage.js';
import { ownedTargets, primaryTarget } from '../task-capture/targets.js';

const invalid = () => Object.assign(new Error('请使用有效的 IANA 时区。'), { code: 'INVALID_ARGUMENTS' });
const short = (value, limit = 160) => typeof value === 'string' ? [...value.replace(/\s+/g, ' ').trim()].slice(0, limit).join('') : '';
const shiftDay = (day, amount) => { const date = new Date(day + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
export function workPeriods(at, timeZone) {
  let format;
  try {
    if (typeof timeZone !== 'string' || timeZone.length > 100 || !timeZone) throw invalid();
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { throw invalid(); }
  const dayAt = instant => { const parts = Object.fromEntries(format.formatToParts(instant).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
  // Find the first instant of a local calendar day. This also handles 23/25-hour
  // days, non-hour offsets and zones whose midnight itself is skipped.
  const midnight = day => {
    const base = Date.parse(day + 'T00:00:00Z'); let low = base - 48 * 3600000, high = base + 48 * 3600000;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (dayAt(mid) < day) low = mid + 1; else high = mid; }
    return new Date(low).toISOString();
  };
  const today = dayAt(at), monday = shiftDay(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7));
  return { timeZone: format.resolvedOptions().timeZone,
    today: { startAt: midnight(today), endAt: midnight(shiftDay(today, 1)), startDate: today, endDate: today },
    week: { startAt: midnight(monday), endAt: midnight(shiftDay(monday, 7)), startDate: monday, endDate: shiftDay(monday, 6) } };
}
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
export function countWork(rows) {
  const tasks = new Set(), projects = new Set(), knowledge = new Set(), abilities = new Set();
  const sets = { project: projects, knowledge, ability: abilities };
  for (const row of rows) { tasks.add(row.taskId); for (const target of row.primaryTargets) sets[target.kind]?.add(target.key); }
  return { tasks: tasks.size, turns: rows.length, projects: projects.size, knowledge: knowledge.size, abilities: abilities.size };
}
export function createWorkStats(root, { now = Date.now, onRead = () => {} } = {}) {
  const files = new Map(), snapshots = new Map(); let index, pending;
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
    return { activity, errors, capture, at: now() };
  }
  async function read({ timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, refresh = false } = {}) {
    const periods = workPeriods(now(), timeZone); timeZone = periods.timeZone;
    if (pending) await pending;
    else if (refresh || !index || now() < index.at || now() - index.at >= 15000 || workPeriods(index.at, timeZone).today.startAt !== periods.today.startAt) {
      pending = build().then(result => { index = result; snapshots.clear(); }).finally(() => { pending = null; });
      await pending;
    }
    const bounds = workPeriods(now(), timeZone), key = `${timeZone}:${bounds.today.startAt}`;
    if (!snapshots.has(key)) {
      const activity = index.activity.filter(row => row.startedAt >= bounds.week.startAt && row.startedAt < bounds.week.endAt && Date.parse(row.startedAt) <= index.at);
      const today = activity.filter(row => row.startedAt >= bounds.today.startAt && row.startedAt < bounds.today.endAt);
      snapshots.set(key, { generatedAt: new Date(index.at).toISOString(), timeZone, today: { ...bounds.today, counts: countWork(today) }, week: { ...bounds.week, counts: countWork(activity) }, activity, capture: index.capture, errors: index.errors });
      if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
    }
    return snapshots.get(key);
  }
  return { read };
}
