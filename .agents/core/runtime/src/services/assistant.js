import { resolve, dirname, isAbsolute } from 'node:path';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { listTasks, readTask, listTaskTargets, captureStatus, syncTasks } from './tasks.js';
import { project } from './projects.js';
import { sessionKey } from '../routing/storage.js';
import { routeEvolution } from '../routing/route-evolution.js';
import { ownershipOf, relatedOf, targetKey } from '../routing/view-targets.js';
import { fail } from '../routing/schema.js';
import { readJSON, taskPath } from '../task-capture/storage.js';

export const ASSISTANT_PROTOCOL = 'ksf-assistant-read-v1';
// The archive remains the only owner. This projection never exports messages,
// previews, or host identity not explicitly supplied by the calling host.
function clean(value, root) {
  if (Array.isArray(value)) return value.map(v => clean(v, root));
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).filter(([k]) => !['messages', 'preview', 'declarations', 'content', 'revisions'].includes(k)).map(([k,v]) => [k, clean(v, root)]));
  if (value.project && Array.isArray(value.abilities) && value.status) {
    result.ownership = clean(ownershipOf(value), root);
    result.relatedTargets = clean(relatedOf(value), root);
  }
  if (value.taskId && typeof value.title === 'string') {
    let stored; try { stored = readJSON(root, `${taskPath(value.taskId)}/task.json`); } catch {}
    result.title = stored?.titleSource === 'host' ? stored.title : 'Codex 聊天';
  }
  return result;
}
function allTasks(root) {
  const records = [], errors = []; let offset = 0;
  do {
    const page = listTasks({ root, limit: 100, offset });
    records.push(...page.records); errors.push(...page.errors); offset = page.nextOffset;
  } while (offset !== null);
  return { records, errors };
}
function catalog(root) {
  const result = project({ root, operation: 'list' });
  const errors = [...result.errors];
  const projects = result.data.projects.flatMap(p => {
    try {
    const item = project({ root, operation: 'read', name: p.name, part: 'metadata' }).data.project;
    const directory = resolve(root, item.directory);
    const mappings = (item.metadata?.repositories ?? []).flatMap((entry, index) => {
      const path = isAbsolute(entry) ? entry : resolve(directory, entry);
      try { if (!lstatSync(path).isDirectory()) return []; return [{ id: String(index), rootPath: realpathSync(path), role: '', factEntrypoints: '', purpose: '' }]; } catch { return []; }
    });
    return [{ id: item.path, name: item.metadata?.name ?? p.name, status: item.metadata?.status ?? 'active', summary: item.metadata?.description ?? '', memoryMode: 'single', cardPath: item.path,
      projectDirectory: directory, engineeringMappings: mappings, targetKey: `current:${p.name}` }];
    } catch (error) { errors.push({ code: error.code ?? 'ASSISTANT_PROJECT_UNAVAILABLE', message: 'Project metadata is unavailable.', path: p.path }); return []; }
  });
  return { projects, errors };
}
function transitions(root, taskId) {
  const events = []; let offset = 0;
  do {
    const page = readTask({ root, taskId, limit: 100, offset });
    for (const summary of page.turns) {
      const turn = readTask({ root, taskId, turnId: summary.turnId, includeMessages: false }).turn;
      for (const [eventIndex, event] of (turn?.routes ?? []).entries()) {
        const o = ownershipOf(event.snapshot), t = o.target;
        const card = o.state === 'bound' && t?.kind === 'project' && t.lifecycle !== 'planned' ? t.path : '';
        events.push({ projectCard: card ?? '', boundAt: event.at, targetKey: t ? targetKey(t) : `state:${o.state}`, turnNumber: turn.turnNumber, eventIndex });
      }
    }
    offset = page.nextOffset;
  } while (offset !== null);
  return events.sort((a,b) => a.boundAt.localeCompare(b.boundAt) || a.turnNumber-b.turnNumber || a.eventIndex-b.eventIndex)
    .filter((v,i,a) => i === 0 || a[i-1].projectCard !== v.projectCard).map(({turnNumber,eventIndex,...value}) => value);
}
export function queryAssistant({ root, input = {} }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_ARGUMENTS', 'Assistant query needs an object.');
  const allowed = ['op', 'target', 'taskId', 'turnId', 'limit', 'offset', 'q', 'nativeThreads'];
  if (Object.keys(input).some(k => !allowed.includes(k))) fail('INVALID_ARGUMENTS', 'Unknown Assistant query field.');
  const { op = 'overview', target = '', taskId, turnId, limit = 50, offset = 0, q = '' } = input;
  let data;
  if (op === 'overview') {
    const targets = listTaskTargets({ root }), tasks = allTasks(root), projects = catalog(root);
    const nativeThreads = input.nativeThreads ?? [];
    if (!Array.isArray(nativeThreads) || nativeThreads.length > 20000 || nativeThreads.some(id => typeof id !== 'string' || !id || id.length > 1024 || /[\x00-\x1f]/.test(id))) fail('INVALID_ARGUMENTS', 'Invalid native thread identifiers.');
    const known = new Set(tasks.records.map(t => t.taskId));
    const mappings = [], mappingErrors = [];
    for (const threadId of new Set(nativeThreads)) {
      try {
        const id = sessionKey(root, { host: 'codex', sessionId: threadId });
        if (id && known.has(id)) mappings.push({ threadId, taskId: id, bindings: transitions(root, id) });
      } catch (error) {
        mappingErrors.push({ code: error.code ?? 'ASSISTANT_IDENTITY_UNAVAILABLE', message: 'Native chat identity cannot be resolved; archive reading remains available.' });
        break;
      }
    }
    data = { ...targets, records: tasks.records, projects: projects.projects, nativeThreads: mappings, capture: captureStatus({ root }),
      errors: [...targets.errors, ...tasks.errors, ...projects.errors, ...mappingErrors] };
  } else if (op === 'chats') data = listTasks({ root, target, q, limit, offset });
  else if (op === 'turns') data = readTask({ root, taskId, target, limit, offset });
  else if (op === 'route') {
    if (!turnId) fail('INVALID_ARGUMENTS', 'Supply turnId.');
    data = readTask({ root, taskId, turnId, target, includeMessages: false });
    if (data.turn) data.evolution = routeEvolution(data.turn.routes);
  } else fail('INVALID_ARGUMENTS', 'Use overview, chats, turns or route.');
  return { protocol: ASSISTANT_PROTOCOL, ...clean(data, root) };
}
export async function refreshAssistant({ root, env = process.env }) {
  if (!captureStatus({ root }).enabled) return { protocol: ASSISTANT_PROTOCOL, skipped: true, reason: 'capture-disabled', errors: [] };
  return { protocol: ASSISTANT_PROTOCOL, ...await syncTasks({ root, env, force: false }) };
}
