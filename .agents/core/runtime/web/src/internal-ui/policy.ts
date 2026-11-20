import type { UIConfiguration, UIResolvedConfiguration, UISystemPreferences, UIRenderCapabilities, UISurfaceRole } from './types';

export const DEFAULT_UI_CONFIGURATION: Readonly<UIConfiguration> = Object.freeze({
  theme: 'system', density: 'compact', material: 'auto', motion: 'system',
});
export const DEFAULT_SYSTEM_PREFERENCES: Readonly<UISystemPreferences> = Object.freeze({
  dark: false, reducedMotion: false, reducedTransparency: false, forcedColors: false,
});

const choices = {
  theme: ['system', 'light', 'dark'], density: ['compact', 'comfortable'],
  material: ['auto', 'solid', 'frost', 'glass'], motion: ['system', 'full', 'reduced'],
} as const;

/** Reject malformed configuration at the boundary rather than changing intent silently. */
export function mergeUIConfiguration(base: Readonly<UIConfiguration>, input: Partial<UIConfiguration> = {}): UIConfiguration {
  const next = { ...base };
  for (const key of Object.keys(choices) as (keyof UIConfiguration)[]) {
    const value = input[key];
    if (value === undefined) continue;
    if (!(choices[key] as readonly string[]).includes(value)) throw new TypeError(`无效的 UI ${key}：${String(value)}`);
    Object.assign(next, { [key]: value });
  }
  return next;
}

/** Pure policy: no document mutation, persistence, service calls or global theme. */
export function resolveUIConfiguration(
  config: Readonly<UIConfiguration>, system: Readonly<UISystemPreferences>,
  capabilities: Readonly<UIRenderCapabilities>, role: UISurfaceRole = 'content', visible = true,
): UIResolvedConfiguration {
  const reasons: UIResolvedConfiguration['reasons'][number][] = [];
  let material: UIResolvedConfiguration['material'] = config.material === 'auto' ? (role === 'shell' ? 'frost' : 'solid') : config.material;
  if (role === 'content' && material !== 'solid') { material = 'solid'; reasons.push('content-solid'); }
  if (material !== 'solid' && system.reducedTransparency) { material = 'solid'; reasons.push('reduced-transparency'); }
  if (material !== 'solid' && system.forcedColors) { material = 'solid'; reasons.push('forced-colors'); }
  if (material === 'glass' && !capabilities.glass) {
    material = capabilities.frost ? 'frost' : 'solid'; reasons.push('unsupported-material');
  }
  if (material === 'frost' && !capabilities.frost) { material = 'solid'; if (!reasons.includes('unsupported-material')) reasons.push('unsupported-material'); }
  const motion = config.motion === 'reduced' || system.reducedMotion ? 'reduced' : 'full';
  if (system.reducedMotion && config.motion !== 'reduced') reasons.push('system-reduced-motion');
  if (!visible) reasons.push('not-visible');
  return {
    theme: config.theme === 'system' ? (system.dark ? 'dark' : 'light') : config.theme,
    density: config.density, material, motion, animate: visible && motion === 'full',
    requested: Object.freeze({ ...config }), reasons: Object.freeze(reasons),
  };
}
