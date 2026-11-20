import {useEffect,useLayoutEffect,useId,useRef,useState,type CSSProperties,type HTMLAttributes,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {CircleCheck,Info,TriangleAlert,CircleX} from 'lucide-react';
import {Button,type ControlTone} from './controls';
import {useUI,uiRootAttributes,uiRootStyle} from './provider';
import {acquireToastRegion} from './toast-region';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>,'onClick'|'onKeyDown'|'tabIndex'> {tone?:ControlTone;variant?:'subtle'|'outline';icon?:ReactNode}
export function Badge({tone='neutral',variant='subtle',icon,children,className='',...props}:BadgeProps){useUI();return <span {...props} data-ksf-component="badge" data-tone={tone} data-variant={variant} className={className}>{icon&&<span className="ksf-control-icon" aria-hidden="true">{icon}</span>}{children}</span>;}

function ToneIcon({tone}:{tone:ControlTone}){const Icon=tone==='success'?CircleCheck:tone==='warning'?TriangleAlert:tone==='danger'?CircleX:Info;return <Icon size={16} aria-hidden="true"/>;}
export interface InlineAlertProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'> {tone?:ControlTone;title?:ReactNode;description?:ReactNode;actions?:ReactNode;onDismiss?:()=>void}
export function InlineAlert({tone='info',title,description,actions,onDismiss,children,role,className='',...props}:InlineAlertProps){
  const ui=useUI();return <div {...props} data-ksf-component="inline-alert" data-tone={tone} role={role??(tone==='danger'?'alert':'status')} aria-live={props['aria-live']??(!ui.environment.active||!ui.environment.visible?'off':undefined)} className={className}>
    <span className="ksf-alert-icon"><ToneIcon tone={tone}/></span><div className="ksf-alert-content">{title!=null&&<strong>{title}</strong>}{(description??children)!=null&&<div>{description??children}</div>}{actions&&<div className="ksf-alert-actions">{actions}</div>}</div>
    {onDismiss&&<Button variant="ghost" icon={<span aria-hidden="true">×</span>} aria-label="关闭提示" onActivate={onDismiss}/>}
  </div>;
}

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>,'children'> {label:string;value?:number|null;max?:number;tone?:ControlTone;description?:ReactNode}
/** A presentation of reported progress. Reaching max does not declare a business task completed. */
export function Progress({label,value=null,max=100,tone='info',description,className='',...props}:ProgressProps){
  useUI();const id=useId();if(!Number.isFinite(max)||max<=0)throw Error('Progress的max需要为正有限数值。');
  const valid=typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max,invalid=value!==null&&value!==undefined&&!valid,percent=valid?value/max*100:null;
  return <div {...props} data-ksf-component="progress" data-tone={tone} data-indeterminate={percent===null||undefined} data-invalid={invalid||undefined} className={className}>
    <div className="ksf-progress-heading"><span id={id+'-label'}>{label}</span><span>{percent===null?(invalid?'进度待核对':'处理中'):Math.round(percent)+'%'}</span></div>
    <div className="ksf-progress-track" role="progressbar" aria-labelledby={id+'-label'} aria-valuemin={0} aria-valuemax={max} aria-valuenow={valid?value:undefined} aria-valuetext={percent===null?(invalid?'进度待核对':'处理中'):undefined} aria-describedby={description!=null?id+'-description':undefined}>
      <div className="ksf-progress-bar" style={percent===null?undefined:{width:percent+'%'}}/>
    </div>{description!=null&&<div id={id+'-description'} className="ksf-feedback-description">{description}</div>}
  </div>;
}

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {loaded?:boolean;shape?:'text'|'rectangle'|'circle';lines?:number;width?:CSSProperties['width'];height?:CSSProperties['height'];label?:string}
export function Skeleton({loaded=false,shape='text',lines=1,width,height,label,children,className='',style,...props}:SkeletonProps){
  useUI();if(loaded)return <>{children}</>;if(!Number.isInteger(lines)||lines<1||lines>50)throw Error('Skeleton的lines需要为1至50的整数。');
  const blockHeight=height??style?.height??(shape==='rectangle'?80:shape==='circle'?32:undefined);
  return <div {...props} data-ksf-component="skeleton" data-shape={shape} aria-hidden={label?undefined:true} role={label?'status':undefined} aria-label={label} className={className} style={{...style,width:width??style?.width,height:blockHeight}}>{Array.from({length:shape==='text'?lines:1},(_,index)=><span key={index} className="ksf-skeleton-line" style={{...(shape!=='text'||lines===1&&blockHeight!==undefined?{height:'100%'}:{}),...(shape==='text'&&lines>1&&index===lines-1?{width:'68%'}:{})}}/>)}</div>;
}

export interface DisclosureProps extends Omit<HTMLAttributes<HTMLDetailsElement>,'title'|'onToggle'> {title:ReactNode;open?:boolean;defaultOpen?:boolean;disabled?:boolean;onOpenChange?:(open:boolean)=>void}
export function Disclosure({title,open,defaultOpen=false,disabled=false,onOpenChange,children,className='',...props}:DisclosureProps){
  useUI();const [local,setLocal]=useState(defaultOpen),value=open??local,last=useRef(value),id=useId();last.current=value;
  return <details {...props} data-ksf-component="disclosure" open={value} className={className} onToggle={event=>{const next=event.currentTarget.open;if(open!==undefined||next===last.current)return;last.current=next;setLocal(next);onOpenChange?.(next);}}>
    <summary aria-controls={id} aria-expanded={value} aria-disabled={disabled||undefined} onClick={event=>{if(disabled){event.preventDefault();event.stopPropagation();return;}if(open!==undefined){event.preventDefault();onOpenChange?.(!open);}}}><span className="ksf-disclosure-chevron" aria-hidden="true">›</span>{title}</summary>
    <div id={id} className="ksf-disclosure-content">{children}</div>
  </details>;
}

export interface ToastIntent {id:string;reason:'timeout'|'close'}
export interface ToastProps {id:string;open:boolean;message:ReactNode;title?:ReactNode;tone?:ControlTone;duration?:number|null;onDismiss:(intent:ToastIntent)=>void;action?:{label:ReactNode;disabled?:boolean;busy?:boolean;onActivate:(id:string)=>void}}
/** Owner-scoped feedback is not a dismissible overlay layer and never consumes another dialog's Escape. */
export function Toast({id,open,message,title,tone='info',duration,onDismiss,action}:ToastProps){
  const ui=useUI(),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),alive=useRef(true),current=useRef({id,open,onDismiss});current.current={id,open,onDismiss};
  const [portal,setPortal]=useState<HTMLElement|null>(null),host=ui.environment.overlayHost;
  useLayoutEffect(()=>{if(!open||!host){setPortal(null);return;}const entry=acquireToastRegion(host,ui.environment.owner,id);setPortal(entry.element);return()=>entry.release();},[host,ui.environment.owner,id,open]);
  useLayoutEffect(()=>{setHovered(false);setFocused(false);},[id,open]);
  const deadline=duration===undefined?(['danger','warning'].includes(tone)?null:5000):duration;
  if(!id.trim())throw Error('Toast需要稳定且非空的id。');if(deadline!==null&&(!Number.isFinite(deadline)||deadline<0))throw Error('Toast的duration需要为非负时长或null。');
  const clock=useRef({id,open:false,duration:deadline,remaining:deadline??0,fired:false});
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    if(!open){clock.current.open=false;return;}
    if(clock.current.id!==id||!clock.current.open||clock.current.duration!==deadline)clock.current={id,open:true,duration:deadline,remaining:deadline??0,fired:false};
    const instance=clock.current;
    if(deadline===null||instance.fired||hovered||focused||!ui.environment.visible||!ui.environment.enabled||!ui.environment.active)return;
    const started=performance.now(),timer=setTimeout(()=>{
      if(!alive.current||current.current.id!==id||!current.current.open||clock.current!==instance||instance.fired)return;
      instance.remaining=0;instance.fired=true;current.current.onDismiss({id,reason:'timeout'});
    },instance.remaining);
    return()=>{clearTimeout(timer);if(!instance.fired)instance.remaining=Math.max(0,instance.remaining-(performance.now()-started));};
  },[id,open,deadline,hovered,focused,ui.environment.visible,ui.environment.enabled,ui.environment.active]);
  if(!open)return null;if(!host)throw Error('Toast需要当前owner的弹层容器。');if(!portal)return null;
  return createPortal(<div {...uiRootAttributes(ui)} style={uiRootStyle(ui)} className="ksf-ui-root ksf-ui-toast-root"><div data-ksf-component="toast" data-tone={tone} data-toast-id={id}
    onPointerEnter={event=>{if(event.pointerType==='mouse'||event.pointerType==='pen')setHovered(true);}} onPointerLeave={()=>setHovered(false)}
    onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocused(false);}}>
    <span className="ksf-alert-icon"><ToneIcon tone={tone}/></span><div className="ksf-toast-content"><div role="status" aria-live={ui.environment.active&&ui.environment.visible?'polite':'off'} aria-atomic="true">{title!=null&&<strong>{title}</strong>}<div>{message}</div></div>{action&&<Button variant="ghost" disabled={action.disabled} busy={action.busy} onActivate={()=>action.onActivate(id)}>{action.label}</Button>}</div>
    <Button variant="ghost" icon={<span aria-hidden="true">×</span>} aria-label="关闭通知" onActivate={()=>{clock.current.fired=true;onDismiss({id,reason:'close'});}}/>
  </div></div>,portal,id);
}
