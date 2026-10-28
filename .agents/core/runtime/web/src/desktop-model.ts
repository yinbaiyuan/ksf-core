export const LEGACY_DESKTOP_KEY = 'ksf.workbench.desktop.v1';
export const PREVIOUS_DESKTOP_KEY = 'ksf.workbench.desktop.v2';
export const DESKTOP_KEY = 'ksf.workbench.desktop.v3';
export const SQUARE_GRID = { version: 'square-v1', cell: 96, gap: 24, maxCols: 12 } as const;
export interface Bounds { x: number; y: number; width: number; height: number }
export interface WidgetLayout { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number; appId?:string; cardId?:string; config?:unknown; name?:string }
export const groupIcons = ['home', 'grid', 'briefcase', 'book', 'star', 'code'] as const;
export type GroupIcon = typeof groupIcons[number];
export interface DesktopGroup { id: string; name: string; icon: GroupIcon; layout: WidgetLayout[] }
export interface DesktopPreferences { version: 3; grid: typeof SQUARE_GRID.version; groups: DesktopGroup[]; activeGroupId: string; bounds: Bounds }
export const defaultLayout = (): WidgetLayout[] => [
  { i: 'work-stats', appId:'conversations', cardId:'work-stats', config:{}, name:'工作统计', x: 0, y: 0, w: 4, h: 2, minW: 1, minH: 1 },
];
export function squareGridMetrics(available: number) {
  const cols = Math.max(1, Math.min(SQUARE_GRID.maxCols, Math.floor((available + SQUARE_GRID.gap) / (SQUARE_GRID.cell + SQUARE_GRID.gap))));
  const width = Math.max(1, available), cell = (width - (cols - 1) * SQUARE_GRID.gap) / cols;
  return { cols, cell, gap: SQUARE_GRID.gap, width };
}
const overlaps = (a: WidgetLayout, b: WidgetLayout) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function integralItem(item: WidgetLayout, cols: number): WidgetLayout {
  const minW=Math.min(cols,item.minW??1),minH=item.minH??1; const w = Math.max(minW, Math.min(cols, Math.round(item.w))), h = Math.max(minH, Math.min(12, Math.round(item.h)));
  return { ...item, w, h, x: Math.max(0, Math.round(item.x)), y: Math.max(0, Math.round(item.y)), minW, minH };
}
function firstFree(item: WidgetLayout, placed: WidgetLayout[], cols: number): WidgetLayout {
  const bottom = Math.max(item.y, ...placed.map(other => other.y + other.h));
  for (let y = item.y; y <= bottom; y++) for (let x = 0; x <= cols - item.w; x++) {
    const candidate = { ...item, x, y };
    if (!placed.some(other => overlaps(candidate, other))) return candidate;
  }
  return { ...item, x: 0, y: bottom };
}
// Project narrow viewports without changing the stored desktop or other groups.
export function fitWidgetLayout(layout: WidgetLayout[], cols: number): WidgetLayout[] {
  const placed: WidgetLayout[] = [];
  for (const source of [...layout].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let item = integralItem(source, cols);
    if (item.x + item.w > cols || placed.some(other => overlaps(item, other))) item = firstFree(item, placed, cols);
    placed.push(item);
  }
  return layout.map(source => placed.find(item => item.i === source.i)!);
}
export function appendWidget(layout: WidgetLayout[], item: WidgetLayout, cols: number) {
  const placed = fitWidgetLayout(layout, cols);
  return [...placed, firstFree(integralItem(item, cols), placed, cols)];
}
export function migrateSquareLayout(layout: WidgetLayout[]) {
  return fitWidgetLayout(layout.map(item => ({ ...item, x: Math.floor(item.x * 2 / 3), y: Math.floor(item.y / 2), w: Math.max(1, Math.round(item.w * 2 / 3)), h: Math.max(1, Math.ceil(item.h / 2)), minW: 1, minH: 1 })), SQUARE_GRID.maxCols);
}
export function fitBounds(bounds: Bounds, area: { width: number; height: number }, minimum = { width: 480, height: 420 }): Bounds {
  const width = Math.min(Math.max(minimum.width, bounds.width), area.width), height = Math.min(Math.max(minimum.height, bounds.height), area.height);
  return { width, height, x: Math.max(0, Math.min(bounds.x, area.width - width)), y: Math.max(0, Math.min(bounds.y, area.height - height)) };
}
export function tiledBounds(side: 'left' | 'right', area: { width: number; height: number }): Bounds {
  const width = (area.width - 12) / 2;
  return { x: side === 'left' ? 0 : width + 12, y: 0, width, height: area.height };
}
export function defaultDesktop(): DesktopPreferences { return { version: 3, grid: SQUARE_GRID.version, groups: [{ id: 'home', name: '主页', icon: 'home', layout: defaultLayout() }], activeGroupId: 'home', bounds: { x: 32, y: 24, width: 1180, height: 740 } }; }
export function currentGroup(value: DesktopPreferences) { return value.groups.find(group => group.id === value.activeGroupId) ?? value.groups[0]; }
export function withGroupLayout(value: DesktopPreferences, layout: WidgetLayout[]): DesktopPreferences {
  return { ...value, grid: SQUARE_GRID.version, groups: value.groups.map(group => group.id === value.activeGroupId ? { ...group, layout: fitWidgetLayout(layout, SQUARE_GRID.maxCols) } : group) };
}
export function groupNameError(name: string, groups: DesktopGroup[], id?: string) {
  const trimmed = name.trim();
  if (!trimmed || [...trimmed].length > 20) return '分组名称请输入 1–20 个字';
  if (groups.some(group => group.id !== id && group.name === trimmed)) return '已有同名分组，请换一个名称';
  return '';
}
export function moveGroup(value: DesktopPreferences, id: string, direction: -1 | 1): DesktopPreferences {
  const index = value.groups.findIndex(group => group.id === id), next = index + direction;
  if (index < 0 || next < 0 || next >= value.groups.length) return value;
  const groups = [...value.groups]; [groups[index], groups[next]] = [groups[next], groups[index]];
  return { ...value, groups };
}
export function removeGroup(value: DesktopPreferences, id: string): DesktopPreferences {
  const index = value.groups.findIndex(group => group.id === id);
  if (value.groups.length <= 1 || index < 0) return value;
  const groups = value.groups.filter(group => group.id !== id);
  return { ...value, groups, activeGroupId: value.activeGroupId === id ? groups[Math.max(0, index - 1)].id : value.activeGroupId };
}
export function sameLayout(a: WidgetLayout[], b: WidgetLayout[]) {
  return a.length === b.length && a.every(item => b.some(other => ['i', 'x', 'y', 'w', 'h'].every(key => item[key as keyof WidgetLayout] === other[key as keyof WidgetLayout]) && JSON.stringify(item.config)===JSON.stringify(other.config)));
}
// A normal drag changes positions only. Narrow viewport projections must not
// overwrite stored card sizes or positions of cards that did not move.
export function moveWidgetPositions(stored: WidgetLayout[], projected: readonly WidgetLayout[], moved: readonly WidgetLayout[]): WidgetLayout[] {
  return stored.map(item => {
    const before = projected.find(value => value.i === item.i), after = moved.find(value => value.i === item.i);
    return before && after && (before.x !== after.x || before.y !== after.y) ? { ...item, x: after.x, y: after.y } : item;
  });
}
function parseLayout(value: unknown, known: WidgetLayout[], fallback: WidgetLayout[]): WidgetLayout[] {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  return value.flatMap((item: any) => {
    if(!item||typeof item.i!=='string'||!item.i||item.i.length>200||seen.has(item.i)||!['x','y','w','h'].every(k=>Number.isFinite(item[k])))return [];
    if(item.i!=='work-stats'&&!known.some(value=>value.i===item.i)&&!(typeof item.appId==='string'&&typeof item.cardId==='string'))return [];
    const legacy=item.i==='work-stats'?{appId:'conversations',cardId:'work-stats',config:{},name:'工作统计'}:{};
    const base={...(known.find(x=>x.i===item.i)??{}),...legacy,...item};
    seen.add(item.i);
    const w = Math.max(base.minW ?? 1, Math.min(12, Math.round(item.w))), h = Math.max(base.minH ?? 1, Math.min(12, Math.round(item.h)));
    return [{ ...base, w, h, x: Math.max(0, Math.min(12 - w, Math.round(item.x))), y: Math.max(0, Math.min(60, Math.round(item.y))) }];
  });
}
export function parseDesktop(value: unknown, known: WidgetLayout[] = defaultLayout()): DesktopPreferences {
  const fallback = defaultDesktop();
  if (!value || typeof value !== 'object' || ![1, 2, 3].includes((value as any).version)) return fallback;
  const v = value as any;
  const readLayout = (layout: unknown, fallbackLayout: WidgetLayout[]) => {
    if (!Array.isArray(layout)) return fallbackLayout;
    const parsed = parseLayout(layout, known, fallbackLayout);
    return v.grid === SQUARE_GRID.version ? fitWidgetLayout(parsed, SQUARE_GRID.maxCols) : migrateSquareLayout(parsed);
  };
  if (v.bounds && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(v.bounds[k]))) fallback.bounds = fitBounds(v.bounds, { width: 7680, height: 4320 });
  if (v.version === 1) fallback.groups[0].layout = readLayout(v.layout, fallback.groups[0].layout);
  else if (Array.isArray(v.groups)) {
    const seen = new Set<string>();
    const groups: DesktopGroup[] = [];
    for (const group of v.groups) {
      if (!group || typeof group.id !== 'string' || !group.id.trim() || seen.has(group.id) || typeof group.name !== 'string' || groupNameError(group.name, groups)) continue;
      seen.add(group.id);
      groups.push({ id: group.id, name: group.name.trim(), icon: groupIcons.includes(group.icon) ? group.icon : 'grid', layout: readLayout(group.layout, []) });
    }
    if (groups.length) { fallback.groups = groups; fallback.activeGroupId = groups.some(group => group.id === v.activeGroupId) ? v.activeGroupId : groups[0].id; }
  }
  return fallback;
}
export function readDesktop(storage?: Pick<Storage, 'getItem'>, known?: WidgetLayout[]) {
  for (const key of [DESKTOP_KEY, PREVIOUS_DESKTOP_KEY, LEGACY_DESKTOP_KEY]) {
    try {
      const value = JSON.parse(storage?.getItem(key) ?? 'null');
      if (!value || value.version !== (key === DESKTOP_KEY ? 3 : key === PREVIOUS_DESKTOP_KEY ? 2 : 1)) continue;
      if ([2,3].includes(value.version) && (!Array.isArray(value.groups) || !value.groups.some((group: any) => group && typeof group.id === 'string' && group.id.trim() && typeof group.name === 'string' && !groupNameError(group.name, [])))) continue;
      return parseDesktop(value, known);
    } catch {}
  }
  return defaultDesktop();
}
export function saveDesktop(value: DesktopPreferences, storage?: Pick<Storage, 'setItem'>) { try { if (!storage) return false; storage.setItem(DESKTOP_KEY, JSON.stringify(value)); return true; } catch { return false; } }
export function patchSearch(source: string, changes: Record<string, string | null>) { const next = new URLSearchParams(source); for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); } return next.toString(); }
export function isDeepLink(search: string) { const p = new URLSearchParams(search); return ['app', 'target', 'project', 'task', 'turn', 'view'].some(key => p.has(key)); }

export function adjustWidgetLayout(layout: WidgetLayout[], id: string, dx: number, dy: number, resize = false, cols: number = SQUARE_GRID.maxCols): WidgetLayout[] {
  const next = fitWidgetLayout(layout, cols), item = next.find(w => w.i === id);
  if (!item) return next;
  if (resize) { item.w = Math.max(Math.min(cols,item.minW??1), Math.min(cols - item.x, Math.round(item.w + dx))); item.h = Math.max(item.minH??1, Math.min(12, Math.round(item.h + dy))); }
  else { item.x = Math.max(0, Math.min(cols - item.w, Math.round(item.x + dx))); item.y = Math.max(0, Math.round(item.y + dy)); }
  const intersects = (a: WidgetLayout, b: WidgetLayout) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const placed = [item];
  // Like pointer editing, an occupied cell pushes the following cards down.
  for (const other of next.filter(w => w !== item).sort((a,b) => a.y - b.y || a.x - b.x)) {
    let collisions = placed.filter(w => intersects(w, other));
    while (collisions.length) { other.y = Math.max(...collisions.map(w => w.y + w.h)); collisions = placed.filter(w => intersects(w, other)); }
    placed.push(other);
  }
  return next;
}
