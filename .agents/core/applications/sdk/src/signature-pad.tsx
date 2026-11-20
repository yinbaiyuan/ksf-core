import {forwardRef,useMemo,type HTMLAttributes} from 'react';
import Source from './fidelity/kokonut/signature-pad';
import {FidelityScope} from './fidelity/scope';
import {useElementRef,useValue,useFormReset} from './primitives/state';
export type SignaturePoint=readonly [number,number,number?];
export type SignatureStroke=readonly SignaturePoint[];
export interface SignaturePadProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'> {label:string;value?:readonly SignatureStroke[];defaultValue?:readonly SignatureStroke[];onValueChange?:(value:readonly SignatureStroke[])=>void;onSvgChange?:(svg:string|null)=>void;disabled?:boolean;name?:string}
export const SignaturePad=forwardRef<HTMLDivElement,SignaturePadProps>(function SignaturePad({label,value,defaultValue=[],onValueChange,onSvgChange,disabled=false,name,...props},ref){
 const [root,assign]=useElementRef(ref),[current,setCurrent,reset]=useValue(value,defaultValue,onValueChange);useFormReset(root,value===undefined,reset);
 const strokes=useMemo(()=>current.map(stroke=>stroke.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>({x:Math.max(0,Math.min(500,p[0])),y:Math.max(0,Math.min(180,p[1])),w:Number.isFinite(p[2])?Math.max(.3,Math.min(10,p[2]!)):2.2}))).filter(st=>st.length),[current]);
 return <div {...props} ref={assign} style={{width:'100%',maxWidth:380,minWidth:0,...props.style}} role="group" aria-label={label}><FidelityScope module="signature-pad" paused={disabled}><Source label={label} value={strokes} disabled={disabled} onChange={onSvgChange} onStrokesChange={data=>setCurrent(data.map(st=>st.map(p=>[p.x,p.y,p.w] as const)))}/></FidelityScope>{name&&<input type="hidden" name={name} disabled={disabled} value={JSON.stringify(current)}/>}</div>;
});
