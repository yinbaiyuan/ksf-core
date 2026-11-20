import {forwardRef} from 'react';
import Source from './fidelity/kokonut/ai-voice';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/ai-voice.css';
export interface VoiceInputProps{label:string;status:'idle'|'recording'|'ready'|'playing';samples?:readonly number[];elapsed?:number;duration?:number;position?:number;disabled?:boolean;onStart?:()=>void;onStop?:()=>void;onPlay?:()=>void;onDiscard?:()=>void;onSend?:()=>void}
const finite=(value:number)=>Number.isFinite(value)?Math.max(0,value):0;
export const VoiceInput=forwardRef<HTMLDivElement,VoiceInputProps>(function VoiceInput({samples=[],elapsed=0,duration=elapsed,position=0,...props},ref){return <FidelityScope module="ai-voice"><Source {...props} controlRef={ref} elapsed={finite(elapsed)} duration={finite(duration)} position={finite(position)} samples={samples.map(sample=>Math.max(.12,Math.min(1,finite(sample))))}/></FidelityScope>;});
