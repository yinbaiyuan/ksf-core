import {cloneElement,useId,useLayoutEffect,useRef,useState,type ComponentProps,type ReactElement,type ReactNode,type Ref} from 'react';
import {Slot} from '@radix-ui/react-slot';
import {X} from 'lucide-react';
import {Button} from './controls';
import {descriptionIds} from './field';
import {InlineAlert} from './feedback';
import {OverlayHost} from './interactions';
import {useUI} from './provider';
import {useComposedRef} from './refs';
import {useOverlayPosition,type OverlayAnchor} from './position';
import type {OverlayCloseReason,OverlayPolicy} from '../../../../applications/sdk/src/controllers/overlay-stack';
import type {OverlayPlacement} from './position-model';

export type UIOpenReason=OverlayCloseReason|'trigger'|'close-button'|'cancel'|'tab'|'target-changed';
export type UIOpenChange=(open:boolean,detail:{reason:UIOpenReason})=>void|boolean|Promise<void|boolean>;
type TriggerElement=ReactElement<ComponentProps<'button'>>;
export interface TooltipProps {
 children:TriggerElement;content:ReactNode;delay?:number;placement?:OverlayPlacement;open?:boolean;onOpenChange?:(open:boolean)=>void;
}
/** Noninteractive description. Use a focusable wrapper when describing a disabled control. */
export function Tooltip({children,content,delay=400,placement='top',open,onOpenChange}:TooltipProps){
 const ui=useUI(),id=useId(),[local,setLocal]=useState(false),[anchor,setAnchor]=useState<HTMLElement|null>(null),panel=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),hover=useRef(false),focused=useRef(false);
 const allowed=ui.environment.active&&ui.environment.visible&&ui.environment.enabled,shown=(open??local)&&allowed&&!!anchor;
 const change=(next:boolean)=>{if(open===undefined)setLocal(next);onOpenChange?.(next);};
 const stop=()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;};
 useLayoutEffect(()=>()=>stop(),[]);
 useLayoutEffect(()=>{if(!allowed){stop();hover.current=false;focused.current=false;change(false);}},[allowed]);
 const position=useOverlayPosition(shown,anchor,panel,placement);
 return <><Slot ref={setAnchor} onPointerEnter={event=>{if(event.pointerType==='touch'||event.defaultPrevented||!allowed)return;hover.current=true;stop();timer.current=setTimeout(()=>{timer.current=null;if(hover.current)change(true);},Math.max(0,delay));}}
   onPointerLeave={()=>{hover.current=false;stop();if(!focused.current)change(false);}}
   onFocus={event=>{if(event.defaultPrevented||!allowed)return;focused.current=true;stop();change(true);}}
   onBlur={()=>{focused.current=false;stop();if(!hover.current)change(false);}}>
   {cloneElement(children,{'aria-describedby':descriptionIds(children.props['aria-describedby'],shown&&id)})}
  </Slot>
  <OverlayHost ref={panel} open={shown} kind="tooltip" trigger={anchor} autoFocus={false} restoreFocus={false} onClose={()=>{stop();change(false);}} role="tooltip" id={id} data-ksf-component="tooltip" data-side={position.side} style={position.style}>{content}</OverlayHost>
 </>;
}

export interface PopoverProps extends Omit<ComponentProps<'div'>,'title'|'onChange'> {
 open:boolean;onOpenChange:UIOpenChange;anchor?:OverlayAnchor|null;trigger?:TriggerElement;placement?:OverlayPlacement;
 label:string;autoFocus?:boolean;initialFocus?:()=>HTMLElement|null;closePolicy?:Partial<OverlayPolicy>;
}
export function Popover({open,onOpenChange,anchor:external,trigger,placement='bottom-start',label,autoFocus=true,initialFocus,closePolicy,children,style,className='',ref,...props}:PopoverProps){
 const ui=useUI(),[triggerNode,setTrigger]=useState<HTMLElement|null>(null),panel=useRef<HTMLDivElement>(null),anchor=external??triggerNode;
 if(open&&!trigger&&!external)throw Error('Popover打开时需要有效anchor或trigger。');
 const shown=open&&!!anchor,position=useOverlayPosition(shown,anchor,panel,placement),bind=useComposedRef(panel,ref);
 return <>{trigger&&<Slot ref={setTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={event=>{if(!event.defaultPrevented&&ui.environment.enabled&&ui.environment.active)void onOpenChange(!open,{reason:'trigger'});}}>{trigger}</Slot>}
  <OverlayHost {...props} ref={bind} open={shown} kind="popover" trigger={typeof HTMLElement!=='undefined'&&anchor instanceof HTMLElement?anchor:triggerNode} autoFocus={autoFocus} initialFocus={initialFocus} policy={closePolicy} onClose={reason=>onOpenChange(false,{reason})} role="dialog" aria-label={label} data-ksf-component="popover" data-side={position.side} className={className} style={{...style,...position.style}}>{children}</OverlayHost>
 </>;
}

export interface DialogProps extends Omit<ComponentProps<'div'>,'title'|'onChange'> {
 open:boolean;onOpenChange:UIOpenChange;title:ReactNode;description?:ReactNode;actions?:ReactNode;busy?:boolean;error?:ReactNode;
 trigger?:HTMLElement|null;initialFocus?:()=>HTMLElement|null;closePolicy?:Partial<OverlayPolicy>;showClose?:boolean;closeLabel?:string;showHeader?:boolean;
}
interface DialogSurfaceProps extends DialogProps {kind:'dialog'|'alert-dialog'|'sheet';side?:'left'|'right'|'top'|'bottom';modal?:boolean}
function DialogSurface({open,onOpenChange,title,description,actions,busy,error,trigger,initialFocus,closePolicy,showClose=true,closeLabel='关闭',showHeader=true,children,kind,side,modal=true,className='',ref,...props}:DialogSurfaceProps){
 const id=useId(),panel=useRef<HTMLDivElement>(null),bind=useComposedRef(panel,ref);
 return <OverlayHost {...props} ref={bind} open={open} kind={kind} modal={modal} trigger={trigger} initialFocus={initialFocus} policy={closePolicy} onClose={reason=>onOpenChange(false,{reason})}
   role={kind==='alert-dialog'?'alertdialog':'dialog'} aria-modal={modal||undefined} aria-labelledby={id+'-title'} aria-describedby={descriptionIds(props['aria-describedby'],description!=null&&id+'-description')} aria-busy={busy||undefined}
   data-ksf-component={kind} data-side={side} className={`ksf-dialog-surface ${className}`.trim()}>
   <header className={showHeader?'ksf-dialog-heading':'ksf-visually-hidden'}><div><h2 id={id+'-title'}>{title}</h2>{description!=null&&<p id={id+'-description'}>{description}</p>}</div>{showHeader&&showClose&&<Button variant="ghost" icon={<X/>} aria-label={closeLabel} onActivate={()=>void onOpenChange(false,{reason:'close-button'})}/>}</header>
   <div className="ksf-dialog-body">{children}{error!=null&&<InlineAlert tone="danger" title="操作未完成">{error}</InlineAlert>}</div>
   {actions&&<footer className="ksf-dialog-actions">{actions}</footer>}
  </OverlayHost>;
}
export function Dialog(props:DialogProps){return <DialogSurface {...props} kind="dialog"/>;}
export interface SheetProps extends DialogProps {side?:'left'|'right'|'top'|'bottom';modal?:boolean}
export function Sheet({side='right',modal=true,...props}:SheetProps){return <DialogSurface {...props} kind="sheet" side={side} modal={modal}/>;}
export interface AlertDialogProps extends Omit<DialogProps,'actions'|'initialFocus'|'showClose'> {
 confirmLabel:string;cancelLabel?:string;danger?:boolean;confirmDisabled?:boolean;confirmDisabledReason?:string;cancelDisabled?:boolean;
 onConfirmIntent:()=>void;onCancelIntent?:()=>void;
}
/** Confirmation emits an intent; only the caller's authoritative result can complete it. */
export function AlertDialog({confirmLabel,cancelLabel='取消',danger=true,confirmDisabled=false,confirmDisabledReason,cancelDisabled=false,onConfirmIntent,onCancelIntent,busy,...props}:AlertDialogProps){
 const safe=useRef<HTMLButtonElement>(null);
 return <DialogSurface {...props} busy={busy} kind="alert-dialog" showClose={false} initialFocus={()=>safe.current}
  actions={<><Button ref={safe} disabled={cancelDisabled} onActivate={()=>{onCancelIntent?.();void props.onOpenChange(false,{reason:'cancel'});}}>{cancelLabel}</Button><Button variant={danger?'danger':'primary'} busy={busy} disabled={confirmDisabled} disabledReason={confirmDisabledReason} onActivate={onConfirmIntent}>{confirmLabel}</Button></>}/>;
}
