import {isMenuCommand, type MenuItem} from './menu-types.ts';
export function menuIndex(items: readonly MenuItem[], current: number, key: string) {
  const enabled = items.map((item, i) => isMenuCommand(item) && !item.disabled ? i : -1).filter(i => i >= 0);
  if (!enabled.length) return -1;
  if (key === 'Home') return enabled[0];
  if (key === 'End') return enabled.at(-1)!;
  const at = enabled.indexOf(current);
  return key === 'ArrowUp' ? enabled[at < 0 ? enabled.length - 1 : (at - 1 + enabled.length) % enabled.length] : enabled[(at + 1) % enabled.length];
}
export function menuMatch(items: readonly MenuItem[], current: number, query: string) {
  for (let step = 1; step <= items.length; step++) {
    const index = (current + step + items.length) % items.length, item = items[index];
    if (isMenuCommand(item) && !item.disabled && item.label.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())) return index;
  }
  return -1;
}
export interface MenuRect {left: number; top: number; width: number; height: number}
export function placeMenu(area: MenuRect, anchor: MenuRect, width: number, height: number, point?: {x: number; y: number}, submenu = false) {
  const right = area.left + area.width, bottom = area.top + area.height;
  let left = point?.x ?? (submenu ? anchor.left + anchor.width + 4 : anchor.left);
  let top = point?.y ?? (submenu ? anchor.top - 4 : anchor.top + anchor.height + 4);
  if (!point && submenu && left + width > right - 8) left = anchor.left - width - 4;
  if (!point && !submenu && top + height > bottom - 8 && anchor.top - height - 4 >= area.top + 8) top = anchor.top - height - 4;
  return {left: Math.max(area.left + 8, Math.min(left, right - width - 8)), top: Math.max(area.top + 8, Math.min(top, bottom - height - 8))};
}
