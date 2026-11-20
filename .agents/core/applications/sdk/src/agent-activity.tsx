import {forwardRef} from 'react';
import Loading from './fidelity/kokonut/ai-loading';
import {FidelityScope} from './fidelity/scope';
export type ActivityStatus='queued'|'running'|'done'|'error'|'cancelled';
export interface ActivityStep {id:string;label:string;status:ActivityStatus;detail?:string;logs?:readonly string[];duration?:string;progress?:number}
export interface AgentActivityProps {label:string;steps:readonly ActivityStep[];elapsed?:string;summary?:string;collapseWhenDone?:boolean}
export const AgentActivity=forwardRef<HTMLDivElement,AgentActivityProps>(function AgentActivity({label,steps,summary,collapseWhenDone=true},ref){return <div ref={ref} aria-label={label}><FidelityScope module="ai-loading"><Loading steps={steps.map(s=>({id:s.id,label:s.status==='cancelled'?s.label+'（已取消）':s.label,status:s.status==='queued'?'pending':s.status==='cancelled'?'error':s.status,detail:[...(s.detail?[s.detail]:[]),...(s.logs??[])]}))} collapseWhenDone={collapseWhenDone}/>{summary&&<p role="status">{summary}</p>}</FidelityScope></div>});
