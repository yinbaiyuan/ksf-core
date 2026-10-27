// Preserve unchanged JSON subtrees so polling does not re-render archived messages.
export function shareJSON(previous: any, next: any): any {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' || Array.isArray(previous) !== Array.isArray(next)) return next;
  const keys = Object.keys(next), sameSize = keys.length === Object.keys(previous).length;
  let equal = sameSize;
  for (const key of keys) {
    const value = shareJSON(previous[key], next[key]);
    if (!Object.hasOwn(previous, key) || value !== previous[key]) equal = false;
    next[key] = value;
  }
  return equal ? previous : next;
}
// A URL has one poller and one in-flight request, regardless of window count.
export function createRemoteCache(fetcher: typeof fetch = fetch) {
  type Entry = { data: any; error: string | null; at: number; revision: number; pending?: Promise<void>; controller?: AbortController; listeners: Set<() => void>; timer?: ReturnType<typeof setInterval> };
  const entries = new Map<string, Entry>();
  function entry(url: string) {
    let item = entries.get(url);
    if (!item) { item = { data: null, error: null, at: 0, revision: 0, listeners: new Set() }; entries.set(url, item); }
    return item;
  }
  async function refresh(url: string, force = false) {
    const item = entry(url);
    if (item.pending) return item.pending;
    if (!force && Date.now() - item.at < 2700) return;
    const previousData = item.data, previousError = item.error;
    item.controller = new AbortController();
    item.pending = (async () => {
      try {
        const response = await fetcher(url, { signal: item.controller!.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok || (!body.data && !body.ok)) throw new Error(body.errors?.[0]?.message ?? body.error?.message ?? `读取失败（${response.status}）`);
        item.data = shareJSON(item.data, body.data ?? body);
        item.error = body.errors?.length ? `${body.errors.length} 条记录无法读取，当前仅展示可核对的记录` : null;
      } catch (error) {
        if (!item.controller?.signal.aborted) item.error = error instanceof Error ? error.message : '读取失败';
      } finally {
        item.at = Date.now(); item.pending = undefined;
        if (item.data !== previousData || item.error !== previousError) {
          item.revision++;
          for (const notify of item.listeners) notify();
        }
      }
    })();
    return item.pending;
  }
  function subscribe(url: string, notify: () => void) {
    const item = entry(url); item.listeners.add(notify);
    if (!item.timer) item.timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) void refresh(url); }, 3000);
    if (typeof document === 'undefined' || !document.hidden) void refresh(url);
    return () => {
      item.listeners.delete(notify);
      if (!item.listeners.size) { clearInterval(item.timer); item.timer = undefined; }
      // Bound the retained cache; pending requests finish once and cannot update unmounted components.
      if (entries.size > 160) for (const [key, value] of entries) { if (!value.listeners.size && !value.pending) { entries.delete(key); if (entries.size <= 120) break; } }
    };
  }
  return { read: (url: string) => entry(url), refresh, subscribe };
}
