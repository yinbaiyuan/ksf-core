import './fidelity/navigation-narrow.css';
import {forwardRef,type ReactNode,type ComponentType,type SVGProps} from 'react';
import Source from './fidelity/kokonut/smooth-tab';
import {FidelityScope} from './fidelity/scope';
import {useValue} from './primitives/state';
import './fidelity/styles/smooth-tab.css';
export interface SwipeTabItem{id:string;label:string;content:ReactNode;icon?:ComponentType<SVGProps<SVGSVGElement>>;disabled?:boolean}
export interface SwipeTabsProps{label:string;items:readonly SwipeTabItem[];value?:string;defaultValue?:string;onValueChange?:(id:string)=>void}
export const SwipeTabs=forwardRef<HTMLDivElement,SwipeTabsProps>(function SwipeTabs({label,items,value,defaultValue,onValueChange},ref){const [current,setCurrent]=useValue(value,defaultValue??items.find(item=>!item.disabled)?.id??'',onValueChange);return <FidelityScope module="smooth-tab" style={{containerType:'inline-size'}}>{items.length?<Source controlRef={ref} label={label} value={current} onChange={setCurrent} items={items.map(item=>({id:item.id,title:item.label,content:item.content,icon:item.icon,disabled:item.disabled}))}/>:<div ref={ref} role="tablist" aria-label={label}>暂无页签</div>}</FidelityScope>;});
