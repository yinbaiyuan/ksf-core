import {forwardRef,useMemo,type ReactNode} from 'react';
import Source from './fidelity/kokonut/page-flip';
import {FidelityScope} from './fidelity/scope';
export interface PageFlipProps {label:string;pages?:readonly {id:string;title:string;content:ReactNode}[];page?:number;onPageChange?:(index:number)=>void;disabled?:boolean}
export const PageFlip=forwardRef<HTMLDivElement,PageFlipProps>(function PageFlip({label,pages,page,onPageChange,disabled=false},ref){
 const data=useMemo(()=>pages?.map(p=><article key={p.id} style={{height:'100%',boxSizing:'border-box',padding:24,background:'var(--ksf-color-surface-raised)',color:'var(--ksf-color-foreground)',display:'flex',flexDirection:'column',gap:16}}><h3>{p.title}</h3>{p.content}</article>),[pages]);
 return <div ref={ref} role="group" aria-label={label}><FidelityScope module="page-flip">{pages?.length===0?<p role="status">暂无页面</p>:<Source pages={data} page={page} onPageChange={onPageChange} disabled={disabled}/>}</FidelityScope></div>;
});
