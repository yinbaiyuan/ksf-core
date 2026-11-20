import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_SYSTEM_PREFERENCES, DEFAULT_UI_CONFIGURATION, mergeUIConfiguration, resolveUIConfiguration } from './policy';
import type { UIConfiguration, UIEnvironment, UIResolvedConfiguration, UISurfaceRole, UISystemPreferences, UIMotion,UIStyle } from './types';
import {Slot} from '@radix-ui/react-slot';

const queries = {
  dark: '(prefers-color-scheme: dark)', reducedMotion: '(prefers-reduced-motion: reduce)',
  reducedTransparency: '(prefers-reduced-transparency: reduce)', forcedColors: '(forced-colors: active)',
} as const;

function systemSnapshot(): string {
  return (Object.keys(queries) as (keyof UISystemPreferences)[]).map(key => typeof matchMedia === 'function' && matchMedia(queries[key]).matches ? '1' : '0').join('');
}
function subscribeSystem(listener: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const matches = Object.values(queries).map(query => matchMedia(query));
  for (const match of matches) match.addEventListener('change', listener);
  return () => { for (const match of matches) match.removeEventListener('change', listener); };
}
const pageVisible=()=>typeof document==='undefined'||document.visibilityState!=='hidden';
function subscribeVisibility(listener:()=>void){if(typeof document==='undefined')return()=>{};document.addEventListener('visibilitychange',listener);return()=>document.removeEventListener('visibilitychange',listener);}

export interface UIContextValue {
  environment: Readonly<UIEnvironment>;
  configuration: Readonly<UIConfiguration>;
  resolved: Readonly<UIResolvedConfiguration>;
  role: UISurfaceRole;
  variables?:Readonly<UIStyle>;
}
const Context = createContext<UIContextValue | null>(null);
/** Internal compatibility boundary; public components still require an explicit provider. */
export const useOptionalUI=()=>useContext(Context);
export function useUI(): UIContextValue {
  const context = useContext(Context);
  if (!context) throw new Error('UI 组件需要 UIProvider；独立页面请显式提供 standalone。');
  return context;
}

export interface UIProviderProps {
  children: ReactNode;
  environment?: UIEnvironment;
  standalone?: { id: string };
  config?: Partial<UIConfiguration>;
  role?: UISurfaceRole;
  className?: string;
  style?: UIStyle;
  /** Deterministic overrides for previews, server rendering and host-managed preferences. */
  system?: Partial<UISystemPreferences>;
  /** Apply the provider root to one element without adding another layout box. */
  asChild?:boolean;
}

/** Attributes are shared with portal roots, without mutating the host's global DOM. */
export function uiRootAttributes(context: UIContextValue) {
  const { environment, resolved, role } = context;
  return {
    'data-ksf-ui': '1', 'data-ui-owner': environment.owner,
    'data-theme': resolved.theme, 'data-density': resolved.density, 'data-material': resolved.material,
    'data-motion': resolved.motion, 'data-ui-visible': String(environment.visible), 'data-ui-role': role,
    'data-ui-active':String(environment.active),
  };
}
/** Internal portal inheritance: copy semantic overrides, never page layout styles. */
export function uiRootStyle(context:UIContextValue):UIStyle{
  return {...context.variables,...(!context.resolved.animate?{
    '--ksf-duration-fast':'0ms','--ksf-duration-standard':'0ms','--ksf-duration-overlay':'0ms',
    '--ksf-ui-busy-animation':'none','--ksf-ui-skeleton-animation':'none','--ksf-ui-progress-animation':'none',
    '--ksf-ui-progress-width':'100%',
  }:{})} as UIStyle;
}

export function UIProvider({ children, environment, standalone, config, role, className = '', style, system,asChild=false }: UIProviderProps) {
  const parent = useContext(Context), snapshot = useSyncExternalStore(subscribeSystem, systemSnapshot, () => '0000'),visible=useSyncExternalStore(subscribeVisibility,pageVisible,()=>true);
  const media = useMemo(() => Object.fromEntries((Object.keys(queries) as (keyof UISystemPreferences)[]).map((key, index) => [key, snapshot[index] === '1'])) as unknown as UISystemPreferences, [snapshot]);
  const isolated = useMemo<UIEnvironment | undefined>(() => standalone ? {
    owner: `standalone:${standalone.id}`, active: true, enabled: true, visible: true,
    toolbarHost: null, contentHost: null, overlayHost: null, capabilities: { frost: typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'blur(1px)'), glass: false },
  } : undefined, [standalone?.id]);
  if (environment && standalone) throw new Error('UIProvider 的 environment 和 standalone 不能同时设置。');
  if (standalone && (typeof standalone.id !== 'string' || !standalone.id.trim())) throw new Error('standalone 需要稳定且非空的 id。');
  const owner = environment ?? isolated ?? parent?.environment;
  if (typeof owner?.owner !== 'string' || !owner.owner.trim()) throw new Error('UIProvider 需要有效 owner，或显式 standalone id。');
  const effectiveEnvironment={...owner,visible:owner.visible&&visible};
  const effectiveRole = role ?? parent?.role ?? 'content';
  const configuration = mergeUIConfiguration(parent?.configuration ?? DEFAULT_UI_CONFIGURATION, config);
  const preferences = {
    ...DEFAULT_SYSTEM_PREFERENCES, ...media, ...system,
    reducedMotion: media.reducedMotion || !!system?.reducedMotion,
    reducedTransparency: media.reducedTransparency || !!system?.reducedTransparency,
    forcedColors: media.forcedColors || !!system?.forcedColors,
  };
  const requested = resolveUIConfiguration(configuration, preferences, owner.capabilities, effectiveRole, effectiveEnvironment.visible && owner.enabled);
  const policy:UIResolvedConfiguration=parent?.resolved.motion==='reduced'&&requested.motion!=='reduced'?{...requested,motion:'reduced',animate:false,reasons:Object.freeze([...requested.reasons,'parent-reduced-motion'])}:requested;
  const resolved:UIResolvedConfiguration=!owner.active&&policy.animate?{...policy,animate:false,reasons:Object.freeze([...policy.reasons,'not-active'])}:policy;
  const variables={...parent?.variables,...Object.fromEntries(Object.entries(style??{}).filter(([name])=>name.startsWith('--ksf-')))} as UIStyle;
  const value: UIContextValue = { environment: effectiveEnvironment, configuration, resolved, role: effectiveRole,variables:Object.freeze(variables) };
  const Root=asChild?Slot:'div';
  return <Context.Provider value={value}><Root {...uiRootAttributes(value)} className={`ksf-ui-root ${className}`.trim()} style={{...style,...uiRootStyle(value)}}>{children}</Root></Context.Provider>;
}

/** A local policy override; it never changes persistence or service completion. */
export function MotionPolicy({ mode, children }: { mode: UIMotion; children: ReactNode }) {
  return <UIProvider config={{ motion: mode }}>{children}</UIProvider>;
}
