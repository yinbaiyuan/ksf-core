import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from './button';
import { GlassSurface } from '../glass-surface';
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { overlays } from '../../overlay-coordinator';
import { useWindowContext } from '../../window-context';
import { useMaterialStyle } from '../material-provider';
export function Sheet({ open, onOpenChange, title, description, children, side = 'right', className = '', solid = false, modal = true, showClose = true, showHeader = true, style }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode; side?: 'left' | 'right'; className?: string; solid?: boolean; modal?: boolean; showClose?: boolean; showHeader?: boolean; style?: CSSProperties }) {
  const materialStyle = useMaterialStyle(), instance = useWindowContext();
  const solidSurface = solid || instance.id !== 'standalone';
  const token = useRef(Symbol('sheet')), trigger = useRef<HTMLElement | null>(null), closeRef = useRef(onOpenChange);
  closeRef.current = onOpenChange;
  useLayoutEffect(() => {
    if (!open) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const menu = trigger.current?.closest('details.os-menu');
    if (menu) trigger.current = menu.querySelector<HTMLElement>('summary');
    if (modal) overlays.claim(token.current, instance.id, () => closeRef.current(false));
    return () => overlays.release(token.current);
  }, [open, modal, instance.id]);
  // The workbench owns its scroll containers. Avoid the optional Overlay scroll-lock
  // implementation, which injects a style element incompatible with our strict CSP.
  return <Dialog.Root modal={modal} open={open} onOpenChange={onOpenChange}><Dialog.Portal>{modal && <div className={`sheet-overlay ${solidSurface ? 'sheet-overlay-solid' : ''}`} aria-hidden="true" onPointerDown={() => onOpenChange(false)} />}<Dialog.Content data-overlay-owner={instance.id} onInteractOutside={event => { if (!modal) event.preventDefault(); }} style={{ ...materialStyle, ...style }} className={`sheet sheet-${side} ${solidSurface ? 'sheet-solid' : ''} ${className}`} onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); else (instance.root?.current?.querySelector<HTMLElement>('button') ?? document.querySelector<HTMLElement>('.ksf-system-trigger'))?.focus({ preventScroll: true }); }}>
    {!solidSurface && <GlassSurface mode="frost" profile="drawer" />}<div className={showHeader ? 'sheet-heading' : 'sr-only'}><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={description ? 'sheet-description' : 'sr-only'}>{description ?? '查看所选内容的详细信息，按 Escape 关闭。'}</Dialog.Description></div>{showHeader && showClose && <Dialog.Close asChild><Button size="icon" aria-label="关闭详情"><X size={18} /></Button></Dialog.Close>}</div>
    <div className="sheet-body">{children}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
