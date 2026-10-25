import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangementChanges, eventTime, routeEvolution, routeSignature } from '../src/route-evolution.ts';
import type { Ability, Project, Route, RouteEvent } from '../src/types.ts';
const project = (name: string): Project => ({ name, scope: 'current', path: `项目/${name}/project.md` });
const ability: Ability = { id: 'partner.test.method', ref: 'partner.test.method@1.0.0', name: '实施搭档', version: '1.0.0', source: 'user', path: '能力/搭档/实施/partner.md', definitionDigest: 'a'.repeat(64), stage: 'selected', fixed: false };
const route: Route = { summary: '安排任务', status: 'working', project: { state: 'bound', primary: project('A') }, references: [project('C')], abilities: [ability] };
const event = (id: string, snapshot: Route): RouteEvent => ({ eventId: id, roundId: 'native-round', at: `2026-10-24T10:00:0${id.length}Z`, reason: `当时说明 ${id}`, snapshot });
test('first arrangement plus completion, repeated snapshots and wording changes produce one node without altering originals', () => {
  const events = [event('a', route), event('bb', { ...route, status: 'completed', summary: '只改了任务简述' }), { ...event('ccc', route), reason: '只改说明' }];
  const original = structuredClone(events), nodes = routeEvolution(events);
  assert.equal(nodes.length, 1); assert.equal(nodes[0].event, events[0]);
  assert.deepEqual(events, original); assert.deepEqual(routeEvolution([]), []);
  assert.equal(routeSignature(events[0].snapshot), routeSignature(events[1].snapshot));
});
test('selected, read, adopted and skipped stages follow only explicit native event order', () => {
  const read = { ...route, abilities: [{ ...ability, stage: 'read' }] }, adopted = { ...route, abilities: [{ ...ability, stage: 'adopted' }] };
  const events = [event('selected', route), event('read', read), event('adopted', adopted)];
  events[1].at = '2026-01-01T00:00:00Z'; // Timestamps do not reorder archive evidence.
  assert.deepEqual(routeEvolution(events).map(n => n.title), ['首次确认', '读取能力', '采用能力']);
  const skipped = routeEvolution([events[0], events[2]]);
  assert.equal(skipped.length, 2); assert.equal(skipped[1].title, '采用能力');
  const change = skipped[1].changes[0];
  assert.equal(change.kind, 'ability-updated');
  if (change.kind === 'ability-updated') { assert.equal(change.before.stage, 'selected'); assert.equal(change.after.stage, 'adopted'); }
});
test('A to B to A and simultaneous project/ability changes remain distinct events', () => {
  const middle = { ...route, project: { state: 'bound', primary: project('B') }, references: [], abilities: [{ ...ability, stage: 'adopted' }] };
  const events = [event('A', route), event('B', middle), event('Aagain', route)], nodes = routeEvolution(events);
  assert.equal(nodes.length, 3); assert.equal(nodes[1].title, '调整归属与能力');
  assert.equal(nodes[1].changes.length, 3); assert.equal(nodes[2].previous, events[1]);
});
test('removed then re-adopted capabilities do not disappear from earlier nodes', () => {
  const adopted = { ...route, abilities: [{ ...ability, stage: 'adopted' }] }, empty = { ...route, abilities: [] };
  const nodes = routeEvolution([event('first', adopted), event('removed', empty), event('again', adopted)]);
  assert.deepEqual(nodes.map(n => n.title), ['首次确认', '移出能力', '采用能力']);
  assert.equal(nodes[0].event.snapshot.abilities[0].stage, 'adopted');
});
test('ordering, fixed entries and live source decorations create neither nodes nor update signatures', () => {
  const other = { ...ability, id: 'competency.test.other', name: '同名能力', path: '能力/基本功/其他/competency.md' };
  const a = { ...route, references: [project('C'), project('D')], abilities: [ability, other] };
  const b: Route = { ...a, project: { ...a.project, primary: { ...a.project.primary!, freshness: 'changed' } }, references: [...a.references].reverse(), abilities: [{ ...other, effectiveChanged: true, freshness: 'unavailable' }, { ...ability, freshness: 'changed' }, { ...ability, id: 'workflow.ksf.entry', fixed: true }] };
  assert.deepEqual(arrangementChanges(a, b), []); assert.equal(routeSignature(a), routeSignature(b));
  assert.equal(routeEvolution([event('one', a), event('two', b)]).length, 1);
});
test('exact definitions, sources, paths and personal revisions are real changes, even under the same name', () => {
  for (const fields of [{ version: '2.0.0', ref: 'partner.test.method@2.0.0' }, { source: 'source:team' }, { path: '能力/搭档/新位置/partner.md' }, { definitionDigest: 'b'.repeat(64) }, { userRevision: 2 }]) {
    const next = { ...route, abilities: [{ ...ability, ...fields }] }, nodes = routeEvolution([event('old', route), event('new', next)]);
    assert.equal(nodes.length, 2); assert.equal(nodes[1].title, '调整能力定义');
    assert.notEqual(routeSignature(route), routeSignature(next));
    assert.equal(nodes[1].previous?.reason, '当时说明 old'); assert.equal(nodes[1].event.reason, '当时说明 new');
  }
  assert.equal(arrangementChanges(route, { ...route, project: { state: 'bound', primary: { ...project('A'), path: '项目/移动后/project.md' } } })[0].kind, 'target-updated');
});
test('same names with different IDs, no-project and unresolved assignments remain explicit', () => {
  const next = { ...route, project: { state: 'none' }, abilities: [ability, { ...ability, id: 'competency.test.different' }] };
  assert.equal(arrangementChanges(route, next).length, 2);
  const nodes = routeEvolution([event('none', next), event('unknown', { ...next, project: { state: 'unresolved' } })]);
  assert.equal(nodes[0].event.snapshot.project.state, 'none'); assert.equal(nodes[1].changes[0].kind, 'ownership');
});
test('unusable timestamps retain evidence order and render an explicit unavailable time', () => {
  for (const time of ['not-a-time', '', undefined]) {
    assert.equal(eventTime(time), '时间不可用');
    assert.equal(eventTime(time, true), '时间不可用');
  }
  assert.match(eventTime('2026-10-24T10:00:00Z'), /^\d{2}:\d{2}:\d{2}$/);
  const events = [event('first', route), { ...event('invalid', { ...route, project: { state: 'none' } }), at: 'invalid' }, event('last', route)];
  assert.deepEqual(routeEvolution(events).map(n => n.event.eventId), ['first', 'invalid', 'last']);
  assert.equal(routeEvolution(events)[1].event.at, 'invalid');
});

test('legacy and unified project reports are equivalent; project to knowledge to project retains exact evidence', () => {
  const unified: Route = { ...route, ownership: { state: 'bound', target: { kind: 'project', ...project('A') } }, relatedTargets: [{ kind: 'project', ...project('C') }] };
  assert.equal(routeSignature(route), routeSignature(unified));
  const knowledge: Route = { ...unified, ownership: { state: 'bound', target: { kind: 'knowledge', name: 'A', path: '知识/A/entry.md' } }, relatedTargets: [{ kind: 'project', ...project('A') }] };
  const events = [event('project', unified), event('knowledge', knowledge), event('project-again', unified)];
  const originals = structuredClone(events), nodes = routeEvolution(events);
  assert.equal(nodes.length, 3); assert.equal(nodes[1].title, '调整主归属');
  assert.equal(nodes[1].event.snapshot.ownership?.target?.kind, 'knowledge');
  assert.equal(nodes[1].previous, events[0]); assert.deepEqual(events, originals);
  const decorated = { ...knowledge, ownership: { ...knowledge.ownership!, target: { ...knowledge.ownership!.target!, freshness: 'unavailable' } } };
  assert.equal(routeSignature(knowledge), routeSignature(decorated));
  assert.equal(routeEvolution([events[1], event('decoration', decorated)]).length, 1);
  const moved = { ...knowledge, ownership: { state: 'bound', target: { kind: 'knowledge' as const, name: 'A', path: '知识/A/another-entry.md' } } };
  assert.notEqual(routeSignature(knowledge), routeSignature(moved));
});

test('planned to bound is one stable target with an establishment node, never a primary switch', () => {
  const targetId = 'a'.repeat(64), planned = { kind: 'ability' as const, name: '新能力', lifecycle: 'planned' as const, targetId, targetVersion: 1 };
  const bound = { kind: 'ability' as const, name: '业务分析', lifecycle: 'existing' as const, targetId, targetVersion: 2, id: 'partner.test.analysis', ref: 'partner.test.analysis@0.1.0', version: '0.1.0', source: 'user', path: '能力/搭档/业务分析/partner.md', definitionDigest: 'a'.repeat(64) };
  const a = { ...route, ownership: { state: 'bound', target: planned }, relatedTargets: [], abilities: [] }, b = { ...a, ownership: { state: 'bound', target: bound } };
  const nodes = routeEvolution([event('planned', a), event('bound', b)]);
  assert.equal(nodes[1].title, '目标已建立'); assert.equal(nodes[1].changes[0].kind, 'target-updated');
  assert.deepEqual(arrangementChanges(a, { ...a, ownership: { state: 'bound', target: { ...planned, currentBinding: bound } } }), []);
  const updated = { ...b, ownership: { state: 'bound', target: { ...bound, ref: 'partner.test.analysis@0.2.0', version: '0.2.0', definitionDigest: 'b'.repeat(64) } } };
  assert.equal(routeEvolution([event('one', b), event('two', updated)])[1].changes[0].kind, 'target-updated');
  assert.equal(routeEvolution([event('ability', b), event('archive', { ...b, ownership: { state: 'bound', target: { kind: 'archive', name: '合同', path: '档案/企业/合同.pdf' } } })])[1].changes[0].kind, 'ownership');
  assert.deepEqual(routeEvolution([event('related-planned', { ...route, relatedTargets: [planned] }), event('related-bound', { ...route, relatedTargets: [bound] })])[1].changes.map(c => c.kind), ['related-updated']);
});
