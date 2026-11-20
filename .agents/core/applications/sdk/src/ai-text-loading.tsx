import {forwardRef,type HTMLAttributes} from 'react';
import Loading from './fidelity/kokonut/ai-text-loading';
import {FidelityScope} from './fidelity/scope';
export interface AITextLoadingProps extends HTMLAttributes<HTMLDivElement> {label:string;messages:readonly string[];intervalMs?:number;showElapsed?:boolean;paused?:boolean}
export const AITextLoading=forwardRef<HTMLDivElement,AITextLoadingProps>(function AITextLoading({label,messages,intervalMs=1500,showElapsed=false,paused=false,...props},ref){return <div {...props} ref={ref}><FidelityScope module="ai-text-loading" paused={paused}><Loading label={label} texts={[...messages]} interval={Math.max(100,intervalMs)} showElapsed={showElapsed}/></FidelityScope></div>});
