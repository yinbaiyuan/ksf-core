import {forwardRef,type HTMLAttributes} from 'react';
import Timeline from './fidelity/kokonut/ai-agent-lanes';
import {FidelityScope} from './fidelity/scope';
export interface AgentStep {tool:'think'|'search'|'read'|'write';label:string;start:number;end?:number;result?:string}
export interface AgentLane {id:string;name:string;steps:AgentStep[];summary?:string}
export interface AgentLanesProps extends HTMLAttributes<HTMLDivElement> {label:string;lanes:readonly AgentLane[];elapsedSeconds:number;completionText?:string}
export const AgentLanes=forwardRef<HTMLDivElement,AgentLanesProps>(function AgentLanes({label,lanes,elapsedSeconds,completionText='',...props},ref){return <div {...props} ref={ref} aria-label={label}><FidelityScope module="ai-agent-lanes">{lanes.length===0?<p role="status" style={{padding:24,border:'1px solid var(--ksf-color-border)',borderRadius:16,margin:0}}>暂无执行通道</p>:<Timeline task={label} lanes={lanes.map(l=>({...l,steps:l.steps.map(s=>({...s}))}))} elapsed={Math.max(0,elapsedSeconds)} answer={completionText}/>}</FidelityScope></div>});
