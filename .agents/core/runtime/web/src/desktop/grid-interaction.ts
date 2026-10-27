import { cloneElement, isValidElement, type ReactNode } from 'react';

// RGL 2.3.0 keeps pixel positions in refs, but memoizes GridItem by integer
// coordinates. Refresh only the active child so sub-cell motion is rendered.
export function refreshGridChild(children: ReactNode, active: string | null) {
  const items = Array.isArray(children) ? children : [children];
  return items.map(child => active !== null && isValidElement(child) && child.key === active ? cloneElement(child) : child);
}

export function createGridRefresh(render: (id: string) => void, requestFrame: (callback: FrameRequestCallback) => number, cancelFrame: (id: number) => void) {
  let active: string | null = null, pending: number | null = null;
  const stop = () => { active = null; if (pending !== null) cancelFrame(pending); pending = null; };
  return {
    start(id: string) { stop(); active = id; },
    move() {
      if (active === null || pending !== null) return;
      pending = requestFrame(() => { pending = null; if (active !== null) render(active); });
    },
    stop,
  };
}
