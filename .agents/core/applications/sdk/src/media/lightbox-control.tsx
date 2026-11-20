import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {WindowLayer} from '../overlays/window-layer';
import {ControlIcon} from '../primitives/control-icons';
import {useValue} from '../primitives/state';
import {useWindowContext} from '../window-context';
import {ImageOperationIcon} from './image-operation-icons';
import type {LightboxProps} from './media-controls';

const initialTransform={scale:1,angle:0,flipX:false,flipY:false,x:0,y:0};
type Transform=typeof initialTransform;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** Ant 6.7.1 image geometry, owned by KSF's existing modal/focus boundary. */
export function Lightbox({open,items,onClose,index,defaultIndex=0,onIndexChange,loop=true,label='图片预览',effect='fade',dismissOnDrag=false,origin}:LightboxProps){
 const context=useWindowContext(),uid=useId(),[current,setCurrent]=useValue(index,defaultIndex,onIndexChange);
 const selected=clamp(Number.isFinite(current)?Math.trunc(current):0,0,Math.max(0,items.length-1)),item=items[selected],source=item?.previewSrc??item?.src;
 const [transform,setTransform]=useState(initialTransform),[stage,setStage]=useState<HTMLDivElement|null>(null),image=useRef<HTMLImageElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 const [loadedSource,setLoadedSource]=useState<string|undefined>(),[failedSource,setFailedSource]=useState<string|undefined>(),[reduced,setReduced]=useState(false),[visible,setVisible]=useState(true),[dragging,setDragging]=useState(false);
 const drag=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
 const latest=useRef({onClose,open,context,transform,selected,items,loop,source});latest.current={onClose,open,context,transform,selected,items,loop,source};
 const interactive=open&&context.active&&context.enabled&&visible;
 const bounds=(next:Transform)=>{const node=image.current;if(!stage||!node)return {x:0,y:0};const odd=Math.abs(Math.round(next.angle/90))%2===1,width=(odd?node.offsetHeight:node.offsetWidth)*next.scale,height=(odd?node.offsetWidth:node.offsetHeight)*next.scale;return {x:Math.max(0,(width-stage.clientWidth)/2),y:Math.max(0,(height-stage.clientHeight)/2)};};
 const constrain=(next:Transform)=>{const limit=bounds(next);return {...next,x:clamp(next.x,-limit.x,limit.x),y:clamp(next.y,-limit.y,limit.y)};};
 const cancelDrag=()=>{const pointer=drag.current;drag.current=null;setDragging(false);if(pointer&&stage?.hasPointerCapture(pointer.id))stage.releasePointerCapture(pointer.id);};
 const requestClose=()=>{if(!latest.current.open||!latest.current.context.active||!latest.current.context.enabled)return;cancelDrag();latest.current.onClose();};
 useLayoutEffect(()=>{cancelDrag();if(open)setTransform(initialTransform);},[selected,open,source]);
 useEffect(()=>{if(!context.active||!context.enabled||!open)cancelDrag();},[open,context.active,context.enabled]);
 useLayoutEffect(()=>{if(!stage||!open)return;const rect=stage.parentElement?.getBoundingClientRect();stage.style.transformOrigin=origin&&rect?`${origin.x-rect.left}px ${origin.y-rect.top}px`:'50% 50%';},[stage,open,origin]);
 useEffect(()=>{if(!stage)return;const doc=stage.ownerDocument,view=doc.defaultView;if(!view)return;const media=view.matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>{setReduced(media.matches);setVisible(!doc.hidden);if(media.matches||doc.hidden){cancelDrag();}};sync();doc.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);view.addEventListener('blur',cancelDrag);return()=>{doc.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);view.removeEventListener('blur',cancelDrag);};},[stage]);
 useEffect(()=>{if(!stage||!open)return;const view=stage.ownerDocument.defaultView;if(!view)return;const resize=()=>setTransform(previous=>constrain(previous));const observer=new view.ResizeObserver(resize);observer.observe(stage);if(image.current)observer.observe(image.current);return()=>observer.disconnect();},[stage,open,source]);
 const zoom=(ratio:number,point?:{x:number;y:number})=>{if(!interactive||!image.current||failedSource===source)return;setTransform(previous=>{const scale=clamp(previous.scale*ratio,1,50),factor=scale/previous.scale,rect=stage?.getBoundingClientRect(),anchor=point&&rect?{x:point.x-rect.left-rect.width/2,y:point.y-rect.top-rect.height/2}:{x:0,y:0};return constrain({...previous,scale,x:previous.x*factor+(1-factor)*anchor.x,y:previous.y*factor+(1-factor)*anchor.y});});};
 const wheel=useRef(zoom);wheel.current=zoom;
 useEffect(()=>{if(!stage||!open)return;const onWheel=(event:WheelEvent)=>{const state=latest.current;if(!state.context.active||!state.context.enabled||stage.ownerDocument.hidden||!image.current||event.deltaY===0)return;event.preventDefault();const change=1+Math.min(Math.abs(event.deltaY)/100,1)*.5;wheel.current(event.deltaY<0?change:1/change,{x:event.clientX,y:event.clientY});};stage.addEventListener('wheel',onWheel,{passive:false});return()=>stage.removeEventListener('wheel',onWheel);},[stage,open]);
 const move=(delta:number)=>{if(!interactive||items.length<2)return;const next=loop?(selected+delta+items.length)%items.length:clamp(selected+delta,0,items.length-1);if(next!==selected)setCurrent(next);};
 const change=(patch:Partial<Transform>)=>{if(interactive)setTransform(previous=>constrain({...previous,...patch,x:0,y:0}));};
 const imageReady=!!source&&failedSource!==source,disabled=!interactive||!imageReady;
 return <WindowLayer open={open} motion={effect==='none'?undefined:'image'} onClose={requestClose} initialFocus={closeButton} className="ksf-lightbox" aria-label={label} aria-modal="true" aria-describedby={`${uid}-status`} inert={!context.active||undefined} data-lightbox-effect={effect} data-reduced-motion={reduced||undefined} data-visible={visible||undefined} data-inactive={!context.active||!context.enabled||undefined} onKeyDown={event=>{
  if(!interactive||event.defaultPrevented||event.nativeEvent.isComposing||/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}
  else if(event.key==='0'){event.preventDefault();setTransform(initialTransform);}
 }}>
  <div ref={setStage} className="ksf-lightbox-stage" data-pannable={transform.scale>1||dismissOnDrag||undefined} data-dragging={dragging||undefined} onClick={event=>{if(event.target===event.currentTarget)void requestClose();}} onPointerDown={event=>{
   if(!interactive||event.button!==0||event.target!==image.current||(transform.scale<=1&&!dismissOnDrag))return;
   event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:transform.x,top:transform.y};setDragging(true);
  }} onPointerMove={event=>{const start=drag.current;if(!interactive||!start||start.id!==event.pointerId)return;if(transform.scale<=1&&dismissOnDrag){setTransform(previous=>({...previous,x:(event.clientX-start.x)*.15,y:Math.max(0,event.clientY-start.y)}));return;}setTransform(previous=>constrain({...previous,x:start.left+event.clientX-start.x,y:start.top+event.clientY-start.y}));}} onPointerUp={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;const dismiss=transform.scale<=1&&dismissOnDrag&&event.clientY-start.y>95;cancelDrag();if(dismiss)void requestClose();else setTransform(previous=>constrain(previous));}} onPointerCancel={()=>{cancelDrag();setTransform(previous=>constrain(previous));}} onLostPointerCapture={()=>{if(drag.current){drag.current=null;setDragging(false);setTransform(previous=>constrain(previous));}}}>
   {source&&failedSource!==source?<img key={item?.id+source} ref={image} src={source} alt={item?.alt??''} draggable={false} className="ksf-lightbox-image" data-loaded={loadedSource===source||undefined} style={{transform:`translate3d(${transform.x}px,${transform.y}px,0) rotate(${transform.angle}deg) scale(${transform.flipX?-transform.scale:transform.scale},${transform.flipY?-transform.scale:transform.scale})`}} onLoad={()=>{setLoadedSource(source);setTransform(previous=>constrain(previous));}} onError={()=>setFailedSource(source)} onDoubleClick={event=>{event.preventDefault();if(transform.scale>1)setTransform(initialTransform);else zoom(1.5,{x:event.clientX,y:event.clientY});}}/>:<div className="ksf-lightbox-empty" role="status">{source?'图片加载失败':'暂无图片'}</div>}
   {source&&loadedSource!==source&&failedSource!==source&&<span className="ksf-visually-hidden" role="status">正在加载图片</span>}
  </div>
  <button ref={closeButton} type="button" className="ksf-lightbox-close" aria-label="关闭图片预览" title="关闭图片预览" disabled={!interactive} onClick={()=>void requestClose()}><ControlIcon name="CloseOutlined"/></button>
  {items.length>1&&<><button type="button" className="ksf-lightbox-switch" data-direction="previous" aria-label="上一张图片" title="上一张图片" disabled={!interactive||(!loop&&selected===0)} onClick={()=>move(-1)}><ControlIcon name="LeftOutlined"/></button><button type="button" className="ksf-lightbox-switch" data-direction="next" aria-label="下一张图片" title="下一张图片" disabled={!interactive||(!loop&&selected===items.length-1)} onClick={()=>move(1)}><ControlIcon name="RightOutlined"/></button></>}
  <div className="ksf-lightbox-footer">
   {item?.caption!=null&&item.caption!==false&&<div className="ksf-lightbox-caption">{item.caption}</div>}
   {items.length>1&&<bdi className="ksf-lightbox-count" aria-live="polite">{selected+1} / {items.length}</bdi>}
   <div className="ksf-lightbox-tools" role="group" aria-label="预览操作">
    <button type="button" disabled={disabled} aria-label="垂直翻转图片" title="垂直翻转图片" aria-pressed={transform.flipY} onClick={()=>change({flipY:!transform.flipY})}><ImageOperationIcon name="SwapOutlined" className="ksf-lightbox-flip-y"/></button>
    <button type="button" disabled={disabled} aria-label="水平翻转图片" title="水平翻转图片" aria-pressed={transform.flipX} onClick={()=>change({flipX:!transform.flipX})}><ImageOperationIcon name="SwapOutlined"/></button>
    <button type="button" disabled={disabled} aria-label="向左旋转图片" title="向左旋转图片" onClick={()=>change({angle:transform.angle-90})}><ImageOperationIcon name="RotateLeftOutlined"/></button>
    <button type="button" disabled={disabled} aria-label="向右旋转图片" title="向右旋转图片" onClick={()=>change({angle:transform.angle+90})}><ImageOperationIcon name="RotateRightOutlined"/></button>
    <button type="button" disabled={disabled||transform.scale<=1} aria-label="缩小图片" title="缩小图片" onClick={()=>zoom(1/1.5)}><ImageOperationIcon name="ZoomOutOutlined"/></button>
    <button type="button" disabled={disabled||transform.scale>=50} aria-label="放大图片" title="放大图片" onClick={()=>zoom(1.5)}><ImageOperationIcon name="ZoomInOutlined"/></button>
   </div>
   <output id={`${uid}-status`} className="ksf-visually-hidden" aria-live="polite">{item?`${item.alt}，${selected+1} / ${items.length}，缩放 ${Math.round(transform.scale*100)}%。方向键切换，0 复位。`:'暂无图片'}</output>
  </div>
 </WindowLayer>;
}
