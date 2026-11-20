import {useElementRef} from './primitives/state';
import {forwardRef, useEffect, useId, useRef, type HTMLAttributes} from 'react';
import {MenuFeedback, MenuPopup, useActionMenu} from './actions/menu';
import type {MenuItem} from './actions/menu-types';
export type {MenuItem, MenuCommand, MenuSeparator} from './actions/menu-types';
export interface ContextMenuProps extends HTMLAttributes<HTMLDivElement> {label: string; items: readonly MenuItem[]; disabled?: boolean}
export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  {label, items, disabled, children, className = '', onContextMenu, onKeyDown, onPointerDown, role = 'group', tabIndex = 0, ...props}, ref,
) {
  const [owner,assign] = useElementRef(ref), id = useId(), menu = useActionMenu();
  useEffect(() => {if (disabled) menu.close(false);}, [disabled]);
  return <div {...props} role={role} aria-label={props['aria-label'] ?? label} className={`ksf-context-target ${className}`.trim()} tabIndex={tabIndex}
    aria-haspopup={disabled ? undefined : 'menu'} aria-expanded={!!menu.opening} aria-controls={menu.opening ? id : undefined}
    ref={assign}
    onContextMenu={event => {onContextMenu?.(event); if (disabled || event.defaultPrevented || !owner.current) return; event.preventDefault(); event.stopPropagation(); menu.show({anchor: owner.current, point: {x: event.clientX, y: event.clientY}, focus: 'first'});}}
    onPointerDown={event => {onPointerDown?.(event); if (event.button === 0 && menu.opening && !(event.target as Element).closest('[role="menu"]') && owner.current?.contains(event.target as Node)) menu.close(false);}}
    onKeyDown={event => {onKeyDown?.(event); if (disabled || event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !owner.current) return;
      if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {event.preventDefault(); event.stopPropagation(); menu.show({anchor: owner.current, focus: 'first'});}
    }}>
    {children}
    {menu.present && !disabled && <MenuPopup opening={menu.present} exiting={menu.exiting} menuId={id} label={label} items={items} fallback={owner.current} close={menu.close} select={menu.select} tab={menu.tab}/>}
    <MenuFeedback error={menu.error}/>
  </div>;
});
