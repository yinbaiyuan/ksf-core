import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
export type FinitePhase='enter'|'entered'|'exit'|'hidden';
interface PresenceOptions {enabled?:boolean;enterDuration?:number;exitDuration?:number;animateInitial?:boolean}
/** Optional bounded presence. Static CSS supplies the motion; no generated stylesheet or global service. */
export function useFinitePresence(open:boolean,{enabled=false,enterDuration=200,exitDuration=enterDuration,animateInitial=true}:PresenceOptions,source:RefObject<HTMLElement|null>,active=true){
 const [state,setState]=useState<{present:boolean;phase:FinitePhase}>(()=>({present:open,phase:open?(enabled&&animateInitial?'enter':'entered'):'hidden'}));
 const previousOpen=useRef(open),[cycle,setCycle]=useState(0);
 useLayoutEffect(()=>{const reopening=open&&!previousOpen.current&&state.present;previousOpen.current=open;if(enabled&&reopening)setCycle(value=>value+1);},[open,enabled,state.present]);
 useLayoutEffect(()=>{
  if(!enabled||!open&&!state.present)return;
  const view=source.current?.ownerDocument.defaultView;
  if(!view){setState({present:open,phase:open?'entered':'hidden'});return;}
  const reduce=view.matchMedia('(prefers-reduced-motion: reduce)');let timer:number|undefined;
  const settle=()=>{if(timer!==undefined)view.clearTimeout(timer);timer=undefined;};
  const sync=()=>{
   settle();const animate=active&&!reduce.matches;
   if(open){
    setState(previous=>previous.present&&previous.phase==='entered'?previous:{present:true,phase:animate&&enterDuration>0?'enter':'entered'});
    if(animate&&enterDuration>0)timer=view.setTimeout(()=>setState({present:true,phase:'entered'}),enterDuration);
   }else if(!animate||exitDuration<=0)setState(previous=>!previous.present?previous:{present:false,phase:'hidden'});
   else{
    setState(previous=>previous.present?{present:true,phase:'exit'}:previous);
    timer=view.setTimeout(()=>setState({present:false,phase:'hidden'}),exitDuration);
   }
  };
  sync();reduce.addEventListener('change',sync);return()=>{settle();reduce.removeEventListener('change',sync);};
 },[open,enabled,enterDuration,exitDuration,source,active,state.present]);
 return enabled?{...state,cycle}:{present:open,phase:(open?'entered':'hidden') as FinitePhase,cycle:0};
}
