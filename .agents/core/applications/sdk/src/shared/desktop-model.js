import {migrateDesktopApplicationIds} from './application-identities.js';
export const LEGACY_DESKTOP_KEY = 'ksf.workbench.desktop.v1';
export const PREVIOUS_DESKTOP_KEY = 'ksf.workbench.desktop.v2';
export const DESKTOP_KEY = 'ksf.workbench.desktop.v3';
export const SQUARE_GRID = { version: 'square-v1', cell: 96, gap: 32, maxCols: 12 };
export const DOCK_SIZE = { min: 28, max: 72, default: 44 };
export function dockIconSize(value) {
    return Number.isFinite(value) ? Math.max(DOCK_SIZE.min, Math.min(DOCK_SIZE.max, Math.round(value))) : DOCK_SIZE.default;
}
const validDockAppId = id => typeof id === 'string' && id.length > 0 && id.length <= 80 && id.trim() === id;
export function setDockPinned(value, appId, pinned) {
    if (!validDockAppId(appId)) return value;
    const ids = value.dock?.pinnedAppIds ?? [];
    if (ids.includes(appId) === pinned) return value;
    return { ...value, dock: { ...value.dock, iconSize: dockIconSize(value.dock?.iconSize), pinnedAppIds: pinned ? [...ids, appId] : ids.filter(id => id !== appId) } };
}
// Pins have a stable order; running windows only add apps not already pinned.
export function dockApplicationIds(pinned, running) {
    return [...new Set([...(pinned ?? []), ...running])];
}
export function reorderDockPins(ids, appId, targetId) {
    const from = ids.indexOf(appId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return ids;
    const result = [...ids];
    result.splice(from, 1); result.splice(to, 0, appId);
    return result;
}
export const groupIcons = ['home', 'grid', 'briefcase', 'book', 'star', 'code'];
export const defaultLayout = () => [
    { i: 'work-stats', appId: 'com.ksf.conversations', cardId: 'work-stats', config: {}, name: '工作统计', x: 0, y: 0, w: 4, h: 2, minW: 1, minH: 1 },
];
export function squareGridMetrics(available, options = {}) {
    const baseCell = Number.isFinite(options.cell) ? Math.max(1, options.cell) : SQUARE_GRID.cell;
    const gap = Number.isFinite(options.gap) ? Math.max(0, options.gap) : SQUARE_GRID.gap;
    const cols = Math.max(1, Math.min(SQUARE_GRID.maxCols, Math.floor((available + gap) / (baseCell + gap))));
    // Keep desktop slots compact instead of stretching them on wide screens.
    const cell = Math.min(baseCell, Math.max(1, available));
    const width = cols * cell + (cols - 1) * gap;
    return { cols, cell, gap, width };
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
// Pack displaced items into the space vacated by the dragged card. Try their
// translated positions first; backtrack only when different footprints need
// a different arrangement. No unrelated item participates in the swap.
function packSwapItems(items, origin, occupied, preferred) {
    const order = [...items].sort((a, b) => b.w * b.h - a.w * a.h || b.h - a.h || a.i.localeCompare(b.i));
    const candidates = order.map(item => {
        const positions = [];
        for (let y = origin.y; y <= origin.y + origin.h - item.h; y++)
            for (let x = origin.x; x <= origin.x + origin.w - item.w; x++) {
                const position = { ...item, x, y };
                if (!occupied.some(other => overlaps(position, other))) positions.push(position);
            }
        const ideal = preferred.find(value => value.i === item.i);
        return positions.sort((a, b) => Math.abs(a.x - ideal.x) + Math.abs(a.y - ideal.y) - Math.abs(b.x - ideal.x) - Math.abs(b.y - ideal.y));
    });
    if (candidates.some(list => !list.length)) return null;
    const mask = item => {
        let value = 0n;
        for (let y = item.y; y < item.y + item.h; y++) for (let x = item.x; x < item.x + item.w; x++)
            value |= 1n << BigInt((y - origin.y) * origin.w + x - origin.x);
        return value;
    };
    const options = candidates.map(list => list.map(item => ({ item, mask: mask(item) }))), failed = new Set();
    let available = options.flat().reduce((sum, option) => sum | option.mask, 0n), cells = 0;
    while (available) { available &= available - 1n; cells++; }
    if (order.reduce((sum, item) => sum + item.w * item.h, 0) > cells) return null;
    const search = (index, used, placed) => {
        if (index === order.length) return placed;
        const key = `${index}:${used}`;
        if (failed.has(key)) return null;
        for (const option of options[index]) if (!(used & option.mask)) {
            const result = search(index + 1, used | option.mask, [...placed, option.item]);
            if (result) return result;
        }
        failed.add(key);
        return null;
    };
    return search(0, 0n, []);
}
// Always resolve against the drag-start snapshot, including while previewing.
export function settleWidgetDrop(stored, projected, id, destination, cols = SQUARE_GRID.maxCols, resize = false) {
    const before = projected.find(item => item.i === id), source = stored.find(item => item.i === id);
    if (!before || !source || ![destination.x, destination.y].every(Number.isFinite)) return stored;
    if (resize && ![destination.w, destination.h].every(Number.isFinite)) return stored;
    let moved = integralItem({ ...before, x: destination.x, y: destination.y,
        ...(resize && source.kind !== 'app' ? { w: destination.w, h: destination.h } : {}) }, cols);
    moved.x = Math.min(moved.x, cols - moved.w);
    if (sameLayout([before], [moved])) return stored;
    const hits = projected.filter(item => item.i !== id && overlaps(moved, item));
    if (resize && hits.length || hits.some(item => !stored.some(value => value.i === item.i))) return stored;
    const target = hits.length === 1 ? hits[0] : null, targetSource = target && stored.find(item => item.i === target.i);
    // A small item dropped inside a larger card aligns with that card's origin.
    // A large card keeps its requested rectangle when it covers smaller items.
    if (target && !(moved.w >= target.w && moved.h >= target.h)) moved = { ...moved, x: target.x, y: target.y };
    const displaced = hits.map(item => ({ ...item, x: item.x + before.x - moved.x, y: item.y + before.y - moved.y }));
    const fits = (items, width) => items.every(item => item.x >= 0 && item.y >= 0 && item.x + item.w <= width &&
        items.every(other => other.i === item.i || !overlaps(item, other)));
    const resolve = positions => {
        const visible = projected.map(item => item.i === id ? moved : positions.find(value => value.i === item.i) ?? item);
        const next = stored.map(item => {
            if (item.i === id) return { ...item,
                x: targetSource ? targetSource.x + moved.x - target.x : moved.x,
                y: targetSource ? targetSource.y + moved.y - target.y : moved.y,
                ...(resize && source.kind !== 'app' ? { w: moved.w, h: moved.h } : {}) };
            const position = positions.find(value => value.i === item.i);
            return position ? { ...item, x: source.x + position.x - before.x, y: source.y + position.y - before.y } : item;
        });
        // Narrow projections must not rewrite sizes or repack bystanders.
        return fits(visible, cols) && fits(next, SQUARE_GRID.maxCols) && sameLayout(fitWidgetLayout(next, cols), visible) ? next : null;
    };
    const direct = resolve(displaced);
    if (direct) return direct;
    if (!hits.length) return stored;
    const occupied = [...projected.filter(item => item.i !== id && !hits.some(hit => hit.i === item.i)), moved];
    const packed = packSwapItems(hits, before, occupied, displaced);
    return packed && resolve(packed) || stored;
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
    if (v.dock && typeof v.dock === 'object' && !Array.isArray(v.dock)) {
        fallback.dock = { iconSize: dockIconSize(v.dock.iconSize) };
        if (Array.isArray(v.dock.pinnedAppIds)) fallback.dock.pinnedAppIds = [...new Set(v.dock.pinnedAppIds.filter(validDockAppId))].slice(0, 1000);
    }
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
    const destination = { ...item };
    if (resize && item.kind !== 'app') {
        destination.w = Math.max(Math.min(cols, item.minW ?? 1), Math.min(cols - item.x, Math.round(item.w + dx)));
        destination.h = Math.max(item.minH ?? 1, Math.min(12, Math.round(item.h + dy)));
    }
    else if (!resize) {
        destination.x = Math.max(0, Math.min(cols - item.w, Math.round(item.x + dx)));
        destination.y = Math.max(0, Math.round(item.y + dy));
    }
    return settleWidgetDrop(layout, next, id, destination, cols, resize);
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
