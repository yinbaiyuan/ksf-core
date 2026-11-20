import {forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {Button} from '../button';
import {Dialog} from '../dialog';
import {Popover} from '../popover';
import {TextField} from '../text-field';
import {Kbd} from '../kbd';
import {useElementRef, useValue} from '../primitives/state';
import {useWindowContext} from '../window-context';
import './navigation.css';

export interface CommandItem {id: string; label: string; description?: string; group?: string; shortcut?: string; disabled?: boolean}
export interface CommandPaletteProps {
  open: boolean; onOpenChange: (open: boolean) => void; label: string; items: readonly CommandItem[];
  onAction: (id: string) => void | Promise<void>; placeholder?: string;
}
export const CommandPalette = forwardRef<HTMLDivElement, CommandPaletteProps>(function CommandPalette({open, onOpenChange, label, items, onAction, placeholder = '搜索命令…'}, ref) {
  const [query, setQuery] = useState(''), [active, setActive] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null), uid = useId(), alive = useRef(true), run = useRef(false), generation = useRef(0);
  useEffect(() => {alive.current = true; return () => {alive.current = false; generation.current++;};}, []);
  useEffect(() => {generation.current++; run.current = false; setBusy(false); if (open) {setQuery(''); setActive(0); setError('');}}, [open]);
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const found = items.filter(item => words.every(word => `${item.label} ${item.description ?? ''} ${item.group ?? ''}`.toLocaleLowerCase().includes(word)));
  const enabled = found.filter(item => !item.disabled), chosen = enabled[Math.min(active, enabled.length - 1)];
  const invoke = async (item: CommandItem) => {
    if (run.current || item.disabled) return;
    const token = generation.current; run.current = true; setBusy(true); setError('');
    try {await onAction(item.id); if (alive.current && generation.current === token) onOpenChange(false);}
    catch (error) {if (alive.current && generation.current === token) setError(error instanceof Error ? error.message : '命令执行失败，请重试。');}
    finally {if (alive.current && generation.current === token) {run.current = false; setBusy(false);}}
  };
  return <Dialog ref={ref} open={open} onClose={() => {if (run.current) return false; onOpenChange(false);}} title={label} footer={false} width={560} initialFocus={input}>
    <div className="ksf-command-palette" aria-busy={busy}>
      <TextField ref={input} aria-label={placeholder} placeholder={placeholder} value={query} disabled={busy} onValueChange={text => {setQuery(text); setActive(0);}} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={`${uid}-list`} aria-activedescendant={chosen ? `${uid}-${chosen.id}` : undefined}
        onKeyDown={event => {if (event.nativeEvent.isComposing || busy) return; if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); setActive(index => enabled.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length : 0);} if (event.key === 'Enter' && chosen) {event.preventDefault(); void invoke(chosen);}}}/>
      <div id={`${uid}-list`} role="listbox" aria-label="匹配的命令">{found.map((item, index) => <div key={item.id}>
        {item.group && (index === 0 || found[index - 1].group !== item.group) && <small className="ksf-command-group">{item.group}</small>}
        <button id={`${uid}-${item.id}`} type="button" role="option" aria-selected={chosen?.id === item.id} disabled={item.disabled || busy} onPointerMove={() => {const at = enabled.findIndex(value => value.id === item.id); if (at >= 0) setActive(at);}} onClick={() => {void invoke(item);}}><span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>{item.shortcut && <Kbd>{item.shortcut}</Kbd>}</button>
      </div>)}{!found.length && <p role="status">没有匹配命令</p>}</div>
      {error && <p role="alert">{error}</p>}<small>↑ ↓ 选择 · Enter执行 · Escape关闭{busy ? ' · 正在执行' : ''}</small>
    </div>
  </Dialog>;
});

export interface RadialMenuItem {id: string; label: string; icon?: ReactNode; disabled?: boolean}
export interface RadialMenuProps {label: string; items: readonly RadialMenuItem[]; onAction: (id: string) => void; disabled?: boolean}
export const RadialMenu = forwardRef<HTMLButtonElement, RadialMenuProps>(function RadialMenu({label, items, onAction, disabled = false}, ref) {
  const context = useWindowContext();
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<string | null>(null);
  const origin = useRef<{x: number; y: number} | null>(null), hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), held = useRef(false), suppress = useRef(-Infinity), current = useRef<string | null>(null);
  const [trigger, assign] = useElementRef(ref), content = useRef<HTMLDivElement>(null), keyboard = useRef(false);
  const cancel = () => {clearTimeout(hold.current); origin.current = null; held.current = false; current.current = null; setSelected(null);};
  useEffect(() => {if (disabled || !context.active || !context.enabled) {cancel(); setOpen(false);}}, [disabled, context.active, context.enabled]);
  useEffect(() => {const stop = () => {cancel(); setOpen(false);}; const view = trigger.current?.ownerDocument.defaultView; view?.addEventListener('blur', stop); return () => {clearTimeout(hold.current); view?.removeEventListener('blur', stop);};}, []);
  useLayoutEffect(() => {if (open && keyboard.current) content.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}, [open]);
  const choose = (id: string) => {if (disabled || items.find(item => item.id === id)?.disabled) return; setOpen(false); cancel(); onAction(id);};
  return <Popover trigger="click" label={label} open={open && !disabled} onOpenChange={next => {setOpen(next); if (!next) cancel();}} placement="bottom" content={<div ref={node => {content.current = node; if (node && keyboard.current) {keyboard.current = false; node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}}} className="ksf-radial-menu" role="menu" aria-label={label} onKeyDown={event => {if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); keyboard.current = false; cancel(); setOpen(false); trigger.current?.focus(); return;} if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return; event.preventDefault(); const buttons = Array.from(content.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []), at = buttons.indexOf(event.target as HTMLButtonElement); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length]?.focus();}}>
    <span className="ksf-radial-center" aria-hidden="true">＋</span>{items.map((item, index) => {const angle = -Math.PI / 2 + index / Math.max(1, items.length) * Math.PI * 2; return <button key={item.id} type="button" role="menuitem" disabled={item.disabled} data-selected={selected === item.id} style={{left: 110 + Math.cos(angle) * 76, top: 110 + Math.sin(angle) * 76}} onClick={() => choose(item.id)}>{item.icon}<span>{item.label}</span></button>;})}
  </div>}><Button ref={assign} disabled={disabled} aria-haspopup="menu" onPointerDown={event => {if (event.button !== 0) return; keyboard.current = false; origin.current = {x: event.clientX, y: event.clientY}; held.current = false; hold.current = setTimeout(() => {held.current = true; setOpen(true);}, 180); event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event => {if (!origin.current) return; const x = event.clientX - origin.current.x, y = event.clientY - origin.current.y; if (!held.current && Math.hypot(x,y) > 22) {clearTimeout(hold.current); held.current = true; setOpen(true);} if (!held.current) return; const angle = (Math.atan2(y,x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI); const item = Math.hypot(x,y) > 22 ? items[Math.round(angle / (2 * Math.PI) * items.length) % items.length] : null; current.current = item && !item.disabled ? item.id : null; setSelected(current.current);}}
      onPointerUp={event => {clearTimeout(hold.current); if (held.current) {suppress.current = event.timeStamp; const id = current.current; if (id) choose(id); else setOpen(false);} origin.current = null;}}
      onPointerCancel={() => {cancel(); setOpen(false);}} onClick={event => {if (event.detail !== 0 && event.timeStamp - suppress.current < 160) event.preventDefault(); suppress.current = -Infinity;}} onKeyDown={event => {if (event.key === 'ArrowDown') {event.preventDefault(); keyboard.current = true; setOpen(true);} if (event.key === 'Escape') {cancel(); setOpen(false);}}}>{label}</Button></Popover>;
});

export interface MorphNavigationItem {id: string; label: string; icon?: ReactNode; disabled?: boolean}
export interface MorphNavigationProps {label: string; items: readonly MorphNavigationItem[]; value?: string; defaultValue?: string; onValueChange?: (id: string) => void}
export const MorphNavigation = forwardRef<HTMLElement, MorphNavigationProps>(function MorphNavigation({label, items, value, defaultValue, onValueChange}, ref) {
  const [selected, setSelected] = useValue(value, defaultValue ?? items.find(item => !item.disabled)?.id ?? '', onValueChange);
  const [node, assign] = useElementRef(ref), [indicator, setIndicator] = useState({left: 0, width: 0});
  useLayoutEffect(() => {
    const root = node.current; if (!root) return;
    const update = () => {const item = root.querySelector<HTMLElement>('[aria-current="page"]'); if (item) setIndicator({left: item.offsetLeft, width: item.offsetWidth});}; update();
    const observer = new ResizeObserver(update); observer.observe(root); for (const child of Array.from(root.children)) observer.observe(child); return () => observer.disconnect();
  }, [selected, items]);
  return <nav ref={assign} className="ksf-morph-navigation" aria-label={label}><span className="ksf-morph-nav-indicator" aria-hidden="true" style={{transform: `translateX(${indicator.left}px)`, width: indicator.width}}/>{items.map(item => <button type="button" key={item.id} disabled={item.disabled} aria-label={item.label} aria-current={selected === item.id ? 'page' : undefined} onClick={() => setSelected(item.id)} onKeyDown={event => {if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const enabled = items.filter(item => !item.disabled), at = enabled.findIndex(value => value.id === item.id), next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(at + (event.key === 'ArrowLeft' ? -1 : 1) + enabled.length) % enabled.length]; if (next) {setSelected(next.id); const buttons = Array.from(node.current?.querySelectorAll<HTMLButtonElement>('button') ?? []); buttons[items.findIndex(item => item.id === next.id) ]?.focus();}}}>{item.icon ?? <span aria-hidden="true">◈</span>}<span className="ksf-morph-nav-label">{item.label}</span></button>)}</nav>;
});
