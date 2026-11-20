import {forwardRef,useMemo} from 'react';
import Source from './fidelity/kokonut/apple-activity-card';
import {FidelityScope} from './fidelity/scope';
export interface ActivityRing {id:string;label:string;value:number;goal:number;color?:string;endColor?:string;unit?:string}
export interface ActivityRingsProps {label:string;rings:readonly ActivityRing[];onFocusRing?:(id:string|null)=>void}
export const ActivityRings=forwardRef<HTMLDivElement,ActivityRingsProps>(function ActivityRings({label,rings,onFocusRing},ref){
 const data=useMemo(()=>rings.slice(0,5).map((r,i)=>({label:r.label,color:r.color??'var(--ksf-color-primary)',colorEnd:r.endColor??r.color??'color-mix(in srgb,var(--ksf-color-primary) 65%,var(--ksf-color-surface-raised))',size:Math.max(40,200-i*40),current:Number.isFinite(r.value)?Math.max(0,r.value):0,target:Number.isFinite(r.goal)?Math.max(0,r.goal):0,unit:r.unit??''})),[rings]);
 return <div ref={ref}><FidelityScope module="apple-activity-card"><Source title={label} activities={data} onFocusRing={i=>onFocusRing?.(i===null?null:rings[i]?.id??null)}/></FidelityScope></div>;
});
