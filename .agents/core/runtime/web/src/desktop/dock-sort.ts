import {useEffect,useRef,useState,type MouseEvent,type PointerEvent} from 'react';
import {frame as motionFrame,cancelFrame} from 'motion/react';
import {reorderDockPins} from '../desktop-model';

type Gesture={id:string;pointerId:number;startX:number;startY:number;x:number;y:number;grabX:number;ids:string[];scrollLeft:number;dragged:boolean;source:HTMLButtonElement};

/** Stable slots decide order; the grabbed button follows the pointer independently. */
export function useDockSort(ids:string[],commit:(ids:string[])=>void,onStart:()=>void,motion=true){
  const rail=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),frame=useRef(0),suppressClick=useRef(false);
  const current=useRef({ids,commit,onStart,motion});current.current={ids,commit,onStart,motion};
  const [preview,setPreview]=useState<string[]|null>(null),[dragging,setDragging]=useState<string|null>(null),[settling,setSettling]=useState<string|null>(null);
  useEffect(()=>{
    let settleTimer:ReturnType<typeof setTimeout>|undefined,settleFrame=0,settleNode:HTMLButtonElement|null=null;
    const clearSettle=()=>{clearTimeout(settleTimer);cancelAnimationFrame(settleFrame);settleNode?.style.removeProperty('--dock-drag-x');settleNode=null;setSettling(null);};
    const slots=(node:HTMLElement)=>[...node.querySelectorAll<HTMLButtonElement>('[data-dock-pinned="true"]')].filter(item=>!item.closest('[inert]')).map(item=>{
      const slot=item.closest<HTMLElement>('.dock-icon-slot')??item;
      return {id:item.dataset.dockApp!,left:slot.offsetLeft+(slot===item?0:item.offsetLeft),width:item.offsetWidth};
    });
    const reorder=(direction:number)=>{
      const g=gesture.current,node=rail.current;if(!g?.dragged||!node||!direction)return;
      const from=g.ids.indexOf(g.id),origin=node.getBoundingClientRect().left-node.scrollLeft;let target=g.id,best=from;
      for(const item of slots(node)){
        const index=g.ids.indexOf(item.id),center=origin+item.left+item.width/2;
        // offsetLeft rounds to pixels; allow its half-pixel boundary at a drop center.
        if((direction>0&&index>best&&g.x>=center-.5)||(direction<0&&index>=0&&index<best&&g.x<=center+.5)){target=item.id;best=index;}
      }
      const next=reorderDockPins(g.ids,g.id,target);if(next!==g.ids){g.ids=next;setPreview(next);}
    };
    const follow=()=>{
      const g=gesture.current,node=rail.current;if(!g?.dragged||!node||!g.source.isConnected)return;
      const box=node.getBoundingClientRect(),width=g.source.offsetWidth,padding=Math.min(parseFloat(getComputedStyle(node).paddingLeft)||0,Math.max(0,(node.clientWidth-width)/2));
      const pinnedEnd=Math.max(0,...slots(node).map(item=>item.left+item.width));
      const left=box.left+padding,right=Math.max(left,Math.min(box.right-width-padding,box.left-node.scrollLeft+pinnedEnd-width));
      const target=Math.max(left,Math.min(g.x-g.grabX,right));
      // Parent FLIP transforms animate the slot. Cancel their current offset only
      // for the grabbed button, so its foreground and glass stay under the cursor.
      const transform=getComputedStyle(g.source).transform,x=transform==='none'?0:new DOMMatrixReadOnly(transform).m41;
      const base=g.source.getBoundingClientRect().left-x;
      g.source.style.setProperty('--dock-drag-x',`${target-base}px`);
    };
    const tick=()=>{
      const g=gesture.current,node=rail.current;if(!g?.dragged||!node)return;
      const box=node.getBoundingClientRect();
      if(g.y>=box.top-16&&g.y<=box.bottom+16){
        const delta=g.x>box.right-24?10:g.x<box.left+24?-10:0,before=node.scrollLeft;
        const end=Math.max(0,...slots(node).map(item=>item.left+item.width));
        node.scrollLeft=Math.max(0,Math.min(before+delta,end-node.clientWidth));
        if(node.scrollLeft!==before)reorder(delta);
      }
      frame.current=requestAnimationFrame(tick);
    };
    const finish=(save:boolean)=>{
      const g=gesture.current;if(!g)return;follow();gesture.current=null;cancelAnimationFrame(frame.current);cancelFrame(follow);
      if(rail.current?.hasPointerCapture(g.pointerId))rail.current.releasePointerCapture(g.pointerId);
      setPreview(null);setDragging(null);
      if(g.dragged){
        if(save)current.current.commit(g.ids);
        const animate=current.current.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
        settleNode=g.source;setSettling(animate?g.id:null);
        settleFrame=requestAnimationFrame(()=>{
          g.source.style.setProperty('--dock-drag-x','0px');
          if(!save&&rail.current)rail.current.scrollTo({left:g.scrollLeft,behavior:animate?'smooth':'instant'});
          if(g.source.isConnected)g.source.focus({preventScroll:true});
          if(animate)settleTimer=setTimeout(clearSettle,240);else clearSettle();
        });
      }
    };
    const move=(event:globalThis.PointerEvent)=>{
      const g=gesture.current;if(!g||g.pointerId!==event.pointerId)return;
      const direction=event.clientX-g.x;g.x=event.clientX;g.y=event.clientY;
      if(!g.dragged&&Math.hypot(g.x-g.startX,g.y-g.startY)>=5){
        clearSettle();g.dragged=true;g.ids=[...current.current.ids];suppressClick.current=true;
        rail.current?.setPointerCapture(g.pointerId);setPreview(g.ids);setDragging(g.id);current.current.onStart();frame.current=requestAnimationFrame(tick);
        // Follow after Motion writes the slot transforms, before the browser paints.
        motionFrame.postRender(follow,true);
      }
      if(g.dragged){event.preventDefault();reorder(direction);}
    };
    const up=(event:globalThis.PointerEvent)=>{
      const g=gesture.current;if(!g||g.pointerId!==event.pointerId)return;
      const box=rail.current?.getBoundingClientRect();
      finish(!!box&&event.clientX>=box.left-8&&event.clientX<=box.right+8&&event.clientY>=box.top-8&&event.clientY<=box.bottom+8);
    };
    const cancel=(event:globalThis.PointerEvent)=>{if(event.pointerId===gesture.current?.pointerId)finish(false);};
    const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'&&gesture.current?.dragged){event.preventDefault();event.stopPropagation();finish(false);}};
    const blur=()=>finish(false);
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);
    window.addEventListener('blur',blur);document.addEventListener('keydown',key,true);
    return()=>{cancelFrame(follow);cancelAnimationFrame(frame.current);clearTimeout(settleTimer);cancelAnimationFrame(settleFrame);settleNode?.style.removeProperty('--dock-drag-x');gesture.current?.source.style.removeProperty('--dock-drag-x');gesture.current=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',blur);document.removeEventListener('keydown',key,true);};
  },[]);
  const pointerDown=(event:PointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||!event.isPrimary)return;
    suppressClick.current=false;
    const source=(event.target as Element).closest<HTMLButtonElement>('button[data-dock-pinned="true"]'),id=source?.dataset.dockApp;
    if(!source||!id||source.closest('[inert]')||!current.current.ids.includes(id))return;
    gesture.current={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,grabX:event.clientX-source.getBoundingClientRect().left,ids:[...current.current.ids],scrollLeft:rail.current?.scrollLeft??0,dragged:false,source};
  };
  const clickCapture=(event:MouseEvent<HTMLDivElement>)=>{if(suppressClick.current&&event.detail>0){event.preventDefault();event.stopPropagation();suppressClick.current=false;}};
  return{rail,preview,dragging,settling,pointerDown,clickCapture};
}
