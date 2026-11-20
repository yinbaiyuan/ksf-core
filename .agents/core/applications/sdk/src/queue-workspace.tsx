import {forwardRef} from 'react';
import Source from './fidelity/kokonut/ai-message-queue';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/ai-message-queue.css';
export type QueueTranscriptEntry={id:string;role:'user';text:string}|{id:string;role:'agent';steps:readonly string[];reply:string;step:number;status:'running'|'done'|'stopped';seconds:number;live?:boolean;error?:string};
export interface QueueMessage{id:string;text:string}
export interface QueueWorkspaceProps{label:string;entries:readonly QueueTranscriptEntry[];items:readonly QueueMessage[];paused:boolean;draft:string;onDraftChange:(text:string)=>void;onItemsChange:(items:QueueMessage[])=>void;onSubmit:(text:string,immediate:boolean)=>void;onStop:()=>void;onResume:()=>void;onSendNow:(id:string)=>void}
export const QueueWorkspace=forwardRef<HTMLDivElement,QueueWorkspaceProps>(function QueueWorkspace({label,entries,items,onItemsChange,...props},ref){return <FidelityScope module="ai-message-queue"><Source title={label} controlRef={ref} workspace={{...props,entries:entries.map(entry=>entry.role==='agent'?{...entry,steps:[...entry.steps],step:Math.max(0,Math.floor(entry.step)),seconds:Number.isFinite(entry.seconds)?Math.max(0,entry.seconds):0}:{...entry}),queue:items.map(item=>({...item})),onQueueChange:onItemsChange}}/></FidelityScope>;});
