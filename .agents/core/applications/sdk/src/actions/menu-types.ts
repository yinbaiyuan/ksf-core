import type {ReactNode} from 'react';
export interface MenuSeparator {id: string; type: 'separator'}
export interface MenuCommandBase {id: string; label: string; disabled?: boolean; danger?: boolean; shortcut?: string; icon?:ReactNode;extra?:ReactNode;keepOpen?:boolean;selected?:boolean}
export type MenuCommand = MenuCommandBase & (
  {onAction: () => void | Promise<unknown>; items?: never; checked?: boolean} |
  {items: readonly MenuItem[]; onAction?: never; checked?: never}
);
export type MenuItem = MenuSeparator | MenuCommand;
export const isMenuCommand = (item: MenuItem): item is MenuCommand => !('type' in item && item.type === 'separator');
