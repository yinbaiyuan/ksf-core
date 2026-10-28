import {useSurfaceScope} from './surface-context';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsRight, LoaderCircle, type LucideIcon } from 'lucide-react';
import { useWindowContext, type WindowObject } from './window-context';
import { toolbarLayout } from './window-toolbar-model';
import './window-toolbar.css';
export interface WindowAction {
  id: string; label: string; icon: LucideIcon; shortcut?: string; badge?: number | string;
  disabled?: boolean; busy?: boolean; pressed?: boolean; priority?: number; onAction: () => void;
}
export interface WindowToolbarProps { object?:WindowObject; navigation?: ReactNode; actions: WindowAction[]; label?: string }
export function WindowToolbar({ object, navigation, actions, label = '应用快捷操作' }: WindowToolbarProps) {
  const scope=useSurfaceScope(),context = useWindowContext(), host = context.toolbarHost;
  useEffect(()=>{context.setObject?.(object??null);},[context.setObject,object?.title,object?.detail]);
  const root = useRef<HTMLDivElement>(null), nav = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0), [navigationWidth, setNavigationWidth] = useState(160), [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    if (!root.current) return;
    const measure = () => { setWidth(root.current?.clientWidth ?? 0); setNavigationWidth(nav.current?.scrollWidth ?? 160); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(root.current); if (nav.current) observer.observe(nav.current);
    return () => observer.disconnect();
  }, [host]);
  const layout = toolbarLayout(actions, width, navigationWidth), overflow = actions.filter(action => layout.overflow.includes(action.id));
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus(); };
  useEffect(() => { if (!context.enabled || !context.active || !overflow.length) setOpen(false); }, [context.enabled, context.active, overflow.length]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const invoke = (action: WindowAction) => { close(true); action.onAction(); };
  const content = <div ref={root} className={`ksf-sdk-surface ${scope} window-toolbar ${layout.labels ? 'with-labels' : 'icons-only'}`} role="toolbar" aria-label={label}>
    <div ref={nav} className="window-navigation">{navigation}</div><div className="window-actions">
      {actions.filter(action => layout.visible.includes(action.id)).map(action => <button key={action.id} type="button" className="window-command" title={`${action.label}${action.shortcut ? `（${action.shortcut}）` : ''}`} aria-label={action.label} aria-keyshortcuts={action.shortcut} aria-pressed={action.pressed} disabled={action.disabled || action.busy} aria-busy={action.busy || undefined} onClick={() => { setOpen(false); action.onAction(); }}>{action.busy ? <LoaderCircle size={16} className="toolbar-spin" /> : <action.icon size={16} />}<span className="command-label">{action.label}</span>{action.badge !== undefined && action.badge !== 0 && <small className="command-badge">{action.badge}</small>}</button>)}
      {!!overflow.length && <div className="window-overflow"><button ref={trigger} type="button" className="window-command" aria-label="更多应用操作" title="更多应用操作" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><ChevronsRight size={18} /><span className="command-label">更多</span></button>{open && <div ref={menu} className="window-command-menu" role="menu" aria-label="更多应用操作" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === 'Tab') close();
        const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
      }}>{overflow.map(action => <button key={action.id} type="button" role="menuitem" disabled={action.disabled || action.busy} aria-busy={action.busy || undefined} onClick={() => invoke(action)}>{action.busy ? <LoaderCircle size={16} className="toolbar-spin" /> : <action.icon size={16} />}<span>{action.label}</span>{action.badge !== undefined && action.badge !== 0 && <small>{action.badge}</small>}{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>)}</div>}</div>}
    </div>
  </div>;
  return host ? createPortal(content, host) : context.id === 'standalone' ? content : null;
}
