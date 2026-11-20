import {useElementRef} from './primitives/state';
import {forwardRef, useEffect, useId, useRef, useState, type HTMLAttributes} from 'react';
import {MenuFeedback, MenuPopup, useActionMenu} from './actions/menu';
import type {MenuItem} from './actions/menu-types';
export type {MenuItem, MenuCommand, MenuSeparator} from './actions/menu-types';
export interface MenubarMenu {id: string; label: string; disabled?: boolean; items: readonly MenuItem[]}
export interface MenubarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label'> {label: string; menus: readonly MenubarMenu[]}
export const Menubar = forwardRef<HTMLDivElement, MenubarProps>(function Menubar({label, menus, className = '', onKeyDown, ...props}, ref) {
  const [root,assign] = useElementRef(ref), buttons = useRef(new Map<number, HTMLButtonElement>()), prefix = useId(), menu = useActionMenu();
  const openedByHover = useRef(false);
  const [active, setActive] = useState(0), enabled = menus.map((item, index) => item.disabled ? -1 : index).filter(i => i >= 0);
  const current = menu.opening ? menus.findIndex(item => item.id === menu.opening?.key) : -1;
  const focus = (index: number) => {setActive(index); buttons.current.get(index)?.focus();};
  const show = (index: number, first: 'first' | 'last' = 'first', hover = false) => {const anchor = buttons.current.get(index); if (anchor && !menus[index].disabled) {openedByHover.current = hover; setActive(index); menu.show({anchor, owner: root.current ?? undefined, key: menus[index].id, focus: first});}};
  const next = (index: number, delta: number) => enabled[(Math.max(0, enabled.indexOf(index)) + delta + enabled.length) % enabled.length];
  useEffect(() => {if (menu.opening && (current < 0 || menus[current].disabled)) menu.close(false);}, [menus, current]);
  const retained=menu.present?menus.findIndex(item=>item.id===menu.present?.key):-1;
  const tabIndex = enabled.includes(active) ? active : enabled[0];
  return <>
    <div {...props} role="menubar" aria-label={label} aria-orientation="horizontal" className={`ksf-menubar ${className}`.trim()}
      ref={assign}
      onKeyDown={event => {onKeyDown?.(event); if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !root.current?.contains(event.target as Node) || !enabled.length) return;
        const index = menus.findIndex((_, i) => buttons.current.get(i) === root.current?.ownerDocument.activeElement);
        if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {event.preventDefault(); const target = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)! : next(index, event.key === 'ArrowLeft' ? -1 : 1); if (menu.opening) show(target); else focus(target);}
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); show(index >= 0 ? index : tabIndex, event.key === 'ArrowUp' ? 'last' : 'first');}
      }}>
      {menus.map((item, index) => <button type="button" role="menuitem" key={item.id} disabled={item.disabled} aria-haspopup="menu" aria-expanded={current === index}
        aria-controls={current === index ? `${prefix}-${index}` : undefined} tabIndex={index === tabIndex ? 0 : -1}
        ref={element => {if (element) buttons.current.set(index, element); else buttons.current.delete(index);}}
        onFocus={() => setActive(index)} onPointerEnter={() => {if (menu.opening && !item.disabled && current !== index) show(index, 'first', true);}}
        onClick={() => current === index && !openedByHover.current ? menu.close(true) : show(index)}>{item.label}</button>)}
      {retained >= 0 && menu.present && <MenuPopup opening={menu.present} exiting={menu.exiting} menuId={`${prefix}-${retained}`} label={menus[retained].label} items={menus[retained].items}
        fallback={root.current} close={menu.close} select={menu.select} tab={menu.tab} navigateRoot={delta => show(next(current, delta))}/>}
    </div>
    <MenuFeedback error={menu.error}/>
  </>;
});
