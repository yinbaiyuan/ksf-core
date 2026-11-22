import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useWindowContext} from '../window-context';

/** A finite height transition, with no animation runtime or cross-window timers. */
export function TreeBranch({open,children}:{open:boolean;children:ReactNode|(()=>ReactNode)}) {
  const [present,setPresent]=useState(open), element=useRef<HTMLUListElement>(null), initial=useRef(true), context=useWindowContext();
  useLayoutEffect(()=>{
    if(initial.current){initial.current=false;return;}
    if(open&&!present){setPresent(true);return;}
    const node=element.current,doc=node?.ownerDocument,view=doc?.defaultView;
    if(!node||!doc||!view)return;
    const media=view.matchMedia('(prefers-reduced-motion: reduce)');
    const reset=()=>{node.removeAttribute('data-moving');if(open){node.style.removeProperty('height');node.style.removeProperty('opacity');}else{node.style.height='0px';node.style.opacity='0';}};
    if(!context.active||!context.enabled||doc.hidden||media.matches){reset();setPresent(open);return;}
    let disposed=false,started=false,frame=0,timer=0,observer:ResizeObserver|undefined,mutation:MutationObserver|undefined;
    const finish=()=>{if(disposed)return;disposed=true;media.removeEventListener('change',reduced);doc.removeEventListener('visibilitychange',visibility);view.removeEventListener('blur',blur);node.removeEventListener('transitionend',end);view.cancelAnimationFrame(frame);view.clearTimeout(timer);observer?.disconnect();mutation?.disconnect();reset();setPresent(open);};
    const reduced=()=>{if(media.matches)finish();},visibility=()=>{if(doc.hidden)finish();},blur=()=>finish();
    const end=(event:TransitionEvent)=>{if(event.target===node&&event.propertyName==='height')finish();};
    const height=node.getBoundingClientRect().height,opacity=view.getComputedStyle(node).opacity,moving=node.hasAttribute('data-moving');
    node.removeAttribute('data-moving');node.style.height=`${open&&!moving?0:height}px`;node.style.opacity=open&&!moving?'0':opacity;
    void node.offsetHeight;
    node.setAttribute('data-moving','');
    const deadline=()=>{view.clearTimeout(timer);timer=view.setTimeout(finish,220);};
    frame=view.requestAnimationFrame(()=>{frame=view.requestAnimationFrame(()=>{frame=0;started=true;node.style.height=`${open?node.scrollHeight:0}px`;node.style.opacity=open?'1':'0';deadline();});});
    const resize=()=>{if(open&&started&&!disposed&&node.hasAttribute('data-moving')){const next=`${node.scrollHeight}px`;if(node.style.height!==next){node.style.height=next;deadline();}}};
    observer=new view.ResizeObserver(resize);
    const observeChildren=()=>{observer?.disconnect();for(const child of node.children)observer?.observe(child);resize();};
    for(const child of node.children)observer.observe(child);
    mutation=new view.MutationObserver(observeChildren);mutation.observe(node,{childList:true});
    media.addEventListener('change',reduced);doc.addEventListener('visibilitychange',visibility);view.addEventListener('blur',blur);node.addEventListener('transitionend',end);
    return()=>{disposed=true;view.cancelAnimationFrame(frame);view.clearTimeout(timer);observer?.disconnect();mutation?.disconnect();media.removeEventListener('change',reduced);doc.removeEventListener('visibilitychange',visibility);view.removeEventListener('blur',blur);node.removeEventListener('transitionend',end);};
  },[open,present,context.active,context.enabled]);
  return present?<ul ref={element} role="group" className="ksf-tree-branch" aria-hidden={!open||undefined} inert={!open||undefined}>{typeof children==='function'?children():children}</ul>:null;
}
