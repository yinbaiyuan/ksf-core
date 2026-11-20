import {useCallback,useEffect,useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactNode,type CSSProperties} from 'react';
import {Button} from '../button';
import {ControlIcon} from '../primitives/control-icons';
import {useFinitePresence} from '../primitives/finite-presence';
import {useMotionActivity} from '../motion-activity';
import {useWindowContext} from '../window-context';
import {WindowPortal} from '../primitives/window-portal';
import {FeedbackIcon,type FeedbackTone} from './feedback-controls';
import './feedback.css';
export interface FeedbackItem {id:string;heading:ReactNode;description?:ReactNode;tone?:FeedbackTone|'loading';duration?:number;actions?:ReactNode;closable?:boolean;icon?:ReactNode}
export type FeedbackInput=Omit<FeedbackItem,'id'>&{id?:string};
export type FeedbackDismissReason='timeout'|'close';
/** State is local to this hook; mount Toast or Notification in the same window. No global service. */
export function useFeedback({limit=5}:{limit?:number}={}){
 const [items,setItems]=useState<FeedbackItem[]>([]),sequence=useRef(0),prefix=useRef('feedback-'+Math.random().toString(36).slice(2));
 const show=useCallback((input:FeedbackInput)=>{const id=input.id??`${prefix.current}-${++sequence.current}`;setItems(old=>{const index=old.findIndex(item=>item.id===id);if(index>=0)return old.map(item=>item.id===id?{...item,...input,id}:item);return [...old,{...input,id}].slice(-Math.max(1,Math.round(limit)));});return id;},[limit]);
 const update=useCallback((id:string,patch:Partial<Omit<FeedbackItem,'id'>>)=>setItems(old=>old.map(item=>item.id===id?{...item,...patch}:item)),[]);
 const dismiss=useCallback((id:string)=>setItems(old=>old.filter(item=>item.id!==id)),[]),clear=useCallback(()=>setItems([]),[]);
 return {items,show,update,dismiss,clear};
}
export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>,'children'>{items:readonly FeedbackItem[];onDismiss:(id:string,reason:FeedbackDismissReason)=>void;duration?:number;placement?:'top-start'|'top'|'top-end'|'bottom-start'|'bottom'|'bottom-end';label?:string;appearance?:'list'|'stack'}
function NoticeItem({item,onDismiss,duration,notification,open,forcedPaused,onExited}:{item:FeedbackItem;onDismiss:NoticeProps['onDismiss'];duration:number;notification:boolean;open:boolean;forcedPaused:boolean;onExited:()=>void}){
 const context=useWindowContext(),[paused,setPaused]=useState(false),element=useRef<HTMLDivElement>(null),remaining=useRef(0),started=useRef(0),latest=useRef(onDismiss),[visible,setVisible]=useState(true);latest.current=onDismiss;
 const lifetime=item.duration??duration,activity=useMotionActivity<HTMLDivElement>(),presence=useFinitePresence(open,{enabled:true},element,context.active&&context.enabled);
 useEffect(()=>{if(!open&&!presence.present)onExited();},[open,presence.present,onExited]);
 useEffect(()=>{remaining.current=Math.max(0,lifetime)*1000;},[item.heading,item.description,item.tone,lifetime]);
 useEffect(()=>{const doc=element.current?.ownerDocument;if(!doc)return;const change=()=>setVisible(!doc.hidden);change();doc.addEventListener('visibilitychange',change);return()=>doc.removeEventListener('visibilitychange',change);},[]);
 useEffect(()=>{if(!open||forcedPaused||lifetime<=0||item.tone==='loading'||paused||!context.active||!context.enabled||!visible)return;started.current=Date.now();const timer=setTimeout(()=>latest.current(item.id,'timeout'),Math.max(0,remaining.current));return()=>{clearTimeout(timer);remaining.current=Math.max(0,remaining.current-(Date.now()-started.current));};},[item.id,item.heading,item.description,item.tone,lifetime,paused,forcedPaused,open,context.active,context.enabled,visible]);
 if(!presence.present)return null;
 return <div ref={node=>{element.current=node;activity.ref.current=node;}} data-motion-active={activity.active} data-motion-phase={presence.phase} inert={!open||undefined} aria-hidden={!open||undefined} className={notification?'ksf-notification-item':'ksf-toast-item'} data-tone={item.tone??'info'} data-closable={(item.closable??notification)||undefined} onPointerEnter={()=>setPaused(true)} onPointerLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setPaused(false);}} role={item.tone==='error'?'alert':'status'}>{item.icon??(item.tone==='loading'?<ControlIcon name="LoadingOutlined" className="ksf-notice-loading-svg"/>:<FeedbackIcon tone={item.tone}/>)}<div className="ksf-notice-copy"><div className="ksf-notice-heading">{item.heading}</div>{item.description&&<div className="ksf-notice-description">{item.description}</div>}{item.actions&&<div className="ksf-notice-actions">{item.actions}</div>}</div>{(item.closable??notification)&&<Button className="ksf-notice-close" size="small" variant="text" aria-label={notification?'关闭通知':'关闭消息'} onClick={()=>onDismiss(item.id,'close')}><ControlIcon name="CloseOutlined"/></Button>}</div>;
}
interface RetainedNotice {item:FeedbackItem;open:boolean}
function Notices({items,onDismiss,duration=3,placement='top-end',label,notification=false,appearance='list',className='',style,...props}:NoticeProps&{notification?:boolean}){
 const [hovering,setHovering]=useState(false),[focused,setFocused]=useState(false),stack=appearance==='stack',expanded=!stack||hovering||focused||items.length<=3;
 const [retained,setRetained]=useState<RetainedNotice[]>(()=>items.map(item=>({item,open:true}))),latestItems=useRef(items);latestItems.current=items;
 const nodes=useRef(new Map<string,HTMLDivElement>()),lastPositions=useRef(new Map<string,{y:number;index:number}>()),[sizes,setSizes]=useState<Record<string,number>>({});
 useLayoutEffect(()=>{const ids=new Set(items.map(item=>item.id));setRetained(old=>[...items.map(item=>({item,open:true})),...old.filter(entry=>!ids.has(entry.item.id)).map(entry=>({...entry,open:false}))]);},[items]);
 const finish=useCallback((id:string)=>{if(latestItems.current.some(item=>item.id===id))return;setRetained(old=>old.filter(entry=>entry.item.id!==id));lastPositions.current.delete(id);},[]);
 const identity=retained.map(entry=>entry.item.id).join('\u0000');
 useLayoutEffect(()=>{
  const sample=nodes.current.values().next().value as HTMLDivElement|undefined,view=sample?.ownerDocument.defaultView;if(!view)return;
  const measure=()=>{const next:Record<string,number>={};for(const [id,node] of nodes.current)next[id]=node.offsetHeight;setSizes(old=>Object.keys(next).length===Object.keys(old).length&&Object.keys(next).every(key=>old[key]===next[key])?old:next);};
  const observer=new view.ResizeObserver(measure);for(const node of nodes.current.values())observer.observe(node);measure();return()=>observer.disconnect();
 },[identity]);
 const positions=new Map<string,{y:number;index:number}>();let y=0,total=0;
 [...items].reverse().forEach((item,index)=>{const height=sizes[item.id]??(notification?64:40),position=stack&&!expanded&&index>0?y+8-height:y;positions.set(item.id,{y:position,index});lastPositions.current.set(item.id,{y:position,index});if(!stack||expanded||index<3)total=Math.max(total,position+height);y=stack&&!expanded?position+height:y+height+16;});
 const bottom=placement.startsWith('bottom');
 return <WindowPortal className="ksf-notices-owner"><div {...props} role="region" aria-label={label??(notification?'当前窗口通知':'当前窗口消息')} className={`${notification?'ksf-notifications':'ksf-toasts'} ${className}`} data-placement={placement} data-appearance={appearance} data-expanded={expanded} data-retained-notices="" style={{...style,'--ksf-notices-height':total+'px'} as CSSProperties}
  onPointerEnter={event=>{props.onPointerEnter?.(event);if(stack)setHovering(true);}} onPointerLeave={event=>{props.onPointerLeave?.(event);setHovering(false);}}
  onFocus={event=>{props.onFocus?.(event);if(stack)setFocused(true);}} onBlur={event=>{props.onBlur?.(event);if(!event.currentTarget.contains(event.relatedTarget as Node))setFocused(false);}}
  onClick={event=>{props.onClick?.(event);event.stopPropagation();}}>
  <div className="ksf-notice-stack-layout" style={{height:total}}>{retained.map(entry=>{const {item,open}=entry,position=positions.get(item.id)??lastPositions.current.get(item.id)??{y:0,index:0},hidden=stack&&!expanded&&position.index>=3,blocked=hidden||stack&&!expanded&&position.index>0;
   return <div key={item.id} ref={node=>{if(node)nodes.current.set(item.id,node);else nodes.current.delete(item.id);}} className="ksf-notice-slot" data-stack-index={position.index} data-present={open} data-beyond-stack={hidden||undefined} inert={blocked||!open||undefined} aria-hidden={blocked||!open||undefined} style={{'--stack-index':position.index,'--ksf-notice-y':position.y+'px',zIndex:items.length+1-position.index,...(bottom?{bottom:position.y}:{top:position.y})} as CSSProperties&{'--stack-index':number;'--ksf-notice-y':string}}>
    <NoticeItem {...{item,onDismiss,duration,notification,open}} forcedPaused={stack&&(hovering||focused)} onExited={()=>finish(item.id)}/>
   </div>;
  })}</div>
 </div></WindowPortal>;
}
export function Toast(props:NoticeProps){return <Notices {...props} placement={props.placement??'top'}/>;}
export function Notification(props:NoticeProps){return <Notices {...props} duration={props.duration??4.5} appearance={props.appearance??'stack'} notification/>;}
