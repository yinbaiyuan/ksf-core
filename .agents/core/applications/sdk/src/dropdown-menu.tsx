import type {FloatingPlacement} from './primitives/position-model';
import {useElementRef} from './primitives/state';
import {forwardRef, useEffect, useId, useRef, type ReactNode} from 'react';
import {Button, type ButtonProps, type ButtonVariant} from './button';
import {useWindowContext} from './window-context';
import {MenuFeedback, MenuPopup, useActionMenu} from './actions/menu';
import type {MenuItem} from './actions/menu-types';
export type {MenuItem, MenuCommand, MenuSeparator} from './actions/menu-types';
export interface DropdownMenuProps {
  label: string; items: readonly MenuItem[]; trigger?: ReactNode; disabled?: boolean; variant?: ButtonVariant; className?: string;
  placement?:FloatingPlacement;arrow?:boolean;triggerMode?:'click'|'hover';
  triggerProps?: Omit<ButtonProps, 'children' | 'onClick' | 'disabled' | 'type' | 'aria-haspopup' | 'aria-expanded' | 'aria-controls'>;
}
export const DropdownMenu = forwardRef<HTMLButtonElement, DropdownMenuProps>(function DropdownMenu(
  {label, items, trigger, disabled, variant, className = '', triggerProps,placement='bottom-start',arrow=false,triggerMode='hover'}, ref,
) {
  const context=useWindowContext(),unavailable=disabled||!context.active||!context.enabled;
  const owner=useRef<HTMLDivElement>(null),[button,assign]=useElementRef(ref),id=useId(),menu=useActionMenu(),hoverTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),latest=useRef({menu,disabled:unavailable,placement,arrow});latest.current={menu,disabled:unavailable,placement,arrow};
  const keep=()=>{clearTimeout(hoverTimer.current);hoverTimer.current=undefined;};
  const leave=()=>{if(triggerMode==='hover'){keep();hoverTimer.current=setTimeout(()=>{hoverTimer.current=undefined;latest.current.menu.close(false);},100);}};
  const enter=()=>{keep();if(triggerMode==='hover'&&!unavailable&&!menu.opening)hoverTimer.current=setTimeout(()=>{hoverTimer.current=undefined;const state=latest.current;if(!state.disabled&&button.current)state.menu.show({anchor:button.current,focus:'none',placement:state.placement,arrow:state.arrow});},150);};
  useEffect(()=>()=>keep(),[]);
  useEffect(() => {if (unavailable){keep();menu.close(false);}}, [unavailable]);
  return <div ref={owner} className={`ksf-menu-owner ${className}`.trim()} onPointerEnter={event=>{if(event.pointerType!=='touch')enter();}} onPointerLeave={leave}>
    <Button {...triggerProps} type="button" variant={variant} disabled={unavailable} aria-label={label} aria-haspopup="menu" aria-expanded={!!menu.opening} aria-controls={menu.opening ? id : undefined}
      ref={assign}
      onClick={() => {keep();if (menu.opening&&triggerMode==='click') menu.close(true); else if (button.current) menu.show({anchor: button.current, focus: 'first',placement,arrow});}}
      onKeyDown={event => {triggerProps?.onKeyDown?.(event); if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); if (button.current) menu.show({anchor: button.current, focus: event.key === 'ArrowUp' ? 'last' : 'first',placement,arrow});}
      }}>{trigger ?? label}</Button>
    {menu.present && !unavailable && <MenuPopup opening={menu.present} exiting={menu.exiting} label={label} menuId={id} items={items} fallback={owner.current} close={menu.close} select={menu.select} tab={menu.tab} onEnter={keep} onLeave={leave}/>}
    <MenuFeedback error={menu.error}/>
  </div>;
});
