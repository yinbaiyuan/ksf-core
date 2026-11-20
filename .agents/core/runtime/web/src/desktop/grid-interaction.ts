import { cloneElement, isValidElement, type ReactNode } from 'react';
import type { WidgetLayout } from '../desktop-model';

// RGL owns mutable interaction coordinates. During preview keep the active
// item's raw cursor position, while restoring every other item from the same
// drag-start snapshot before applying this frame's swap.
export function applyGridPositions(next: readonly WidgetLayout[], positions: readonly WidgetLayout[], active: string | null = null) {
  for (const item of next) {
    const position = positions.find(value => value.i === item.i);
    if (position && item.i !== active) Object.assign(item, { x: position.x, y: position.y, w: position.w, h: position.h });
  }
}

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
