import {forwardRef,useLayoutEffect,type HTMLAttributes} from 'react';
import {useElementRef} from '../primitives/state';import {useWindowContext} from '../window-context';
/** Finite scroll decay; every frame and observer belongs to the column's document. */
export const TimeScrollColumn=forwardRef<HTMLDivElement,HTMLAttributes<HTMLDivElement>&{target:number;enabled:boolean}>(function TimeScrollColumn({target,enabled,...props},ref){
 const [element,assign]=useElementRef(ref),context=useWindowContext();
 useLayoutEffect(()=>{const node=element.current,doc=node?.ownerDocument,view=doc?.defaultView;if(!node||!doc||!view||!enabled||!context.active||!context.enabled)return;let frame=0,interrupted=false,windowPaused=false,visible=!!node.getClientRects().length;const media=view.matchMedia('(prefers-reduced-motion: reduce)'),stop=()=>{if(frame)view.cancelAnimationFrame(frame);frame=0;},canRun=()=>!interrupted&&!windowPaused&&visible&&!doc.hidden&&node.isConnected;
  const advance=()=>{frame=0;if(!canRun())return;if(media.matches){node.scrollTop=target;return;}const remaining=target-node.scrollTop;if(Math.abs(remaining)*2/3<=1){node.scrollTop=target;return;}const before=node.scrollTop;node.scrollTop=before+remaining/3;if(node.scrollTop===before)return;frame=view.requestAnimationFrame(advance);};
  const resume=()=>{stop();if(canRun())advance();},interrupt=()=>{interrupted=true;stop();},reduced=()=>{stop();if(media.matches)node.scrollTop=target;else if(canRun())advance();},visibility=()=>{if(doc.hidden)stop();else resume();},blur=()=>{windowPaused=true;stop();},focus=()=>{windowPaused=false;resume();};
  const observer=new view.IntersectionObserver(entries=>{const next=entries.some(entry=>entry.isIntersecting);if(next===visible)return;visible=next;if(visible)resume();else stop();});observer.observe(node);media.addEventListener('change',reduced);doc.addEventListener('visibilitychange',visibility);view.addEventListener('blur',blur);view.addEventListener('focus',focus);node.addEventListener('wheel',interrupt,{passive:true});node.addEventListener('pointerdown',interrupt,{passive:true});resume();
  return()=>{stop();observer.disconnect();media.removeEventListener('change',reduced);doc.removeEventListener('visibilitychange',visibility);view.removeEventListener('blur',blur);view.removeEventListener('focus',focus);node.removeEventListener('wheel',interrupt);node.removeEventListener('pointerdown',interrupt);};
 },[target,enabled,context.active,context.enabled,element]);
 return <div {...props} ref={assign}/>;
});
