import {useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {useHostTheme} from '../components/host-theme';

type Position={left:number;top:number};
/** All application hints share one surface and the taskbar's top edge. */
export function useDockTooltip(trigger:RefObject<HTMLButtonElement|null>,name:string,disabled=false){
 const theme=useHostTheme(),id=useId()+'-tooltip',node=useRef<HTMLSpanElement>(null);
 const [position,setPosition]=useState<Position|null>(null),visible=!!position&&!disabled;
 const hide=()=>setPosition(null);
 const show=()=>{
  if(disabled)return;const anchor=trigger.current;if(!anchor)return;
  const box=anchor.getBoundingClientRect(),top=anchor.closest('.os-dock')?.getBoundingClientRect().top??box.top;
  setPosition({left:box.left+box.width/2,top:top-8});
 };
 useEffect(()=>{if(disabled)setPosition(null);},[disabled]);
 useEffect(()=>{
  if(!visible)return;const close=()=>setPosition(null);
  window.addEventListener('resize',close);window.addEventListener('scroll',close,true);window.addEventListener('blur',close);
  return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);window.removeEventListener('blur',close);};
 },[visible]);
 useLayoutEffect(()=>{
  if(!visible||!node.current)return;
  const update=()=>{
   const anchor=trigger.current;if(!anchor||!node.current)return;
   const box=node.current.getBoundingClientRect(),bounds=anchor.getBoundingClientRect(),baseline=anchor.closest('.os-dock')?.getBoundingClientRect().top??bounds.top;
   const left=Math.max(8+box.width/2,Math.min(bounds.left+bounds.width/2,innerWidth-8-box.width/2)),top=Math.max(8+box.height,Math.min(baseline-8,innerHeight-8));
   setPosition(value=>!value||value.left===left&&value.top===top?value:{left,top});
  };
  update();const observer=new ResizeObserver(update);observer.observe(node.current);return()=>observer.disconnect();
 },[visible,name,trigger]);
 return {id,visible,show,hide,node:visible&&position?createPortal(<span ref={node} id={id} className={`dock-tooltip is-floating host-surface ${theme}`} role="tooltip" style={{left:position.left,bottom:innerHeight-position.top}}>{name}</span>,document.body):null};
}

export function DockLauncherButton({anchor,open,toggle,children}:{anchor:RefObject<HTMLButtonElement|null>;open:boolean;toggle:()=>void;children:ReactNode}){
 const tip=useDockTooltip(anchor,'所有应用',open);
 return <><button ref={anchor} type="button" className="dock-item" aria-label="所有应用" aria-describedby={tip.visible?tip.id:undefined} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?'ksf-application-launcher':undefined}
  onPointerEnter={tip.show} onPointerLeave={tip.hide} onPointerDown={tip.hide} onFocus={tip.show} onBlur={tip.hide}
  onClick={()=>{tip.hide();toggle();}} onKeyDown={event=>{if(event.key==='Escape'&&tip.visible){event.preventDefault();event.stopPropagation();tip.hide();}}}>{children}</button>{tip.node}</>;
}
