import {forwardRef,useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {useElementRef,useValue,cx} from '../primitives/state';
import {useWindowContext} from '../window-context';
import type {CarouselProps} from './media-controls';
const clamp=(value:number,max:number)=>Math.max(0,Math.min(Math.max(0,max),Number.isFinite(value)?Math.trunc(value):0));

/** Clones contain pixels/markup only: application components are never mounted twice. */
function cloneSlide(source:HTMLElement|null,target:HTMLElement|null){
 if(!source||!target)return;
 const fragment=source.ownerDocument.createDocumentFragment();for(const child of source.childNodes)fragment.append(child.cloneNode(true));
 for(const element of fragment.querySelectorAll<HTMLElement>('*')){
  element.removeAttribute('id');element.removeAttribute('autofocus');element.removeAttribute('form');element.removeAttribute('name');
  element.setAttribute('tabindex','-1');element.style.animationPlayState='paused';
  if(element.matches('button,input,select,textarea,fieldset,option'))(element as HTMLInputElement).disabled=true;
  if(element.matches('audio,video')){element.removeAttribute('autoplay');(element as HTMLMediaElement).pause();}
  if(element.tagName==='IFRAME'||element.tagName==='SCRIPT'||element.tagName==='OBJECT'||element.tagName==='EMBED')element.remove();
 }
 const sources=source.querySelectorAll('canvas'),copies=fragment.querySelectorAll('canvas');copies.forEach((canvas,i)=>{const original=sources[i];if(!original)return;try{canvas.width=original.width;canvas.height=original.height;canvas.getContext('2d')?.drawImage(original,0,0);}catch{/* A lost drawing context leaves the inert clone empty until the original returns. */}});
 target.replaceChildren(fragment);
}

export const Carousel=forwardRef<HTMLDivElement,CarouselProps>(function Carousel({slides,index,defaultIndex=0,onIndexChange,loop=true,autoplay=false,interval=3000,arrows=false,dots=true,effect='slide',dotsPlacement='bottom',autoplayProgress=false,label='轮播',className,onKeyDown,style,...props},ref){
 const context=useWindowContext(),[root,assign]=useElementRef(ref),uid=useId(),[current,setCurrent]=useValue(index,defaultIndex,onIndexChange),count=slides.length,selected=clamp(current,count-1),cloned=loop&&count>1,vertical=dotsPlacement==='start'||dotsPlacement==='end',delay=Math.max(500,Number.isFinite(interval)?interval:3000);
 const [hover,setHover]=useState(false),[focused,setFocused]=useState(false),[playing,setPlaying]=useState(autoplay),[visible,setVisible]=useState(true),[reduced,setReduced]=useState(false),[rtl,setRtl]=useState(false),[dragging,setDragging]=useState(false),[dragOffset,setDragOffset]=useState(0);
 const [visual,setVisual]=useState({position:selected+(cloned?1:0),animate:false}),moving=useRef(false),timer=useRef<{view:Window;id:number}|null>(null),before=useRef({selected,count,cloned,effect,vertical}),intent=useRef<{from:number;to:number;direction:number}|null>(null),touch=useRef<{id:number;x:number;y:number;offset:number}|null>(null);
 const realSlides=useRef(new Map<number,HTMLDivElement>()),leading=useRef<HTMLDivElement>(null),trailing=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),remaining=useRef({selected,delay,value:delay});
 const latest=useRef({selected,count,cloned,setCurrent,loop,context,reduced,visible,vertical,rtl});latest.current={selected,count,cloned,setCurrent,loop,context,reduced,visible,vertical,rtl};
 const interactive=context.active&&context.enabled&&visible,running=playing&&!hover&&!focused&&!reduced&&!visual.animate&&!dragging&&interactive&&count>1;
 const clearMotion=()=>{if(timer.current){timer.current.view.clearTimeout(timer.current.id);timer.current=null;}moving.current=false;};
 const finish=()=>{clearMotion();const state=latest.current;setVisual({position:state.selected+(state.cloned?1:0),animate:false});};
 const scheduleFinish=()=>{const view=root.current?.ownerDocument.defaultView;if(!view)return;clearMotion();moving.current=true;timer.current={view,id:view.setTimeout(finish,550)};};
 const resetDrag=()=>{const pointer=touch.current;touch.current=null;setDragging(false);setDragOffset(0);if(pointer&&root.current?.hasPointerCapture(pointer.id))root.current.releasePointerCapture(pointer.id);};
 useEffect(()=>setPlaying(autoplay),[autoplay]);
 useEffect(()=>{const node=root.current,doc=node?.ownerDocument,view=doc?.defaultView;if(!node||!doc||!view)return;const media=view.matchMedia('(prefers-reduced-motion: reduce)');let inView=true;const sync=()=>{setVisible(!doc.hidden&&inView);setReduced(media.matches);setRtl(view.getComputedStyle(node).direction==='rtl');if(!inView||doc.hidden||media.matches){resetDrag();finish();}};const visibility=typeof view.IntersectionObserver==='function'?new view.IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??true;sync();}):null;visibility?.observe(node);sync();doc.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);view.addEventListener('blur',resetDrag);const observer=new view.MutationObserver(sync);for(let parent:HTMLElement|null=node;parent;parent=parent.parentElement)observer.observe(parent,{attributes:true,attributeFilter:['dir','class','style','data-ksf-theme']});return()=>{doc.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);view.removeEventListener('blur',resetDrag);observer.disconnect();visibility?.disconnect();};},[root]);
 useLayoutEffect(()=>{
  const previous=before.current,sameShape=previous.count===count&&previous.cloned===cloned&&previous.effect===effect&&previous.vertical===vertical,changed=previous.selected!==selected;
  before.current={selected,count,cloned,effect,vertical};
  if(!sameShape||!interactive||reduced){resetDrag();finish();intent.current=null;return;}
  if(!changed)return;
  clearMotion();let position=selected+(cloned?1:0);const requested=intent.current;intent.current=null;
  if(effect==='slide'&&cloned&&requested?.from===previous.selected&&requested.to===selected){
   if(previous.selected===count-1&&selected===0&&requested.direction===1){cloneSlide(realSlides.current.get(0)??null,trailing.current);position=count+1;}
   else if(previous.selected===0&&selected===count-1&&requested.direction===-1){cloneSlide(realSlides.current.get(count-1)??null,leading.current);position=0;}
  }
  setVisual({position,animate:true});scheduleFinish();
 },[selected,count,cloned,effect,vertical,interactive,reduced]);
 useEffect(()=>()=>{clearMotion();},[]);
 const request=(next:number,direction=0)=>{if(!interactive||count<2||moving.current)return;const target=clamp(next,count-1);if(target===selected)return;intent.current={from:selected,to:target,direction};setCurrent(target);};
 const move=(delta:number)=>request(loop?(selected+delta+count)%count:clamp(selected+delta,count-1),delta);
 const moveLatest=useRef(move);moveLatest.current=move;
 useEffect(()=>{
  const prior=remaining.current;if(prior.selected!==selected||prior.delay!==delay)remaining.current={selected,delay,value:delay};
  if(!running)return;const view=root.current?.ownerDocument.defaultView;if(!view)return;const started=view.performance.now(),timeout=view.setTimeout(()=>{
   remaining.current={selected,delay,value:delay};
   if(!latest.current.loop&&latest.current.selected===latest.current.count-1){setPlaying(false);return;}
   moveLatest.current(1);
  },Math.max(0,remaining.current.value));
  return()=>{view.clearTimeout(timeout);if(latest.current.selected===selected&&remaining.current.delay===delay)remaining.current.value=Math.max(0,remaining.current.value-(view.performance.now()-started));};
 },[running,selected,delay,loop,root]);
 const slideStyle=(position:number)=>vertical&&effect==='slide'?{'--ksf-carousel-slide-index':position} as CSSProperties:undefined;
 const trackStyle={'--ksf-carousel-position':visual.position,'--ksf-carousel-drag':`${dragOffset}px`,transform:effect==='slide'&&!vertical?`translate3d(calc(${-visual.position*100}% + ${dragOffset}px),0,0)`:undefined} as CSSProperties;
 const complete=(event:import('react').TransitionEvent<HTMLDivElement>)=>{const node=event.target as HTMLElement;if(!moving.current)return;if(effect==='slide'&&!vertical&&node===event.currentTarget&&event.propertyName==='transform'||vertical&&effect==='slide'&&node.dataset.current&&event.propertyName==='transform'||effect==='fade'&&node.dataset.current&&event.propertyName==='opacity')finish();};
 return <div {...props} ref={assign} role={props.role??'region'} aria-roledescription="轮播" aria-label={props['aria-label']??label} className={cx('ksf-carousel',className)} data-effect={effect} data-dots-placement={dotsPlacement} data-vertical={vertical||undefined} data-moving={visual.animate||undefined} data-dragging={dragging||undefined} data-rtl={rtl||undefined} data-reduced-motion={reduced||undefined} data-inactive={!interactive||undefined} style={{'--ksf-carousel-interval':`${delay}ms`,'--ksf-carousel-progress-state':running?'running':'paused',...style} as CSSProperties} onPointerEnter={event=>{props.onPointerEnter?.(event);if(!event.defaultPrevented)setHover(true);}} onPointerLeave={event=>{props.onPointerLeave?.(event);setHover(false);}} onFocus={event=>{props.onFocus?.(event);setFocused(true);}} onBlur={event=>{props.onBlur?.(event);if(!event.currentTarget.contains(event.relatedTarget as Node))setFocused(false);}} onKeyDown={event=>{
  onKeyDown?.(event);if(!interactive||event.defaultPrevented||event.nativeEvent.isComposing||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move((event.key==='ArrowLeft'?-1:1)*(rtl?-1:1));}
  else if(vertical&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();move(event.key==='ArrowUp'?-1:1);}
  else if(event.key==='Home'||event.key==='End'){event.preventDefault();request(event.key==='Home'?0:count-1);}
 }} onPointerDown={event=>{
  props.onPointerDown?.(event);if(event.defaultPrevented||!interactive||moving.current||count<2||event.pointerType==='mouse'||event.button!==0||(event.target as HTMLElement).closest('button,a,input,textarea,select,[contenteditable=true]'))return;
  touch.current={id:event.pointerId,x:event.clientX,y:event.clientY,offset:0};event.currentTarget.setPointerCapture(event.pointerId);
 }} onPointerMove={event=>{
  props.onPointerMove?.(event);const start=touch.current;if(event.defaultPrevented||!interactive||!start||start.id!==event.pointerId)return;
  const primary=vertical?event.clientY-start.y:event.clientX-start.x,cross=vertical?event.clientX-start.x:event.clientY-start.y;
  if(!dragging&&Math.abs(cross)>Math.abs(primary)&&Math.abs(cross)>10){resetDrag();return;}if(Math.abs(primary)<5&&!dragging)return;
  event.preventDefault();setDragging(true);const size=vertical?viewport.current?.clientHeight:viewport.current?.clientWidth,direction=primary*(rtl&&!vertical?-1:1),edge=!loop&&(selected===0&&direction>0||selected===count-1&&direction<0),offset=Math.max(-(size??Infinity),Math.min(size??Infinity,primary*(edge ? .35 : 1)));start.offset=offset;setDragOffset(offset);
 }} onPointerUp={event=>{
  props.onPointerUp?.(event);const start=touch.current;if(!start||start.id!==event.pointerId)return;const size=vertical?viewport.current?.clientHeight:viewport.current?.clientWidth,offset=start.offset,direction=(offset<0?1:-1)*(rtl&&!vertical?-1:1);resetDrag();
  if(event.defaultPrevented||!interactive)return;
  if(Math.abs(offset)>Math.max(20,(size??200)/5))move(direction);
  // Animate back when the threshold, non-loop boundary or controlled parent rejects a move.
  if(offset&&!moving.current&&!reduced){setVisual(previous=>({...previous,animate:true}));scheduleFinish();}
 }} onPointerCancel={event=>{props.onPointerCancel?.(event);resetDrag();if(!reduced){setVisual(previous=>({...previous,animate:true}));scheduleFinish();}}} onLostPointerCapture={event=>{props.onLostPointerCapture?.(event);if(touch.current)resetDrag();}}>
  <div ref={viewport} className="ksf-carousel-viewport" aria-live={running?'off':'polite'}>
   <div className="ksf-carousel-track" style={trackStyle} onTransitionEnd={complete}>
    {cloned&&effect==='slide'&&<div ref={leading} className="ksf-carousel-slide" data-clone="leading" aria-hidden="true" inert style={slideStyle(0)}/>}
    {slides.map((slide,i)=><div id={`${uid}-${i}`} key={i} ref={node=>{if(node)realSlides.current.set(i,node);else realSlides.current.delete(i);}} dir={rtl?'rtl':'ltr'} className="ksf-carousel-slide" role="group" aria-roledescription="幻灯片" aria-label={`${i+1} / ${count}`} aria-hidden={i!==selected} inert={!interactive||i!==selected||undefined} data-current={i===selected||undefined} style={slideStyle(i+(cloned?1:0))}>{slide}</div>)}
    {cloned&&effect==='slide'&&<div ref={trailing} className="ksf-carousel-slide" data-clone="trailing" aria-hidden="true" inert style={slideStyle(count+1)}/>}
   </div>
   {arrows&&count>1&&<><button type="button" className="ksf-carousel-arrow" data-direction="previous" aria-label="上一页" disabled={!interactive||(!loop&&selected===0)} onClick={()=>move(-1)}/><button type="button" className="ksf-carousel-arrow" data-direction="next" aria-label="下一页" disabled={!interactive||(!loop&&selected===count-1)} onClick={()=>move(1)}/></>}
   {dots&&count>0&&<div className="ksf-carousel-dots" role="group" aria-label="选择幻灯片">{slides.map((_,i)=><button key={i} type="button" aria-label={`第${i+1}页`} aria-current={i===selected?'true':undefined} aria-controls={`${uid}-${i}`} disabled={!interactive} onClick={()=>request(i)}><span className="ksf-carousel-dot-track" aria-hidden="true"/>{i===selected&&autoplay&&autoplayProgress&&<i key={`${i}-${delay}`} className="ksf-carousel-dot-progress" aria-hidden="true"/>}</button>)}</div>}
   {autoplay&&<button type="button" className="ksf-carousel-play" disabled={!interactive} aria-label={playing?'暂停自动播放':'开始自动播放'} aria-pressed={playing} title={playing?'暂停自动播放':'开始自动播放'} onClick={()=>setPlaying(value=>!value)}><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">{playing?<path d="M4 3h3v10H4zm5 0h3v10H9z"/>:<path d="M4 2l10 6-10 6z"/>}</svg></button>}
   {!count&&<div role="status" className="ksf-carousel-empty">暂无内容</div>}
  </div>
 </div>;
});
