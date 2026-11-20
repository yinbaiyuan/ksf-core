import {forwardRef} from 'react';
import Source from './fidelity/kokonut/ai-memory';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/ai-memory.css';
export interface SavedMemory{id:string;text:string;group:string;saved:string;state?:'live'|'new'|'replaced'}
export interface MemoryChatMessage{id:string;role:'user'|'assistant';text:string;error?:boolean;saved?:string;savedText?:string;replaced?:string}
export interface MemoryWorkspaceProps{label:string;memories:readonly SavedMemory[];messages:readonly MemoryChatMessage[];draft:string;enabled:boolean;busy?:boolean;thinking?:boolean;suggestions?:readonly string[];undo?:SavedMemory;onDraftChange:(text:string)=>void;onEnabledChange:(enabled:boolean)=>void;onSend:(text:string)=>void;onEdit:(id:string,text:string)=>void;onForget:(id:string)=>void;onUndo:()=>void}
export const MemoryWorkspace=forwardRef<HTMLDivElement,MemoryWorkspaceProps>(function MemoryWorkspace({label,memories,messages,suggestions=[],busy=false,...props},ref){return <FidelityScope module="ai-memory"><Source title={label} controlRef={ref} workspace={{...props,busy,rows:memories.map(memory=>({...memory,state:memory.state??'live'})),messages:messages.map(message=>({...message})),suggestions:[...suggestions]}}/></FidelityScope>;});
