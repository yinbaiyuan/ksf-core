import {forwardRef,type ReactNode,type ComponentType,type SVGProps} from 'react';
import Source from './fidelity/kokonut/marking-menu';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/marking-menu.css';
export interface RadialMenuItem{id:string;label:string;icon?:ComponentType<SVGProps<SVGSVGElement>>;disabled?:boolean}
export interface RadialMenuProps{label:string;items:readonly RadialMenuItem[];onAction:(id:string)=>void;disabled?:boolean;children?:ReactNode}
const Dot=()=> <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor"/></svg>;
export const RadialMenu=forwardRef<HTMLDivElement,RadialMenuProps>(function RadialMenu({label,items,onAction,disabled=false,children},ref){return <FidelityScope module="marking-menu"><Source label={label} disabled={disabled} controlRef={ref} items={items.map(item=>({id:item.id,label:item.label,disabled:item.disabled,icon:item.icon??Dot}))} onSelect={item=>{if(!disabled&&!item.disabled)onAction(item.id);}}>{children}</Source></FidelityScope>;});
