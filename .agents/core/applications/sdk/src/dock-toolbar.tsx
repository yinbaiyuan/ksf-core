import {forwardRef,type ReactNode,type ComponentType,type SVGProps} from 'react';
import Source from './fidelity/kokonut/toolbar';
import {FidelityScope} from './fidelity/scope';
import {useValue} from './primitives/state';
import './fidelity/styles/toolbar.css';
export type DockEdge='top'|'right'|'bottom'|'left';
export interface DockTool{id:string;label:string;icon?:ComponentType<SVGProps<SVGSVGElement>>;shortcut?:string;cursor?:string;items?:readonly DockTool[]}
export interface DockToolbarProps{label:string;items:readonly DockTool[];value?:string;defaultValue?:string;onValueChange?:(id:string)=>void;defaultEdge?:DockEdge;onEdgeChange?:(edge:DockEdge)=>void;shortcuts?:'focused'|'window'|'off';children?:ReactNode}
const Dot=()=> <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor"/></svg>;
export const DockToolbar=forwardRef<HTMLDivElement,DockToolbarProps>(function DockToolbar({label,items,value,defaultValue,onValueChange,defaultEdge='bottom',onEdgeChange,shortcuts='focused',children},ref){const first=items[0]?.items?.[0]?.id??items[0]?.id??'',[current,setCurrent]=useValue(value,defaultValue??first,onValueChange);const map=(items:readonly DockTool[]):import('./fidelity/kokonut/toolbar').DockTool[]=>items.map(item=>({id:item.id,label:item.label,icon:item.icon??Dot,shortcut:item.shortcut,cursor:item.cursor,tools:item.items?.length?map(item.items):undefined}));return <FidelityScope module="toolbar"><Source ariaLabel={label} controlRef={ref} tools={map(items)} value={current} onValueChange={setCurrent} defaultEdge={defaultEdge} onEdgeChange={onEdgeChange} shortcuts={shortcuts==='focused'?'scoped':shortcuts==='window'?'global':'off'}>{children}</Source></FidelityScope>;});
