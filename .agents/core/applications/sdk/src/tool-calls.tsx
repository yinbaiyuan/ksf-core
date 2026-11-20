import {forwardRef,type HTMLAttributes,type ReactNode} from 'react';
import Calls from './fidelity/kokonut/ai-tool-calls';
import {FidelityScope} from './fidelity/scope';
export type ToolCallStatus='receiving'|'ready'|'approval-pending'|'approved'|'done'|'error'|'denied';
export interface ToolCall {id:string;name:string;status:ToolCallStatus;runningLabel?:string;completedLabel?:string;inputSummary?:string;outputSummary?:string;error?:string;icon?:ReactNode}
export interface ToolCallsProps extends HTMLAttributes<HTMLDivElement> {label:string;calls:readonly ToolCall[];prompt?:string;answer?:ReactNode}
const states={receiving:'input-streaming',ready:'input-available','approval-pending':'approval-requested',approved:'approval-responded',done:'output-available',error:'output-error',denied:'output-denied'} as const;
export const ToolCalls=forwardRef<HTMLDivElement,ToolCallsProps>(function ToolCalls({label,calls,prompt,answer,...props},ref){return <div {...props} ref={ref} aria-label={label}><FidelityScope module="ai-tool-calls"><Calls prompt={prompt} answer={answer} calls={calls.map(c=>({id:c.id,tool:c.name,state:states[c.status],running:c.runningLabel,done:c.completedLabel,detail:c.inputSummary,result:c.outputSummary,error:c.error,icon:c.icon}))}/></FidelityScope></div>});
