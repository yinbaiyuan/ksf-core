import type { Task, TurnSummary } from './types.ts';
export const DISPLAY_KEY = 'ksf.workbench.display.v1';
export const POSITION_KEY = 'ksf.workbench.position.v1';
export interface Display { directory: number; rounds: number; focus: boolean }
export interface Position { target: string; task: string; turn: string; scroll: number }
export const defaultDisplay: Display = { directory: 264, rounds: 264, focus: false };
export function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), Math.max(min, max)); }
export function paneLimits(kind: 'directory' | 'rounds', viewport: number, other: number) { return { min: kind === 'directory' ? 216 : 220, max: Math.max(kind === 'directory' ? 216 : 220, Math.min(360, viewport - other - 496)) }; }
export function readDisplay(storage?: Pick<Storage, 'getItem'>): Display {
  try { const v = JSON.parse(storage?.getItem(DISPLAY_KEY) ?? 'null'); return { directory: clamp(Number(v?.directory) || 264, 216, 360), rounds: clamp(Number(v?.rounds) || 264, 220, 360), focus: v?.focus === true }; } catch { return { ...defaultDisplay }; }
}
export function readPosition(storage?: Pick<Storage, 'getItem'>): Position | null {
  try { const v = JSON.parse(storage?.getItem(POSITION_KEY) ?? 'null'); return v && typeof v.target === 'string' && v.target.length <= 4096 && /^[a-f0-9]{64}$/.test(v.task) && typeof v.turn === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(v.turn) && Number.isFinite(v.scroll) && v.scroll >= 0 ? v : null; } catch { return null; }
}
export function saveLocal(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Reading works without storage. */ } }
export function localDisplay() { try { return readDisplay(localStorage); } catch { return { ...defaultDisplay }; } }
export function localPosition() { try { return readPosition(localStorage); } catch { return null; } }
export function roundTitle(turn?: TurnSummary | null) { return turn?.route?.summary?.trim() || (turn?.policy === 'exclude' ? '本轮未记录' : turn?.preview?.trim()) || '等待采集与上报'; }
export function filterTurns(turns: TurnSummary[], query: string) { const q = query.trim().toLocaleLowerCase(); return q ? turns.filter(t => `${roundTitle(t)} ${t.turnNumber ?? ''} ${t.targetRelation?.label ?? ''}`.toLocaleLowerCase().includes(q)) : turns; }
export function titleMatches(task: Task, query: string) { return task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()); }
export function highlightParts(value: string, query: string) {
  if (!query) return [{ text: value, match: false }];
  const parts: { text: string; match: boolean }[] = [], lower = value.toLocaleLowerCase(), q = query.toLocaleLowerCase();
  let offset = 0, index = lower.indexOf(q);
  while (index >= 0) { if (index > offset) parts.push({ text: value.slice(offset, index), match: false }); parts.push({ text: value.slice(index, index + query.length), match: true }); offset = index + query.length; index = lower.indexOf(q, offset); }
  if (offset < value.length) parts.push({ text: value.slice(offset), match: false }); return parts;
}
