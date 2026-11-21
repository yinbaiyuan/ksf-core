import {TextField,type TextFieldProps} from '@ksf/sdk/text-field';
import {configurationNumber} from './settings-numbers';
import {Children,cloneElement,isValidElement,Fragment,useLayoutEffect,useRef,type ReactNode,type ReactElement} from 'react';
import {Field,type FieldProps} from '@ksf/sdk/field';
import {Select,type SelectProps} from '@ksf/sdk/select';
/** Associates the SDK field with the existing controlled editor, without adding form state. */
export function SettingsField({children,className='',...props}:FieldProps){const first=typeof children==='function'?undefined:Children.toArray(children).find(child=>isValidElement<{id?:string}>(child));const id=props.id??(isValidElement<{id?:string}>(first)?first.props.id:undefined);return <Field {...props} className={'settings-field-row '+className} id={id}>{control=>Children.map(typeof children==='function'?children(control):children,child=>isValidElement(child)?cloneElement(child as ReactElement<Record<string,unknown>>,{...control,...child.props as object}):child)}</Field>;}
/** Translate existing option content into the public Select contract. */
export function SettingsSelect({children,...props}:Omit<SelectProps,'options'>&{children:ReactNode}){
 const options:SelectProps['options'][number][]=[];
 const text=(node:ReactNode):string=>Children.toArray(node).map(child=>isValidElement<{children?:ReactNode}>(child)?text(child.props.children):String(child)).join('');
 const collect=(nodes:ReactNode)=>Children.forEach(nodes,node=>{if(!isValidElement<{value?:string;disabled?:boolean;children?:ReactNode}>(node))return;if(node.type===Fragment)collect(node.props.children);else if(node.type==='option')options.push({value:String(node.props.value??text(node.props.children)),label:text(node.props.children),disabled:node.props.disabled});});collect(children);
 return <Select {...props} options={options}/>;
}
/** Keep partial numeric text, and let native form validation focus the SDK input. */
export function SettingsNumberField({value='',min,max,integer=true,...props}:TextFieldProps&{integer?:boolean}){
 const input=useRef<HTMLInputElement>(null);let error:string|undefined;
 try{configurationNumber(String(value),'数值',min===undefined?-Number.MAX_SAFE_INTEGER:Number(min),max===undefined?Number.MAX_SAFE_INTEGER:Number(max),integer);}catch(issue){error=issue instanceof Error?issue.message:String(issue);}
 useLayoutEffect(()=>{input.current?.setCustomValidity(error??'');},[error]);
 return <TextField {...props} ref={input} value={String(value)} inputMode="decimal" error={error}/>;
}
