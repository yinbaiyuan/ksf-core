import {useEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {AnchoredLayer,type FloatingPlacement} from '../primitives/layer';
import {FidelityPortalFrame,useScopedReducedMotion} from './scope';
/** The fixed-source panel keeps its own Motion surface; KSF owns placement, focus and window boundaries. */
export function FidelityPopup({anchor,open,onClose,id,label,placement='top-start',children}:{anchor:RefObject<HTMLElement|null>;open:boolean;onClose:()=>void;id:string;label:string;placement?:FloatingPlacement;children:ReactNode}){
 const reduced=useScopedReducedMotion(),[kept,setKept]=useState(open),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),present=open||kept;
 useEffect(()=>{clearTimeout(timer.current);if(open)setKept(true);else if(!kept)return;else if(reduced)setKept(false);else timer.current=setTimeout(()=>setKept(false),140);return()=>clearTimeout(timer.current);},[open,reduced]);
 return <AnchoredLayer anchor={anchor} open={present} onClose={onClose} role="dialog" aria-label={label} id={id} placement={placement} autoFocus style={{padding:0,border:0,background:'transparent',boxShadow:'none',overflow:'visible'}}><FidelityPortalFrame>{children}</FidelityPortalFrame></AnchoredLayer>;
}
