import { useCallback, useEffect, useRef, useState } from 'react';
export function useRemote<T>(path: string | null, pages = 1, collection?: 'records' | 'turns') {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null; loading: boolean }>({ key: path, data: null, error: null, loading: !!path });
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true, busy = false;
    const controller = new AbortController();
    setState(old => old.key === path ? old : { key: path, data: null, error: null, loading: !!path });
    async function update() {
      if (!path || busy || document.hidden) return;
      busy = true;
      try {
        const bodies = await Promise.all(Array.from({ length: collection ? pages : 1 }, async (_, index) => {
          const url = new URL(path, location.origin);
          if (collection) { url.searchParams.set('offset', String(index * 30)); url.searchParams.set('limit', '30'); }
          const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
          const body = await response.json();
          if (!response.ok || !body.data) throw new Error(body.errors?.[0]?.message ?? body.error?.message ?? `读取失败（${response.status}）`);
          return body;
        }));
        let data = bodies[0].data;
        if (collection) {
          const seen = new Set<string>();
          data = { ...data, nextOffset: bodies.at(-1)!.data.nextOffset,
            [collection]: bodies.flatMap(body => body.data[collection]).filter(item => {
              const id = item.taskId && collection === 'records' ? item.taskId : item.turnId;
              if (seen.has(id)) return false; seen.add(id); return true;
            }) };
        }
        const errors = bodies.flatMap(body => body.errors ?? []);
        if (alive) setState({ key: path, data, loading: false, error: errors.length ? `${errors.length} 条记录无法读取，当前仅展示可核对的记录` : null });
      } catch (error) {
        if (alive && !controller.signal.aborted) setState(old => ({ ...old, key: path, loading: false, error: error instanceof Error ? error.message : '读取失败，请重试' }));
      } finally { busy = false; }
    }
    refreshRef.current = () => { void update(); };
    void update();
    const timer = window.setInterval(update, 3000);
    document.addEventListener('visibilitychange', update);
    return () => { alive = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [path, pages, collection]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { data: state.key === path ? state.data : null, error: state.key === path ? state.error : null, loading: state.key !== path || state.loading, refresh };
}
export function useLocation() {
  const [search, setSearch] = useState(() => new URLSearchParams(location.search));
  useEffect(() => { const pop = () => setSearch(new URLSearchParams(location.search)); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const navigate = useCallback((values: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    const url = `${location.pathname}${next.size ? '?' + next.toString() : ''}`;
    history[replace ? 'replaceState' : 'pushState'](null, '', url); setSearch(next);
  }, []);
  return { search, navigate };
}
