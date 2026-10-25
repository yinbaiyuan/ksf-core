import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { taskProjectFixture } from './helpers/task-project-fixture.js';
import { listTaskProjects, listTasks, readTask } from '../src/services/tasks.js';
import { turnPath } from '../src/task-capture/storage.js';
import { runTaskCommand } from '../src/commands/tasks.js';

test('historical project membership uses every primary declaration and virtual group, retaining references only as evidence', t => {
  const f = taskProjectFixture(t), catalog = listTaskProjects({ root: f.root });
  const a = catalog.projects.find(p => p.key === f.key('A')), b = catalog.projects.find(p => p.key === f.key('B')), c = catalog.projects.find(p => p.key === f.key('C'));
  assert.equal(a.primaryTurnCount, 3); assert.equal(a.referenceTurnCount, 0); assert.equal(a.turnCount, 3); assert.equal(a.chatCount, 1);
  assert.equal(b.primaryTurnCount, 2); assert.equal(c, undefined);
  assert.equal(listTasks({ root: f.root, project: f.key('C'), projectMatch: 'history' }).total, 0);
  for (const key of ['state:none', 'state:unresolved', 'unreported', 'state:excluded']) assert.equal(catalog.projects.find(p => p.key === key).turnCount, 1);
  assert.equal(listTasks({ root: f.root, project: f.key('A') }).total, 0); // latest query contract stays unchanged
  const list = listTasks({ root: f.root, project: f.key('A'), projectMatch: 'history' });
  assert.equal(list.total, 1); assert.equal(list.records[0].projectContext.latestTurnId, 'four');
  assert.equal(list.records[0].projectContext.latestReported.route.project.primary.name, f.projects.A.name);
  const detail = readTask({ root: f.root, taskId: f.taskId, project: f.key('A') });
  assert.equal(detail.total, 8); assert.equal(detail.turns.find(t => t.turnId === 'two').projectRelation.kind, 'other');
  assert.equal(detail.turns.find(t => t.turnId === 'one').projectRelation.kind, 'primary');
  const switched = detail.turns.find(t => t.turnId === 'four');
  assert.equal(switched.projectHistory.switched, true); assert.deepEqual(switched.projectHistory.sequence.map(p => p.key), [f.key('A'), f.key('B')]);
  assert.equal(switched.route.project.primary.name, f.projects.B.name);
  assert.equal(readTask({ root: f.root, taskId: f.taskId, turnId: 'one', project: f.key('C') }).turn.projectRelation.kind, 'reference');
  assert.equal(detail.turns.find(t => t.turnId === 'eight').projectRelation.kind, 'excluded');
});
test('reference-only chats and later reference reports do not affect project membership, counts or default positioning', t => {
  const f = taskProjectFixture(t), otherId = 'b'.repeat(64);
  f.save('four', 4, [f.route('A', ['C']), f.route('B', ['A', 'C'])]);
  f.save('later-reference', 10, [f.route('B', ['A'])]);
  f.save('reference-only-chat', 9, [f.route('B', ['A'])], { id: otherId });
  const catalog = listTaskProjects({ root: f.root }), a = catalog.projects.find(p => p.key === f.key('A'));
  assert.equal(a.chatCount, 1); assert.equal(a.turnCount, 3); assert.equal(a.primaryTurnCount, 3); assert.equal(a.referenceTurnCount, 1);
  const list = listTasks({ root: f.root, project: f.key('A'), projectMatch: 'history', limit: 1 });
  assert.equal(list.total, 1); assert.equal(list.records[0].taskId, f.taskId);
  const context = list.records[0].projectContext;
  assert.equal(context.latestTurnId, 'four'); assert.equal(context.latestReported.eventId, 'four-0');
  assert.equal(context.latestReported.route.project.primary.name, f.projects.A.name);
  const other = readTask({ root: f.root, taskId: otherId, project: f.key('A') });
  assert.equal(other.projectContext.turnCount, 0); assert.equal(other.projectContext.latestTurnId, null); assert.equal(other.projectContext.latestReported, null);
  const detail = readTask({ root: f.root, taskId: f.taskId, project: f.key('A') });
  assert.equal(detail.turns.find(t => t.turnId === 'later-reference').projectRelation.kind, 'reference');
  assert.equal(readTask({ root: f.root, taskId: f.taskId, turnId: 'later-reference' }).turn.routes[0].snapshot.references[0].name, f.projects.A.name);
});
test('history search filters before paging; queries preserve originals and tolerate a damaged round explicitly', t => {
  const f = taskProjectFixture(t), id = 'b'.repeat(64);
  f.save('second-chat', 9, [f.route('A', [], '其他聊天')], { id });
  const list = listTasks({ root: f.root, projectMatch: 'history', project: f.key('A'), q: '历史专属词', limit: 1 });
  assert.equal(list.total, 1); assert.equal(list.records[0].taskId, f.taskId); assert.equal(list.nextOffset, null);
  const path = join(f.root, turnPath(f.taskId, 'one')), before = readFileSync(path);
  listTaskProjects({ root: f.root }); readTask({ root: f.root, taskId: f.taskId, project: f.key('A') }); assert.deepEqual(readFileSync(path), before);
  writeFileSync(join(f.root, turnPath(f.taskId, 'two')), '{"protocol":"future"}');
  const partial = listTaskProjects({ root: f.root }); assert.equal(partial.errors.length, 1);
  assert.equal(partial.projects.find(p => p.key === f.key('B')).turnCount, 1);
  assert.equal(readTask({ root: f.root, taskId: f.taskId }).errors[0].turnId, 'two');
  assert.throws(() => listTasks({ root: f.root, projectMatch: 'guess' }), { code: 'INVALID_ARGUMENTS' });
});
test('CLI history mode uses the shared projection without changing the latest-query default', async t => {
  const f = taskProjectFixture(t);
  const result = await runTaskCommand(['list', '--project', f.key('A'), '--project-match', 'history', '--json'], f.root);
  assert.equal(result.exitCode, 0);
  assert.equal(JSON.parse(result.stdout).data.records[0].projectContext.turnCount, 3);
  assert.equal(JSON.parse((await runTaskCommand(['list', '--project', f.key('A'), '--json'], f.root)).stdout).data.total, 0);
});
