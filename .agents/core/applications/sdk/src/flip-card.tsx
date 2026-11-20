import {forwardRef,type ReactNode} from 'react';
import Source from './fidelity/kokonut/card-flip';
import {FidelityScope} from './fidelity/scope';
export interface FlipCardProps {label:string;front?:ReactNode;back?:ReactNode;flipped?:boolean;defaultFlipped?:boolean;onFlippedChange?:(flipped:boolean)=>void;disabled?:boolean;axis?:'x'|'y'}
export const FlipCard=forwardRef<HTMLDivElement,FlipCardProps>(function FlipCard(props,ref){return <div ref={ref}><FidelityScope module="card-flip"><Source {...props}/></FidelityScope></div>;});
