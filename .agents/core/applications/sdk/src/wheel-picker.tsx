import {forwardRef,useMemo,type HTMLAttributes} from 'react';
import Source from './fidelity/kokonut/wheel-picker';
import {FidelityScope} from './fidelity/scope';
import {useElementRef,useValue,useFormReset} from './primitives/state';
export interface WheelOption {value:string;label:string}
export interface WheelColumn {id:string;label:string;options:readonly WheelOption[];loop?:boolean;width?:number}
export interface WheelPickerGroupProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'|'onChange'> {label:string;columns?:readonly WheelColumn[];value?:Record<string,string>;defaultValue?:Record<string,string>;onValueChange?:(value:Record<string,string>)=>void;disabled?:boolean;name?:string}
export const WheelPickerGroup=forwardRef<HTMLDivElement,WheelPickerGroupProps>(function WheelPickerGroup({label,columns,value,defaultValue,onValueChange,disabled=false,name,style,...props},ref){
 const [root,assign]=useElementRef(ref);const initial=defaultValue??(columns?Object.fromEntries(columns.map(c=>[c.id,c.options[0]?.value??''])):{hour:'8',minute:'41',period:'am'});const [current,setCurrent,reset]=useValue(value,initial,onValueChange);useFormReset(root,value===undefined,reset);
 const data=useMemo(()=>columns?.map(c=>({id:c.id,label:c.label,options:[...c.options],loop:c.loop,width:c.width===undefined?undefined:Math.max(48,Math.min(256,c.width)),className:undefined})),[columns]);
 return <div {...props} ref={assign} style={{display:'inline-flex',maxWidth:'100%',minWidth:0,opacity:disabled?0.45:1,...style}} aria-disabled={disabled||undefined}><FidelityScope module="wheel-picker" inline paused={disabled}><div inert={disabled||undefined}><Source label={label} columns={data} value={current} onValueChange={setCurrent}/></div></FidelityScope>{name&&<input type="hidden" name={name} value={JSON.stringify(current)} disabled={disabled}/>}</div>;
});
export interface WheelPickerProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'|'onChange'> {label:string;options:readonly WheelOption[];value?:string;defaultValue?:string;onValueChange?:(value:string)=>void;loop?:boolean;disabled?:boolean;name?:string}
export const WheelPicker=forwardRef<HTMLDivElement,WheelPickerProps>(function WheelPicker({label,options,value,defaultValue,onValueChange,loop=false,disabled=false,name,...props},ref){
 const [root,assign]=useElementRef(ref),[current,setCurrent,reset]=useValue(value,defaultValue??options[0]?.value??'',onValueChange);useFormReset(root,value===undefined,reset);
 const columns=useMemo(()=>[{id:'value',label,options,loop}],[label,options,loop]);return <div {...props} ref={assign} style={{display:'inline-flex',maxWidth:'100%',minWidth:0,...props.style}}>{options.length?<WheelPickerGroup label={label} columns={columns} value={{value:current}} onValueChange={v=>setCurrent(v.value)} disabled={disabled}/>:<p role="status">暂无选项</p>}{name&&<input type="hidden" name={name} value={current} disabled={disabled}/>}</div>;
});
