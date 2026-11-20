import {forwardRef,useCallback,useEffect,useRef,useState,type ForwardedRef,type HTMLAttributes,type ReactNode} from 'react';
import {Button} from '../button';
import {useMotionActivity} from '../motion-activity';
import {cx,useElementRef} from '../primitives/state';
import {ControlIcon,type ControlIconName} from '../primitives/control-icons';
import {ResultIllustration} from './result-illustration';
import {useFinitePresence} from '../primitives/finite-presence';
import {useWindowContext} from '../window-context';
import {DefaultEmptyIllustration} from '../primitives/default-empty-illustration';
import {EmptyIllustration} from '../primitives/empty-illustration';
import './feedback.css';
export type FeedbackTone='info'|'success'|'warning'|'error';
function useFeedbackActivity<T extends HTMLElement>(forwarded:ForwardedRef<T>,enabled:boolean){
 const activity=useMotionActivity<T>({enabled}),[,assign]=useElementRef(forwarded);
 const ref=useCallback((node:T|null)=>{activity.ref.current=node;const cleanup=assign(node);if(typeof cleanup==='function')return()=>{activity.ref.current=null;cleanup();};},[assign]);
 return {ref,active:activity.active};
}
export function FeedbackIcon({tone='info',result=false}:{tone?:FeedbackTone;result?:boolean}){
 const names:Record<FeedbackTone,ControlIconName>={success:'CheckCircleFilled',error:'CloseCircleFilled',warning:result?'WarningFilled':'ExclamationCircleFilled',info:result?'ExclamationCircleFilled':'InfoCircleFilled'};
 return <span className="ksf-feedback-icon" data-tone={tone} aria-hidden="true"><ControlIcon name={names[tone]}/></span>;
}
export interface InlineAlertProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'>{heading?:ReactNode;tone?:FeedbackTone;icon?:ReactNode|false;actions?:ReactNode;onDismiss?:()=>void;banner?:boolean;variant?:'outlined'|'filled'}
export const InlineAlert=forwardRef<HTMLDivElement,InlineAlertProps>(function InlineAlert({heading,tone:providedTone,icon,actions,onDismiss,banner=false,variant='outlined',children,className,...props},ref){
 const [closed,setClosed]=useState(false),[element,assign]=useElementRef(ref),context=useWindowContext(),notified=useRef(false),latestDismiss=useRef(onDismiss);latestDismiss.current=onDismiss;
 const presence=useFinitePresence(!closed,{enabled:true,enterDuration:0,exitDuration:300,animateInitial:false},element,context.active&&context.enabled);
 useEffect(()=>{if(closed&&!presence.present&&!notified.current){notified.current=true;latestDismiss.current?.();}},[closed,presence.present]);
 const dismiss=()=>{if(closed)return;const node=element.current,view=node?.ownerDocument.defaultView;if(node&&view){const style=view.getComputedStyle(node);node.style.setProperty('--ksf-alert-close-height',node.offsetHeight+'px');node.style.setProperty('--ksf-alert-close-padding-top',style.paddingTop);node.style.setProperty('--ksf-alert-close-padding-bottom',style.paddingBottom);node.style.setProperty('--ksf-alert-close-margin-bottom',style.marginBottom);}setClosed(true);};
 const tone=providedTone??(banner?'warning':'info'),description=heading!==undefined&&heading!==null&&children!==undefined&&children!==null,showIcon=icon===true||icon!==false&&(icon!==undefined||banner);
 if(!presence.present)return null;
 return <div {...props} ref={assign} inert={closed||undefined} data-motion-phase={presence.phase} data-variant={variant} role={props.role??(tone==='error'?'alert':'status')} className={cx('ksf-inline-alert',className)} data-tone={tone} data-banner={banner||undefined} data-description={description||undefined}>
  {showIcon&&(icon===true||icon===undefined?<FeedbackIcon tone={tone}/>:icon)}
  <div className="ksf-alert-copy">{heading&&<div className="ksf-alert-heading">{heading}</div>}{children&&<div>{children}</div>}</div>
  {actions&&<div className="ksf-alert-actions">{actions}</div>}{onDismiss&&<Button className="ksf-alert-close" size="small" variant="text" aria-label="关闭提示" onClick={dismiss}><ControlIcon name="CloseOutlined"/></Button>}
 </div>;
});
export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>,'children'>{value?:number;max?:number;variant?:'line'|'circle'|'dashboard';tone?:FeedbackTone;active?:boolean;size?:number;strokeWidth?:number;successValue?:number;steps?:number;showValue?:boolean;format?:(value:number,percent:number)=>ReactNode;label?:string;strokeColor?:string;trailColor?:string;round?:boolean}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
export const Progress=forwardRef<HTMLDivElement,ProgressProps>(function Progress({value=0,max=100,variant='line',tone='info',active=false,size=120,strokeWidth,successValue=0,steps,showValue=true,format,label='进度',strokeColor,trailColor,round=true,className,style,...props},ref){const limit=Number.isFinite(max)&&max>0?max:100,v=clamp(value,0,limit),percent=v/limit*100,success=clamp(successValue,0,v)/limit*100,thickness=clamp(strokeWidth??(variant==='line'?8:Math.max(300/Math.max(32,size),6)),1,24),count=steps?Math.round(clamp(steps,1,100)):0,arc=variant==='dashboard'?(360-75)/360*100:100,radius=50-thickness/2,activity=useFeedbackActivity(ref,active);return <div {...props} ref={activity.ref} data-motion-active={activity.active} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={v} aria-valuetext={tone==='error'?'发生错误':undefined} className={cx('ksf-progress',className)} data-tone={tone==='info'&&percent===100?'success':tone} data-variant={variant} data-active={active||undefined} data-round={round} style={{'--ksf-progress-color':strokeColor,'--ksf-progress-trail':trailColor,'--ksf-progress-label-size':`${Math.max(32,size)*.15+6}px`,...style,...(variant!=='line'?{width:Math.max(32,size)}:{})} as import('react').CSSProperties}>{variant==='line'?<div className="ksf-progress-track" style={{height:thickness}}>{count?<div className="ksf-progress-steps">{Array.from({length:count},(_,i)=><i key={i} data-filled={i<count*percent/100||undefined}/>)}</div>:<><i style={{width:percent+'%'}}/><b style={{width:success+'%'}}/></>}</div>:<svg viewBox="0 0 100 100" className="ksf-progress-circle" aria-hidden="true" style={{transform:`rotate(${variant==='dashboard'?127.5:-90}deg)`}}><circle cx="50" cy="50" r={radius} pathLength="100" fill="none" strokeWidth={thickness} strokeDasharray={`${arc} 100`} className="ksf-progress-rail"/><circle cx="50" cy="50" r={radius} pathLength="100" fill="none" strokeWidth={thickness} strokeLinecap={round?'round':'butt'} strokeDasharray={`${percent*arc/100} 100`} className="ksf-progress-value"/>{success>0&&<circle cx="50" cy="50" r={radius} pathLength="100" fill="none" strokeWidth={thickness} strokeLinecap={round?'round':'butt'} strokeDasharray={`${success*arc/100} 100`} className="ksf-progress-success"/>}</svg>}{showValue&&<span className="ksf-progress-label">{format?format(v,percent):tone==='error'?<ControlIcon name={variant==='line'?'CloseCircleFilled':'CloseOutlined'}/>:percent===100?<ControlIcon name={variant==='line'?'CheckCircleFilled':'CheckOutlined'}/>:Math.round(percent)+'%'}</span>}</div>;});
export interface SpinnerProps extends HTMLAttributes<HTMLDivElement>{spinning?:boolean;delay?:number;label?:string;size?:'small'|'medium'|'large';block?:boolean;indicator?:ReactNode}
export const Spinner=forwardRef<HTMLDivElement,SpinnerProps>(function Spinner({spinning=true,delay=0,label='',size='medium',block,indicator,children,className,...props},ref){
 const [visible,setVisible]=useState(spinning&&delay<=0),activity=useFeedbackActivity(ref,visible),blocked=block??children!==undefined;
 useEffect(()=>{if(!spinning){setVisible(false);return;}if(delay<=0){setVisible(true);return;}const timer=setTimeout(()=>setVisible(true),delay);return()=>clearTimeout(timer);},[spinning,delay]);
 return <div {...props} ref={activity.ref} data-motion-active={activity.active} className={cx('ksf-spinner',className)} data-block={blocked||undefined} data-spinning={visible||undefined} aria-busy={spinning||undefined}>
  {children!==undefined&&<div className="ksf-spinner-content" inert={blocked&&visible||undefined}>{children}</div>}
  {visible&&<div className="ksf-spinner-indicator" role="status" aria-label={label||'加载中'}>{indicator??<span className="ksf-spinner-dots" data-size={size} aria-hidden="true">{[0,1,2,3].map(i=><i key={i} style={{animationDelay:i*400+'ms'}}/>)}</span>}{label&&<span>{label}</span>}</div>}
 </div>;
});
/** Ant Design 6.7.1 Skeleton Image vector, MIT; see THIRD_PARTY_NOTICES.txt. */
function SkeletonImageGlyph(){return <svg viewBox="0 0 1098 1024" aria-hidden="true" focusable="false" className="ksf-skeleton-image-glyph"><path d="M365.7 329.1q0 45.8-32 77.7t-77.7 32-77.7-32-32-77.7 32-77.6 77.7-32 77.7 32 32 77.6M951 548.6v256H146.3V694.9L329 512l91.5 91.4L713 311zm54.8-402.3H91.4q-7.4 0-12.8 5.4T73 164.6v694.8q0 7.5 5.5 12.9t12.8 5.4h914.3q7.5 0 12.9-5.4t5.4-12.9V164.6q0-7.5-5.4-12.9t-12.9-5.4m91.4 18.3v694.8q0 37.8-26.8 64.6t-64.6 26.9H91.4q-37.7 0-64.6-26.9T0 859.4V164.6q0-37.8 26.8-64.6T91.4 73h914.3q37.8 0 64.6 26.9t26.8 64.6"/></svg>;}
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement>{loading?:boolean;active?:boolean;rows?:number;avatar?:boolean;heading?:boolean;widths?:Array<number|string>;shape?:'text'|'avatar'|'button'|'input'|'image';round?:boolean}
export const Skeleton=forwardRef<HTMLDivElement,SkeletonProps>(function Skeleton({loading=true,active=false,rows:requestedRows,avatar=false,heading=true,widths,shape='text',round=false,children,className,...props},ref){
 const activity=useFeedbackActivity(ref,loading&&active),rows=Math.round(clamp(requestedRows??(!avatar&&heading?3:2),0,20));
 if(!loading)return <div {...props} ref={activity.ref} className={className}>{children}</div>;
 return <div {...props} ref={activity.ref} data-motion-active={activity.active} className={cx('ksf-skeleton',className)} data-active={active||undefined} role="status" aria-label={props['aria-label']??'内容加载中'}>
  <div aria-hidden="true" className="ksf-skeleton-layout" data-shape={shape} data-round={round||undefined} data-paragraph={shape==='text'&&rows>0||undefined} data-heading={shape==='text'&&heading||undefined} data-avatar={avatar||undefined}>
   {shape!=='text'?<i className={`ksf-skeleton-shape ksf-skeleton-${shape}`}>{shape==='image'&&<SkeletonImageGlyph/>}</i>:<>{avatar&&<div className="ksf-skeleton-header"><i className="ksf-skeleton-avatar"/></div>}<div className="ksf-skeleton-body">{heading&&<h3 className="ksf-skeleton-heading"/>}{rows>0&&<ul className="ksf-skeleton-paragraph">{Array.from({length:rows},(_,i)=><li className="ksf-skeleton-line" key={i} style={{width:widths?.[i]??(i===rows-1&&(!avatar||!heading||rows>=3)?'61%':'100%')}}/>)}</ul>}</div></>}
  </div>
 </div>;
});
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'>{heading?:ReactNode;description?:ReactNode;illustration?:ReactNode|false;compact?:boolean;actions?:ReactNode}
export const EmptyState=forwardRef<HTMLDivElement,EmptyStateProps>(function EmptyState({heading,description='暂无数据',illustration,compact=false,actions,children,className,...props},ref){return <div {...props} ref={ref} className={cx('ksf-empty-state',className)} data-compact={compact||undefined}>{illustration!==false&&<div className="ksf-empty-illustration">{illustration??(compact?<EmptyIllustration/>:<DefaultEmptyIllustration/>)}</div>}{heading!=null&&heading!==false&&<div className="ksf-empty-heading">{heading}</div>}{description!=null&&description!==false&&<div className="ksf-empty-description">{description}</div>}{children}{actions!=null&&actions!==false&&<div className="ksf-empty-actions">{actions}</div>}</div>;});
export interface ResultProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'>{status?:FeedbackTone|'403'|'404'|'500';heading:ReactNode;description?:ReactNode;icon?:ReactNode;actions?:ReactNode}
export const Result=forwardRef<HTMLDivElement,ResultProps>(function Result({status='info',heading,description,icon,actions,children,className,...props},ref){
 const numeric=status==='403'||status==='404'||status==='500';
 return <div {...props} ref={ref} className={cx('ksf-result',className)} data-tone={numeric?'info':status} data-status={status}>
  <div className="ksf-result-icon" aria-hidden="true">{icon??(numeric?<div className="ksf-result-image"><ResultIllustration status={status}/></div>:<FeedbackIcon tone={status as FeedbackTone} result/>)}</div>
  <div className="ksf-result-heading">{heading}</div>{description&&<div className="ksf-result-description">{description}</div>}{children&&<div className="ksf-result-content">{children}</div>}{actions&&<div className="ksf-result-actions">{actions}</div>}
 </div>;
});
