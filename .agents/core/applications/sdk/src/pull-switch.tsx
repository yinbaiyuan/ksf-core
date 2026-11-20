import {forwardRef,useRef} from 'react';
import Source from './fidelity/kokonut/pull-cord';
import {FidelityScope} from './fidelity/scope';
import {useValue,useFormReset} from './primitives/state';
export interface PullSwitchProps {label:string;checked?:boolean;defaultChecked?:boolean;onCheckedChange?:(checked:boolean)=>void;disabled?:boolean;name?:string}
export const PullSwitch=forwardRef<HTMLButtonElement,PullSwitchProps>(function PullSwitch({label,checked,defaultChecked=true,onCheckedChange,disabled=false,name},ref){const root=useRef<HTMLDivElement>(null),[current,setCurrent,reset]=useValue(checked,defaultChecked,onCheckedChange);useFormReset(root,checked===undefined,reset);return <div ref={root} style={{display:'inline-flex',maxWidth:'100%',opacity:disabled?0.45:1}}><FidelityScope module="pull-cord" inline paused={disabled}><Source label={label} checked={current} onCheckedChange={setCurrent} controlRef={ref} disabled={disabled}/></FidelityScope>{name&&current&&<input type="hidden" name={name} value="on" disabled={disabled}/>}</div>;});
