// Fixed free MIT Kokonut demo data and icons, adapted to KSF public props.
// Copyright (c) 2025 kokonutUI. Full license: ../../THIRD_PARTY_NOTICES.txt
import {DEFAULT_TABS} from '../fidelity/kokonut/smooth-tab';
import {DEFAULT_TOOLS} from '../fidelity/kokonut/toolbar';
import {DEFAULT_ITEMS} from '../fidelity/kokonut/marking-menu';
import {SAMPLE_ACCOUNTS,SAMPLE_ITEMS} from '../fidelity/kokonut/profile-dropdown';
import {sampleItems} from '../fidelity/kokonut/action-search-bar';
import {DEFAULT_NAV_ITEMS} from '../fidelity/kokonut/morphic-navbar';
import type {SwipeTabItem} from '../swipe-tabs';import type {DockTool} from '../dock-toolbar';import type {RadialMenuItem} from '../radial-menu';import type {AccountIdentity,AccountMenuEntry} from '../account-menu';import type {CommandItem} from '../command-palette';import type {MorphNavigationItem} from '../morph-navigation';
export const swipeTabDemoItems:SwipeTabItem[]=DEFAULT_TABS.map(item=>({id:item.id,label:item.title,icon:item.icon,content:item.content}));
const dock=(tools:typeof DEFAULT_TOOLS):DockTool[]=>tools.map(tool=>({id:tool.id,label:tool.label,icon:tool.icon,shortcut:tool.shortcut,cursor:tool.cursor,items:tool.tools?dock(tool.tools):undefined}));
export const dockDemoTools=dock(DEFAULT_TOOLS);
export const radialDemoItems:RadialMenuItem[]=DEFAULT_ITEMS.map(item=>({...item}));
export const profileDemoAccounts:AccountIdentity[]=SAMPLE_ACCOUNTS.map(account=>({...account}));
export const profileDemoItems:AccountMenuEntry[]=SAMPLE_ITEMS.map((item,index)=>({id:'action-'+index,label:item.label,icon:item.icon,detail:item.value}));
export const commandDemoItems:CommandItem[]=sampleItems.map(item=>({...item,kind:item.href?'link':'command'}));
export const morphDemoItems:MorphNavigationItem[]=Object.entries(DEFAULT_NAV_ITEMS).map(([id,item])=>({id,label:item.name}));
