// Adapted from Cult UI Gradient Button Group, MIT (Jordan-Gilliam).
// Source and license: scripts/licenses/cult-ui-gradient-button-group.txt.
import {useEffect,useId,useRef,type KeyboardEvent,type ReactNode} from 'react';
import {LayoutGroup,motion,useReducedMotion} from 'motion/react';
import './gradient-button-group.css';

export interface GradientGroupItem {id:string;label:string;icon:ReactNode}
type Props={items:GradientGroupItem[];value:string;onValueChange:(id:string)=>void;enabled:boolean;onHint:(node:HTMLElement,label:string)=>void;onHideHint:()=>void};

/** Controlled navigation: the selected ring follows the committed desktop group. */
export function GradientButtonGroup({items,value,onValueChange,enabled,onHint,onHideHint}:Props){
  const id=useId(),root=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
  const animate=enabled&&!reduced;
  const transition=animate?{type:'spring' as const,stiffness:400,damping:30}:{duration:0};
  useEffect(()=>{
    const node=root.current;if(!node)return;
    const reveal=()=>node.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
    reveal();const observer=new ResizeObserver(reveal);observer.observe(node);return()=>observer.disconnect();
  },[value]);
  const hint=(node:HTMLButtonElement,label:string)=>{const text=node.querySelector<HTMLElement>('.group-button-label');if(text&&text.scrollWidth>text.clientWidth)onHint(node,label);};
  const key=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(event.target as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    buttons[next]?.focus({preventScroll:true});buttons[next]?.scrollIntoView({block:'nearest',inline:'nearest'});
  };
  const scrolled=()=>{onHideHint();const focused=document.activeElement;if(focused instanceof HTMLButtonElement&&root.current?.contains(focused))hint(focused,focused.getAttribute('aria-label')??'');};
  return <LayoutGroup id={id}><motion.div ref={root} layoutScroll className="desktop-group-list gradient-button-group" role="toolbar" aria-label="桌面分组" aria-orientation="horizontal" onKeyDown={key} onScroll={scrolled}>
    {items.map(item=>{const active=item.id===value;return <button key={item.id} type="button" className={`gradient-group-button${active?' is-active':''}`} data-group-id={item.id} aria-label={item.label} aria-pressed={active} tabIndex={active?0:-1}
      onPointerEnter={event=>hint(event.currentTarget,item.label)} onFocus={event=>hint(event.currentTarget,item.label)} onPointerLeave={onHideHint} onBlur={onHideHint} onClick={()=>{onHideHint();if(!active)onValueChange(item.id);}}>
      {active&&<>
        <motion.span aria-hidden="true" className="group-active-well" layoutId="active-well" transition={transition}/>
        <motion.span aria-hidden="true" className="group-active-ring" layoutId="active-gold-ring" transition={transition}><span className="group-gradient-spin"/></motion.span>
        <motion.span aria-hidden="true" className="group-active-gap" layoutId="active-inner-ring" transition={transition}/>
      </>}
      <motion.span aria-hidden="true" className="group-button-face" initial={false} animate={{opacity:active?1:.96}} transition={animate?{duration:.18}:{duration:0}}/>
      <span className="group-button-content"><span className="group-button-icon" aria-hidden="true">{item.icon}</span><span className="group-button-label">{item.label}</span></span>
    </button>;})}
  </motion.div></LayoutGroup>;
}
