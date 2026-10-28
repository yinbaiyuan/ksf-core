import {createPortal} from 'react-dom';
import {suspendWindowContent,focusableElements} from '../../overlay-boundary';
import './sheet.css';
import {useSurfaceScope} from '../../surface-context';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from './button';
import { GlassSurface } from '../glass-surface';
import { useId, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { overlays } from '../../overlay-coordinator';
import { useWindowContext } from '../../window-context';
import { useMaterialStyle } from '../material-provider';
export type SheetProps = { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode; side?: 'left' | 'right'; className?: string; solid?: boolean; modal?: boolean; showClose?: boolean; showHeader?: boolean; style?: CSSProperties; presentation?: 'drawer' | 'dialog' };
export function Sheet({ open, onOpenChange, title, description, children, side = 'right', className = '', solid = false, modal = true, showClose = true, showHeader = true, style, presentation = 'drawer' }: SheetProps) {
  const scope=useSurfaceScope();
  const materialStyle = useMaterialStyle(), instance = useWindowContext(), coordinator = instance.overlays ?? overlays;
  const solidSurface = solid || instance.id !== 'standalone';
  const token = useRef(Symbol('sheet')), trigger = useRef<HTMLElement | null>(null), closeRef = useRef(onOpenChange);
  closeRef.current = onOpenChange;
  useLayoutEffect(() => {
    if (!open || instance.overlayHost) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const menu = trigger.current?.closest('details.os-menu');
    if (menu) trigger.current = menu.querySelector<HTMLElement>('summary');
    if (modal) coordinator.claim(token.current, instance.id, () => closeRef.current(false));
    return () => coordinator.release(token.current);
  }, [open, modal, instance.id]);
  if(instance.overlayHost && instance.contentHost) return <WindowSheet {...{open,onOpenChange,title,description,children,side,className,modal,showClose,showHeader,style,presentation,scope,materialStyle}}/>;
  // The workbench owns its scroll containers. Avoid the optional Overlay scroll-lock
  // implementation, which injects a style element incompatible with our strict CSP.
  return <Dialog.Root modal={modal} open={open} onOpenChange={onOpenChange}><Dialog.Portal>{modal && <div className={`ksf-sdk-surface ${scope} sheet-overlay ${solidSurface ? 'sheet-overlay-solid' : ''}`} aria-hidden="true" onPointerDown={() => onOpenChange(false)} />}<Dialog.Content data-overlay-owner={instance.id} onInteractOutside={event => { if (!modal) event.preventDefault(); }} style={{ ...materialStyle, ...style }} className={`ksf-sdk-surface ${scope} sheet sheet-${side} ${solidSurface ? 'sheet-solid' : ''} ${className}`} onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); else (instance.root?.current?.querySelector<HTMLElement>('button') ?? document.querySelector<HTMLElement>('.ksf-system-trigger'))?.focus({ preventScroll: true }); }}>
    {!solidSurface && <GlassSurface mode="frost" profile="drawer" />}<div className={showHeader ? 'sheet-heading' : 'sr-only'}><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={description ? 'sheet-description' : 'sr-only'}>{description ?? '查看所选内容的详细信息，按 Escape 关闭。'}</Dialog.Description></div>{showHeader && showClose && <Dialog.Close asChild><Button size="icon" aria-label="关闭详情"><X size={18} /></Button></Dialog.Close>}</div>
    <div className="sheet-body">{children}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

/** App-modal, not page-modal: other windows, Dock and title-bar controls remain usable. */
function WindowSheet({open,onOpenChange,title,description,children,side,className,modal,showClose,showHeader,style,presentation,scope,materialStyle}:SheetProps & {scope:string;materialStyle:CSSProperties}) {
  const instance=useWindowContext(), panel=useRef<HTMLDivElement>(null), token=useRef(Symbol('window-sheet')), trigger=useRef<HTMLElement|null>(null), current=useRef({instance,onOpenChange});
  current.current={instance,onOpenChange};const id=instance.id+useId();
  // Capture before React commits descendant autoFocus inputs into the portal.
  const opener=useMemo(()=>open&&document.activeElement instanceof HTMLElement&&instance.root?.current?.contains(document.activeElement)?document.activeElement:null,[open,instance.id]);
  useLayoutEffect(()=>{
    if(!open)return;
    const element=panel.current, owner=instance.root?.current, content=instance.contentHost!, coordinator=instance.overlays??overlays;
    trigger.current=opener;
    const summary=trigger.current?.closest('details.os-menu')?.querySelector<HTMLElement>('summary');if(summary)trigger.current=summary;
    if(modal)coordinator.claim(token.current,instance.id,()=>current.current.onOpenChange(false));
    const restore=modal?suspendWindowContent(content):()=>{};
    if(instance.active&&instance.enabled){const target=panel.current;if(target&&!target.contains(document.activeElement))(focusableElements(target)[0]??target).focus({preventScroll:true});}
    // Escape is local to the active owner. No document-wide dismissal/focus trap.
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing&&current.current.instance.active&&current.current.instance.enabled){event.preventDefault();event.stopPropagation();current.current.onOpenChange(false);}};
    owner?.addEventListener('keydown',key);
    return()=>{const focus=document.activeElement,hadFocus=!!element?.contains(focus)||focus===document.body;owner?.removeEventListener('keydown',key);restore();coordinator.release(token.current);
      if(hadFocus&&current.current.instance.active&&current.current.instance.enabled&&trigger.current?.isConnected&&!trigger.current.closest('[inert]'))trigger.current.focus({preventScroll:true});};
  },[open,instance.id,instance.overlayHost,instance.contentHost,modal]);
  if(!open)return null;
  return createPortal(<>{modal&&<div className={`ksf-sdk-surface ${scope} sheet-overlay sheet-overlay-solid ksf-window-sheet-overlay`} data-overlay-owner={instance.id} aria-hidden="true" onPointerDown={()=>onOpenChange(false)}/>}
    <div ref={panel} role="dialog" tabIndex={-1} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-overlay-owner={instance.id} data-sheet-scope="window" data-presentation={presentation} style={{...materialStyle,...style}} className={`ksf-sdk-surface ${scope} sheet sheet-${side} sheet-solid ${className} ksf-window-sheet`} onKeyDown={event=>{
      if(event.key!=='Tab'||!modal)return;const elements=focusableElements(event.currentTarget),first=elements[0],last=elements.at(-1);if(!first){event.preventDefault();event.currentTarget.focus();}else if(event.shiftKey&&(document.activeElement===first||document.activeElement===event.currentTarget)){event.preventDefault();last!.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===event.currentTarget)){event.preventDefault();first.focus();}
    }}>
      <div className={showHeader?'sheet-heading':'sheet-heading sr-only'}><div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`} className={description?'sheet-description':'sr-only'}>{description??'查看所选内容的详细信息，按 Escape 关闭。'}</p></div>{showHeader&&showClose&&<Button size="icon" aria-label="关闭详情" onClick={()=>onOpenChange(false)}><X size={18}/></Button>}</div>
      <div className="sheet-body">{children}</div>
    </div></>,instance.overlayHost!);
}
