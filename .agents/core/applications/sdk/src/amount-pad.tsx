import {forwardRef,type HTMLAttributes} from 'react';
import Source from './fidelity/kokonut/amount-pad';
import {FidelityScope} from './fidelity/scope';
import {useElementRef,useValue,useFormReset} from './primitives/state';
export interface AmountPadProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'|'onChange'> {label:string;value?:string;defaultValue?:string;onValueChange?:(value:string)=>void;currency?:string;disabled?:boolean;name?:string;max?:number;balance?:number;presets?:readonly number[];recipient?:{name:string;handle?:string};onConfirm?:(amount:number)=>void;confirmLabel?:string}
export const AmountPad=forwardRef<HTMLDivElement,AmountPadProps>(function AmountPad({label,value,defaultValue='',onValueChange,currency='$',disabled=false,name,max=2500,balance=3204.18,presets,recipient,onConfirm,confirmLabel='Confirm',...props},ref){
 const [root,assign]=useElementRef(ref),[current,setCurrent,reset]=useValue(value,defaultValue,onValueChange);useFormReset(root,value===undefined,reset);const cap=Number.isFinite(max)?Math.max(.01,max):2500;const safe=/^\d{0,7}(?:\.\d{0,2})?$/.test(current)?Number(current)>cap?String(cap):current:'';
 return <div {...props} ref={assign} aria-label={label} role="group" style={{width:'100%',maxWidth:320,minWidth:0,...props.style}}><FidelityScope module="amount-pad" paused={disabled}><Source value={safe} onValueChange={setCurrent} currency={currency} max={cap} balance={balance} presets={presets?[...presets]:undefined} recipient={recipient} onSend={onConfirm} actionLabel={confirmLabel} disabled={disabled}/></FidelityScope>{name&&<input type="hidden" name={name} value={safe} disabled={disabled}/>}</div>;
});
