import type { GlassOptions } from './liquid-glass';
export class Surface {
  constructor(host: HTMLElement, options?: { radius?: number; bleed?: number; owner?: HTMLElement; optics?: GlassOptions });
  root: HTMLElement;
  attach(): void; detach(): void; update(): void;
  setDelta(delta: { x?: number; y?: number; w?: number; h?: number }): void;
  setOptics(optics: GlassOptions, radius: number): void;
  refreshBackdrop(): void;
}

export function requestSync(scope?: Element | unknown): void;
export function setGlassResizing(root: Element | null, active: boolean): void;
export function setGlassInteracting(root: Element | null, active: boolean): void;

export function isGlassResizing(root: Element | null): boolean;
