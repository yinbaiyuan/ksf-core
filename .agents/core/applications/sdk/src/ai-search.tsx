import {forwardRef,useId,type TextareaHTMLAttributes,type ReactNode,type ComponentType} from 'react';
import {Globe,Telescope,Image,Braces,Lightbulb} from 'lucide-react';
import SourceSearch from './fidelity/kokonut/ai-input-search';
import {FidelityScope} from './fidelity/scope';
import type {PromptAttachment} from './ai-prompt';
export interface AISearchTool{id:string;label:string;activity:string;description?:string;placeholder?:string;readsSources?:boolean;limit?:number;icon?:'web'|'research'|'image'|'code'|'reason'}
export interface AISearchSource{domain:string;title:string;icon?:ReactNode}
export interface AISearchProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,'value'|'defaultValue'|'onSubmit'>{
 label:string;value:string;onValueChange:(value:string)=>void;onSubmit:()=>void;onStop?:()=>void;
 status?:'idle'|'working'|'done'|'stopped'|'error';error?:string;tools?:readonly AISearchTool[];tool?:string|null;onToolChange?:(id:string|null)=>void;
 models?:readonly string[];model?:string;onModelChange?:(id:string)=>void;remaining?:Readonly<Record<string,number>>;
 sources?:readonly AISearchSource[];elapsed?:number;attachments?:readonly PromptAttachment[];onPickFiles?:()=>void;onRemoveAttachment?:(id:string)=>void;submitOnEnter?:boolean;
}
const icons={web:Globe,research:Telescope,image:Image,code:Braces,reason:Lightbulb};
export const AISearch=forwardRef<HTMLTextAreaElement,AISearchProps>(function AISearch({label,value,onValueChange,onSubmit,onStop,status='idle',error,tools=[],tool=null,onToolChange,models=[],model,onModelChange,remaining={},sources=[],elapsed=0,attachments=[],onPickFiles,onRemoveAttachment,submitOnEnter=true,disabled,className,...inputProps},ref){const id=useId();return <FidelityScope module="ai-input-search" className={className}><fieldset disabled={disabled} style={{display:'contents',border:0,padding:0,margin:0,minWidth:0}}><SourceSearch tools={tools.map(item=>({...item,hint:item.description,icon:icons[item.icon??'web'],color:'var(--ksf-color-primary)'}))} models={[...models]} placeholder={inputProps.placeholder??'Ask anything, or type / for tools'} control={{value,onValueChange,onSubmit,onStop,status:status==='error'?'stopped':status,disabled,tool,onToolChange,model:model??models[0]??'',onModelChange,remaining:{...remaining},sources:[...sources],elapsed:Math.max(0,elapsed),files:attachments.map(item=>({name:item.name,size:item.size??0,lastModified:0,type:item.mediaType??''} as File)),onPickFiles,onRemoveFile:index=>{const item=attachments[index];if(item)onRemoveAttachment?.(item.id);},inputRef:ref,inputProps:{...inputProps,'aria-label':inputProps['aria-label']??label,'aria-invalid':status==='error'||inputProps['aria-invalid'],'aria-describedby':[inputProps['aria-describedby'],error?id:undefined].filter(Boolean).join(' ')||undefined},submitOnEnter}}/></fieldset>{error&&<p id={id} role="alert" style={{color:'var(--ksf-color-danger)',fontSize:13}}>{error}</p>}</FidelityScope>;});
