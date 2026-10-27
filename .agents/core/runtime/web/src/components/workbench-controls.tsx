import { useEffect, useRef, useState } from 'react';
import { remoteCache } from '../api';
import { useWindowContext } from '../window-context';

import type { TaskList, TaskTarget } from '../types';
import { clamp, highlightParts } from '../workbench-model';
export function Highlight({ text, query }: { text: string; query: string }) { return <>{highlightParts(text, query).map((p, i) => p.match ? <mark key={i}>{p.text}</mark> : p.text)}</>; }
export function PaneResize({ name, value, min, max, onChange, onCommit, defaultValue }: { name: string; value: number; min: number; max: number; onChange: (v: number) => void; onCommit?:(v:number)=>void; defaultValue?:number }) {
  const drag = useRef<{ x: number; value: number } | null>(null);
  const latest=useRef(value);latest.current=value;
  const change=(next:number)=>{latest.current=next;onChange(next);};
  const finish=(cancel=false)=>{if(!drag.current)return;const original=drag.current.value;drag.current=null;if(cancel)change(original);else onCommit?.(latest.current);};
  return <div className="pane-resize" role="separator" aria-label={`调整${name}宽度`} title={`拖动调整${name}宽度；方向键微调，Shift 加速${defaultValue===undefined?'':'，双击恢复默认'}`} aria-orientation="vertical" aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
    onPointerDown={e => { if (e.button !== 0) return; drag.current = { x: e.clientX, value }; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus(); }}
    onPointerMove={e => { if (drag.current) change(clamp(drag.current.value + e.clientX - drag.current.x, min, max)); }}
    onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()}
    onDoubleClick={defaultValue===undefined?undefined:()=>{const next=clamp(defaultValue,min,max);change(next);onCommit?.(next);}}
    onKeyDown={e => { if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopPropagation();finish(true);return;}const next = e.key === 'ArrowLeft' ? value - (e.shiftKey ? 32 : 8) : e.key === 'ArrowRight' ? value + (e.shiftKey ? 32 : 8) : e.key === 'Home' ? min : e.key === 'End' ? max : null; if (next != null) { e.preventDefault();const clamped=clamp(next,min,max);change(clamped);onCommit?.(clamped); } }}><span /></div>;
}
export function useTargetSearch(targets: TaskTarget[], query: string) {
  const { enabled } = useWindowContext(), [, redraw] = useState(0);
  const urls = query ? targets.map(t => { const url = new URL('/api/tasks', location.origin); url.searchParams.set('target', t.key); url.searchParams.set('q', query); url.searchParams.set('limit', '30'); url.searchParams.set('offset', '0'); url.searchParams.sort(); return { key: t.key, url: url.toString() }; }) : [];
  const signature = urls.map(v => v.url).join('\n');
  useEffect(() => {
    if (!enabled) return;
    const list = signature.split('\n').filter(Boolean), off = list.map(url => remoteCache.subscribe(url, () => redraw(v => v + 1)));
    const visible = () => { if (!document.hidden) for (const url of list) void remoteCache.refresh(url); };
    document.addEventListener('visibilitychange', visible);
    return () => { off.forEach(fn => fn()); document.removeEventListener('visibilitychange', visible); };
  }, [signature, enabled]);
  const groups = new Map<string, TaskList>(), errors = new Set<string>(); let loading = false;
  for (const item of urls) { const value = remoteCache.read(item.url); if (value.data) groups.set(item.key, value.data); if (value.error) errors.add(value.error); if (!value.data && !value.error) loading = true; }
  return { groups, loading, errors: [...errors] };
}
