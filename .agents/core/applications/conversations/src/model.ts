import type { Ability, Route, RouteEvent, Task } from './types.ts';
import { ownershipOf, relatedOf, ownershipIdentity, ownershipLabel, targetIdentity } from './targets.ts';
export const stageNames: Record<string, string> = { selected: '已选择', read: '已读取', adopted: '已采用' };
export const typeNames: Record<string, string> = { cooperation: '协同', partner: '搭档', competency: '基本功', 'data-package': '数据包' };
export const captureNames: Record<string, string> = { completed: '已归档', interrupted: '已中断', pending: '待补采', partial: '部分缺失', excluded: '明确排除' };
export const agentNames: Record<string, string> = { preparing: '准备中', working: '处理中', waiting: '等待中', completed: '已完成', paused: '已暂停', failed: '失败' };
export const sourceName = (source: string) => source === 'system' ? '系统' : source === 'user' ? '个人' : `能力源 · ${source.replace(/^source:/, '')}`;
export const projectName = (route?: Route | null) => route ? ownershipLabel(ownershipOf(route)) : '未上报归属';
// Historical snapshots retain their original IDs; only their display group changes.
export const abilityType = (ability: Ability) => { const type = ability.id.split('.')[0]; return type === 'workflow' ? 'cooperation' : type; };
export const changed = (item: { freshness?: string; effectiveChanged?: boolean }) => ['changed', 'unavailable'].includes(item.freshness ?? '') || item.effectiveChanged;
export function defaultTurn(task: Task) { return task.latestReported?.turnId ?? task.lastTurn.turnId; }
export function safeLink(input: unknown): string | undefined {
  if (typeof input !== 'string' || /[\u0000-\u0020\u007f]/.test(input)) return undefined;
  try { const url = new URL(input); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export function routeChanges(previous: Route | null, next: Route): string[] {
  if (!previous) return ['首次上报路由'];
  const result: string[] = [];
  if (ownershipIdentity(ownershipOf(previous)) !== ownershipIdentity(ownershipOf(next))) result.push(`主归属：${projectName(previous)} → ${projectName(next)}`);
  const refKey = (r: Route) => relatedOf(r).map(targetIdentity).sort().join('|');
  if (refKey(previous) !== refKey(next)) result.push('关联对象调整');
  const beforeAbilities = previous.abilities.filter(a => !a.fixed);
  const nextAbilities = next.abilities.filter(a => !a.fixed);
  const old = new Map(beforeAbilities.map(a => [a.id, a]));
  const current = new Map(nextAbilities.map(a => [a.id, a]));
  for (const a of nextAbilities) {
    const before = old.get(a.id);
    if (!before) result.push(`新增${stageNames[a.stage] ?? a.stage}：${a.name}`);
    else {
      if (before.stage !== a.stage) result.push(`${a.name}：${stageNames[before.stage]} → ${stageNames[a.stage]}`);
      if (before.source !== a.source || before.path !== a.path || before.definitionDigest !== a.definitionDigest || before.ref !== a.ref) result.push(`${a.name}：来源或定义调整`);
    }
  }
  for (const a of beforeAbilities) if (!current.has(a.id)) result.push(`移出：${a.name}`);
  return result;
}
export function timeline(events: RouteEvent[]) { return events.map((event, i) => ({ event, changes: routeChanges(events[i - 1]?.snapshot ?? null, event.snapshot) })); }
// A list renders many timestamps. Reuse formatters, never formatted values, so
// incoming timestamps still update and short/full forms retain the local time zone.
const dateFormats = new Map<boolean, Intl.DateTimeFormat>();
export const date = (value?: string | null, full = false) => {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return '暂无上报';
  let formatter = dateFormats.get(full);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(full ? { year: 'numeric', second: '2-digit' } : {}), hour12: false });
    dateFormats.set(full, formatter);
  }
  return formatter.format(timestamp);
};
