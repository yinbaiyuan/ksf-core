import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { routingFixture } from './routing-fixture.js';
import { enableChat } from '../../src/services/chat.js';
import { bindCurrentWork, readCurrentWork, currentWorkContext, acceptWorkContext } from '../../src/services/work-context.js';
import { enableCapture, declareTask, syncTasks, readTask } from '../../src/services/tasks.js';
import { sessionKey } from '../../src/routing/storage.js';
import { parseTranscript } from '../../src/task-capture/codex.js';

export function taskCaptureFixture(t, { activatedAt = '2026-01-01T00:00:00Z', metadata = {} } = {}) {
  const f = routingFixture(t), identity = { host: 'codex', sessionId: 'capture-fixture' }, env = { CODEX_THREAD_ID: identity.sessionId, CODEX_HOME: join(f.root, 'host') };
  f.add('partner.ksf.runtime', 'system'); f.add('partner.test.executor'); f.add('competency.test.reviewed');
  f.addProject('primary'); f.addProject('reference-only');
  enableChat({ root: f.root, at: activatedAt }); enableCapture({ root: f.root, at: activatedAt });
  const path = join(env.CODEX_HOME, 'sessions/rollout-capture.jsonl'); mkdirSync(join(env.CODEX_HOME, 'sessions'), { recursive: true });
  const append = row => appendFileSync(path, JSON.stringify(row) + '\n');
  append({ type: 'session_meta', payload: { id: identity.sessionId, cwd: f.root, ...metadata } });
  const taskId = sessionKey(f.root, identity), o = { root: f.root, identity };
  let time = Date.parse('2026-01-02T00:00:00Z');
  const tick = () => new Date(time += 100).toISOString();
  const start = (turnId, at = '2026-01-02T00:00:00Z', startedAt = at) => { time = Date.parse(at); append({ type: 'event_msg', timestamp: at, payload: { type: 'task_started', turn_id: turnId, started_at: startedAt } }); };
  const message = (id, role, text, phase = role === 'user' ? 'input' : 'final_answer') => append({ type: 'response_item', timestamp: tick(), payload: { type: 'message', id, role, phase, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } });
  const finish = id => append({ type: 'event_msg', timestamp: tick(), payload: { type: 'task_complete', turn_id: id } });
  const output = result => append({ type: 'response_item', timestamp: tick(), payload: { type: 'function_call_output', output: JSON.stringify(result) } });
  const declare = (turnId, eventId, policy = 'capture', overrides = {}) => {
    const result = declareTask({ root: f.root, env, now: tick(), input: { turnId, eventId, policy, reason: 'fixture policy', ...overrides } });
    output(result); return result;
  };
  const scope = async id => (await parseTranscript(path, activatedAt)).turns.get(id).inputScope;
  const sync = async (options = {}) => { const result = await syncTasks({ root: f.root, env, transcriptPath: path, force: true, ...options }); assert.deepEqual(result.errors, []); return result; };
  const read = id => readTask({ root: f.root, taskId, turnId: id }).turn;
  const work = { schemaVersion: 1, goal: 'fixture work', status: 'active', ownership: { state: 'bound', target: { kind: 'project', name: 'primary', scope: 'current' } }, executor: { ref: 'partner.test.executor@0.1.0', source: 'user' }, methods: [], files: [], taskRef: null };
  const bind = current => bindCurrentWork({ ...o, current, ifMatch: readCurrentWork(o).etag });
  const get = extras => currentWorkContext({ ...o, ...(extras ? { extras } : {}) });
  const consume = value => { assert.equal(value.complete, true); acceptWorkContext({ ...o, delivery: value.delivery }); };
  const report = overrides => ({ summary: 'explicit fixture arrangement', status: 'working', ownership: work.ownership, relatedTargets: [], abilities: [f.ability('partner.test.executor')], ...overrides });
  return { ...f, identity, env, o, path, taskId, append, start, message, finish, output, declare, scope, sync, read, work, bind, get, consume, report };
}
