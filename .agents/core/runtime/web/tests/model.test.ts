import { test } from 'node:test';
import assert from 'node:assert/strict';
import { date, defaultTurn, routeChanges, safeLink, timeline } from '../src/model.ts';
import type { Ability, Route, Task } from '../src/types.ts';
const ability: Ability = { id: 'partner.example.method', ref: 'partner.example.method@1.0.0', name: '实施搭档', version: '1.0.0', source: 'user', path: '能力/搭档/实施/partner.md', definitionDigest: 'a'.repeat(64), stage: 'selected', fixed: false };
const route: Route = { summary: '真实任务', status: 'working', project: { state: 'none' }, references: [], abilities: [ability] };
test('timestamps retain local formatting, full precision and invalid fallbacks when reused across records', () => {
  for (const full of [false, true]) {
    const expected = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(full ? { year: 'numeric', second: '2-digit' } : {}), hour12: false });
    for (const value of ['2026-10-25T18:21:32+08:00', '2026-10-24T23:59:01Z', '2026-10-25T18:22:45+08:00']) assert.equal(date(value, full), expected.format(new Date(value)));
  }
  for (const value of [undefined, null, '', 'invalid']) assert.equal(date(value), '暂无上报');
});
test('default is explicitly the last reported native turn, never an inferred latest-turn route', () => {
  const task = { lastTurn: { turnId: 'new' }, latestReported: { turnId: 'reported' } } as Task;
  assert.equal(defaultTurn(task), 'reported');
  assert.equal(defaultTurn({ ...task, latestReported: null }), 'new');
});
test('route deltas expose project, references, stages and exact source changes; state-only reports stay secondary', () => {
  assert.deepEqual(routeChanges(null, route), ['首次上报路由']);
  assert.deepEqual(routeChanges(route, { ...route, status: 'completed' }), []);
  assert.deepEqual(routeChanges(route, { ...route, abilities: [{ ...ability, stage: 'adopted' }] }), ['实施搭档：已选择 → 已采用']);
  assert.deepEqual(routeChanges(route, { ...route, abilities: [{ ...ability, definitionDigest: 'b'.repeat(64) }] }), ['实施搭档：来源或定义调整']);
  assert.deepEqual(routeChanges(route, { ...route, abilities: [] }), ['移出：实施搭档']);
  const bound = { ...route, project: { state: 'bound', primary: { name: '交付项目', scope: 'current', path: '项目/交付项目/project.md' } } } as Route;
  assert.deepEqual(routeChanges(route, bound), ['主归属：无归属 → 交付项目']);
  assert.deepEqual(routeChanges(bound, { ...bound, project: { ...bound.project, primary: { ...bound.project.primary!, freshness: 'changed' } } }), []);
  assert.equal(timeline([{ eventId: 'one', roundId: 'r', at: '2026-01-01', reason: '明确说明', snapshot: route }, { eventId: 'two', roundId: 'r', at: '2026-01-02', reason: '完成', snapshot: { ...route, status: 'completed' } }])[1].changes.length, 0);
});
test('safe links reject script, file, data, local references and protocol-relative URLs', () => {
  for (const link of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', '/USER.md', '//evil.example/x', 'java\nscript:alert(1)', 'https://a.example/\t']) assert.equal(safeLink(link), undefined, link);
  assert.equal(safeLink('https://example.com/docs?q=1'), 'https://example.com/docs?q=1');
  assert.equal(safeLink('http://127.0.0.1:4173/'), 'http://127.0.0.1:4173/');
});
