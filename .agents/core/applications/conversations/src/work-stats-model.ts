import type { WorkActivity, WorkMetric, WorkPeriod, WorkStats, WorkTarget } from './types';
export const workMetrics: { id: WorkMetric; label: string }[] = [{ id: 'tasks', label: '任务' }, { id: 'turns', label: '对话轮次' }, { id: 'projects', label: '项目' }, { id: 'knowledge', label: '知识' }, { id: 'abilities', label: '能力' }];
export const workPeriodLabels = { today: '今日', week: '本周' };
export const workPageSize = 30;
export function workRows(data: WorkStats, period: WorkPeriod, target?: string) {
  const range = data[period];
  return data.activity.filter(row => row.startedAt >= range.startAt && row.startedAt < range.endAt && (!target || row.primaryTargets.some(t => t.key === target)));
}
export function workTasks(rows: WorkActivity[]) {
  const tasks = new Map<string, { id: string; title: string; turns: number; latest: WorkActivity }>();
  for (const row of rows) {
    const item = tasks.get(row.taskId) ?? { id: row.taskId, title: row.taskTitle, turns: 0, latest: row }; item.turns++;
    if (row.startedAt > item.latest.startedAt) item.latest = row;
    tasks.set(row.taskId, item);
  }
  return [...tasks.values()].sort((a, b) => b.latest.startedAt.localeCompare(a.latest.startedAt) || a.id.localeCompare(b.id));
}
export function workTargets(rows: WorkActivity[], metric: WorkMetric) {
  const kind = { projects: 'project', knowledge: 'knowledge', abilities: 'ability' }[metric as 'projects' | 'knowledge' | 'abilities'];
  const targets = new Map<string, { target: WorkTarget; tasks: Set<string>; turns: Set<string>; at: string }>();
  for (const row of rows) for (const target of row.primaryTargets) {
    if (target.kind !== kind) continue;
    const item = targets.get(target.key) ?? { target, tasks: new Set<string>(), turns: new Set<string>(), at: row.startedAt };
    if (row.startedAt > item.at) { item.at = row.startedAt; item.target = target; }
    item.tasks.add(row.taskId); item.turns.add(`${row.taskId}:${row.turnId}`); targets.set(target.key, item);
  }
  return [...targets.values()].sort((a, b) => b.at.localeCompare(a.at) || a.target.label.localeCompare(b.target.label));
}
export function workSearch(row: WorkActivity, target?: string) {
  return new URLSearchParams({ task: row.taskId, turn: row.turnId, target: target ?? row.navigationTarget }).toString();
}
export function workDateRange(data: WorkStats, period: WorkPeriod) {
  const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return period === 'today' ? short(data.today.startDate) : `${short(data.week.startDate)}–${short(data.week.endDate)}`;
}
export function nextWorkMidnight(at = new Date()) {
  const next = new Date(at); next.setHours(24, 0, 0, 0); return Math.max(1, next.getTime() - at.getTime());
}
