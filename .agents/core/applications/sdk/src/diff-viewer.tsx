import './fidelity/diff-narrow.css';
import {forwardRef} from 'react';
import Source from './fidelity/kokonut/ai-diff-review';
import {FidelityScope} from './fidelity/scope';
import {diffLines} from './assistant/diff-model.js';
import './fidelity/styles/ai-diff-review.css';
export interface DiffFile{id:string;path:string;before:string;after:string;decision?:'pending'|'accepted'|'rejected'}
export interface DiffViewerProps{label:string;files:readonly DiffFile[];streaming?:boolean;onDecision?:(id:string,decision:'accepted'|'rejected')=>void;onUndo?:(id:string)=>void;maxLines?:number}
export const DiffViewer=forwardRef<HTMLDivElement,DiffViewerProps>(function DiffViewer({label,files,streaming=false,onDecision,onUndo,maxLines=400},ref){const limit=Number.isFinite(maxLines)?Math.max(1,Math.floor(maxLines)):400;return <FidelityScope module="ai-diff-review"><Source label={label} controlRef={ref} streaming={streaming} canDecide={!!onDecision} canUndo={!!onUndo} decisions={Object.fromEntries(files.map(file=>[file.id,file.decision??'pending']))} files={files.map(file=>{const lines=diffLines(file.before,file.after);return{path:file.id,displayPath:file.path,created:!file.before&&!!file.after,truncated:lines.length>limit,hunks:[{start:1,lines:lines.slice(0,limit).map(line=>({type:line.kind,text:line.text,oldLine:line.oldLine,newLine:line.newLine}))}]};})} onDecision={(id,decision)=>{if(streaming)return;if(decision==='pending')onUndo?.(id);else onDecision?.(id,decision);}}/></FidelityScope>;});
