import {forwardRef} from 'react';
import Source from './fidelity/kokonut/ai-citations';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/ai-citations.css';
import type {CitationSource} from './assistant/review';
export interface CitedAnswerPart{text:string;sourceIds?:readonly string[]}
export interface CitedAnswerProps{parts:readonly CitedAnswerPart[];sources:readonly CitationSource[];label?:string;onOpenSource?:(source:CitationSource)=>void}
export const CitedAnswer=forwardRef<HTMLDivElement,CitedAnswerProps>(function CitedAnswer({parts,sources,label='带引用的回答',onOpenSource},ref){return <FidelityScope module="ai-citations"><Source label={label} controlRef={ref} parts={parts.map(part=>({text:part.text,cite:part.sourceIds?[...part.sourceIds]:undefined}))} sources={sources.map(source=>({id:source.id,title:source.title,url:source.url??'',site:source.site,snippet:source.excerpt}))} onOpenSource={onOpenSource?source=>{const original=sources.find(item=>item.id===source.id);if(original)onOpenSource(original);}:undefined}/></FidelityScope>;});
