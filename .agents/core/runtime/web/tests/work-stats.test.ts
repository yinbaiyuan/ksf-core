import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workRows, workTargets, workTasks, workSearch, workDateRange, workPageSize, nextWorkMidnight } from '../src/work-stats-model.ts';
import { defaultLayout, parseDesktop, withGroupLayout, defaultDesktop, currentGroup } from '../src/desktop-model.ts';
import type { WorkActivity, WorkStats } from '../src/types.ts';
const row = (taskId: string, turnId: string, startedAt: string, keys = ['one']): WorkActivity => ({ taskId, turnId, startedAt, taskTitle: `聊天${taskId}`, title: `轮次${turnId}`, navigationTarget: 'current:默认', primaryTargets: keys.map(key => ({ key, kind: 'project', label: '同名项目', lifecycle: 'existing' })) });
function data(): WorkStats {
  const counts = { tasks: 2, turns: 3, projects: 2, knowledge: 0, abilities: 0 };
  return { generatedAt: '2026-10-28T12:00:00Z', timeZone: 'Asia/Shanghai', today: { startAt: '2026-10-27T16:00:00Z', endAt: '2026-10-28T16:00:00Z', startDate: '2026-10-28', endDate: '2026-10-28', counts }, week: { startAt: '2026-10-25T16:00:00Z', endAt: '2026-11-01T16:00:00Z', startDate: '2026-10-26', endDate: '2026-11-01', counts },
    activity: [row('a', 'old', '2026-10-26T01:00:00Z'), row('a', 'first', '2026-10-28T01:00:00Z', ['one', 'two']), row('b', 'same-native-id', '2026-10-28T02:00:00Z'), row('a', 'same-native-id', '2026-10-28T03:00:00Z')], capture: { enabled: true, activatedAt: null }, errors: [] };
}
test('detail tasks and distinct targets match period rows and never merge same names or cross-chat turn IDs', () => {
  const rows = workRows(data(), 'today'); assert.equal(rows.length, 3); assert.equal(workRows(data(), 'week').length, 4);
  const tasks = workTasks(rows); assert.equal(tasks.length, 2); assert.equal(tasks[0].latest.turnId, 'same-native-id'); assert.equal(tasks[0].turns, 2);
  const targets = workTargets(rows, 'projects'); assert.equal(targets.length, 2); assert.equal(targets.find(item => item.target.key === 'one')?.turns.size, 3);
  assert.equal(workTasks(workRows(data(), 'today', 'two'))[0].latest.turnId, 'first'); assert.equal(workRows(data(), 'today', 'missing').length, 0);
});
test('navigation uses the matching period turn and requested target, with correct date and page labels', () => {
  const activity = workRows(data(), 'today', 'two')[0], search = new URLSearchParams(workSearch(activity, 'two'));
  assert.equal(search.get('turn'), 'first'); assert.equal(search.get('task'), 'a'); assert.equal(search.get('target'), 'two');
  assert.equal(new URLSearchParams(workSearch(activity)).get('target'), 'current:默认');
  assert.equal(workDateRange(data(), 'today'), '10/28'); assert.equal(workDateRange(data(), 'week'), '10/26–11/1'); assert.equal(workPageSize, 30);
  assert.equal(nextWorkMidnight(new Date(2026, 9, 28, 23, 59, 59)), 1000);
});
test('formal stats survives retirement of test cards and deliberate removal stays empty', () => {
  const original = defaultLayout(); assert.equal(original.length, 1); assert.equal(original[0].i, 'work-stats');
  const stats = { ...original[0], x: 3, y: 5 }, retired = ['continue', 'recent', 'ownership'].map((i, x) => ({ i, x: x * 2, y: 0, w: 2, h: 2 }));
  const saved = withGroupLayout(defaultDesktop(), [...retired, stats]);
  assert.deepEqual(currentGroup(parseDesktop(saved, original)).layout, [stats]);
  const removed = withGroupLayout(saved, []); assert.deepEqual(currentGroup(parseDesktop(removed, original)).layout, []);
});
