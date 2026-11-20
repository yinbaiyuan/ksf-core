import {useId,useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactNode} from 'react';
import {Button} from './controls';
import {Disclosure} from './feedback';
import {useUI} from './provider';

export interface RunWorkspaceProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'> {
 title?:ReactNode;description?:ReactNode;actions?:ReactNode;
 composer:ReactNode;submitted?:ReactNode;hasSubmission:boolean;
 status:ReactNode;waiting?:ReactNode;result:ReactNode;tools?:ReactNode;
 context?:ReactNode;contextSummary?:ReactNode;history?:ReactNode;
 submittedExpanded:boolean;onSubmittedExpandedChange:(open:boolean)=>void;
 contextExpanded:boolean;onContextExpandedChange:(open:boolean)=>void;
 layout?:'auto'|'wide'|'narrow';onLayoutChange?:(layout:'wide'|'narrow')=>void;
}
/** Controlled composition only. Request identity, execution, drafts and persistence stay with the app/services. */
export function RunWorkspace({title='AI 工作区',description,actions,composer,submitted,hasSubmission,status,waiting,result,tools,context,contextSummary,history,submittedExpanded,onSubmittedExpandedChange,contextExpanded,onContextExpandedChange,layout='auto',onLayoutChange,className='',...props}:RunWorkspaceProps){
 const ui=useUI(),id=useId(),root=useRef<HTMLDivElement>(null),statusRef=useRef<HTMLElement>(null),waitingRef=useRef<HTMLElement>(null),resultRef=useRef<HTMLElement>(null),lastFocus=useRef<HTMLElement|null>(null),[width,setWidth]=useState(0),callback=useRef(onLayoutChange);callback.current=onLayoutChange;
 const wide=layout==='wide'||layout==='auto'&&width>=1080,small=layout==='narrow'||layout==='auto'&&width<640;
 useLayoutEffect(()=>{if(layout!=='auto'||!root.current)return;const node=root.current,measure=()=>setWidth(node.getBoundingClientRect().width);measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[layout]);
 useLayoutEffect(()=>{callback.current?.(wide?'wide':'narrow');if(!ui.environment.active||!ui.environment.visible)return;const previous=lastFocus.current;if(previous&&(!previous.isConnected||!previous.getClientRects().length)&&(document.activeElement===document.body||document.activeElement===previous))statusRef.current?.focus({preventScroll:true});},[wide,small,ui.environment.active,ui.environment.visible]);
 const jump=(target:HTMLElement|null)=>{target?.scrollIntoView({block:'start',behavior:'auto'});target?.focus({preventScroll:true});};
 return <div {...props} ref={root} data-ksf-component="run-workspace" data-layout={wide?'wide':'narrow'} data-small={small||undefined} data-submitted={hasSubmission||undefined} onFocusCapture={event=>{lastFocus.current=event.target as HTMLElement;props.onFocusCapture?.(event);}} className={`ksf-run-workspace ${className}`.trim()}>
  <header className="ksf-run-workspace-heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div><div className="ksf-run-workspace-actions">{actions}</div></header>
  {hasSubmission&&<nav className="ksf-run-workspace-nav" aria-label="运行内容定位"><Button variant="ghost" onActivate={()=>jump(statusRef.current)}>运行状态</Button>{waiting&&<Button onActivate={()=>jump(waitingRef.current)}>待处理</Button>}<Button variant="ghost" onActivate={()=>jump(resultRef.current)}>结果</Button></nav>}
  <div className="ksf-run-workspace-layout"><div className="ksf-run-workspace-main">
   {!hasSubmission&&composer}
   {hasSubmission&&<><section id={id+'-status'} ref={statusRef} tabIndex={-1} aria-label="当前运行">{status}</section>{waiting&&<section id={id+'-waiting'} ref={waitingRef} tabIndex={-1} aria-label="待处理交互">{waiting}</section>}
    {submitted&&(small?<Disclosure title="本次已提交内容" open={submittedExpanded} onOpenChange={onSubmittedExpandedChange}>{submitted}</Disclosure>:<section aria-label="本次已提交内容">{submitted}</section>)}</>}
   {!wide&&context&&<Disclosure title={contextSummary??'项目与资源'} open={contextExpanded} onOpenChange={onContextExpandedChange}>{context}</Disclosure>}
   {hasSubmission&&<div className="ksf-run-workspace-output"><section id={id+'-result'} ref={resultRef} tabIndex={-1} aria-label="运行结果">{result}</section>{tools&&<section aria-label="运行工具">{tools}</section>}</div>}
   {hasSubmission&&<Disclosure title="后续草稿">{composer}</Disclosure>}
   {history&&<section aria-label="原生会话历史">{history}</section>}
  </div>{wide&&context&&<aside className="ksf-run-workspace-context" aria-label="项目与资源">{context}</aside>}</div>
 </div>;
}
