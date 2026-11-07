import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { taskCaptureFixture } from './helpers/task-capture-fixture.js';
import { parseTranscript, nativeTurnState } from '../src/task-capture/codex.js';
import { readTask, readTaskInput, syncTasks, declareTask } from '../src/services/tasks.js';
import { sessionKey } from '../src/routing/storage.js';
import { turnPath } from '../src/task-capture/storage.js';
import { createTaskActivitySource } from '../src/services/task-activity.js';
import { createTaskReviewSource } from '../src/services/task-review.js';
import { runTaskCommand } from '../src/commands/tasks.js';

test('a scoped early capture cannot cover a later same-turn recording restriction', async t => {
  const f = taskCaptureFixture(t); f.start('one'); f.message('u1', 'user', 'ordinary');
  f.declare('one', 'early', 'capture', { inputScope: await f.scope('one'), report: f.report() }); await f.sync();
  assert.deepEqual(f.read('one').timing, { userSentAt: '2026-01-02T00:00:00.100Z', assistantRepliedAt: null, durationMs: null });
  f.message('u2', 'user', '本轮不记录 PRIVATE_LATE_CANARY'); await f.sync();
  assert.equal(f.read('one').policy, 'pending'); assert.equal(f.read('one').messages.length, 0);
  const withheldTiming = { userSentAt: null, assistantRepliedAt: null, durationMs: null };
  assert.deepEqual(f.read('one').timing, withheldTiming);
  assert.doesNotMatch(readFileSync(join(f.root, turnPath(f.taskId, 'one')), 'utf8'), /PRIVATE_LATE_CANARY|ordinary|explicit fixture arrangement/);
  assert.equal((await createTaskActivitySource(f.root).read()).activity.length, 0);
  assert.equal((await createTaskReviewSource(f.root).sources()).total, 0);
  f.declare('one', 'exclude', 'exclude', { inputScope: await f.scope('one') }); await f.sync();
  assert.equal(f.read('one').policy, 'exclude'); assert.equal(f.read('one').messages.length, 0);
  assert.deepEqual(f.read('one').timing, withheldTiming);
});
test('legacy receipt replay never extends its original input coverage, including after source shrink', async t => {
  const f = taskCaptureFixture(t); f.start('one'); f.message('u1', 'user', 'ordinary'); const receipt = f.declare('one', 'early'); await f.sync();
  f.message('u2', 'user', '解释“不记录对话”按钮'); f.output(receipt); await f.sync(); assert.equal(f.read('one').policy, 'pending');
  const rows = readFileSync(f.path, 'utf8').trim().split('\n');
  writeFileSync(f.path, rows.filter(line => !line.includes('ordinary') && !line.includes('KSF_TASK_RECEIPT')).join('\n') + '\n');
  f.output(receipt); await f.sync(); assert.equal(f.read('one').policy, 'pending');
  f.declare('one', 'new-scope', 'capture', { inputScope: await f.scope('one') }); await f.sync();
  assert.equal(f.read('one').policy, 'capture');
});
test('a valid fresh scope clarifies quoted restrictions; invalid scope keeps the hold', async t => {
  const f = taskCaptureFixture(t); f.start('one'); f.message('u', 'user', '解释“不记录对话”的意思');
  f.declare('one', 'invalid', 'capture', { inputScope: { version: 1, count: 1, digest: '0'.repeat(64) } }); await f.sync();
  assert.equal(f.read('one').policy, 'pending'); assert(f.read('one').issues.some(i => i.code === 'TASK_INPUT_SCOPE_UNCONFIRMED'));
  f.declare('one', 'valid', 'capture', { inputScope: await f.scope('one') }); await f.sync();
  assert.equal(f.read('one').policy, 'capture'); assert.equal(f.read('one').messages.length, 1);
});
test('a declaration flushed before native user input never publishes the answer early', async t => {
  const f = taskCaptureFixture(t); f.start('one'); f.declare('one', 'before-user'); f.message('a', 'assistant', 'EARLY_ANSWER_CANARY'); await f.sync();
  assert.equal(f.read('one').policy, 'pending'); assert.doesNotMatch(JSON.stringify(f.read('one')), /EARLY_ANSWER_CANARY/);
  f.message('u', 'user', '本轮不记录 LATE_INPUT_CANARY'); await f.sync(); assert.equal(f.read('one').policy, 'pending');
  assert.doesNotMatch(JSON.stringify(f.read('one')), /EARLY_ANSWER_CANARY|LATE_INPUT_CANARY/);
});
test('a cold legacy replay cannot use its later output position to acknowledge newer restrictions', async t => {
  const f = taskCaptureFixture(t); f.start('one'); f.message('u1', 'user', 'ordinary'); const receipt = f.declare('one', 'early');
  const rows = readFileSync(f.path, 'utf8').trim().split('\n'); writeFileSync(f.path, rows.filter(line => !line.includes('KSF_TASK_RECEIPT')).join('\n') + '\n');
  f.message('u2', 'user', '本轮不记录 COLD_REPLAY_CANARY'); f.output(receipt); await f.sync();
  assert.equal(f.read('one').policy, 'pending'); assert.doesNotMatch(JSON.stringify(f.read('one')), /COLD_REPLAY_CANARY/);
});
test('editing an existing message creates a new input version requiring fresh policy coverage', async t => {
  const f = taskCaptureFixture(t); f.start('one'); f.message('same-id', 'user', 'ORDINARY_EDIT_CANARY'); f.declare('one', 'early'); await f.sync();
  writeFileSync(f.path, readFileSync(f.path, 'utf8').replace('ORDINARY_EDIT_CANARY', '本轮不记录 PRIVATE_EDIT_CANARY'));
  await f.sync(); assert.equal(f.read('one').policy, 'pending');
  assert.doesNotMatch(JSON.stringify(f.read('one')), /PRIVATE_EDIT_CANARY|ORDINARY_EDIT_CANARY/);
});
test('task input verifies native identity and returns its scope without writing files', async t => {
  const f = taskCaptureFixture(t); f.start('one'); f.message('u', 'user', 'ordinary');
  const before = readdirSync(f.root, { recursive: true }).sort();
  const result = await readTaskInput({ root: f.root, env: f.env, turnId: 'one' });
  assert.deepEqual(result.inputScope, await f.scope('one')); assert.equal(result.readOnly, true);
  const cli = await runTaskCommand(['input', '--turn', 'one', '--json'], f.root, { env: f.env }); assert.equal(cli.exitCode, 0);
  assert.deepEqual(readdirSync(f.root, { recursive: true }).sort(), before);
  await assert.rejects(readTaskInput({ root: f.root, env: { ...f.env, CODEX_THREAD_ID: 'other-chat' }, turnId: 'one' }), { code: 'TASK_INPUT_UNAVAILABLE' });
});
test('archive and native counters preserve millisecond precision at the activation boundary', async t => {
  const baseline = '2026-01-02T00:00:00.500Z', f = taskCaptureFixture(t, { activatedAt: baseline });
  f.start('first', '2026-01-02T00:00:00.584Z', 1767312000); f.message('u', 'user', 'after activation');
  const parsed = await parseTranscript(f.path, baseline), count = await nativeTurnState(f.path, baseline);
  assert.equal(parsed.turns.size, 1); assert.deepEqual(count.turnIds, ['first']); await f.sync(); assert.equal(f.read('first').startedAt, '2026-01-02T00:00:00.584Z');
});
test('forks archive only new child turns and expose a verified local parent relation', async t => {
  const f = taskCaptureFixture(t, { metadata: { parent_thread_id: 'parent-chat', timestamp: '2026-01-03T00:00:00Z' } });
  f.start('parent-one'); f.message('p1', 'user', 'parent first');
  f.start('parent-two', '2026-01-02T00:00:05Z'); f.message('p2', 'user', 'parent second');
  const copied = readFileSync(f.path, 'utf8').split('\n').slice(1).join('\n'), parent = join(f.env.CODEX_HOME, 'sessions/rollout-parent.jsonl');
  writeFileSync(parent, JSON.stringify({ type: 'session_meta', payload: { id: 'parent-chat', cwd: f.root } }) + '\n' + copied);
  await syncTasks({ root: f.root, env: f.env, transcriptPath: parent, force: true });
  f.start('child-one', '2026-01-04T00:00:00Z'); f.message('c', 'user', 'child own'); await f.sync();
  const child = readTask({ root: f.root, taskId: f.taskId }), parentTaskId = sessionKey(f.root, { host: 'codex', sessionId: 'parent-chat' });
  assert.equal(child.total, 1); assert.equal(child.turns[0].turnId, 'child-one'); assert.equal(child.task.lineage.parentTaskId, parentTaskId); assert.equal(child.task.lineage.available, true);
  assert.equal(readTask({ root: f.root, taskId: parentTaskId }).total, 2); assert.equal(f.read('parent-one'), null);
  assert.doesNotMatch(JSON.stringify(child.task), /parent-chat/);
  const excluded = declareTask({ root: f.root, env: { ...f.env, CODEX_THREAD_ID: 'parent-chat' }, input: { turnId: 'parent-two', eventId: 'exclude-parent', policy: 'exclude', reason: 'parent restriction' } });
  appendFileSync(parent, JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', output: JSON.stringify(excluded) } }) + '\n');
  await syncTasks({ root: f.root, env: f.env, transcriptPath: parent, force: true }); await f.sync();
  assert.equal(readTask({ root: f.root, taskId: parentTaskId, turnId: 'parent-two' }).turn.messages.length, 0); assert.equal(readTask({ root: f.root, taskId: f.taskId }).total, 1);
});
test('missing parent archive remains unavailable and is never imported by a relationship query', async t => {
  const f = taskCaptureFixture(t, { metadata: { parent_thread_id: 'unarchived-parent', timestamp: '2026-01-01T12:00:00Z' } });
  f.start('child'); f.message('u', 'user', 'child own input'); await f.sync(); const before = readdirSync(f.root, { recursive: true }).sort();
  const child = readTask({ root: f.root, taskId: f.taskId }); assert.equal(child.task.lineage.available, false); assert.equal(child.total, 1);
  assert.deepEqual(readdirSync(f.root, { recursive: true }).sort(), before);
});
test('a changed fork origin cannot rewrite its existing archive or import another lineage', async t => {
  const f = taskCaptureFixture(t, { metadata: { parent_thread_id: 'original-parent', timestamp: '2026-01-01T12:00:00Z' } });
  f.start('child'); f.message('u', 'user', 'child own'); await f.sync(); const path = join(f.root, turnPath(f.taskId, 'child')), bytes = readFileSync(path);
  writeFileSync(f.path, readFileSync(f.path, 'utf8').replace('original-parent', 'different-parent'));
  const result = await syncTasks({ root: f.root, env: f.env, transcriptPath: f.path, force: true }); assert.equal(result.errors[0].code, 'TASK_SOURCE_IDENTITY'); assert.deepEqual(readFileSync(path), bytes);
});
test('unknown fork creation boundary does not import inherited history', async t => {
  const f = taskCaptureFixture(t, { metadata: { parent_thread_id: 'parent' } }); f.start('unknown'); f.message('u', 'user', 'not proven to be new');
  const result = await syncTasks({ root: f.root, env: f.env, transcriptPath: f.path, force: true });
  assert.equal(result.errors[0].code, 'TASK_SOURCE_UNSUPPORTED'); assert.equal(readTask({ root: f.root, taskId: f.taskId }).total, 0);
});
test('an unflushed final line never marks completed historical turns partial', async t => {
  const f = taskCaptureFixture(t);
  for (let i = 0; i < 3; i++) { const id = 'complete-' + i; f.start(id, `2026-01-02T00:00:0${i}Z`); f.message('u-' + i, 'user', 'input'); f.message('a-' + i, 'assistant', 'answer'); f.finish(id); }
  await f.sync(); appendFileSync(f.path, '{"type":"event_msg"'); const result = await f.sync();
  assert(result.sourceIssues.some(i => i.code === 'TASK_SOURCE_PARTIAL' && i.retryable));
  for (let i = 0; i < 3; i++) { assert.equal(f.read('complete-' + i).status, 'completed'); assert(!f.read('complete-' + i).issues.some(i => i.code === 'TASK_SOURCE_PARTIAL')); }
  appendFileSync(f.path, ',"payload":{"type":"unrelated"}}\n'); await f.sync(); assert.equal(f.read('complete-2').status, 'completed');
});
test('invalid UTF-8 is explicit and local; later healthy turns still complete', async t => {
  const f = taskCaptureFixture(t); f.start('damaged'); f.message('u', 'user', 'valid input');
  const row = JSON.stringify({ type: 'response_item', payload: { type: 'message', id: 'bad', role: 'user', content: [{ type: 'input_text', text: 'BYTE_SENTINEL' }] } });
  const [prefix, suffix] = row.split('BYTE_SENTINEL'); appendFileSync(f.path, Buffer.concat([Buffer.from(prefix), Buffer.from([0xff]), Buffer.from(suffix + '\n')]));
  f.start('healthy', '2026-01-03T00:00:00Z'); f.message('hu', 'user', 'hello'); f.message('ha', 'assistant', 'answer'); f.finish('healthy'); const result = await f.sync();
  assert(result.sourceIssues.some(i => i.code === 'TASK_SOURCE_ENCODING')); assert.equal(f.read('damaged').status, 'partial'); assert.equal(f.read('healthy').status, 'completed');
  assert(!f.read('healthy').issues.some(i => i.code === 'TASK_SOURCE_ENCODING')); assert.doesNotMatch(JSON.stringify(f.read('damaged')), /�/);
  await assert.rejects(nativeTurnState(f.path, '2026-01-01T00:00:00Z'), { code: 'CHAT_SOURCE_PARTIAL' });
});
test('unreadable native boundary never attaches following messages to the previous turn', async t => {
  const f = taskCaptureFixture(t); f.start('old'); f.message('u', 'user', 'old input'); appendFileSync(f.path, '{bad-native-boundary}\n');
  f.message('unassigned', 'user', 'UNASSIGNED_CANARY'); f.start('new', '2026-01-03T00:00:00Z'); f.message('new-u', 'user', 'new input'); await f.sync();
  assert.doesNotMatch(JSON.stringify(f.read('old')), /UNASSIGNED_CANARY/); assert.equal(f.read('new').messages[0].id, 'new-u');
});
test('UTF-8 across stream chunks and CRLF preserve complete original Unicode', async t => {
  const f = taskCaptureFixture(t); f.start('unicode'); const text = '汉🚀'.repeat(30000); f.message('u', 'user', text);
  writeFileSync(f.path, readFileSync(f.path, 'utf8').replace(/\n/g, '\r\n')); await f.sync(); assert.equal(f.read('unicode').messages[0].content[0].text, text);
});
