import './fidelity/navigation-narrow.css';
import {forwardRef,useEffect,useRef,useState,type RefObject,type ReactNode} from 'react';
import Source from './fidelity/kokonut/morphic-navbar';
import {FidelityScope} from './fidelity/scope';
import {useValue} from './primitives/state';
import {useWindowContext} from './window-context';
import './fidelity/styles/morphic-navbar.css';
export interface MorphNavigationItem{id:string;label:string;icon?:ReactNode;disabled?:boolean}
export interface MorphNavigationProps{label:string;items:readonly MorphNavigationItem[];value?:string;defaultValue?:string;onValueChange?:(id:string)=>void;compact?:boolean;scrollTarget?:RefObject<HTMLElement|null>}
export const MorphNavigation=forwardRef<HTMLElement,MorphNavigationProps>(function MorphNavigation({label,items,value,defaultValue,onValueChange,compact=false,scrollTarget},ref){const [current,setCurrent]=useValue(value,defaultValue??items.find(item=>!item.disabled)?.id??'',onValueChange),owner=useWindowContext(),[offset,setOffset]=useState(0);useEffect(()=>{if(!compact)return;const target=scrollTarget?.current??owner.root?.current;if(!target)return;const update=(event?:Event)=>setOffset(event?.target instanceof HTMLElement?event.target.scrollTop:target.scrollTop);update();target.addEventListener('scroll',update,true);return()=>target.removeEventListener('scroll',update,true);},[compact,scrollTarget,owner.root]);return <FidelityScope module="morphic-navbar" style={{containerType:'inline-size'}}><Source label={label} controlRef={ref} items={Object.fromEntries(items.map(item=>[item.id,{name:item.label,icon:item.icon,disabled:item.disabled}]))} value={current} onValueChange={id=>{if(!items.find(item=>item.id===id)?.disabled)setCurrent(id);}} compact={compact} scrollOffset={offset}/></FidelityScope>;});
