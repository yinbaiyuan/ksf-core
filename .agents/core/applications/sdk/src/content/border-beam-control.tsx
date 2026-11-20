import {forwardRef,useCallback,type CSSProperties,type HTMLAttributes} from 'react';
import {useElementRef,cx} from '../primitives/state';
import {useMotionActivity} from '../motion-activity';
import {useWindowContext} from '../window-context';
import './border-beam.css';
export interface BorderBeamProps extends HTMLAttributes<HTMLDivElement>{duration?:number;count?:number;lineWidth?:number;radius?:number;color?:string;gradient?:string;hoverOnly?:boolean;disabled?:boolean;beamLength?:number;beamOutset?:number}
/** A decorative owned-wrapper effect. No cloned child, portal, event interception or JS animation loop. */
export const BorderBeam=forwardRef<HTMLDivElement,BorderBeamProps>(function BorderBeam({duration=6,count=1,lineWidth=1,radius=8,color,gradient,hoverOnly=false,disabled=false,beamLength=100,beamOutset=0,children,className='',style,...props},ref){
 if(!Number.isFinite(duration)||duration<=0||!Number.isInteger(count)||count<1||count>8)throw new Error('BorderBeam duration必须大于0，count范围为1到8。');
 if(!Number.isFinite(lineWidth)||lineWidth<0||!Number.isFinite(radius)||radius<0||!Number.isFinite(beamLength)||beamLength<=0||!Number.isFinite(beamOutset))throw new Error('BorderBeam线宽和圆角必须为非负数，beamLength必须大于0，beamOutset必须为有限数。');
 const context=useWindowContext(),activity=useMotionActivity<HTMLDivElement>({enabled:!disabled&&context.active&&context.enabled}),[,assign]=useElementRef(ref),setRoot=useCallback((node:HTMLDivElement|null)=>{activity.ref.current=node;const cleanup=assign(node);if(typeof cleanup==='function')return()=>{activity.ref.current=null;cleanup();};},[assign]);
 const background=gradient??(color?`linear-gradient(to left, ${color} 0%, ${color} 70%, transparent)`:'linear-gradient(to left, var(--ksf-color-primary) 0%, color-mix(in srgb,var(--ksf-color-primary) 85%,var(--ksf-color-background)) 70%, transparent)');
 return <div {...props} ref={setRoot} className={cx('ksf-border-beam',className)} data-hover-only={hoverOnly||undefined} data-disabled={disabled||undefined} data-motion-active={activity.active} style={{...style,borderRadius:radius,'--ksf-beam-duration':duration+'s','--ksf-beam-length':beamLength+'px','--ksf-beam-width':lineWidth+'px','--ksf-beam-inset':-beamOutset+'px','--ksf-beam-background':background} as CSSProperties}>{children}{!disabled&&Array.from({length:count},(_,index)=><span key={index} className="ksf-border-beam-track" aria-hidden="true" style={{'--ksf-beam-delay':-duration*index/count+'s'} as CSSProperties}/>)}</div>;
});
