import { lstatSync, readdirSync } from 'node:fs';
import { setImmediate as yieldThread } from 'node:timers/promises';
import { managedPath } from '../routing/storage.js';
import { fail, invalid, isToken } from '../routing/schema.js';
import { currentObjectId } from '../objects/legacy.js';
import { validId } from '../objects/schema.js';
import { taskIds, taskPath, turnPath, readTurn, readJSON, turnTiming, config, PROTOCOL } from '../task-capture/storage.js';
import { ownedTargets, primaryTarget } from '../task-capture/targets.js';
import { projectKey, turnProjects } from '../task-capture/projects.js';
import { openingWorkRevision } from '../task-capture/route-facts.js';

const short = (value, limit = 160) => typeof value === 'string' ? [...value.replace(/\s+/g, ' ').trim()].slice(0, limit).join('') : '';
function projection(turn) {
  const user = turn.messages.find(message => message.role === 'user' && message.content.some(block =>
    ['text', 'input_text'].includes(block.type) ? typeof block.text === 'string' && !!block.text.trim() : !!block.type));
  if (turn.policy !== 'capture' || turn.capturePolicyHeld || turn.chatPolicyHeld || turn.explicitExcluded || turn.status === 'excluded' || !user) return null;
  const last = turn.routes.at(-1)?.snapshot;
  const workFacts = last ? undefined : turn.routeFacts;
  const projectKeys = last ? turnProjects(turn).entries.filter(entry => entry.project).map(entry => entry.key)
    : (workFacts?.workChanges ?? []).filter(({ project }) => project && project.lifecycle !== 'planned').map(({ project }) => projectKey(project));
  const abilityIds = new Set((turn.routeFacts?.abilityIds ?? []).map(currentObjectId));
  for (const event of turn.routes) for (const ability of event.snapshot.abilities) {
    const id = currentObjectId(ability?.id);
    if (ability?.stage === 'adopted' && validId(id)) abilityIds.add(id);
  }
  const { assistantRepliedAt, durationMs } = turnTiming(turn);
  return { taskId: turn.taskId, turnId: turn.turnId, startedAt: new Date(turn.startedAt).toISOString(),
    answeredAt: Date.parse(assistantRepliedAt), durationMs, revision: turn.revision, status: turn.status,
    title: short(last?.summary) || short(user.content.filter(block => ['text', 'input_text'].includes(block.type)).map(block => block.text).join('\n').split(/\r?\n/).find(line => line.trim())) || '附件对话',
    navigationTarget: last ? primaryTarget(last).key : 'unreported',
    primaryTargets: ownedTargets(turn).filter(item => item.target).map(item => ({ key: item.key, kind: item.target.kind, label: short(item.label), lifecycle: item.target.lifecycle ?? 'existing' })),
    projectKeys, abilityIds: [...abilityIds].sort(), startingProject: workFacts?.startingProject, openingRevision: openingWorkRevision(workFacts),
    arrangements: turn.routeFacts?.workChanges.filter(change => change.arrangement) ?? [] };
}

function localCalendar(timeZone, at) {
  let format;
  try {
    if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 100) throw new Error();
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { invalid('请使用有效的 IANA 时区。'); }
  const dateAt = instant => {
    const parts = Object.fromEntries(format.formatToParts(instant).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  // Advance calendar dates independently of the length of each local day.
  const cursor = new Date(dateAt(at) + 'T00:00:00Z');
  cursor.setUTCDate(cursor.getUTCDate() - 29);
  const days = new Map();
  for (let index = 0; index < 30; index++) {
    days.set(cursor.toISOString().slice(0, 10), 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { timeZone: format.resolvedOptions().timeZone, days, dateAt };
}

export function createTaskActivitySource(root,{onRead=()=>{},now=Date.now}={}){
  const files = new Map();
  let pending;
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
      const taskRows = [], arrangements = new Map();
      for (const name of names) {
        if (!name.endsWith('.json') || !isToken(name.slice(0, -5))) continue;
        const turnId = name.slice(0, -5), path = turnPath(id, turnId); seen.add(path);
        try {
          const row = cached(path, () => projection(readTurn(root, id, turnId)));
          if (row) {
            taskRows.push(row);
            for (const change of row.arrangements) {
              // Revisions identify one archived change within this chat.
              arrangements.set(change.revision, arrangements.has(change.revision) ? null : { change, row });
            }
          }
        } catch (error) { errors.push(issue(error, { taskId: id, turnId })); }
        if (++inspected % 8 === 0) await yieldThread();
      }
      for (const { arrangements: _, startingProject, openingRevision, ...row } of taskRows) {
        const opening = arrangements.get(openingRevision);
        const startedBefore = opening && (opening.row.startedAt < row.startedAt ||
          (opening.row.startedAt === row.startedAt && opening.row.turnId.localeCompare(row.turnId) < 0));
        // Match the archived opening arrangement shown in the conversation. The
        // live chat binding is never evidence for an older turn.
        const project = startedBefore && Date.parse(opening.change.at) <= Date.parse(row.startedAt) ? opening.change.project : startingProject;
        const keys = new Set(row.projectKeys);
        if (project && project.lifecycle !== 'planned') keys.add(projectKey(project));
        activity.push({ ...row, projectKeys: [...keys], taskTitle: title || row.title });
      }
    }
    for (const path of files.keys()) if (!seen.has(path)) files.delete(path);
    let capture = { enabled: false, activatedAt: null };
    try { const settings = config(root); capture = { enabled: settings?.enabled ?? false, activatedAt: settings?.activatedAt ?? null }; }
    catch (error) { errors.push(issue(error)); }
    activity.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.taskId.localeCompare(b.taskId) || a.turnId.localeCompare(b.turnId));
    return { activity, errors, capture };
  }
  function snapshot() {
    pending ??= build().finally(() => { pending = null; });
    return pending;
  }
  async function read() {
    const { activity, errors, capture } = await snapshot();
    return { activity: activity.map(({ projectKeys, abilityIds, answeredAt, durationMs, revision, status, ...row }) => row), errors, capture };
  }
  async function matchingRows({ project, ability }, at) {
    if (project) {
      const { name, scope } = project;
      if (typeof name !== 'string' || !name.trim() || name.length > 255 || ['.', '..'].includes(name)
        || /[\\/\x00-\x1f\x7f]/u.test(name) || !['current', 'archived'].includes(scope)) invalid('请选择有效项目。');
    }
    if (ability !== undefined && !validId(ability)) invalid('请提供不含版本号的完整能力 ID。');
    const key = project && projectKey(project);
    const { activity, errors, capture } = await snapshot();
    const rows = activity.filter(row => Date.parse(row.startedAt) <= at
      && (!key || row.projectKeys.includes(key)) && (!ability || row.abilityIds.includes(ability)));
    return { rows, errors, capture };
  }
  async function readStats({ project, ability, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone }) {
    const at = now();
    const calendar = localCalendar(timeZone, at);
    const { rows, errors, capture } = await matchingRows({ project, ability }, at);
    let total = 0;
    const duration = { totalMs: 0, measuredTurns: 0, unmeasuredTurns: 0 };
    for (const row of rows) {
      if (row.durationMs !== null && row.answeredAt <= at) {
        duration.totalMs += row.durationMs;
        duration.measuredTurns++;
      } else {
        duration.unmeasuredTurns++;
      }
      const date = calendar.dateAt(Date.parse(row.startedAt));
      if (!calendar.days.has(date)) continue;
      calendar.days.set(date, calendar.days.get(date) + 1);
      total++;
    }
    return {
      project: project ?? null, ability: ability ?? null, timeZone: calendar.timeZone,
      turnCount: rows.length, chatCount: new Set(rows.map(row => row.taskId)).size, duration,
      recent30Days: { turnCount: total, days: Array.from(calendar.days, ([date, count]) => ({ date, count })) },
      capture, partial: errors.length > 0, errors
    };
  }
  async function readProject({ name, scope, timeZone } = {}) {
    if (timeZone === undefined) invalid('请使用有效的 IANA 时区。');
    const stats = await readStats({ project: { name, scope }, timeZone });
    return { timeZone: stats.timeZone, total: stats.recent30Days.turnCount, duration: stats.duration,
      days: stats.recent30Days.days, captureEnabled: stats.capture.enabled, partial: stats.partial };
  }
  async function listTurns({ project, ability, limit = 20, offset = 0, withMessages = false }) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
      invalid('分页须使用 1–100 的 limit 和非负 offset。');
    }
    const { rows, errors, capture } = await matchingRows({ project, ability }, now());
    const issues = [...errors];
    const turns = [];
    for (const { revision, answeredAt, ...row } of rows.slice(offset, offset + limit)) {
      if (!withMessages) {
        turns.push(row);
        continue;
      }
      try {
        const turn = readTurn(root, row.taskId, row.turnId);
        if (!turn || turn.revision !== revision || !projection(turn)) fail('TASK_CONFLICT', '轮次在读取期间已变更。');
        turns.push({ ...row, turn: { ...turn, timing: turnTiming(turn) } });
      } catch (error) { issues.push(issue(error, { taskId: row.taskId, turnId: row.turnId })); }
    }
    return { project: project ?? null, ability: ability ?? null, total: rows.length, limit, offset,
      nextOffset: offset + limit < rows.length ? offset + limit : null,
      turns, capture, partial: issues.length > 0, errors: issues };
  }
  return { read, readProject, readStats, listTurns };
}
