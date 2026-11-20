import {forwardRef,useId,useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactNode,type RefObject} from 'react';
import {useValue,cx} from '../primitives/state';
import {ControlIcon} from '../primitives/control-icons';
import {useWindowContext} from '../window-context';
export interface AccordionItem {id:string;title:ReactNode;content:ReactNode;disabled?:boolean;extra?:ReactNode}
export interface AccordionProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'|'onChange'> {items:readonly AccordionItem[];value?:readonly string[];defaultValue?:readonly string[];onValueChange?:(ids:string[])=>void;multiple?:boolean;appearance?:'outlined'|'plain';unmountClosed?:boolean;size?:'small'|'medium'|'large';expandIconPosition?:'start'|'end';renderExpandIcon?:(expanded:boolean)=>ReactNode;expandOn?:'header'|'icon'}

function AccordionPanel({open,unmountClosed,id,labelledBy,header,children}:{open:boolean;unmountClosed:boolean;id:string;labelledBy:string;header:()=>HTMLButtonElement|undefined;children:ReactNode}){
 const context=useWindowContext(),[present,setPresent]=useState(open),panel=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),initial=useRef(true),heldFocus=useRef(false);
 useLayoutEffect(()=>{
  const node=panel.current,inner=body.current,doc=node?.ownerDocument,view=doc?.defaultView;if(!node||!inner||!doc||!view){initial.current=false;return;}
  if(!open&&heldFocus.current&&context.active&&context.enabled&&(node.contains(doc.activeElement)||doc.activeElement===doc.body)){const trigger=header(),target=trigger&&!trigger.disabled?trigger:node.closest('.ksf-accordion')?.querySelector<HTMLButtonElement>(':scope>section>header>h3>button:not(:disabled)');target?.focus({preventScroll:true});}
  const reset=()=>{node.removeAttribute('data-moving');if(open){node.style.removeProperty('height');node.style.removeProperty('opacity');}else{node.style.height='0px';node.style.opacity='0';}setPresent(open);};
  const media=view.matchMedia('(prefers-reduced-motion: reduce)');
  if(initial.current||!context.active||!context.enabled||doc.hidden||media.matches){initial.current=false;reset();return;}
  if(open)setPresent(true);
  let disposed=false,frame=0,timer=0;const moving=node.hasAttribute('data-moving'),height=node.getBoundingClientRect().height,opacity=view.getComputedStyle(node).opacity;
  node.removeAttribute('data-moving');node.style.height=`${open&&!moving?0:height}px`;node.style.opacity=open&&!moving?'0':opacity;
  void node.offsetHeight;node.setAttribute('data-moving','');
  const finish=()=>{if(disposed)return;disposed=true;view.cancelAnimationFrame(frame);view.clearTimeout(timer);observer.disconnect();media.removeEventListener('change',reduce);doc.removeEventListener('visibilitychange',visibility);view.removeEventListener('blur',finish);node.removeEventListener('transitionend',end);reset();};
  const reduce=()=>{if(media.matches)finish();},visibility=()=>{if(doc.hidden)finish();},end=(event:TransitionEvent)=>{if(event.target===node&&event.propertyName==='height')finish();};
  const observer=new view.ResizeObserver(()=>{if(open&&!disposed&&node.hasAttribute('data-moving'))node.style.height=`${inner.getBoundingClientRect().height}px`;});
  frame=view.requestAnimationFrame(()=>{frame=view.requestAnimationFrame(()=>{frame=0;node.style.height=`${open?inner.getBoundingClientRect().height:0}px`;node.style.opacity=open?'1':'0';observer.observe(inner);timer=view.setTimeout(finish,220);});});
  media.addEventListener('change',reduce);doc.addEventListener('visibilitychange',visibility);view.addEventListener('blur',finish);node.addEventListener('transitionend',end);
  return()=>{disposed=true;view.cancelAnimationFrame(frame);view.clearTimeout(timer);observer.disconnect();media.removeEventListener('change',reduce);doc.removeEventListener('visibilitychange',visibility);view.removeEventListener('blur',finish);node.removeEventListener('transitionend',end);};
 },[open,unmountClosed,context.active,context.enabled]);
 if(unmountClosed&&!open&&!present)return null;
 return <div ref={panel} id={id} role="region" aria-labelledby={labelledBy} hidden={!open&&!present} aria-hidden={!open||undefined} inert={!open||undefined} className="ksf-accordion-panel" onFocusCapture={()=>{heldFocus.current=true;}} onBlurCapture={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))heldFocus.current=false;}}><div ref={body} className="ksf-accordion-body">{children}</div></div>;
}

export const Accordion=forwardRef<HTMLDivElement,AccordionProps>(function Accordion({items,value,defaultValue=[],onValueChange,multiple=true,appearance='outlined',unmountClosed=false,size='medium',expandIconPosition='start',renderExpandIcon,expandOn='header',className='',...props},ref){
 const context=useWindowContext(),uid=useId(),[open,setOpen]=useValue<readonly string[]>(value,defaultValue,ids=>onValueChange?.([...ids])),buttons=useRef(new Map<string,HTMLButtonElement>()),enabled=items.filter(item=>!item.disabled);
 const toggle=(id:string)=>{if(context.active&&context.enabled)setOpen(open.includes(id)?open.filter(value=>value!==id):multiple?[...open,id]:[id]);};
 return <div {...props} ref={ref} inert={!context.active||!context.enabled||props.inert||undefined} className={cx('ksf-accordion',className)} data-appearance={appearance} data-size={size} data-icon-position={expandIconPosition}>
  {items.map((item,index)=>{const expanded=open.includes(item.id),headerId=`${uid}-header-${index}`,panelId=`${uid}-panel-${index}`;return <section key={item.id} data-open={expanded||undefined} data-disabled={item.disabled||undefined}>
   <header><h3><button type="button" id={headerId} ref={node=>{if(node)buttons.current.set(item.id,node);else buttons.current.delete(item.id);}} aria-expanded={expanded} aria-controls={panelId} disabled={item.disabled} onClick={event=>{if(expandOn==='header'||event.detail===0||(event.target as HTMLElement).closest('[data-expand-icon]'))toggle(item.id);}} onKeyDown={event=>{
    if(event.defaultPrevented||event.nativeEvent.isComposing||!context.active||!context.enabled)return;const at=enabled.findIndex(value=>value.id===item.id),target=event.key==='ArrowDown'?enabled[(at+1)%enabled.length]:event.key==='ArrowUp'?enabled[(at-1+enabled.length)%enabled.length]:event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):undefined;if(target){event.preventDefault();buttons.current.get(target.id)?.focus();}
   }}><span aria-hidden="true" data-expand-icon data-default-icon={!renderExpandIcon||undefined}>{renderExpandIcon?renderExpandIcon(expanded):<ControlIcon name="RightOutlined"/>}</span><span className="ksf-accordion-title">{item.title}</span></button></h3>{item.extra!=null&&item.extra!==false&&<div className="ksf-accordion-extra">{item.extra}</div>}</header>
   <AccordionPanel open={expanded} unmountClosed={unmountClosed} id={panelId} labelledBy={headerId} header={()=>buttons.current.get(item.id)}>{item.content}</AccordionPanel>
  </section>;})}
 </div>;
});
