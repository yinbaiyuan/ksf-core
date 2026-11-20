import {forwardRef,useMemo} from 'react';
import Source from './fidelity/kokonut/ai-inline-edit';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/ai-inline-edit.css';
export type AIRewriteResult=string|Promise<string>|AsyncIterable<string>;
export interface AITextSelection{paragraph:number;start:number;end:number}
export interface AIInlineEditProps{label:string;paragraphs:readonly string[];onValueChange:(paragraphs:string[])=>void;onRewrite:(text:string,instruction:string,attempt:number,signal:AbortSignal)=>AIRewriteResult;initialSelection?:AITextSelection}
export const AIInlineEdit=forwardRef<HTMLDivElement,AIInlineEditProps>(function AIInlineEdit({label,paragraphs,onValueChange,onRewrite,initialSelection},ref){const value=useMemo(()=>[...paragraphs],[paragraphs]),selection=initialSelection&&Number.isInteger(initialSelection.paragraph)&&Number.isInteger(initialSelection.start)&&Number.isInteger(initialSelection.end)&&initialSelection.start>=0&&initialSelection.end>initialSelection.start&&initialSelection.end<=(value[initialSelection.paragraph]?.length??0)?{p:initialSelection.paragraph,start:initialSelection.start,end:initialSelection.end}:undefined;return <FidelityScope module="ai-inline-edit"><Source title={label} controlRef={ref} paragraphs={value} onChange={onValueChange} rewrite={onRewrite} initialSelection={selection}/></FidelityScope>;});
