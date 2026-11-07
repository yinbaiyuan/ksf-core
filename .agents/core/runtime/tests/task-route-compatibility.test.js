import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { taskCaptureFixture } from './helpers/task-capture-fixture.js';
import { mutateChat, readChatContext } from '../src/services/chat.js';
import { readTask, listTasks, listTaskTargets, taskHook } from '../src/services/tasks.js';
import { readCurrentWork } from '../src/services/work-context.js';
import { runWorkContextCommand } from '../src/commands/work-context.js';
import { location } from '../src/chat-state/storage.js';
import { sessionKey } from '../src/routing/storage.js';
import { turnPath } from '../src/task-capture/storage.js';

test('R1 binding and temporary loading never register capability participation', t => {
  const f = taskCaptureFixture(t); f.bind(f.work); f.consume(f.get([{ ref: 'competency.test.reviewed@0.1.0', source: 'user' }]));
  assert.equal(readChatContext(f.o).abilities.length, 0);
});
test('R2 an explicitly continued arrangement archives without rerunning the routers', async t => {
  const f = taskCaptureFixture(t); f.bind(f.work); f.start('continued'); f.message('u', 'user', 'continue');
  f.declare('continued', 'route', 'capture', { report: f.report() }); f.message('a', 'assistant', 'answer'); f.finish('continued'); await f.sync();
  assert.equal(f.read('continued').status, 'completed'); const route = f.read('continued').routes[0].snapshot;
  assert.equal(route.project.primary.name, 'primary'); assert.deepEqual(route.abilities.map(a => a.id), ['partner.test.executor']);
});
test('R3 unreported dialogue is archived without borrowing the binding or previous route', async t => {
  const f = taskCaptureFixture(t); f.bind(f.work); f.start('reported'); f.message('u1', 'user', 'first'); f.declare('reported', 'route', 'capture', { report: f.report() });
  f.start('unreported', '2026-01-03T00:00:00Z'); f.message('u2', 'user', 'second'); f.message('a', 'assistant', 'answer'); f.finish('unreported'); await f.sync();
  assert.equal(f.read('unreported').messages.length, 2); assert.equal(f.read('unreported').routes.length, 0);
  assert.equal(readTask({ root: f.root, taskId: f.taskId }).task.latestReported.turnId, 'reported');
});
test('R4 retiring current work never rewrites the historical archive', async t => {
  const f = taskCaptureFixture(t); f.bind(f.work); f.consume(f.get()); f.start('saved'); f.message('u', 'user', 'input'); f.declare('saved', 'route', 'capture', { report: f.report() }); await f.sync();
  const path = join(f.root, turnPath(f.taskId, 'saved')), bytes = readFileSync(path); f.bind(null);
  assert(f.get().retired.some(item => item.purposes.includes('executor'))); assert.deepEqual(readFileSync(path), bytes);
});
test('R5 reference projects do not establish primary chat membership', async t => {
  const f = taskCaptureFixture(t); f.start('references'); f.message('u', 'user', 'input');
  f.declare('references', 'route', 'capture', { report: f.report({ relatedTargets: [{ kind: 'project', name: 'reference-only', scope: 'current' }] }) }); await f.sync();
  const targets = listTaskTargets({ root: f.root }).targets;
  assert(targets.some(item => item.key === 'current:primary')); assert(!targets.some(item => item.key === 'current:reference-only'));
});
test('R6 a reviewed capability is a target, not an automatically adopted execution method', async t => {
  const f = taskCaptureFixture(t); f.start('review'); f.message('u', 'user', 'review method');
  f.declare('review', 'route', 'capture', { report: f.report({ ownership: { state: 'bound', target: { kind: 'ability', ref: 'competency.test.reviewed@0.1.0', source: 'user' } } }) }); await f.sync();
  const route = f.read('review').routes[0].snapshot;
  assert.equal(route.ownership.target.id, 'competency.test.reviewed'); assert.deepEqual(route.abilities.map(a => a.id), ['partner.test.executor']);
});

async function prompt(f, turnId) {
  const result = await taskHook({ root: f.root, env: f.env, input: {
    hook_event_name: 'UserPromptSubmit', session_id: f.env.CODEX_THREAD_ID,
    turn_id: turnId, transcript_path: f.path,
  } });
  return result.hookSpecificOutput.additionalContext;
}
async function bindInTurn(f, turnId, current) {
  const ifMatch = readCurrentWork({ root: f.root, env: f.env }).etag;
  const result = await runWorkContextCommand(['bind', '--from', '-', '--if-match', ifMatch, '--turn', turnId, '--json'],
    f.root, { env: f.env, stdin: current });
  assert.equal(result.exitCode, 0, result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.data.routeFactIssue, undefined);
}
function use(f, turnId, operation = 'use', ifMatch) {
  return mutateChat({ root: f.root, env: f.env, operation, turnId, objectId: 'partner.test.executor', ifMatch });
}

test('binding and use reach the exact archive turn with no route declaration for continuing, asking or switching', async t => {
  const f = taskCaptureFixture(t);
  const alternate = { ...f.work, ownership: { state: 'bound', target: { kind: 'project', name: 'reference-only', scope: 'current' } } };
  f.start('begin'); f.message('u1', 'user', 'start project');
  assert.match(await prompt(f, 'begin'), /ordinary turns require no declaration/);
  await bindInTurn(f, 'begin', f.work);
  use(f, 'begin');
  f.message('a1', 'assistant', 'done'); f.finish('begin');
  f.start('continue', '2026-01-03T00:00:00Z'); f.message('u2', 'user', 'continue project'); await prompt(f, 'continue');
  use(f, 'continue');
  f.message('a2', 'assistant', 'done'); f.finish('continue');
  f.start('aside', '2026-01-04T00:00:00Z'); f.message('u3', 'user', 'unrelated aside'); await prompt(f, 'aside');
  f.consume(f.get([{ ref: 'competency.test.reviewed@0.1.0', source: 'user' }]));
  f.message('a3', 'assistant', 'done'); f.finish('aside');
  f.start('switch', '2026-01-05T00:00:00Z'); f.message('u4', 'user', 'switch project'); await prompt(f, 'switch');
  await bindInTurn(f, 'switch', alternate);
  await bindInTurn(f, 'switch', alternate); // A retry cannot duplicate the change.
  f.message('a4', 'assistant', 'done'); f.finish('switch'); await f.sync();
  assert.deepEqual(f.read('begin').routeFacts.abilityIds, ['partner.test.executor']);
  assert.equal(f.read('begin').routeFacts.workChanges[0].project.name, 'primary');
  assert.deepEqual(f.read('continue').routeFacts, { workChanges: [], abilityIds: ['partner.test.executor'] });
  assert.deepEqual(f.read('aside').routeFacts, { workChanges: [], abilityIds: [] });
  assert.deepEqual(f.read('switch').routeFacts.workChanges.map(change => change.project.name), ['reference-only']);
  const result = listTasks({ root: f.root, target: 'current:primary' }).records[0];
  assert.equal(result.targetContext.arrangementTurnId, 'begin');
  assert.equal(result.targetContext.turnCount, 0);
  assert.equal(result.workArrangement.project.name, 'reference-only');
  for (const turnId of ['begin', 'continue', 'aside', 'switch']) {
    const turn = f.read(turnId);
    assert.equal(turn.declarations.length, 0);
    assert.equal(turn.routes.length, 0);
    assert.equal(turn.status, 'completed');
    assert.ok(!turn.issues.some(issue => issue.code === 'TASK_ROUTE_UNREPORTED'));
  }
  assert.equal(readTask({ root: f.root, taskId: f.taskId, turnId: 'aside', target: 'current:primary' }).turn.targetRelation.matches, false);
});

test('a later restriction removes earlier automatic route facts and their pending work change', async t => {
  const f = taskCaptureFixture(t);
  f.start('private'); f.message('u', 'user', 'ordinary beginning'); await prompt(f, 'private');
  await bindInTurn(f, 'private', f.work); use(f, 'private'); await f.sync();
  assert.equal(f.read('private').routeFacts.workChanges.length, 1);
  assert.equal(f.read('private').routeFacts.abilityIds.length, 1);
  f.message('late', 'user', '本轮不记录'); await f.sync();
  assert.equal(f.read('private').policy, 'pending');
  assert.deepEqual(f.read('private').routeFacts, { workChanges: [], abilityIds: [] });
  const shared = JSON.parse(readFileSync(join(f.root, location(f.taskId)), 'utf8'));
  assert.equal(shared.workChanges, undefined);
  assert.equal(shared.workArrangement, undefined);
  assert.equal(readCurrentWork(f.o).current.ownership.target.name, 'primary');
  f.declare('private', 'private-exclude', 'exclude', { inputScope: await f.scope('private') }); await f.sync();
  assert.equal(f.read('private').policy, 'exclude');
  assert.deepEqual(f.read('private').routeFacts, { workChanges: [], abilityIds: [] });
  assert.ok(!listTaskTargets({ root: f.root }).targets.some(target => target.key === 'current:primary'));
});

test('a prompt Hook can stage an arrangement before the native user message is flushed', async t => {
  const f = taskCaptureFixture(t);
  f.start('waiting-for-input'); await prompt(f, 'waiting-for-input');
  assert.equal(f.read('waiting-for-input').policy, 'pending');
  await bindInTurn(f, 'waiting-for-input', f.work);
  assert.deepEqual(f.read('waiting-for-input').routeFacts, { workChanges: [], abilityIds: [] });
  f.message('u', 'user', 'start project'); f.message('a', 'assistant', 'done'); f.finish('waiting-for-input');
  await f.sync();
  const turn = f.read('waiting-for-input');
  assert.equal(turn.policy, 'capture');
  assert.equal(turn.routeFacts.workChanges[0].arrangement.executor.id, 'partner.test.executor');
  assert.deepEqual(turn.routes, []);

  const startedAt = new Date().toISOString();
  await prompt(f, 'waiting-for-start');
  const next = { ...f.work, ownership: { state: 'bound', target: { kind: 'project', name: 'reference-only', scope: 'current' } } };
  await bindInTurn(f, 'waiting-for-start', next);
  f.start('waiting-for-start', startedAt);
  f.message('u2', 'user', 'switch'); f.message('a2', 'assistant', 'done'); f.finish('waiting-for-start');
  await f.sync();
  const switched = f.read('waiting-for-start');
  assert.equal(switched.routeFacts.startingArrangementRevision, undefined);
  assert.equal(switched.openingWorkArrangement.project.name, 'primary');
  assert.equal(switched.routeFacts.workChanges[0].project.name, 'reference-only');
});

test('work arrangement versions track only routing changes and resolve a turn against its own history', async t => {
  const f = taskCaptureFixture(t);
  f.add('partner.test.alternate');
  f.addProject('another-reference');
  const project = name => ({ kind: 'project', name, scope: 'current' });
  const initial = { ...f.work, relatedTargets: [project('reference-only'), project('another-reference')] };
  const related = { ...initial, relatedTargets: [project('another-reference')] };
  const alternate = { ...related, executor: { ref: 'partner.test.alternate@0.1.0', source: 'user' } };
  let timestamp = Date.now() + 60000;
  async function turn(id, act = async () => {}) {
    f.start(id, new Date(timestamp += 1000).toISOString());
    f.message(`u-${id}`, 'user', `test ${id}`);
    await prompt(f, id); await act();
    f.message(`a-${id}`, 'assistant', 'done'); f.finish(id); await f.sync();
    assert.deepEqual(f.read(id).routes, []);
    assert.deepEqual(f.read(id).declarations, []);
    return f.read(id);
  }
  const first = await turn('first-version', async () => { await bindInTurn(f, 'first-version', initial); use(f, 'first-version'); });
  const firstChange = first.routeFacts.workChanges[0];
  assert.equal(firstChange.project.name, 'primary');
  assert.equal(firstChange.arrangement.executor.ref, initial.executor.ref);
  assert.deepEqual(first.routeFacts.abilityIds, ['partner.test.executor']);

  const aside = await turn('aside-version', async () => bindInTurn(f, 'aside-version', { ...initial, goal: 'rephrased', relatedTargets: initial.relatedTargets.toReversed() }));
  assert.deepEqual(aside.routeFacts.workChanges, []);
  assert.deepEqual(aside.routeFacts.abilityIds, []);
  assert.equal(aside.openingWorkArrangement.revision, firstChange.revision);

  const changed = await turn('change-related', async () => bindInTurn(f, 'change-related', related));
  assert.equal(changed.routeFacts.workChanges[0].projectChanged, false);
  assert.deepEqual(changed.routeFacts.workChanges[0].arrangement.relatedProjects.map(item => item.name), ['another-reference']);
  assert.equal(readTask({ root: f.root, taskId: f.taskId, turnId: 'change-related', target: 'current:primary' }).turn.targetRelation.matches, false);

  const newPartner = await turn('change-partner', async () => bindInTurn(f, 'change-partner', alternate));
  assert.equal(newPartner.routeFacts.workChanges[0].projectChanged, false);
  assert.equal(newPartner.routeFacts.workChanges[0].arrangement.executor.id, 'partner.test.alternate');
  assert.deepEqual(newPartner.routeFacts.abilityIds, []);

  const switched = await turn('switch-projects', async () => {
    for (const name of ['reference-only', 'primary']) await bindInTurn(f, 'switch-projects', { ...alternate, ownership: { state: 'bound', target: project(name) } });
  });
  assert.deepEqual(switched.routeFacts.workChanges.map(item => item.project.name), ['reference-only', 'primary']);
  assert.equal(switched.routeFacts.workChanges[0].previousArrangementRevision, newPartner.routeFacts.workChanges[0].revision);
  assert.equal(switched.routeFacts.workChanges[1].previousArrangementRevision, undefined);
  assert.equal(switched.openingWorkArrangement.revision, newPartner.routeFacts.workChanges[0].revision);
  assert.deepEqual(f.read('aside-version').openingWorkArrangement.arrangement.relatedProjects.map(item => item.name).sort(), ['another-reference', 'reference-only']);

  // A binding update with no native turn is usable for live work. It cannot lend an older snapshot to subsequent turns.
  f.bind({ ...alternate, relatedTargets: [] });
  const unversioned = await turn('missing-version');
  assert.equal(unversioned.openingWorkArrangement, undefined);
  assert.equal(unversioned.routeFacts.startingProject.name, 'primary');
});

test('route details show a verified work project without assigning ordinary turns to it', async t => {
  const f = taskCaptureFixture(t);
  const scopePath = join(f.root, location(f.taskId));
  f.bind(f.work);
  const before = new Date('2026-01-01T12:00:00Z');
  utimesSync(scopePath, before, before);
  f.start('existing');
  f.message('u0', 'user', 'previous ordinary input');
  f.message('a0', 'assistant', 'done');
  f.finish('existing');
  await f.sync();
  const original = { name: 'primary', scope: 'current' };
  assert.deepEqual(f.read('existing').currentWorkProject, original);
  assert.equal(f.read('existing').routeFacts.startingProject, undefined);

  f.start('aside', '2026-01-03T00:00:00Z');
  f.message('u1', 'user', 'unrelated question');
  await prompt(f, 'aside');
  f.message('a1', 'assistant', 'done');
  f.finish('aside');
  await f.sync();
  assert.deepEqual(f.read('aside').routeFacts.startingProject, original);
  assert.deepEqual(f.read('aside').routes, []);
  assert.deepEqual(f.read('aside').declarations, []);
  assert.equal(readTask({ root: f.root, taskId: f.taskId, turnId: 'aside', target: 'current:primary' }).turn.targetRelation.matches, false);

  f.start('switch', '2026-01-04T00:00:00Z');
  f.message('u2', 'user', 'switch work project');
  await prompt(f, 'switch');
  const next = { name: 'reference-only', scope: 'current' };
  await bindInTurn(f, 'switch', { ...f.work, ownership: { state: 'bound', target: { kind: 'project', ...next } } });
  f.message('a2', 'assistant', 'done');
  f.finish('switch');
  await f.sync();
  assert.deepEqual(f.read('switch').routeFacts.startingProject, original);
  assert.deepEqual(f.read('switch').routeFacts.workChanges.map(change => change.project.name), [next.name]);
  assert.deepEqual(f.read('aside').routeFacts.startingProject, original);
  assert.equal(f.read('existing').currentWorkProject, undefined);

  const after = new Date('2026-01-04T12:00:00Z');
  utimesSync(scopePath, after, after);
  f.start('hidden', '2026-01-05T00:00:00Z');
  f.message('u3', 'user', 'ordinary beginning');
  await prompt(f, 'hidden');
  assert.deepEqual(f.read('hidden').routeFacts.startingProject, next);
  f.message('u4', 'user', '本轮不记录');
  await f.sync();
  assert.equal(f.read('hidden').policy, 'pending');
  assert.equal(f.read('hidden').routeFacts.startingProject, undefined);
  assert.equal(f.read('hidden').currentWorkProject, undefined);
});

for (const parentField of ['parent_thread_id', 'forked_from_id']) test(`a fork reads its own facts and links its verified parent (${parentField})`, async t => {
  const parent = taskCaptureFixture(t);
  parent.start('parent-turn'); parent.message('u', 'user', 'parent work'); await prompt(parent, 'parent-turn');
  await bindInTurn(parent, 'parent-turn', parent.work); use(parent, 'parent-turn');
  parent.message('a', 'assistant', 'done'); parent.finish('parent-turn'); await parent.sync();
  const child = { ...parent, path: join(parent.env.CODEX_HOME, 'sessions/rollout-fork.jsonl'), env: { ...parent.env, CODEX_THREAD_ID: 'route-fork' } };
  const retained = readFileSync(parent.path, 'utf8').split('\n').slice(1).join('\n');
  writeFileSync(child.path, JSON.stringify({ type: 'session_meta', payload: {
    id: child.env.CODEX_THREAD_ID, cwd: child.root, [parentField]: parent.env.CODEX_THREAD_ID, timestamp: '2026-01-03T00:00:00Z',
  } }) + '\n' + retained);
  const append = row => appendFileSync(child.path, JSON.stringify(row) + '\n');
  append({ type: 'event_msg', timestamp: '2026-01-03T00:00:01Z', payload: { type: 'task_started', turn_id: 'child-turn' } });
  append({ type: 'response_item', timestamp: '2026-01-03T00:00:02Z', payload: { type: 'message', id: 'child-input', role: 'user', content: [{ type: 'input_text', text: 'new child input' }] } });
  await prompt(child, 'child-turn');
  const childId = sessionKey(child.root, { host: 'codex', sessionId: child.env.CODEX_THREAD_ID });
  const detail = readTask({ root: child.root, taskId: childId });
  assert.equal(detail.total, 1);
  assert.equal(detail.task.lineage.parentTaskId, parent.taskId);
  assert.equal(detail.task.workArrangement, undefined);
  assert.deepEqual(detail.turns[0].routeFacts, { workChanges: [], abilityIds: [] });
  assert.equal(detail.turns[0].timing.userSentAt, '2026-01-03T00:00:02.000Z');
  assert.equal(detail.turns[0].timing.durationMs, null);
});
