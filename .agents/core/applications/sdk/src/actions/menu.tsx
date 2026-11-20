import {positionFloating,floatingLayoutBox,type FloatingPlacement} from '../primitives/position-model';
import {useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {useWindowContext} from '../window-context';
import {useSurfaceScope} from '../surface-context';
import {followTheme} from '../primitives/layer';
import {isMenuCommand, type MenuCommand, type MenuItem} from './menu-types';
import {menuIndex, menuMatch, placeMenu} from './menu-model';
import './menu.css';

export type MenuFocus = 'first' | 'last' | 'none';
interface Opening {anchor: HTMLElement; owner?: HTMLElement; point?: {x: number; y: number}; focus: MenuFocus; key?: string;placement?:FloatingPlacement;arrow?:boolean}
const focusElement = (element?: HTMLElement | null) => {if (element?.isConnected && !element.closest('[inert],[hidden]') && !element.matches(':disabled')) element.focus({preventScroll: true});};

export function useActionMenu() {
  const context=useWindowContext(),[opening,setOpening]=useState<Opening|null>(null),[present,setPresent]=useState<Opening|null>(null),[error,setError]=useState('');
  const live=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),current=useRef({opening,context});current.current={opening,context};
  const clear=()=>{clearTimeout(timer.current);timer.current=undefined;};
  useEffect(()=>{live.current=true;return()=>{live.current=false;clear();};},[]);
  useEffect(()=>{if(!context.active||!context.enabled){clear();setOpening(null);setPresent(null);}},[context.active,context.enabled]);
  const close=(focus=false)=>{const state=current.current;setOpening(null);clear();const doc=state.opening?.anchor.ownerDocument,reduce=doc?.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!state.context.active||!state.context.enabled||doc?.hidden||reduce)setPresent(null);else timer.current=setTimeout(()=>{timer.current=undefined;if(live.current)setPresent(null);},200);
    if(focus&&state.context.active&&state.context.enabled)focusElement(state.opening?.anchor);
  };
  const show=(value:Opening)=>{if(context.active&&context.enabled){clear();setError('');setPresent(value);setOpening(value);}};
  const select=(item:MenuCommand)=>{if(item.disabled||item.items||!current.current.context.active||!current.current.context.enabled)return;if(!item.keepOpen)close(true);try{Promise.resolve(item.onAction()).catch(issue=>{if(live.current)setError(issue instanceof Error?issue.message:String(issue));});}catch(issue){if(live.current)setError(issue instanceof Error?issue.message:String(issue));}};
  const tab=(backwards:boolean)=>{const anchor=current.current.opening?.anchor,boundary=context.root?.current??context.contentHost??anchor?.closest('.ksf-sdk-surface'),candidates=boundary?[...boundary.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')].filter(e=>e.tabIndex>=0&&!e.matches(':disabled')&&!e.closest('[inert],[hidden],[role="menu"]')&&e.getClientRects().length>0):[],at=anchor?candidates.indexOf(anchor):-1,next=candidates[at+(backwards?-1:1)];close(false);queueMicrotask(()=>{if(live.current&&current.current.context.active&&current.current.context.enabled)focusElement(next??anchor);});};
  useEffect(()=>{const doc=present?.anchor.ownerDocument;if(!doc)return;const media=doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)'),visibility=()=>{if(doc.hidden){clear();setOpening(null);setPresent(null);}else if(media?.matches&&!current.current.opening){clear();setPresent(null);}};doc.addEventListener('visibilitychange',visibility);media?.addEventListener('change',visibility);return()=>{doc.removeEventListener('visibilitychange',visibility);media?.removeEventListener('change',visibility);};},[present?.anchor,!!opening]);
  return {opening,present,exiting:!opening,show,close,select,tab,error};
}

export function MenuFeedback({error}: {error: string}) {return error ? <p className="ksf-menu-feedback" role="alert">{error}</p> : null;}

export function MenuPopup({opening, label, items, fallback, close, select, tab, navigateRoot, menuId,onEnter,onLeave,exiting=false}: {
  exiting?:boolean;menuId?: string; onEnter?:()=>void;onLeave?:()=>void;opening: Opening; label: string; items: readonly MenuItem[]; fallback: HTMLElement | null;
  close: (focus?: boolean) => void; select: (item: MenuCommand) => void; tab: (backwards: boolean) => void;
  navigateRoot?: (delta: number) => void;
}) {
  const context = useWindowContext(), roots = useRef(new Set<HTMLElement>());
  const host = context.overlayHost ?? context.contentHost ?? fallback?.closest<HTMLElement>('.ksf-sdk-surface') ?? context.root?.current ?? fallback;
  if (!host||!context.active||!context.enabled) return null;
  return <MenuLevel key={`${opening.key ?? 'root'}:${opening.point ? `${opening.point.x},${opening.point.y}` : 'anchor'}`} menuId={menuId} exiting={exiting} anchor={opening.anchor} owner={opening.owner} point={opening.point} initialFocus={opening.focus} placement={opening.placement} arrow={opening.arrow} onEnter={onEnter} onLeave={onLeave} label={label} items={items} host={host}
    roots={roots} closeLevel={close} closeAll={close} select={select} tab={tab} navigateRoot={navigateRoot}/>;
}

function MenuLevel({anchor, owner, point, initialFocus, label, items, host, roots, closeLevel, closeAll, select, tab, submenu = false, navigateRoot, menuId,placement,arrow=false,onEnter,onLeave,exiting=false}: {
  exiting?:boolean;menuId?: string;placement?:FloatingPlacement;arrow?:boolean;onEnter?:()=>void;onLeave?:()=>void;
  anchor: HTMLElement; owner?: HTMLElement; point?: {x: number; y: number}; initialFocus: MenuFocus;
  label: string; items: readonly MenuItem[]; host: HTMLElement; roots: RefObject<Set<HTMLElement>>;
  closeLevel: (focus?: boolean) => void; closeAll: (focus?: boolean) => void;
  select: (item: MenuCommand) => void; tab: (backwards: boolean) => void; submenu?: boolean; navigateRoot?: (delta: number) => void;
}) {
  const context = useWindowContext(), scope = useSurfaceScope(), id = useId(), root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1), [child, setChild] = useState<{index: number; focus: MenuFocus} | null>(null);
  const [retainedChild,setRetainedChild]=useState<{index:number;focus:MenuFocus}|null>(null);
  useLayoutEffect(()=>{if(child){setRetainedChild(child);return;}if(!retainedChild)return;const view=anchor.ownerDocument.defaultView;if(!context.active||!context.enabled||view?.matchMedia('(prefers-reduced-motion: reduce)').matches){setRetainedChild(null);return;}const timer=setTimeout(()=>setRetainedChild(null),200),media=view?.matchMedia('(prefers-reduced-motion: reduce)'),finish=()=>{if(media?.matches){clearTimeout(timer);setRetainedChild(null);}};media?.addEventListener('change',finish);return()=>{clearTimeout(timer);media?.removeEventListener('change',finish);};},[child,context.active,context.enabled]);
  const visibleChild=child??retainedChild;
  const buttons = useRef(new Map<number, HTMLButtonElement>()), query = useRef({text: '', at: 0});
  const latest = useRef({closeLevel, closeAll, select}); latest.current = {closeLevel, closeAll, select};
  const go = (index: number) => {setActive(index); focusElement(buttons.current.get(index));};
  useLayoutEffect(()=>{if(exiting||active<0)return;const item=items[active];if(!item||!isMenuCommand(item)||item.disabled){const next=menuIndex(items,active,'ArrowDown');if(next>=0)go(next);else root.current?.focus({preventScroll:true});}},[items,exiting]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element||exiting) return;
    roots.current.add(element);
    const registration = context.overlays?.isManaged?.() ? context.overlays.register?.({kind: 'menu', modal: false, element: () => root.current,
      trigger: owner ?? anchor, autoFocus: false, restoreFocus: false,
      onClose: reason => {if (reason === 'escape') latest.current.closeLevel(true); else if (reason === 'outside') latest.current.closeAll(true); else if (reason !== 'parent-removed' && reason !== 'owner-removed') latest.current.closeAll(false);},
    }) : undefined;
    // A newly opened, unrelated window menu replaces this tree; child menus keep it open.
    const unsubscribe = registration && !submenu ? context.overlays?.subscribe?.(() => {
      const layers = context.overlays?.getSnapshot?.() ?? [], own = layers.find(layer => layer.token === registration.token);
      if (!own) return;
      const unrelated = layers.some(layer => {
        if (layer.kind !== 'menu' || layer.order <= own.order) return false;
        let parent = layer.parent;
        const seen = new Set<symbol>();
        while (parent && !seen.has(parent)) {if (parent === own.token) return false; seen.add(parent); parent = layers.find(value => value.token === parent)?.parent ?? null;}
        return true;
      });
      if (unrelated) latest.current.closeAll(false);
    }) : undefined;
    const inside = (target: Node | null) => !!target && [...roots.current].some(menu => menu.contains(target));
    const outside = (event: PointerEvent) => {if (!inside(event.target as Node) && !(owner ?? anchor).contains(event.target as Node)) latest.current.closeAll(true);};
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || !context.active || !context.enabled || !element.contains(event.target as Node)) return;
      event.preventDefault(); event.stopImmediatePropagation(); latest.current.closeLevel(true);
    };
    if (!registration) {element.ownerDocument.addEventListener('pointerdown', outside); element.ownerDocument.defaultView?.addEventListener('keydown', escape, true);}
    return () => {roots.current.delete(element); unsubscribe?.(); registration?.dispose(); element.ownerDocument.removeEventListener('pointerdown', outside); element.ownerDocument.defaultView?.removeEventListener('keydown', escape, true);};
  }, [anchor, owner, host, context.overlays,exiting]);

  useLayoutEffect(() => {if (!exiting&&initialFocus !== 'none') {const index = menuIndex(items, -1, initialFocus === 'last' ? 'End' : 'Home'); if (index >= 0) go(index); else root.current?.focus();}}, [initialFocus, anchor, host,exiting]);

  useLayoutEffect(() => {
    const element = root.current, doc = anchor.ownerDocument, view = doc.defaultView;
    if (!element || !view||exiting) return;
    const measure = () => {
      if (!anchor.isConnected) {latest.current.closeAll(false); return;}
      const area = context.id === 'standalone' && !host.closest('.ksf-sdk-surface') ? {left: 0, top: 0, width: view.innerWidth, height: view.innerHeight} : host.getBoundingClientRect(), box = anchor.getBoundingClientRect();
      const parent = submenu ? anchor.closest('[role="menu"]')?.getBoundingClientRect() : null;
      if (parent && (box.bottom <= parent.top || box.top >= parent.bottom)) {latest.current.closeLevel(false); return;}
      element.style.maxWidth = `${Math.max(0, area.width - 16)}px`; element.style.maxHeight = `${Math.max(0, area.height - 16)}px`;
      element.style.minWidth = !submenu&&!point?`${Math.min(box.width,Math.max(0,area.width-16))}px`:'0px';
      element.style.left = '0px'; element.style.top = '0px';
      const computed=view.getComputedStyle(element),matrix=new view.DOMMatrix(computed.transform==='none'?undefined:computed.transform),[ox=0,oy=0]=computed.transformOrigin.split(' ').map(parseFloat),origin=floatingLayoutBox(element.getBoundingClientRect(),element.offsetWidth,element.offsetHeight,matrix,{x:ox,y:oy}),desired = submenu?positionFloating({...box,top:box.top-4},origin,area,computed.direction==='rtl'?'left-start':'right-start',4):!point&&placement?positionFloating(box,origin,area,placement,arrow?10:4):placeMenu(area, box, origin.width, origin.height, point, false);element.dataset.menuSide='side' in desired?String(desired.side):'bottom';element.style.setProperty('--ksf-menu-arrow-x',`${Math.max(12,Math.min(origin.width-12,box.left+box.width/2-desired.left))}px`);element.style.setProperty('--ksf-menu-arrow-y',`${Math.max(12,Math.min(origin.height-12,box.top+box.height/2-desired.top))}px`);
      element.style.left = `${desired.left - origin.left}px`; element.style.top = `${desired.top - origin.top}px`;
    };
    const stopTheme=followTheme(anchor,element);measure();
    const resize = new ResizeObserver(measure); resize.observe(element); resize.observe(host); resize.observe(anchor);
    const mutations = new MutationObserver(measure);
    for (let current: HTMLElement | null = anchor; current; current = current.parentElement) mutations.observe(current, {attributes: true, attributeFilter: ['style', 'class', 'data-ksf-theme']});
    const scroll = (event: Event) => {if ([...roots.current].some(menu => menu.contains(event.target as Node))) measure(); else latest.current.closeAll(false);};
    const blur = () => latest.current.closeAll(false);
    doc.addEventListener('scroll', scroll, true); view.addEventListener('blur', blur); view.addEventListener('resize', measure);
    const media = view.matchMedia('(prefers-color-scheme: dark)'); media.addEventListener('change', measure);
    return () => {stopTheme();resize.disconnect(); mutations.disconnect(); doc.removeEventListener('scroll', scroll, true); view.removeEventListener('blur', blur); view.removeEventListener('resize', measure); media.removeEventListener('change', measure);};
  }, [anchor, host, point?.x, point?.y, submenu,placement,arrow,exiting]);

  const childItem = visibleChild && items[visibleChild.index];
  return createPortal(<div ref={root} id={menuId} className={`ksf-sdk-surface ${scope} ksf-action-menu`} role="menu" aria-label={label} aria-hidden={exiting||undefined} inert={exiting||undefined} data-exiting={exiting||undefined} tabIndex={-1}
    data-ksf-action-menu="" data-arrow={arrow||undefined} onPointerEnter={onEnter} onPointerLeave={onLeave} style={{position: 'fixed', left: 0, top: 0} as CSSProperties}
    onClick={event=>event.stopPropagation()} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (exiting||!context.active||!context.enabled||!root.current?.contains(event.target as Node) || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      const focused = items.findIndex((_, index) => buttons.current.get(index) === root.current?.ownerDocument.activeElement);
      if (event.key === 'Tab') {if (!event.defaultPrevented) {event.preventDefault(); tab(event.shiftKey);} else closeAll(false); event.stopPropagation(); return;}
      if (event.defaultPrevented) return;
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {event.preventDefault(); event.stopPropagation(); setChild(null); go(menuIndex(items, focused, event.key)); return;}
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); closeLevel(true); return;}
      const rtl=getComputedStyle(root.current).direction==='rtl',openKey=rtl?'ArrowLeft':'ArrowRight',closeKey=rtl?'ArrowRight':'ArrowLeft';
      const item = items[focused];
      if (item && isMenuCommand(item) && item.items && [openKey,'Enter',' '].includes(event.key)) {event.preventDefault(); event.stopPropagation(); setChild({index: focused, focus: 'first'}); return;}
      if (event.key === closeKey && submenu) {event.preventDefault(); event.stopPropagation(); closeLevel(true); return;}
      if (['ArrowLeft','ArrowRight'].includes(event.key) && navigateRoot) {event.preventDefault(); event.stopPropagation(); navigateRoot((event.key === 'ArrowLeft' ? -1 : 1)*(rtl?-1:1)); return;}
      if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now(), old = now - query.current.at < 700 ? query.current.text : '';
        const text = old && [...old].every(letter => letter === event.key) ? event.key : old + event.key;
        query.current = {text, at: now}; const index = menuMatch(items, focused, text);
        if (index >= 0) {event.preventDefault(); event.stopPropagation(); setChild(null); go(index);}
      }
    }}>
    <div className="ksf-menu-content">{items.map((item, index) => !isMenuCommand(item) ? <div role="separator" className="ksf-menu-separator" key={item.id}/> : <button key={item.id} ref={element => {if (element) buttons.current.set(index, element); else buttons.current.delete(index);}}
      type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} tabIndex={-1} disabled={item.disabled}
      aria-checked={item.checked} aria-haspopup={item.items ? 'menu' : undefined} aria-expanded={item.items ? child?.index === index : undefined}
      aria-controls={item.items ? `${id}-child-${index}` : undefined} data-danger={item.danger || undefined} data-selected={item.selected||undefined} data-active={active === index || undefined}
      onFocus={() => setActive(index)} onPointerEnter={() => {if (!item.disabled) {go(index); setChild(item.items?.length ? {index, focus: 'none'} : null);}}}
      onClick={() => {if (item.items) setChild({index, focus: 'first'}); else select(item);}}>
      {(item.icon!==undefined||item.checked!==undefined)&&<span className="ksf-menu-check" aria-hidden="true">{item.icon??(item.checked ? '✓' : '')}</span>}<span className="ksf-menu-label">{item.label}</span>
      {item.extra&&<span className="ksf-menu-extra">{item.extra}</span>}{item.shortcut && <span className="ksf-menu-shortcut">{item.shortcut}</span>}{item.items && <span aria-hidden="true">›</span>}
    </button>)}
    </div>{visibleChild && childItem && isMenuCommand(childItem) && childItem.items && buttons.current.get(visibleChild.index) && <MenuLevel key={childItem.id}
      menuId={`${id}-child-${visibleChild.index}`} exiting={exiting||!child} anchor={buttons.current.get(visibleChild.index)!} initialFocus={child?.focus??'none'} label={childItem.label} items={childItem.items} host={host} roots={roots} submenu
      closeLevel={focus => {if (focus) focusElement(buttons.current.get(visibleChild.index)); setChild(null);}} closeAll={closeAll} select={select} tab={tab} onEnter={onEnter} onLeave={onLeave}/>} 
  </div>, host);
}
