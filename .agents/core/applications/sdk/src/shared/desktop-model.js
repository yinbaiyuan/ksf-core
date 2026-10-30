import {migrateDesktopApplicationIds} from './application-identities.js';
export const LEGACY_DESKTOP_KEY = 'ksf.workbench.desktop.v1';
export const PREVIOUS_DESKTOP_KEY = 'ksf.workbench.desktop.v2';
export const DESKTOP_KEY = 'ksf.workbench.desktop.v3';
export const SQUARE_GRID = { version: 'square-v1', cell: 96, gap: 24, maxCols: 12 };
export const groupIcons = ['home', 'grid', 'briefcase', 'book', 'star', 'code'];
export const defaultLayout = () => [
    { i: 'work-stats', appId: 'com.ksf.conversations', cardId: 'work-stats', config: {}, name: '工作统计', x: 0, y: 0, w: 4, h: 2, minW: 1, minH: 1 },
];
export function squareGridMetrics(available) {
    const cols = Math.max(1, Math.min(SQUARE_GRID.maxCols, Math.floor((available + SQUARE_GRID.gap) / (SQUARE_GRID.cell + SQUARE_GRID.gap))));
    const width = Math.max(1, available), cell = (width - (cols - 1) * SQUARE_GRID.gap) / cols;
    return { cols, cell, gap: SQUARE_GRID.gap, width };
}
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function integralItem(item, cols) {
    if (item.kind === 'app') item = { ...item, w: 1, h: 1, minW: 1, minH: 1 };
    const minW = Math.min(cols, item.minW ?? 1), minH = item.minH ?? 1;
    const w = Math.max(minW, Math.min(cols, Math.round(item.w))), h = Math.max(minH, Math.min(12, Math.round(item.h)));
    return { ...item, w, h, x: Math.max(0, Math.round(item.x)), y: Math.max(0, Math.round(item.y)), minW, minH };
}
function firstFree(item, placed, cols) {
    const bottom = Math.max(item.y, ...placed.map(other => other.y + other.h));
    for (let y = item.y; y <= bottom; y++)
        for (let x = 0; x <= cols - item.w; x++) {
            const candidate = { ...item, x, y };
            if (!placed.some(other => overlaps(candidate, other)))
                return candidate;
        }
    return { ...item, x: 0, y: bottom };
}
// Project narrow viewports without changing the stored desktop or other groups.
export function fitWidgetLayout(layout, cols) {
    const placed = [];
    for (const source of [...layout].sort((a, b) => a.y - b.y || a.x - b.x)) {
        let item = integralItem(source, cols);
        if (item.x + item.w > cols || placed.some(other => overlaps(item, other)))
            item = firstFree(item, placed, cols);
        placed.push(item);
    }
    return layout.map(source => placed.find(item => item.i === source.i));
}
export function appendWidget(layout, item, cols) {
    if (item.kind === 'app' && layout.some(other => other.kind === 'app' && other.appId === item.appId)) return layout;
    const placed = fitWidgetLayout(layout, cols);
    return [...placed, firstFree(integralItem(item, cols), placed, cols)];
}
export function migrateSquareLayout(layout) {
    return fitWidgetLayout(layout.map(item => ({ ...item, x: Math.floor(item.x * 2 / 3), y: Math.floor(item.y / 2), w: Math.max(1, Math.round(item.w * 2 / 3)), h: Math.max(1, Math.ceil(item.h / 2)), minW: 1, minH: 1 })), SQUARE_GRID.maxCols);
}
export function fitBounds(bounds, area, minimum = { width: 480, height: 420 }) {
    const width = Math.min(Math.max(minimum.width, bounds.width), area.width), height = Math.min(Math.max(minimum.height, bounds.height), area.height);
    return { width, height, x: Math.max(0, Math.min(bounds.x, area.width - width)), y: Math.max(0, Math.min(bounds.y, area.height - height)) };
}
export function tiledBounds(side, area) {
    const width = (area.width - 12) / 2;
    return { x: side === 'left' ? 0 : width + 12, y: 0, width, height: area.height };
}
export function defaultDesktop() { return { version: 3, grid: SQUARE_GRID.version, groups: [{ id: 'home', name: '主页', icon: 'home', layout: defaultLayout() }], activeGroupId: 'home', bounds: { x: 32, y: 24, width: 1180, height: 740 } }; }
export function currentGroup(value) { return value.groups.find(group => group.id === value.activeGroupId) ?? value.groups[0]; }
export function withGroupLayout(value, layout) {
    return { ...value, grid: SQUARE_GRID.version, groups: value.groups.map(group => group.id === value.activeGroupId ? { ...group, layout: fitWidgetLayout(layout, SQUARE_GRID.maxCols) } : group) };
}
export function groupNameError(name, groups, id) {
    const trimmed = name.trim();
    if (!trimmed || [...trimmed].length > 20)
        return '分组名称请输入 1–20 个字';
    if (groups.some(group => group.id !== id && group.name === trimmed))
        return '已有同名分组，请换一个名称';
    return '';
}
export function moveGroup(value, id, direction) {
    const index = value.groups.findIndex(group => group.id === id), next = index + direction;
    if (index < 0 || next < 0 || next >= value.groups.length)
        return value;
    const groups = [...value.groups];
    [groups[index], groups[next]] = [groups[next], groups[index]];
    return { ...value, groups };
}
export function removeGroup(value, id) {
    const index = value.groups.findIndex(group => group.id === id);
    if (value.groups.length <= 1 || index < 0)
        return value;
    const groups = value.groups.filter(group => group.id !== id);
    return { ...value, groups, activeGroupId: value.activeGroupId === id ? groups[Math.max(0, index - 1)].id : value.activeGroupId };
}
export function sameLayout(a, b) {
    return a.length === b.length && a.every(item => b.some(other => ['i', 'x', 'y', 'w', 'h'].every(key => item[key] === other[key]) && JSON.stringify(item.config) === JSON.stringify(other.config)));
}
// A normal drag changes positions only. Narrow viewport projections must not
// overwrite stored card sizes or positions of cards that did not move.
export function moveWidgetPositions(stored, projected, moved) {
    return stored.map(item => {
        const before = projected.find(value => value.i === item.i), after = moved.find(value => value.i === item.i);
        return before && after && (before.x !== after.x || before.y !== after.y) ? { ...item, x: after.x, y: after.y } : item;
    });
}
function parseLayout(value, known, fallback) {
    if (!Array.isArray(value))
        return fallback;
    const seen = new Set(), apps = new Set();
    return value.flatMap((item) => {
        if (!item || typeof item.i !== 'string' || !item.i || item.i.length > 200 || seen.has(item.i) || !['x', 'y', 'w', 'h'].every(k => Number.isFinite(item[k])))
            return [];
        if (item.kind === 'app' && (typeof item.appId !== 'string' || !item.appId || apps.has(item.appId))) return [];
        if (item.kind !== 'app' && item.i !== 'work-stats' && !known.some(value => value.i === item.i) && !(typeof item.appId === 'string' && typeof item.cardId === 'string'))
            return [];
        const legacy = item.i === 'work-stats' ? { appId: 'com.ksf.conversations', cardId: 'work-stats', config: {}, name: '工作统计' } : {};
        const base = { ...(known.find(x => x.i === item.i) ?? {}), ...legacy, ...item };
        seen.add(item.i);
        if (item.kind === 'app') { apps.add(item.appId); return [{ i:item.i, kind:'app', appId:item.appId, name:item.name, x:Math.max(0,Math.min(11,Math.round(item.x))), y:Math.max(0,Math.round(item.y)), w:1, h:1, minW:1, minH:1 }]; }
        const w = Math.max(base.minW ?? 1, Math.min(12, Math.round(item.w))), h = Math.max(base.minH ?? 1, Math.min(12, Math.round(item.h)));
        return [{ ...base, w, h, x: Math.max(0, Math.min(12 - w, Math.round(item.x))), y: Math.max(0, Math.min(60, Math.round(item.y))) }];
    });
}
export function parseDesktop(value, known = defaultLayout()) {
    const fallback = defaultDesktop();
    if (!value || typeof value !== 'object' || ![1, 2, 3].includes(value.version))
        return fallback;
    const v = migrateDesktopApplicationIds(value);
    if (v.shortcuts?.initialized === true && typeof v.shortcuts.homeGroupId === 'string' && v.shortcuts.installations && typeof v.shortcuts.installations === 'object')
        fallback.shortcuts = { initialized:true, homeGroupId:v.shortcuts.homeGroupId, installations:{...v.shortcuts.installations} };
    const readLayout = (layout, fallbackLayout) => {
        if (!Array.isArray(layout))
            return fallbackLayout;
        const parsed = parseLayout(layout, known, fallbackLayout);
        return v.grid === SQUARE_GRID.version ? fitWidgetLayout(parsed, SQUARE_GRID.maxCols) : migrateSquareLayout(parsed);
    };
    if (v.bounds && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(v.bounds[k])))
        fallback.bounds = fitBounds(v.bounds, { width: 7680, height: 4320 });
    if (v.version === 1)
        fallback.groups[0].layout = readLayout(v.layout, fallback.groups[0].layout);
    else if (Array.isArray(v.groups)) {
        const seen = new Set();
        const groups = [];
        for (const group of v.groups) {
            if (!group || typeof group.id !== 'string' || !group.id.trim() || seen.has(group.id) || typeof group.name !== 'string' || groupNameError(group.name, groups))
                continue;
            seen.add(group.id);
            groups.push({ id: group.id, name: group.name.trim(), icon: groupIcons.includes(group.icon) ? group.icon : 'grid', layout: readLayout(group.layout, []) });
        }
        if (groups.length) {
            fallback.groups = groups;
            fallback.activeGroupId = groups.some(group => group.id === v.activeGroupId) ? v.activeGroupId : groups[0].id;
        }
    }
    return fallback;
}
export function readDesktop(storage, known) {
    for (const key of [DESKTOP_KEY, PREVIOUS_DESKTOP_KEY, LEGACY_DESKTOP_KEY]) {
        try {
            const value = JSON.parse(storage?.getItem(key) ?? 'null');
            if (!value || value.version !== (key === DESKTOP_KEY ? 3 : key === PREVIOUS_DESKTOP_KEY ? 2 : 1))
                continue;
            if ([2, 3].includes(value.version) && (!Array.isArray(value.groups) || !value.groups.some((group) => group && typeof group.id === 'string' && group.id.trim() && typeof group.name === 'string' && !groupNameError(group.name, []))))
                continue;
            return parseDesktop(value, known);
        }
        catch { }
    }
    return defaultDesktop();
}
export function saveDesktop(value, storage) { try {
    if (!storage)
        return false;
    storage.setItem(DESKTOP_KEY, JSON.stringify(value));
    return true;
}
catch {
    return false;
} }
export function patchSearch(source, changes) { const next = new URLSearchParams(source); for (const [k, v] of Object.entries(changes)) {
    if (v)
        next.set(k, v);
    else
        next.delete(k);
} return next.toString(); }
export function isDeepLink(search) { const p = new URLSearchParams(search); return ['app', 'target', 'project', 'task', 'turn', 'view'].some(key => p.has(key)); }
export function adjustWidgetLayout(layout, id, dx, dy, resize = false, cols = SQUARE_GRID.maxCols) {
    const next = fitWidgetLayout(layout, cols), item = next.find(w => w.i === id);
    if (!item)
        return next;
    if (resize && item.kind !== 'app') {
        item.w = Math.max(Math.min(cols, item.minW ?? 1), Math.min(cols - item.x, Math.round(item.w + dx)));
        item.h = Math.max(item.minH ?? 1, Math.min(12, Math.round(item.h + dy)));
    }
    else if (!resize) {
        item.x = Math.max(0, Math.min(cols - item.w, Math.round(item.x + dx)));
        item.y = Math.max(0, Math.round(item.y + dy));
    }
    const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const placed = [item];
    // Like pointer editing, an occupied cell pushes the following cards down.
    for (const other of next.filter(w => w !== item).sort((a, b) => a.y - b.y || a.x - b.x)) {
        let collisions = placed.filter(w => intersects(w, other));
        while (collisions.length) {
            other.y = Math.max(...collisions.map(w => w.y + w.h));
            collisions = placed.filter(w => intersects(w, other));
        }
        placed.push(other);
    }
    return next;
}

/** Reconcile a complete installed snapshot only. The marker and layout commit together. */
export function reconcileApplicationShortcuts(value, installed, cols, createId) {
    const first = !value.shortcuts?.initialized, ids = new Set(installed.map(app => app.id));
    let groups = value.groups.map(group => ({ ...group, layout:group.layout.filter(item => item.kind !== 'app' || ids.has(item.appId)) }));
    let home = groups.find(group => group.id === (value.shortcuts?.homeGroupId ?? 'home'));
    if (!home) home = groups.find(group => group.name === '主页');
    if (!home) { home = {id:createId(), name:'主页', icon:'home', layout:[]}; groups.push(home); }
    const target = first ? (groups.find(group => group.id === value.activeGroupId) ?? home) : home;
    const installations = Object.fromEntries(installed.map(app => [app.id,app.installationId]));
    for (const app of installed) if (app.hasWindow && (first || value.shortcuts.installations[app.id] !== app.installationId)) {
        target.layout = appendWidget(target.layout, {i:createId(),kind:'app',appId:app.id,name:app.name,x:0,y:0,w:1,h:1,minW:1,minH:1}, cols);
    }
    const next = { ...value, groups, shortcuts:{initialized:true,homeGroupId:home.id,installations} };
    const prior=value.shortcuts;
    const unchanged=prior?.initialized && prior.homeGroupId===home.id && Object.keys(prior.installations).length===installed.length && installed.every(app=>prior.installations[app.id]===app.installationId) && JSON.stringify(groups)===JSON.stringify(value.groups);
    return unchanged ? value : next;
}
