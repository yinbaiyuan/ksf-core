import {forwardRef,type TextareaHTMLAttributes} from 'react';
import {AIAutocomplete} from './fidelity/kokonut/ai-autocomplete';
import {FidelityScope} from './fidelity/scope';
import {useValue,useElementRef,useFormReset} from './primitives/state';
import './fidelity/styles/ai-autocomplete.css';
import './fidelity/autocomplete-animation.css';
export interface AutocompleteInputProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,'value'|'defaultValue'>{label:string;value?:string;defaultValue?:string;suggestions:readonly string[];loading?:boolean;onValueChange?:(value:string)=>void;onAccept?:(value:string)=>void}
export const AutocompleteInput=forwardRef<HTMLTextAreaElement,AutocompleteInputProps>(function AutocompleteInput({label,value,defaultValue='',suggestions,loading=false,onValueChange,onAccept,...props},ref){const [text,setText,reset]=useValue(value,defaultValue,onValueChange),[root,assign]=useElementRef(ref);useFormReset(root,value===undefined,reset,props.form);const completion=suggestions.find(item=>item.startsWith(text)&&item!==text);return <FidelityScope module="ai-autocomplete"><AIAutocomplete label={label} value={text} completion={completion} loading={loading} onValueChange={setText} onAccept={onAccept} controlRef={assign} nativeProps={props} disabled={props.disabled} readOnly={props.readOnly} placeholder={props.placeholder}/></FidelityScope>;});
