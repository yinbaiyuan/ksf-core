import {forwardRef,useId,type TextareaHTMLAttributes,type ReactNode} from 'react';
import SourcePrompt from './fidelity/kokonut/ai-prompt';
import {FidelityScope} from './fidelity/scope';
export type {AIModelOption} from './ai-model-types';
import type {AIModelOption} from './ai-model-types';
export interface PromptAttachment{id:string;name:string;detail?:string;mediaType?:string;size?:number;previewUrl?:string}
export interface PromptCommand{id:string;label:string;description?:string;icon?:ReactNode}
export interface AIPromptProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,'value'|'defaultValue'|'onSubmit'>{
 label:string;value:string;onValueChange:(text:string)=>void;onSubmit:()=>void;
 status?:'idle'|'submitting'|'streaming'|'error';error?:string;onStop?:()=>void;
 attachments?:readonly PromptAttachment[];onPickFiles?:()=>void;onRemoveAttachment?:(id:string)=>void;onFiles?:(files:readonly File[])=>void;
 models?:readonly AIModelOption[];model?:string;onModelChange?:(id:string)=>void;effort?:string;onEffortChange?:(effort:string)=>void;
 commands?:readonly PromptCommand[];onCommand?:(id:string)=>void;submitOnEnter?:boolean;
 header?:string;headerAction?:string;promotedModel?:string;
}
export const AIPrompt=forwardRef<HTMLTextAreaElement,AIPromptProps>(function AIPrompt({label,value,onValueChange,onSubmit,status='idle',error,onStop,attachments=[],onPickFiles,onRemoveAttachment,onFiles,models=[],model,onModelChange,effort,onEffortChange,commands=[],onCommand,submitOnEnter=true,header='',headerAction,promotedModel,disabled,className,...inputProps},ref){const id=useId(),busy=status==='submitting'||status==='streaming',current=models.find(item=>item.id===model)??models.find(item=>!item.disabled);return <FidelityScope module="ai-prompt" className={className}><fieldset disabled={disabled} style={{display:'contents',border:0,padding:0,margin:0,minWidth:0}}><SourcePrompt models={models.map(item=>({name:item.id,label:item.label,description:item.description,disabled:item.disabled,icon:item.icon,effortHints:item.effortHints?{...item.effortHints}:undefined,efforts:item.efforts?[...item.efforts]:undefined}))} placeholder={inputProps.placeholder??'Ask anything. Type / for commands'} headerText={header} headerAction={headerAction} promotedModel={promotedModel} commands={onCommand?[...commands]:[]} control={{value,onValueChange,onSubmit,onStop,responding:busy,disabled,attachments:attachments.map(item=>({id:item.id,file:{name:item.name,type:item.mediaType??'',size:item.size??0},detail:item.detail,previewUrl:item.previewUrl})),onPickFiles,onRemoveAttachment,onFiles,model:model??current?.id??'',onModelChange,effort:effort??current?.efforts?.[0]??null,onEffortChange,onCommand,submitOnEnter,inputRef:ref,inputProps:{...inputProps,'aria-label':inputProps['aria-label']??label,'aria-invalid':status==='error'||inputProps['aria-invalid'],'aria-describedby':[inputProps['aria-describedby'],error?id:undefined].filter(Boolean).join(' ')||undefined}}}/></fieldset>{error&&<p id={id} role="alert" style={{color:'var(--ksf-color-danger)',fontSize:13}}>{error}</p>}</FidelityScope>;});
