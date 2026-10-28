import type { Ownership, Route, Target } from './types.ts';
/** Normalize old archives in memory only. Exact target identity never depends on its label. */
export function ownershipOf(route: Route): Ownership {
  return route.ownership ?? (route.project.state === 'bound' && route.project.primary
    ? { state: 'bound', target: { kind: 'project', ...route.project.primary } } : { state: route.project.state });
}
export function relatedOf(route: Route): Target[] { return route.relatedTargets ?? route.references.map(p => ({ kind: 'project', ...p })); }
export const targetTypeNames = { project: '项目', knowledge: '知识单元', ability: '能力目标', archive: '档案' };
export function targetKey(target: Target) { return target.targetId ? `target:${target.targetId}` : target.kind === 'project' ? `${target.scope}:${target.name}` : target.kind === 'ability' ? `ability:${target.source}:${target.id}` : `${target.kind}:${target.path}`; }
export function targetLabel(target: Target) { return `${target.name}${target.kind === 'project' && target.scope === 'archived' ? '（已归档）' : ''}`; }
export function ownershipLabel(ownership: Ownership) { return ownership.target ? targetLabel(ownership.target) : ownership.state === 'none' ? '无归属' : '待确定'; }
export function ownershipKey(route: Route) { const o = ownershipOf(route); return o.target ? targetKey(o.target) : `state:${o.state}`; }
export const targetDetails = (t: Target) => JSON.stringify([t.lifecycle ?? 'existing', t.path ?? null, t.scope ?? null, t.ref ?? null, t.version ?? null, t.definitionDigest ?? null, t.userRevision ?? null, t.entryType ?? null]);
export const targetIdentity = (target: Target) => JSON.stringify([targetKey(target), targetDetails(target)]);
export const ownershipIdentity = (ownership: Ownership) => JSON.stringify([ownership.state, ownership.target ? targetIdentity(ownership.target) : null]);
