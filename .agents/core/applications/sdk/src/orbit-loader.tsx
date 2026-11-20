import {forwardRef,type HTMLAttributes} from 'react';
import Source from './fidelity/kokonut/loader';
import {FidelityScope} from './fidelity/scope';
export interface OrbitLoaderProps extends Omit<HTMLAttributes<HTMLDivElement>,'children'|'title'>{label?:string;description?:string;diameter?:80|128|160;paused?:boolean}
export const OrbitLoader=forwardRef<HTMLDivElement,OrbitLoaderProps>(function OrbitLoader({label='Configuring your account...',description='Please wait while we prepare everything for you',diameter=128,paused=false,className,...props},ref){return <div ref={ref} {...props} className={className}><FidelityScope module="loader" paused={paused}><Source title={label} subtitle={description} size={diameter===80?'sm':diameter===160?'lg':'md'} role="status"/></FidelityScope></div>;});
