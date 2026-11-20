import {LayoutGroup} from 'motion/react';
import {forwardRef,useId,useMemo,type ReactNode} from 'react';
import Source from './fidelity/kokonut/card-stack';
import {FidelityScope} from './fidelity/scope';
export interface DeckCard {id:string;title:string;subtitle?:string;description?:string;content?:ReactNode;art?:ReactNode;specs?:readonly {label:string;value:string}[];price?:string}
export interface CardStackProps {label:string;cards?:readonly DeckCard[];activeId?:string;onActiveChange?:(id:string)=>void;onInspect?:(id:string)=>void;onAction?:(id:string)=>void;actionLabel?:string;disabled?:boolean}
export const CardStack=forwardRef<HTMLDivElement,CardStackProps>(function CardStack({label,cards,activeId,onActiveChange,onInspect,onAction,actionLabel='选择此项',disabled=false},ref){
 const layoutId=useId();
 const data=useMemo(()=>cards?.map(c=>({...c,subtitle:c.subtitle??'',description:c.description??'',art:c.art??c.content??null,specs:[...(c.specs??[])]})),[cards]);
 return <div ref={ref} role="group" aria-label={label}><FidelityScope module="card-stack"><LayoutGroup id={layoutId}>{cards?.length===0?<p role="status">暂无卡片</p>:<Source cards={data} activeId={activeId} disabled={disabled} onChange={c=>onActiveChange?.(c.id)} onInspect={onInspect} onAction={c=>onAction?.(c.id)} actionLabel={actionLabel}/>}</LayoutGroup></FidelityScope></div>;
});
