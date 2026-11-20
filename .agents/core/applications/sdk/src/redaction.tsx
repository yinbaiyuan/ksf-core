import {forwardRef, type HTMLAttributes} from 'react';
import PromptRedaction, {type RedactKind, type Reply} from './fidelity/kokonut/ai-redact';
import {FidelityScope} from './fidelity/scope';
export type RedactionKind=RedactKind;
export type RedactionReply=Reply;
export interface RedactionProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'|'onSubmit'|'onChange'> {title?:string;value?:string;defaultValue?:string;onValueChange?:(value:string)=>void;names?:string[];onSubmit:(request:{maskedText:string;signal:AbortSignal})=>RedactionReply}
/** Pre-send redaction UI. Only masked placeholders leave through onSubmit. */
export const Redaction=forwardRef<HTMLDivElement,RedactionProps>(function Redaction({title,value,defaultValue,onValueChange,names,onSubmit,...props},ref){return <div {...props} ref={ref}><FidelityScope module="ai-redact"><PromptRedaction title={title} value={value} defaultValue={defaultValue} onValueChange={onValueChange} names={names} respond={(maskedText,signal)=>onSubmit({maskedText,signal})}/></FidelityScope></div>});
