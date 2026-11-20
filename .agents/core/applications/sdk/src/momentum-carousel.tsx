import {forwardRef,useMemo} from 'react';
import Source from './fidelity/kokonut/carousel-cards';
import {FidelityScope} from './fidelity/scope';
export interface CarouselCard {id:string;title:string;location?:string;image?:string;imageAlt?:string;scene?:'city'|'mountains'|'dunes'|'lake'|'islands'|'skyline'|'terraces'|'coast';badge?:string;dates?:string;amount?:number;currency?:string;priceLabel?:string;rating?:number;reviewCount?:number}
export interface MomentumCarouselProps {label:string;eyebrow?:string;cards?:readonly CarouselCard[];activeId?:string;onActiveChange?:(id:string)=>void;onInspect?:(id:string)=>void;disabled?:boolean;favoriteIds?:readonly string[];onFavoriteChange?:(id:string,favorite:boolean)=>void}
export const MomentumCarousel=forwardRef<HTMLDivElement,MomentumCarouselProps>(function MomentumCarousel({label,eyebrow,cards,activeId,onActiveChange,onInspect,disabled=false,favoriteIds,onFavoriteChange},ref){
 const data=useMemo(()=>cards?.map((c,i)=>({...c,location:c.location??'',price:c.amount??0,scene:c.scene??(['city','mountains','dunes','lake','islands','skyline','terraces','coast'] as const)[i%8]})),[cards]);
 const favorites=useMemo(()=>favoriteIds?[...favoriteIds]:undefined,[favoriteIds]);
 return <div ref={ref}><FidelityScope module="carousel-cards">{cards?.length===0?<p role="status">暂无卡片</p>:<Source items={data} title={label} eyebrow={eyebrow} activeId={activeId} onActiveChange={onActiveChange} onSelect={c=>onInspect?.(c.id)} disabled={disabled} favorites={favorites} onToggleFavorite={onFavoriteChange}/>}</FidelityScope></div>;
});
