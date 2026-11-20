import './fidelity/styles/ai-model-selector.css';
import {forwardRef,useState} from 'react';
import Source from './fidelity/kokonut/ai-model-selector';
import {FidelityScope} from './fidelity/scope';
import {useValue} from './primitives/state';
import type {AIModelOption} from './ai-model-types';
export type {AIModelOption} from './ai-model-types';
export interface ModelSelectorProps{models:readonly AIModelOption[];value?:string;defaultValue?:string;onValueChange?:(id:string)=>void;effort?:string;defaultEffort?:string;onEffortChange?:(effort:string)=>void;disabled?:boolean;label?:string}
export const ModelSelector=forwardRef<HTMLDivElement,ModelSelectorProps>(function ModelSelector({models,value,defaultValue,onValueChange,effort,defaultEffort,onEffortChange,disabled=false,label='选择模型'},ref){
 const [selected,setSelected]=useValue(value,defaultValue??models.find(model=>!model.disabled)?.id??'',onValueChange),[levels,setLevels]=useState<Record<string,string>>(()=>defaultEffort!==undefined?{[selected]:defaultEffort}:{}),current=models.find(item=>item.id===selected),level=effort??levels[selected]??current?.defaultEffort??current?.efforts?.[0]??'',invalid=!current||!!current.efforts?.length&&!current.efforts.includes(level);
 return <FidelityScope module="ai-model-selector">{models.length?<Source controlRef={ref} label={label} disabled={disabled} invalid={invalid} models={models.map(item=>({id:item.id,name:item.label,description:item.description,icon:item.icon,disabled:item.disabled,efforts:(item.efforts??[]).map(id=>({id,label:id,hint:item.effortHints?.[id]})),defaultEffort:item.defaultEffort}))} value={{model:selected,effort:level}} onChange={next=>{if(next.model!==selected)setSelected(next.model);if(effort===undefined)setLevels(old=>({...old,[next.model]:next.effort}));if(next.model!==selected||next.effort!==level)onEffortChange?.(next.effort);}}/>:<div ref={ref} aria-label={label} aria-disabled="true" style={{height:44,maxWidth:384,borderRadius:999,padding:'8px 16px',fontSize:12,background:'color-mix(in srgb,var(--ksf-color-foreground) 5%,transparent)',color:'var(--ksf-color-muted-foreground)'}}>没有可用模型</div>}</FidelityScope>;
});
