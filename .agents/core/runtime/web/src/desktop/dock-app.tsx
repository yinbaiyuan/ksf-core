import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function DockApp({ name, count, icon, onOpen, children }: { name: string; count: number; icon: ReactNode; onOpen: () => void; children: ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const dismiss = (restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const showMenu = () => {
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    setPosition({ left: Math.max(8, Math.min(bounds.left + bounds.width / 2 - 130, innerWidth - 268)), bottom: innerHeight - bounds.top + 8 });
  };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null);
    };
    const close = () => setPosition(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [position]);
  const menuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(true); return; }
    if (event.key === 'Tab') { dismiss(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus({ preventScroll: true });
  };
  return <>
    <button ref={trigger} className="dock-item" aria-label={`${name}，${count} 个窗口`} title={name} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? id : undefined}
      onClick={() => { dismiss(); onOpen(); }}
      onContextMenu={event => { event.preventDefault(); showMenu(); }}
      onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); showMenu(); } }}>
      {icon}<span className="dock-tooltip" hidden={!!position}>{name}</span><i className={count ? 'dock-running' : ''} />
    </button>
    {position && createPortal(<div ref={menu} id={id} className="dock-context-menu" role="menu" aria-label={`${name}窗口操作`} style={position} onKeyDown={menuKey}
      onContextMenu={event => event.preventDefault()} onClick={event => { if ((event.target as HTMLElement).closest('[role="menuitem"]')) dismiss(true); }}>
      <h3>{name}<span>{count} 个窗口</span></h3>{children}
    </div>, document.body)}
  </>;
}
