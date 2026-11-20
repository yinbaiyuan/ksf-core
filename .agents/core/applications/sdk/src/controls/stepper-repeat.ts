import {useEffect,useRef,type PointerEvent as ReactPointerEvent,type MouseEvent as ReactMouseEvent} from 'react';
import {useWindowContext} from '../window-context';
/** One immediate native pointer step, then the same 600/200ms hold cadence. */
export function useStepperRepeat(step:(direction:number)=>void|boolean,disabled:boolean){
 const context=useWindowContext(),latest=useRef(step),timer=useRef<{view:Window;delay:number;repeat?:number;blur:()=>void}|null>(null),pointerStep=useRef(false);latest.current=step;
 const stop=()=>{const current=timer.current;if(current){current.view.clearTimeout(current.delay);if(current.repeat!==undefined)current.view.clearInterval(current.repeat);current.view.removeEventListener('blur',current.blur);timer.current=null;}};
 useEffect(()=>{if(disabled||!context.active||!context.enabled){stop();pointerStep.current=false;}return stop;},[disabled,context.active,context.enabled]);
 const handlers=(direction:number)=>({
  onPointerDown:(event:ReactPointerEvent<HTMLButtonElement>)=>{if(disabled||!context.active||!context.enabled||event.button!==0)return;event.preventDefault();stop();pointerStep.current=true;if(latest.current(direction)===false)return;const view=event.currentTarget.ownerDocument.defaultView;if(!view)return;event.currentTarget.setPointerCapture(event.pointerId);const state={view,delay:0,repeat:undefined as number|undefined,blur:stop};timer.current=state;view.addEventListener('blur',stop,{once:true});state.delay=view.setTimeout(()=>{if(timer.current===state){if(latest.current(direction)===false){stop();return;}state.repeat=view.setInterval(()=>{if(latest.current(direction)===false)stop();},200);}},600);},
  onPointerUp:()=>stop(),onPointerCancel:()=>{stop();pointerStep.current=false;},onLostPointerCapture:()=>stop(),onBlur:()=>stop(),
  onClick:(event:ReactMouseEvent<HTMLButtonElement>)=>{if(!disabled&&(event.detail===0||!pointerStep.current))latest.current(direction);pointerStep.current=false;}
 });
 return handlers;
}
