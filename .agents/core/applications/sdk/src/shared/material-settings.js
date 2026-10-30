export const MATERIAL_KEY = 'ksf.workbench.material.v1';
export const profileNames = { directory: '归属目录框', workspace: '工作区外层背景框', reader: '主阅读区', chat: '当前聊天选中态', round: '当前轮次选中态', button: '操作按钮', section: '章节选中透镜', drawer: '详情抽屉', window: '应用窗框', dock: 'Dock', statusbar: '状态栏', card: '桌面卡片' };
export const profileLimits = {
    opacity: [0, 1, .01], refraction: [0, 48, 1], bezel: [.05, 1, .01], curvature: [1.5, 8, .1], ior: [1.05, 2.5, .05],
    chroma: [0, .3, .01], blur: [0, 24, .5], specular: [0, 1, .01], specularWidth: [.5, 4, .1], lightAngle: [-180, 180, 1], radius: [0, 48, 1],
    shadowOpacity: [0, .4, .01], shadowBlur: [0, 40, 1], shadowY: [0, 20, 1], grow: [0, 20, 1], squash: [0, 12, .5], stiffness: [80, 900, 10], damping: [10, 70, 1], stretch: [0, 24, 1],
};
export const backdropLimits = { wash: [0, 1, .01], brightness: [.4, 1.6, .05], saturation: [0, 2, .05], x: [0, 100, 1], y: [0, 100, 1] };
export function defaultMaterialSettings() {
    const panel = { tint: '#FFFFFF', opacity: .64, refraction: 24, bezel: .3, curvature: 4, ior: 1.5, invert: false, chroma: .1, blur: 2, specular: .5, specularWidth: 2, lightAngle: -120, radius: 22, shadowOpacity: .1, shadowBlur: 12, shadowY: 4, grow: 4, squash: 1.5, stiffness: 600, damping: 36, stretch: 0 };
    return { version: 1, motion: true, backdrop: { wash: 0, brightness: 1, saturation: 1, x: 50, y: 50 }, profiles: {
            window: { ...panel, opacity: .64, blur: 12, refraction: 24, specular: .7, shadowOpacity: .24, shadowBlur: 40, shadowY: 16 },
            dock: { ...panel, opacity: .48, blur: 8, refraction: 28, bezel: .48, specular: .8, radius: 26 },
            statusbar: { ...panel, opacity: .65, blur: 10, refraction: 14, radius: 0, shadowOpacity: .06 },
            card: { ...panel, opacity: .68, blur: 12, refraction: 22, specular: .68, radius: 24, shadowOpacity: .12, shadowBlur: 24, shadowY: 8 },
            directory: { ...panel }, workspace: { ...panel }, chat: { ...panel, opacity: .72, radius: 11 }, round: { ...panel, opacity: .72, radius: 12 },
            reader: { ...panel, tint: '#FDFEFF', opacity: 1, blur: 8, radius: 17, shadowOpacity: .08, shadowY: 2 },
            button: { ...panel, opacity: .62, refraction: 14, bezel: .8, curvature: 3, chroma: .12, blur: 0, specular: .6, specularWidth: 1.5, radius: 16, grow: 10, squash: 4 },
            section: { ...panel, opacity: .6, refraction: 5, bezel: .35, chroma: 0, blur: 0, specular: .6, specularWidth: 1.5, radius: 18, shadowOpacity: .08, shadowBlur: 3, shadowY: 1, stiffness: 380, damping: 28, stretch: 12 },
            drawer: { ...panel, opacity: .9, refraction: 0, chroma: 0, blur: 20, radius: 22, shadowOpacity: .22, shadowBlur: 40, shadowY: 18 },
        } };
}
const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
export function bounded(value, limits) { return Math.min(limits[1], Math.max(limits[0], value)); }
export function parseMaterialSettings(value) {
    const result = defaultMaterialSettings();
    if (!record(value) || value.version !== 1)
        return result;
    if (typeof value.motion === 'boolean')
        result.motion = value.motion;
    if (record(value.backdrop))
        for (const key of Object.keys(backdropLimits)) {
            const v = value.backdrop[key];
            if (typeof v === 'number' && Number.isFinite(v))
                result.backdrop[key] = bounded(v, backdropLimits[key]);
        }
    if (record(value.profiles))
        for (const id of Object.keys(profileNames)) {
            const input = value.profiles[id];
            if (!record(input))
                continue;
            const profile = result.profiles[id];
            for (const key of Object.keys(profileLimits)) {
                const v = input[key];
                if (typeof v === 'number' && Number.isFinite(v))
                    profile[key] = bounded(v, profileLimits[key]);
            }
            if (typeof input.tint === 'string' && /^#[a-f\d]{6}$/i.test(input.tint))
                profile.tint = input.tint.toUpperCase();
            if (typeof input.invert === 'boolean')
                profile.invert = input.invert;
        }
    return result;
}
export function readMaterialSettings(storage) {
    try {
        return parseMaterialSettings(JSON.parse(storage?.getItem(MATERIAL_KEY) ?? 'null'));
    }
    catch {
        return defaultMaterialSettings();
    }
}
export function tintColor(profile) {
    const rgb = [1, 3, 5].map(i => parseInt(profile.tint.slice(i, i + 2), 16));
    return `rgb(${rgb.join(' ')} / ${profile.opacity})`;
}
export function shadowCSS(profile) { return `0 ${profile.shadowY}px ${profile.shadowBlur}px rgb(0 0 0 / ${profile.shadowOpacity})`; }
