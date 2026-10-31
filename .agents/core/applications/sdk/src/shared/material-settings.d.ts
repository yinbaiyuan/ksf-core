export declare const MATERIAL_KEY = "ksf.workbench.material.v1";
export declare const profileNames: {
    readonly directory: '归属目录框';
    readonly workspace: '工作区外层背景框';
    readonly reader: '主阅读区';
    readonly chat: '当前聊天选中态';
    readonly round: '当前轮次选中态';
    readonly button: '操作按钮';
    readonly section: '章节选中透镜';
    readonly drawer: '详情抽屉';
    readonly window: '应用窗框';
    readonly dock: 'Dock';
    readonly statusbar: '状态栏';
    readonly card: '桌面卡片';
};
export type ProfileId = keyof typeof profileNames;
export interface MaterialProfile {
    tint: string;
    opacity: number;
    refraction: number;
    bezel: number;
    curvature: number;
    ior: number;
    invert: boolean;
    chroma: number;
    blur: number;
    specular: number;
    specularWidth: number;
    lightAngle: number;
    radius: number;
    shadowOpacity: number;
    shadowBlur: number;
    shadowY: number;
    grow: number;
    squash: number;
    stiffness: number;
    damping: number;
    stretch: number;
}
export interface BackdropSettings {
    wash: number;
    brightness: number;
    saturation: number;
    x: number;
    y: number;
}
export interface MaterialSettings {
    version: 1;
    motion: boolean;
    backdrop: BackdropSettings;
    profiles: Record<ProfileId, MaterialProfile>;
}
export declare const profileLimits: {
    readonly opacity: readonly [0, 1, 0.01];
    readonly refraction: readonly [0, 48, 1];
    readonly bezel: readonly [0.05, 1, 0.01];
    readonly curvature: readonly [1.5, 8, 0.1];
    readonly ior: readonly [1.05, 2.5, 0.05];
    readonly chroma: readonly [0, 0.3, 0.01];
    readonly blur: readonly [0, 24, 0.5];
    readonly specular: readonly [0, 1, 0.01];
    readonly specularWidth: readonly [0.5, 4, 0.1];
    readonly lightAngle: readonly [-180, 180, 1];
    readonly radius: readonly [0, 48, 1];
    readonly shadowOpacity: readonly [0, 0.4, 0.01];
    readonly shadowBlur: readonly [0, 40, 1];
    readonly shadowY: readonly [0, 20, 1];
    readonly grow: readonly [0, 20, 1];
    readonly squash: readonly [0, 12, 0.5];
    readonly stiffness: readonly [80, 900, 10];
    readonly damping: readonly [10, 70, 1];
    readonly stretch: readonly [0, 24, 1];
};
export declare const backdropLimits: {
    readonly wash: readonly [0, 1, 0.01];
    readonly brightness: readonly [0.4, 1.6, 0.05];
    readonly saturation: readonly [0, 2, 0.05];
    readonly x: readonly [0, 100, 1];
    readonly y: readonly [0, 100, 1];
};
export declare function defaultMaterialSettings(): MaterialSettings;
export declare function bounded(value: number, limits: readonly [number, number, number]): number;
export declare function parseMaterialSettings(value: unknown): MaterialSettings;
export declare function readMaterialSettings(storage?: Pick<Storage, 'getItem'>): MaterialSettings;
export declare function tintColor(profile: MaterialProfile): string;
export declare function shadowCSS(profile: MaterialProfile): string;
