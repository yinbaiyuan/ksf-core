import type {CSSProperties} from 'react';
/** Public UI contracts. The implementation is supplied by the workbench runtime. */
export type UIStyle=CSSProperties&{[name:`--ksf-${string}`]:string|number|undefined};
export type UITheme = 'system' | 'light' | 'dark';
export type UIDensity = 'compact' | 'comfortable';
export type UIMaterial = 'auto' | 'solid' | 'frost' | 'glass';
export type UIMotion = 'system' | 'full' | 'reduced';
export type UISurfaceRole = 'content' | 'shell' | 'summary';

export interface UIConfiguration {
  theme: UITheme;
  density: UIDensity;
  material: UIMaterial;
  motion: UIMotion;
}

export interface UISystemPreferences {
  dark: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  forcedColors: boolean;
}

export interface UIRenderCapabilities {
  frost: boolean;
  glass: boolean;
}

export interface UIEnvironment {
  /** Stable owner; never infer an owner from whichever window is currently active. */
  owner: string;
  active: boolean;
  enabled: boolean;
  visible: boolean;
  toolbarHost: HTMLElement | null;
  contentHost: HTMLElement | null;
  overlayHost: HTMLElement | null;
  /** Host-provided CSP style nonce; previews may omit it and retain code-only diagrams. */
  styleNonce?: string;
  overlays?: import('@ksf/sdk/overlay-coordinator').OverlayAccess;
  commands?: import('@ksf/sdk/controllers').ApplicationCommands;
  capabilities: UIRenderCapabilities;
}

export interface UIResolvedConfiguration {
  theme: 'light' | 'dark';
  density: UIDensity;
  material: Exclude<UIMaterial, 'auto'>;
  motion: 'full' | 'reduced';
  animate: boolean;
  /** Keep intent separate from effective policy, including accessibility fallbacks. */
  requested: Readonly<UIConfiguration>;
  reasons: readonly ('content-solid' | 'reduced-transparency' | 'forced-colors' | 'unsupported-material' | 'system-reduced-motion' | 'not-visible' | 'not-active' | 'parent-reduced-motion')[];
}

