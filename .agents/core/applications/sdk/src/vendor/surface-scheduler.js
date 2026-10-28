// Batch optical measurements and pause them while a native layout gesture owns a scope.
export function createSurfaceScheduler(surfaces, requestFrame) {
  const pending = new Set(), suspended = new Set();
  let scheduled = false;
  const paused = surface => [...suspended].some(root => root.contains(surface.host));
  function enqueue(surface) {
    if (!surfaces.has(surface) || paused(surface)) return;
    pending.add(surface);
    if (scheduled) return;
    scheduled = true;
    requestFrame(() => {
      scheduled = false;
      const list = [...pending].filter(surface => surfaces.has(surface) && !paused(surface));
      pending.clear();
      const sources = new Map();
      const measurements = list.map(surface => surface.measure(sources));
      list.forEach((surface, index) => surface.apply(measurements[index]));
    });
  }
  function sync(root) {
    for (const surface of surfaces) if (!root || root.contains(surface.host)) enqueue(surface);
  }
  return {
    enqueue, sync,
    cancel(surface) { pending.delete(surface); },
    suspend(root, active) {
      if (active) {
        if (suspended.has(root)) return false;
        suspended.add(root);
        for (const surface of pending) if (root.contains(surface.host)) pending.delete(surface);
      } else {
        if (!suspended.delete(root)) return false;
        sync(root);
      }
      return true;
    },
  };
}
