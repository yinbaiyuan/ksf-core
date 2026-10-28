export interface GlassOptions {
  x?: number; y?: number; width?: number; height?: number; radius?: number;
  refraction?: number; bezel?: number; curvature?: number; ior?: number;
  invert?: boolean; chroma?: number; blur?: number; specular?: number;
  specularWidth?: number; lightAngle?: number; mapScale?: number;
  mode?: 'content' | 'backdrop'; fit?: boolean; clip?: boolean;
  fallback?: string; sync?: boolean; hidden?: boolean; deferMap?: boolean;
}
export function createGlass(target: HTMLElement, options?: GlassOptions): {
  update(options?: GlassOptions): void; flush(): void; destroy(): void;
  readonly filterId: string; readonly params: GlassOptions;
};
export const engine: 'blink' | 'webkit' | 'gecko';
export const reducedMotion: MediaQueryList;
export function createSpring(initial: number, update: (value: number, velocity: number) => void, options?: { stiffness?: number; damping?: number; mass?: number }): {
  set(value: number, options?: { immediate?: boolean }): void;
  stop(): void; readonly value: number; readonly target: number;
};

export function renderLensMap(options?: GlassOptions, scale?: number): { canvas: HTMLCanvasElement; width: number; height: number; scale: number };
