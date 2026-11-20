import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
import type {MentionToken} from './mention-model';
export interface MentionAnchorPosition {left:number;top:number;height:number;visible:boolean}
export function MentionAnchor({input,token,text,enabled,anchor,onPosition}:{input:RefObject<HTMLTextAreaElement|null>;token:MentionToken|null;text:string;enabled:boolean;anchor:RefObject<HTMLSpanElement|null>;onPosition:(position:MentionAnchorPosition)=>void}){
 const previous=useRef<MentionAnchorPosition|null>(null),mirror=useRef<HTMLDivElement>(null),mark=useRef<HTMLSpanElement>(null),[position,setPosition]=useState<{left:number;top:number;height:number;visible:boolean}>({left:0,top:0,height:0,visible:false});
 useLayoutEffect(()=>{
  const field=input.current,copy=mirror.current,marker=mark.current,holder=copy?.parentElement,view=field?.ownerDocument.defaultView;
  if(!enabled||!token||!field||!copy||!marker||!holder||!view)return;
  const measure=()=>{
   const css=view.getComputedStyle(field),fieldBox=field.getBoundingClientRect(),holderBox=holder.getBoundingClientRect();
   for(const name of ['font','line-height','letter-spacing','word-spacing','text-transform','text-indent','text-align','direction','tab-size','padding','border-width','border-style'])copy.style.setProperty(name,css.getPropertyValue(name));
   copy.style.borderColor='transparent';copy.style.width=`${field.offsetWidth}px`;copy.style.height=`${field.offsetHeight}px`;copy.style.left=`${fieldBox.left-holderBox.left}px`;copy.style.top=`${fieldBox.top-holderBox.top}px`;
   const box=marker.getBoundingClientRect(),next={left:box.right-holderBox.left-field.scrollLeft,top:box.top-holderBox.top-field.scrollTop,height:box.height,visible:box.bottom-field.scrollTop>fieldBox.top&&box.top-field.scrollTop<fieldBox.bottom&&box.right-field.scrollLeft>=fieldBox.left&&box.left-field.scrollLeft<=fieldBox.right};
   const old=previous.current;if(!old||old.left!==next.left||old.top!==next.top||old.height!==next.height||old.visible!==next.visible){previous.current=next;setPosition(next);onPosition(next);}
  };
  measure();const observer=new view.ResizeObserver(measure);observer.observe(field);observer.observe(holder);field.addEventListener('scroll',measure);view.addEventListener('resize',measure);
  return()=>{observer.disconnect();field.removeEventListener('scroll',measure);view.removeEventListener('resize',measure);};
 },[text,token?.start,token?.end,token?.prefix,enabled,input,onPosition]);
 return <><div ref={mirror} className="ksf-mention-mirror" aria-hidden="true">{token&&<>{text.slice(0,token.start)}<span ref={mark}>{token.prefix}</span>{text.slice(token.start+token.prefix.length)}</>}</div><span ref={anchor} className="ksf-mention-anchor" aria-hidden="true" data-visible={enabled&&!!token&&position.visible||undefined} style={{left:position.left,top:position.top,width:0,height:position.height}}/></>;
}
