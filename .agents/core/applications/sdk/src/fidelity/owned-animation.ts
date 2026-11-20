import {useCallback,useRef} from 'react';
import {animate} from 'motion/react';
import {useFidelityActivity,useScopedEffect} from './scope';
/** Keeps imperative animations tied to the owning window and component lifetime. */
export function useOwnedAnimator():typeof animate {
 const controls=useRef(new Set<{stop:()=>void}>()),activity=useFidelityActivity(),current=useRef(activity);current.current=activity;
 useScopedEffect(()=>()=>{for(const c of controls.current)c.stop();controls.current.clear();},[]);
 return useCallback(((...args:any[])=>{if(current.current.reduced||!current.current.active)args[2]={...args[2],type:'tween',duration:0,delay:0,repeat:0};const c=(animate as any)(...args);controls.current.add(c);void c.then(()=>controls.current.delete(c));return c;}) as typeof animate,[]);
}
