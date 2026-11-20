import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
import type {WindowContextValue} from '../window-context';

/** Ant's 100ms click window, scoped to the owning KSF window and released with the view. */
export function useDialogOrigin(enabled:boolean,open:boolean,source:RefObject<HTMLElement|null>,panel:RefObject<HTMLElement|null>,host:HTMLElement|null,context:WindowContextValue){
 const click=useRef<{x:number;y:number;at:number}|null>(null),measured=useRef(false),[origin,setOrigin]=useState('50% 50%');
 useLayoutEffect(()=>{
  if(!enabled||!context.enabled||!context.active)return;
  const node=source.current,owner=context.root?.current??node?.closest<HTMLElement>('.ksf-sdk-surface')??node?.parentElement;if(!owner)return;
  const roots=[owner,...context.overlayHost&&!owner.contains(context.overlayHost)?[context.overlayHost]:[]];
  const capture=(event:MouseEvent)=>{
   const target=event.composedPath().find((item):item is HTMLElement=>item instanceof HTMLElement&&item.hasAttribute('data-overlay-owner'));
   if(event.button!==0||event.detail===0||target&&target.dataset.overlayOwner!==context.id){click.current=null;return;}
   click.current={x:event.clientX,y:event.clientY,at:Date.now()};
  };
  const keyboard=()=>{click.current=null;};
  for(const root of roots){root.addEventListener('click',capture,true);root.addEventListener('keydown',keyboard,true);}
  return()=>{for(const root of roots){root.removeEventListener('click',capture,true);root.removeEventListener('keydown',keyboard,true);}click.current=null;};
 },[enabled,context.id,context.root,context.overlayHost,context.enabled,context.active,source]);
 useLayoutEffect(()=>{
  if(!enabled||!open){measured.current=false;return;}
  const node=panel.current;if(!node||measured.current)return;measured.current=true;
  const sample=click.current;click.current=null;
  if(!sample||Date.now()-sample.at>=100){setOrigin('50% 50%');return;}
  // The first CSS animation frame already scales the bounding rect. Measure before
  // that transform, in the same layout commit, without painting an unscaled panel.
  const animation=node.style.getPropertyValue('animation-name'),priority=node.style.getPropertyPriority('animation-name');
  let rect:DOMRect;
  try{node.style.setProperty('animation-name','none','important');rect=node.getBoundingClientRect();}
  finally{if(animation)node.style.setProperty('animation-name',animation,priority);else node.style.removeProperty('animation-name');}
  setOrigin(`${sample.x-rect.left}px ${sample.y-rect.top}px`);
 },[enabled,open,host,panel]);
 return origin;
}
