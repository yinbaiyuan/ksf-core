import {motion,useIsPresent} from 'motion/react';
import {useSyncExternalStore,type ReactNode} from 'react';
import './dock-motion.css';

const ease=[.22,1,.36,1] as const;
const reducedMedia=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
const reducedSnapshot=()=>reducedMedia?.matches??false;
const subscribeReduced=(listener:()=>void)=>{reducedMedia?.addEventListener('change',listener);return()=>reducedMedia?.removeEventListener('change',listener);};
const useDockReducedMotion=()=>useSyncExternalStore(subscribeReduced,reducedSnapshot,()=>false);
/** Animate occupied space, leaving the icon's artwork and hit target full size. */
export function DockIconSlot({size,trailing,motion:enabled,children}:{size:number;trailing:boolean;motion:boolean;children:ReactNode}){
 const present=useIsPresent(),reduced=useDockReducedMotion(),animate=enabled&&!reduced;
 return <motion.div className="dock-icon-slot" aria-hidden={!present||undefined} inert={!present}
  layout={animate?'position':false}
  initial={animate?{width:0,opacity:0,y:6}:false}
  animate={{width:size+(trailing?12:0),opacity:1,y:0}}
  exit={{width:0,opacity:0,y:4}}
  transition={{duration:animate ? .22 : 0,ease,opacity:{duration:animate ? .16 : 0},layout:{duration:animate ? .22 : 0,ease}}}
 >{children}</motion.div>;
}

export function DockDivider({visible,motion:enabled}:{visible:boolean;motion:boolean}){
 const reduced=useDockReducedMotion();
 return <motion.span className="dock-divider" aria-hidden="true" initial={false}
  animate={{width:visible?1:0,marginInline:visible?8:0,opacity:visible?1:0}}
  transition={{duration:enabled&&!reduced ? .22 : 0,ease}}/>;
}
