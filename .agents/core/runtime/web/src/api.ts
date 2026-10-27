import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRemoteCache } from './remote-cache';
import { useWindowContext } from './window-context';
export const remoteCache = createRemoteCache();
export function useRemote<T>(path: string | null, pages = 1, collection?: 'records' | 'turns') {
  const { enabled } = useWindowContext();
  const [, render] = useState(0);
  const urls = useMemo(() => path ? Array.from({ length: collection ? pages : 1 }, (_, i) => {
    const url = new URL(path, location.origin);
    if (collection) { url.searchParams.set('offset', String(i * 30)); url.searchParams.set('limit', '30'); }
    url.searchParams.sort(); return url.toString();
  }) : [], [path, pages, collection]);
  const key = urls.join('\n'), refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!enabled) return;
    const list = key.split('\n').filter(Boolean), notify = () => render(v => v + 1);
    const off = list.map(url => remoteCache.subscribe(url, notify));
    const visible = () => { if (!document.hidden) for (const url of list) void remoteCache.refresh(url); };
    refreshRef.current = () => { for (const url of list) void remoteCache.refresh(url, true); };
    document.addEventListener('visibilitychange', visible);
    return () => { off.forEach(fn => fn()); document.removeEventListener('visibilitychange', visible); refreshRef.current = () => {}; };
  }, [key, enabled]);
  const entries = urls.map(url => remoteCache.read(url));
  const revision = entries.map(e => e.revision).join(',');
  const data = useMemo(() => {
    const first = entries[0]?.data ?? null;
    if (!first || !collection) return first;
    const seen = new Set<string>();
    return { ...first, nextOffset: entries.at(-1)?.data?.nextOffset ?? (entries.some(e => !e.data) ? 0 : null),
      [collection]: entries.flatMap(e => e.data?.[collection] ?? []).filter(item => { const id = collection === 'records' ? item.taskId : item.turnId; if (seen.has(id)) return false; seen.add(id); return true; }) };
  }, [key, collection, revision]);
  return { data: data as T | null, error: entries.find(e => e.error)?.error ?? null, loading: !!path && entries.some(e => !e.data && !e.error), refresh: useCallback(() => refreshRef.current(), []) };
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
