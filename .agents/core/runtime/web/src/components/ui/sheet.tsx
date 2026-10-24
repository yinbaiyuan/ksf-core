import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from './button';
import type { ReactNode } from 'react';
export function Sheet({ open, onOpenChange, title, description, children, side = 'right' }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode; side?: 'left' | 'right' }) {
  // The workbench owns its scroll containers. Avoid the optional Overlay scroll-lock
  // implementation, which injects a style element incompatible with our strict CSP.
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><div className="sheet-overlay" aria-hidden="true" onPointerDown={() => onOpenChange(false)} /><Dialog.Content className={`sheet sheet-${side}`} onCloseAutoFocus={event => { event.preventDefault(); const trigger = document.querySelector<HTMLElement>('[data-detail-origin="true"]'); trigger?.focus(); }}>
    <div className="sheet-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={description ? 'sheet-description' : 'sr-only'}>{description ?? '查看所选内容的详细信息，按 Escape 关闭。'}</Dialog.Description></div><Dialog.Close asChild><Button size="icon" aria-label="关闭详情"><X size={18} /></Button></Dialog.Close></div>
    <div className="sheet-body">{children}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
