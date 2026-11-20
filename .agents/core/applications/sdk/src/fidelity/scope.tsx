import {MotionConfig} from './motion-provider';
import {createContext, useContext, useEffect, useLayoutEffect, useState, type DependencyList, type EffectCallback, type ReactNode,type CSSProperties,type SyntheticEvent} from 'react';

import {useMotionActivity} from '../motion-activity';
import {useWindowContext} from '../window-context';
import './kokonut-base.css';

const FidelityContext = createContext({active:true, reduced:false,module:'',theme:'light' as 'light'|'dark'});
/** Keeps the referenced visual implementation inside its KSF window and theme. */
export function FidelityScope({children, inline=false, className='',paused=false,style,module,theme,as='div'}:{children:ReactNode;as?:'div'|'span';module:string;theme?:'light'|'dark';inline?:boolean;className?:string;paused?:boolean;style?:CSSProperties}) {
  const {ref,active:motionActive}=useMotionActivity<HTMLElement>({respectReducedMotion:false});
  const active=motionActive&&!paused;
  const owner=useWindowContext();
  const guardOwner=(event:SyntheticEvent)=>{if(!owner.active||!owner.enabled){if(event.type!=='wheel')event.preventDefault();event.stopPropagation();}};
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{const query=ref.current?.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');if(!query)return;const update=()=>setReduced(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[ref]);
  const [dark,setDark]=useState(false);
  useLayoutEffect(()=>{const node=ref.current,view=node?.ownerDocument.defaultView;if(!node||!view)return;const update=()=>setDark(view.getComputedStyle(node).colorScheme==='dark');update();const observer=new view.MutationObserver(update);for(let ancestor:Element|null=node;ancestor;ancestor=ancestor.parentElement)observer.observe(ancestor,{attributes:true,attributeFilter:['class','style','data-ksf-theme']});const query=view.matchMedia('(prefers-color-scheme: dark)');query.addEventListener('change',update);return()=>{observer.disconnect();query.removeEventListener('change',update);};},[ref,theme]);
  const Tag=as;
  return <Tag ref={node=>{ref.current=node}} onPointerDownCapture={guardOwner} onPointerMoveCapture={guardOwner} onPointerUpCapture={guardOwner} onClickCapture={guardOwner} onKeyDownCapture={guardOwner} onWheelCapture={guardOwner} onPasteCapture={guardOwner} onCutCapture={guardOwner} className={`ksf-kokonut ksf-kokonut--${module} ${className}`} data-ksf-theme={theme} data-ksf-reference-theme={theme??(dark?'dark':'light')} data-motion-active={active} data-motion-reduced={reduced} style={{display:as==='span'?'inline':inline?'inline-flex':'block',width:inline?undefined:'100%',maxWidth:'100%',minWidth:0,...style}}>
    <FidelityContext.Provider value={{active,reduced,module,theme:theme??(dark?'dark':'light')}}><MotionConfig reducedMotion={active&&!reduced?'never':'always'}>{children}</MotionConfig></FidelityContext.Provider>
  </Tag>;
}
export function useScopedEffect(effect:EffectCallback,deps?:DependencyList){const {active,reduced}=useContext(FidelityContext);useEffect(()=>active?effect():undefined,deps===undefined?undefined:[active,reduced,...deps]);}
export function useScopedLayoutEffect(effect:EffectCallback,deps?:DependencyList){const {active,reduced}=useContext(FidelityContext);useLayoutEffect(()=>active?effect():undefined,deps===undefined?undefined:[active,reduced,...deps]);}
export function useScopedReducedMotion(){const {active,reduced}=useContext(FidelityContext);return reduced||!active;}

/** Stops imperative Motion loops while this component's KSF window is inactive. */
export function useFidelityActivity(){return useContext(FidelityContext);}

/** Carries the same fixed-source CSS and theme into a KSF-owned portal. */
export function FidelityPortalFrame({children,style}:{children:ReactNode;style?:CSSProperties}){const context=useContext(FidelityContext);return <div className={`ksf-kokonut ksf-kokonut--${context.module}`} data-ksf-reference-theme={context.theme} data-motion-active={context.active} style={style}>{children}</div>;}
