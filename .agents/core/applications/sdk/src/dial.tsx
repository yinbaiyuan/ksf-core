import {forwardRef,type HTMLAttributes} from 'react';
import Source from './fidelity/kokonut/detent-dial';
import {FidelityScope} from './fidelity/scope';
import {useElementRef,useValue,useFormReset} from './primitives/state';
export interface DialProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'|'onChange'> {label:string;value?:number;defaultValue?:number;onValueChange?:(value:number)=>void;min?:number;max?:number;step?:number;unit?:string;size?:number;disabled?:boolean;name?:string;formatValue?:(value:number)=>string}
export const Dial=forwardRef<HTMLDivElement,DialProps>(function Dial({label,value,defaultValue=21,onValueChange,min=16,max=30,step=.5,unit='°',size=240,disabled=false,name,formatValue,...props},ref){
 const [node,assign]=useElementRef(ref),[current,setCurrent,reset]=useValue(value,defaultValue,onValueChange);useFormReset(node,value===undefined,reset);
 const low=Number.isFinite(min)?min:16,high=Number.isFinite(max)?Math.max(low+.001,max):Math.max(low+14,30),increment=Number.isFinite(step)&&step>0?step:.5;const safe=Math.max(low,Math.min(high,Number.isFinite(current)?current:low));
 return <div {...props} style={{display:'inline-flex',maxWidth:'100%',minWidth:0,...props.style}}><FidelityScope module="detent-dial" inline paused={disabled}><Source controlRef={assign} label={label} value={safe} onValueChange={setCurrent} defaultValue={defaultValue} min={low} max={high} step={increment} formatValue={formatValue??(v=>`${v.toFixed(Math.min(5,String(increment).split('.')[1]?.length??0))}${unit}`)} size={Math.max(120,Math.min(480,Number.isFinite(size)?size:240))} disabled={disabled}/></FidelityScope>{name&&<input type="hidden" name={name} value={safe} disabled={disabled}/>}</div>;
});
