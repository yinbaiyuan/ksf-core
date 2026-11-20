import {forwardRef,useMemo} from 'react';
import Source from './fidelity/kokonut/activity-terrain';
import {FidelityScope} from './fidelity/scope';
export interface ActivityCell {id:string;label:string;value:number}
export interface ActivityTerrainProps {label:string;cells:readonly ActivityCell[];endDate?:string;defaultFlat?:boolean;onCellSelect?:(id:string)=>void;onCellHover?:(id:string|null)=>void}
export const ActivityTerrain=forwardRef<HTMLDivElement,ActivityTerrainProps>(function ActivityTerrain({label,cells,endDate='2026-11-19',defaultFlat=false,onCellSelect,onCellHover},ref){
 const data=useMemo(()=>cells.map(c=>Number.isFinite(c.value)?Math.max(0,c.value):0),[cells]);
 return <div ref={ref} style={{width:'100%',minWidth:0,maxWidth:'100%'}}><FidelityScope module="activity-terrain">{cells.length?<Source title={label} data={data} endDate={endDate} defaultFlat={defaultFlat} onSelect={i=>{if(cells[i])onCellSelect?.(cells[i].id);}} onHover={i=>onCellHover?.(i===null?null:cells[i]?.id??null)}/>:<p role="status">暂无活动记录</p>}</FidelityScope></div>;
});
