import {useLayoutEffect,useState,type RefObject,type CSSProperties} from 'react';
import {useUI} from './provider';
import {placeOverlay,type OverlayPlacement,type UIRect} from './position-model';
export type OverlayAnchor=HTMLElement|{x:number;y:number};
/** Observe only while open; scale client rects back into the owner, never portal into body. */
export function useOverlayPosition(open:boolean,anchor:OverlayAnchor|null,panel:RefObject<HTMLElement|null>,placement:OverlayPlacement='bottom-start',gap=6){
 const host=useUI().environment.overlayHost;
 const [position,setPosition]=useState<{anchor:OverlayAnchor;style:CSSProperties;side:string}|null>(null);
 useLayoutEffect(()=>{
  if(!open||!host||!anchor)return;
  const update=()=>{
   const element=panel.current;if(!element)return;
   const owner=host.getBoundingClientRect(),scaleX=owner.width/host.clientWidth||1,scaleY=owner.height/host.clientHeight||1;
   const rect=anchor instanceof HTMLElement?anchor.getBoundingClientRect():{left:anchor.x,top:anchor.y,width:0,height:0};
   const area={left:Math.max(owner.left,0),top:Math.max(owner.top,0),right:Math.min(owner.right,innerWidth),bottom:Math.min(owner.bottom,innerHeight)};
   const boundary:UIRect={left:(area.left-owner.left)/scaleX+8,top:(area.top-owner.top)/scaleY+8,width:Math.max(0,(area.right-area.left)/scaleX-16),height:Math.max(0,(area.bottom-area.top)/scaleY-16)};
   // Constrain before measuring: wrapping at a narrow edge changes the panel's height.
   // Initial layout runs before paint; later writes run in the coalesced animation frame.
   element.style.setProperty('--ksf-overlay-available-width',boundary.width+'px');
   element.style.setProperty('--ksf-overlay-available-height',boundary.height+'px');
   const result=placeOverlay({left:(rect.left-owner.left)/scaleX,top:(rect.top-owner.top)/scaleY,width:rect.width/scaleX,height:rect.height/scaleY},{width:Math.min(element.offsetWidth,boundary.width),height:Math.min(element.offsetHeight,boundary.height)},boundary,placement,gap);
   const next={anchor,side:result.side,style:{position:'absolute',left:result.left,top:result.top,'--ksf-overlay-available-width':result.maxWidth+'px','--ksf-overlay-available-height':result.maxHeight+'px'} as CSSProperties};
   setPosition(prior=>prior?.anchor===anchor&&JSON.stringify(prior.style)===JSON.stringify(next.style)&&prior.side===next.side?prior:next);
  };
  let frame=0;
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;update();});};
  update();const observer=new ResizeObserver(schedule);observer.observe(host);if(panel.current)observer.observe(panel.current);if(anchor instanceof HTMLElement)observer.observe(anchor);
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);document.addEventListener('visibilitychange',schedule);
  return()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);document.removeEventListener('visibilitychange',schedule);};
 },[open,host,anchor,panel,placement,gap]);
 return {style:open&&position?.anchor===anchor?position.style:{position:'absolute',left:0,top:0} as CSSProperties,side:position?.side};
}
