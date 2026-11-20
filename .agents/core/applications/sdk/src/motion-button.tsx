import {forwardRef,type MouseEvent,type ReactNode,type ButtonHTMLAttributes} from 'react';
import type {ButtonProps} from './button';
import Gradient from './fidelity/kokonut/gradient-button';
import Attract from './fidelity/kokonut/attract-button';
import Particle from './fidelity/kokonut/particle-button';
import Slide from './fidelity/kokonut/slide-text-button';
import Hold from './fidelity/kokonut/hold-button';
import Confirm from './fidelity/kokonut/slide-to-confirm';
import {FidelityScope} from './fidelity/scope';

export interface MotionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onClick'> {
 loading?:boolean;icon?:ReactNode;size?:'small'|'medium'|'large';
 effect?:'gradient'|'magnetic'|'particle'|'slide';alternateLabel?:string;
 status?:'idle'|'pending'|'success'|'error';pendingLabel?:ReactNode;successLabel?:ReactNode;errorLabel?:ReactNode;
 onClick?:(event:MouseEvent<HTMLButtonElement>)=>unknown;onSuccess?:()=>void;onError?:(error:unknown)=>void;
}
export const MotionButton=forwardRef<HTMLButtonElement,MotionButtonProps>(function MotionButton({effect='gradient',alternateLabel,children,onClick,status,pendingLabel='处理中',successLabel='已完成',errorLabel='请重试',onSuccess,onError,loading,disabled,size,icon,...props},ref){
 const native={...props,disabled:disabled||loading,'aria-busy':loading||undefined};
 const button=effect==='magnetic'?<Attract {...native} onClick={onClick}>{icon}{children}</Attract>:effect==='particle'?<Particle {...native} onClick={onClick} status={loading?'pending':status} pendingLabel={pendingLabel} successLabel={successLabel} errorLabel={errorLabel} onSuccess={onSuccess} onError={onError} icon={icon} size={size==='small'?'sm':size==='large'?'lg':'default'}>{children}</Particle>:effect==='slide'?<Slide {...native} onClick={onClick} text={icon?<span style={{display:'inline-flex',alignItems:'center',gap:8}}>{icon}{children}</span>:children} hoverText={alternateLabel}/>:<Gradient {...native} variant="purple" icon={icon} onClick={onClick}>{children}</Gradient>;
 return <FidelityScope module={{gradient:"gradient-button",magnetic:"attract-button",particle:"particle-button",slide:"slide-text-button"}[effect]} inline><span style={{display:'inline-flex'}} ref={node=>{const el=node?.querySelector<HTMLButtonElement>('button')??null;if(typeof ref==='function')ref(el);else if(ref)ref.current=el;}}>{button}</span></FidelityScope>;
});
export interface HoldButtonProps extends Omit<ButtonProps,'onClick'> {duration?:number;onConfirm:()=>void;holdingLabel?:ReactNode;completeLabel?:ReactNode}
export const HoldButton=forwardRef<HTMLButtonElement,HoldButtonProps>(function HoldButton({duration=1200,onConfirm,children,holdingLabel='继续按住',completeLabel='已确认',disabled,loading,variant,tone,size,shape,fullWidth,icon,iconPosition,wave,ghost,...props},ref){return <FidelityScope module="hold-button" inline><span ref={node=>{const el=node?.querySelector<HTMLButtonElement>('button')??null;if(typeof ref==='function')ref(el);else if(ref)ref.current=el;}}><Hold {...props} disabled={disabled||loading} holdDuration={Math.max(150,duration)} onHoldComplete={onConfirm} holdingLabel={holdingLabel} completeLabel={completeLabel} variant="blue">{children}</Hold></span></FidelityScope>});
export interface SlideToConfirmProps {label:string;confirmed?:boolean;disabled?:boolean;onConfirm:()=>unknown|Promise<unknown>}
export const SlideToConfirm=forwardRef<HTMLDivElement,SlideToConfirmProps>(function SlideToConfirm({label,confirmed=false,disabled=false,onConfirm},ref){return <div ref={ref} style={{maxWidth:'100%'}}><FidelityScope module="slide-to-confirm"><Confirm confirmed={confirmed} label={confirmed?'已确认':label} doneLabel="已确认" confirmingLabel="处理中" onConfirm={onConfirm} disabled={disabled||confirmed} resetAfter={null}/></FidelityScope></div>});
