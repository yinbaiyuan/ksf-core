interface ScheduledSurface {
  host: Element;
  measure(sources: Map<Element, DOMRect>): unknown;
  apply(measurement: unknown): void;
}
export function createSurfaceScheduler<T extends ScheduledSurface>(surfaces: Set<T>, requestFrame: (callback: FrameRequestCallback) => number): {
  enqueue(surface: T): void;
  sync(root: Element | null): void;
  cancel(surface: T): void;
  suspend(root: Element, active: boolean): boolean;
};
