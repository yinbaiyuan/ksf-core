

import { ownershipOf, relatedOf, ownershipIdentity, targetIdentity, targetKey, targetDetails } from './view-targets.js';









const eventClock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export function eventTime(at                    , full = false) {
  const time = new Date(at ?? '');
  if (!Number.isFinite(time.getTime())) return '时间不可用';
  return full ? time.toLocaleString('zh-CN') : eventClock.format(time);
}

export const projectIdentity = (p         ) => JSON.stringify([p.scope, p.name, p.path]);
export const definitionIdentity = (a         ) => JSON.stringify([a.ref, a.source, a.version, a.userRevision ?? null, a.path, a.definitionDigest]);
const professionals = (route       ) => route.abilities.filter(a => !a.fixed);

/** Canonical arrangement only. Transport, display labels and query decorations do not create history. */
export function routeSignature(route       ) {
  return JSON.stringify([
    ownershipIdentity(ownershipOf(route)),
    [...new Set(relatedOf(route).map(targetIdentity))].sort(),
    professionals(route).map(a => JSON.stringify([a.id, a.stage, definitionIdentity(a)])).sort(),
  ]);
}

export function arrangementChanges(before       , after       )                {
  const result                = [];
  const a = ownershipOf(before), b = ownershipOf(after);
  if (a.state !== b.state || (a.target ? targetKey(a.target) : null) !== (b.target ? targetKey(b.target) : null)) result.push({ kind: 'ownership', before: a, after: b });
  else if (a.target && b.target && targetDetails(a.target) !== targetDetails(b.target)) result.push({ kind: 'target-updated', before: a.target, after: b.target, binding: a.target.lifecycle === 'planned' && b.target.lifecycle !== 'planned' });
  const oldRefs = new Map(relatedOf(before).map(p => [targetKey(p), p])), newRefs = new Map(relatedOf(after).map(p => [targetKey(p), p]));
  for (const [key, p] of oldRefs) if (!newRefs.has(key)) result.push({ kind: 'related', action: 'removed', target: p });
  for (const [key, p] of newRefs) {
    const previous = oldRefs.get(key);
    if (!previous) result.push({ kind: 'related', action: 'added', target: p });
    else if (targetDetails(previous) !== targetDetails(p)) result.push({ kind: 'related-updated', before: previous, after: p, binding: previous.lifecycle === 'planned' && p.lifecycle !== 'planned' });
  }
  const old = new Map(professionals(before).map(a => [a.id, a])), current = new Map(professionals(after).map(a => [a.id, a]));
  for (const [id, a] of current) {
    const previous = old.get(id);
    if (!previous) result.push({ kind: 'ability-added', ability: a });
    else {
      const stageChanged = previous.stage !== a.stage, definitionChanged = definitionIdentity(previous) !== definitionIdentity(a);
      if (stageChanged || definitionChanged) result.push({ kind: 'ability-updated', before: previous, after: a, stageChanged, definitionChanged });
    }
  }
  for (const [id, a] of old) if (!current.has(id)) result.push({ kind: 'ability-removed', ability: a });
  return result;
}

function changeTitle(changes               ) {
  const projects = changes.some(c => ['ownership', 'related', 'target-updated', 'related-updated'].includes(c.kind));
  const abilities = changes.some(c => c.kind.startsWith('ability-'));
  if (changes.every(c => (c.kind === 'target-updated' || c.kind === 'related-updated') && c.binding)) return '目标已建立';
  if (changes.every(c => c.kind === 'target-updated' || c.kind === 'related-updated')) return '更新目标信息';
  if (projects && abilities) return '调整归属与能力';
  if (changes.some(c => c.kind === 'ownership')) return '调整主归属';
  if (projects) return '调整关联对象';
  if (changes.every(c => c.kind === 'ability-removed')) return '移出能力';
  if (changes.every(c => c.kind === 'ability-updated' && c.definitionChanged && !c.stageChanged)) return '调整能力定义';
  const stages = changes.map(c => c.kind === 'ability-added' ? c.ability.stage : c.kind === 'ability-updated' && c.stageChanged && !c.definitionChanged ? c.after.stage : null);
  if (stages.every(stage => stage === 'selected')) return '选择能力';
  if (stages.every(stage => stage === 'read')) return '读取能力';
  if (stages.every(stage => stage === 'adopted')) return '采用能力';
  return '调整能力安排';
}

export function routeEvolution(events              )                  {
  const result                  = [];
  for (const event of events) {
    const previous = result.at(-1)?.event;
    if (!previous) result.push({ event, changes: [], title: '首次确认' });
    else {
      const changes = arrangementChanges(previous.snapshot, event.snapshot);
      if (changes.length) result.push({ event, previous, changes, title: changeTitle(changes) });
    }
  }
  return result;
}
