import {forwardRef} from 'react';
import Source from './fidelity/kokonut/ai-token-alternatives';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/ai-token-alternatives.css';
export interface TokenCandidate{value:string;probability:number}
export interface AlternativeToken{id:string;text:string;candidates:readonly TokenCandidate[];original?:string}
export type TokenAnswerPart={text:string}|{tokenId:string};
export interface TokenAlternativesProps{label:string;prompt?:string;tokens:readonly AlternativeToken[];parts?:readonly TokenAnswerPart[];loading?:boolean;error?:string;onChoose?:(id:string,value:string)=>void}
export const TokenAlternatives=forwardRef<HTMLDivElement,TokenAlternativesProps>(function TokenAlternatives({label,prompt,tokens,parts,loading,error,onChoose},ref){const slots=tokens.map(token=>{const options=token.candidates.map(candidate=>({text:candidate.value,p:Number.isFinite(candidate.probability)?Math.max(0,Math.min(1,candidate.probability)):0}));if(!options.some(option=>option.text===token.text))options.unshift({text:token.text,p:0});if(token.original){const i=options.findIndex(option=>option.text===token.original);if(i>=0)options.unshift(...options.splice(i,1));}return{id:token.id,options};});const pieces=parts?parts.map(part=>'text'in part?part.text:{slot:part.tokenId}):tokens.flatMap((token,index)=>index?[" ",{slot:token.id}]:[{slot:token.id}]);return <FidelityScope module="ai-token-alternatives"><Source label={label} prompt={prompt} controlRef={ref} controlled={{pieces,slots,choice:Object.fromEntries(tokens.map(token=>[token.id,token.text])),loading,error,onChoose}}/></FidelityScope>;});
