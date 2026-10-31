export declare const LEGACY_DESKTOP_KEY = "ksf.workbench.desktop.v1";
export declare const PREVIOUS_DESKTOP_KEY = "ksf.workbench.desktop.v2";
export declare const DESKTOP_KEY = "ksf.workbench.desktop.v3";
export declare const SQUARE_GRID: {
    readonly version: 'square-v1';
    readonly cell: 96;
    readonly gap: 24;
    readonly maxCols: 12;
};
export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface WidgetLayout {
    kind?: 'app' | 'card';
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    appId?: string;
    cardId?: string;
    config?: unknown;
    name?: string;
}
export declare const groupIcons: readonly ['home', 'grid', 'briefcase', 'book', 'star', 'code'];
export type GroupIcon = typeof groupIcons[number];
export interface DesktopGroup {
    id: string;
    name: string;
    icon: GroupIcon;
    layout: WidgetLayout[];
}
export interface DesktopPreferences {
    version: 3;
    grid: typeof SQUARE_GRID.version;
    groups: DesktopGroup[];
    activeGroupId: string;
    bounds: Bounds;
    shortcuts?: { initialized: true; homeGroupId: string; installations: Record<string,string> };
}
export interface ShortcutApplication {id:string;name:string;installationId:string;hasWindow:boolean}
export declare function reconcileApplicationShortcuts(value:DesktopPreferences,installed:ShortcutApplication[],cols:number,createId:()=>string):DesktopPreferences;
export declare const defaultLayout: () => WidgetLayout[];
export declare function squareGridMetrics(available: number): {
    cols: number;
    cell: number;
    gap: 24;
    width: number;
};
export declare function fitWidgetLayout(layout: WidgetLayout[], cols: number): WidgetLayout[];
export declare function appendWidget(layout: WidgetLayout[], item: WidgetLayout, cols: number): WidgetLayout[];
export declare function migrateSquareLayout(layout: WidgetLayout[]): WidgetLayout[];
export declare function fitBounds(bounds: Bounds, area: {
    width: number;
    height: number;
}, minimum?: {
    width: number;
    height: number;
}): Bounds;
export declare function tiledBounds(side: 'left' | 'right', area: {
    width: number;
    height: number;
}): Bounds;
export declare function defaultDesktop(): DesktopPreferences;
export declare function currentGroup(value: DesktopPreferences): DesktopGroup;
export declare function withGroupLayout(value: DesktopPreferences, layout: WidgetLayout[]): DesktopPreferences;
export declare function groupNameError(name: string, groups: DesktopGroup[], id?: string): "" | "分组名称请输入 1–20 个字" | "已有同名分组，请换一个名称";
export declare function moveGroup(value: DesktopPreferences, id: string, direction: -1 | 1): DesktopPreferences;
export declare function removeGroup(value: DesktopPreferences, id: string): DesktopPreferences;
export declare function sameLayout(a: WidgetLayout[], b: WidgetLayout[]): boolean;
export declare function moveWidgetPositions(stored: WidgetLayout[], projected: readonly WidgetLayout[], moved: readonly WidgetLayout[]): WidgetLayout[];
export declare function parseDesktop(value: unknown, known?: WidgetLayout[]): DesktopPreferences;
export declare function readDesktop(storage?: Pick<Storage, 'getItem'>, known?: WidgetLayout[]): DesktopPreferences;
export declare function saveDesktop(value: DesktopPreferences, storage?: Pick<Storage, 'setItem'>): boolean;
export declare function patchSearch(source: string, changes: Record<string, string | null>): string;
export declare function isDeepLink(search: string): boolean;
export declare function adjustWidgetLayout(layout: WidgetLayout[], id: string, dx: number, dy: number, resize?: boolean, cols?: number): WidgetLayout[];
