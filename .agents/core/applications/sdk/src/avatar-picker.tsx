import {forwardRef,type HTMLAttributes} from 'react';
import Source from './fidelity/kokonut/avatar-picker';
import {FidelityScope} from './fidelity/scope';
import {useElementRef,useValue,useFormReset} from './primitives/state';
export interface AvatarValue {displayName:string;variant:number}
export interface AvatarSelection extends AvatarValue {seed:string;description?:string}
export interface AvatarPickerProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'|'onChange'> {label:string;description?:string;value?:AvatarValue;defaultValue?:AvatarValue;onValueChange?:(value:AvatarValue)=>void;onPreviewChange?:(value:AvatarSelection)=>void;onConfirm?:(value:AvatarSelection)=>void;confirmLabel?:string;disabled?:boolean;name?:string}
export const AvatarPicker=forwardRef<HTMLDivElement,AvatarPickerProps>(function AvatarPicker({label,description,value,defaultValue={displayName:'Robin Vale',variant:0},onValueChange,onPreviewChange,onConfirm,confirmLabel,disabled=false,name,...props},ref){
 const [root,assign]=useElementRef(ref),[current,setCurrent,reset]=useValue(value,defaultValue,onValueChange);useFormReset(root,value===undefined,reset);const safe={displayName:current.displayName,variant:Number.isFinite(current.variant)?Math.trunc(current.variant):0};
 return <div {...props} ref={assign} style={{width:'100%',minWidth:0,maxWidth:384,opacity:disabled?0.45:1,...props.style}} inert={disabled||undefined}><FidelityScope module="avatar-picker" paused={disabled}><Source title={label} description={description} value={safe} defaultValue={defaultValue} name={name} submitLabel={confirmLabel} onChange={v=>{setCurrent({displayName:v.displayName,variant:v.variant});onPreviewChange?.(v);}} onComplete={onConfirm}/></FidelityScope></div>;
});
