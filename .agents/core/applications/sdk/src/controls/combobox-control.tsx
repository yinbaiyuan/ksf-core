import {forwardRef,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {TextField,type TextFieldProps,type ChoiceOption} from './inputs';
import {useValue,useElementRef,useFormReset} from '../primitives/state';
import {AnchoredLayer} from '../primitives/layer';
import {usePickerPresence} from '../date/picker-presence';
import {useWindowContext} from '../window-context';
import './extended-inputs.css';
export interface ComboboxProps extends Omit<TextFieldProps,'onValueChange'|'value'|'defaultValue'> {
 options:readonly ChoiceOption[];value?:string;defaultValue?:string;onValueChange?:(value:string)=>void;allowCustom?:boolean;renderOption?:(option:ChoiceOption)=>ReactNode;
}
export const Combobox=forwardRef<HTMLInputElement,ComboboxProps>(function Combobox({options,value,defaultValue='',onValueChange,allowCustom=true,renderOption,onKeyDown,onFocus,onBlur,onClick,onCompositionStart,onCompositionEnd,...props},ref){
 const [current,setCurrent,reset]=useValue(value,defaultValue,onValueChange),labelFor=(text:string)=>options.find(option=>option.value===text)?.label??text;
 const [query,setQuery]=useState(()=>labelFor(current)),[composing,setComposing]=useState(false),composition=useRef(false),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const [input,assign]=useElementRef(ref),anchor=useRef<HTMLDivElement>(null),context=useWindowContext(),id=useId();
 const enabled=!props.disabled&&!props.readOnly&&context.active&&context.enabled,text=allowCustom&&!composing?labelFor(current):query;
 const filtered=options.filter(option=>option.label.toLocaleLowerCase().includes(text.toLocaleLowerCase())||option.value.toLocaleLowerCase().includes(text.toLocaleLowerCase()));
 const expanded=open&&enabled&&filtered.length>0,visible=usePickerPresence(expanded,enabled,anchor),lastOptions=useRef<readonly ChoiceOption[]>(filtered);if(expanded)lastOptions.current=filtered;
 const displayed=expanded?filtered:lastOptions.current;
 useEffect(()=>{setQuery(labelFor(current));setActive(-1);},[current]);
 useEffect(()=>{if(!enabled){setOpen(false);setActive(-1);setComposing(false);composition.current=false;}},[enabled]);
 useFormReset(input,value===undefined,()=>{reset();setQuery(labelFor(defaultValue));setOpen(false);setActive(-1);setComposing(false);composition.current=false;},props.form);
 const close=()=>{setOpen(false);setActive(-1);if(!allowCustom&&!composition.current)setQuery(labelFor(current));};
 const choose=(option:ChoiceOption)=>{if(!enabled||option.disabled)return;setCurrent(option.value);setQuery(value===undefined?option.label:labelFor(current));setOpen(false);setActive(-1);input.current?.focus({preventScroll:true});};
 const move=(step:number)=>{for(let n=1;n<=filtered.length;n++){const start=active>=0?active:step>0?-1:0,index=((start+step*n)%filtered.length+filtered.length)%filtered.length;if(!filtered[index].disabled){setActive(index);break;}}};
 useEffect(()=>{if(!expanded||active<0)return;const panel=input.current?.ownerDocument.getElementById(`${id}-list`),row=panel?.querySelector<HTMLElement>(`[data-option-index="${active}"]`),view=panel?.firstElementChild as HTMLElement|null;if(row&&view){if(row.offsetTop<view.scrollTop)view.scrollTop=row.offsetTop;else if(row.offsetTop+row.offsetHeight>view.scrollTop+view.clientHeight)view.scrollTop=row.offsetTop+row.offsetHeight-view.clientHeight;}},[active,expanded,id]);
 return <div ref={anchor} className="ksf-combobox"><TextField {...props} ref={assign} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={visible?`${id}-list`:undefined}
  aria-activedescendant={expanded&&active>=0&&filtered[active]?`${id}-option-${active}`:undefined} value={text}
  onValueChange={next=>{if(!enabled)return;setQuery(next);setOpen(true);setActive(-1);if(allowCustom&&!composition.current)setCurrent(next);}}
  onCompositionStart={event=>{composition.current=true;setComposing(true);onCompositionStart?.(event);}}
  onCompositionEnd={event=>{composition.current=false;setComposing(false);if(allowCustom&&enabled)setCurrent(event.currentTarget.value);setQuery(value===undefined?event.currentTarget.value:labelFor(current));onCompositionEnd?.(event);}}
  onFocus={event=>{onFocus?.(event);if(!event.defaultPrevented&&enabled)setOpen(true);}}
  onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&enabled)setOpen(true);}}
  onBlur={event=>{onBlur?.(event);const next=event.relatedTarget as Node|null;if(!next||!anchor.current?.contains(next))close();}}
  onKeyDown={event=>{onKeyDown?.(event);if(event.defaultPrevented||!enabled||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||composition.current)return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);move(event.key==='ArrowDown'?1:-1);}else if(event.key==='Enter'&&expanded&&active>=0&&filtered[active]){event.preventDefault();choose(filtered[active]);}else if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab')close();}}/>
 <AnchoredLayer anchor={anchor} open={visible} onClose={close} matchWidth gap={4} role="listbox" id={`${id}-list`} aria-label={`${props.label??'输入'}建议`} aria-hidden={!expanded||undefined} inert={!expanded||undefined} data-closing={!expanded||undefined} className="ksf-choice-popup ksf-combobox-panel">
  <div className="ksf-combobox-options">{displayed.map((option,index)=><button type="button" key={option.value} id={`${id}-option-${index}`} data-option-index={index} role="option" aria-selected={option.value===current} disabled={option.disabled} data-active={index===active||undefined} tabIndex={-1} className="ksf-combobox-option" onMouseDown={event=>event.preventDefault()} onPointerMove={()=>{if(enabled&&!option.disabled)setActive(index);}} onClick={()=>choose(option)}>{renderOption?renderOption(option):<>{option.icon}<span>{option.label}{option.description&&<small>{option.description}</small>}</span></>}</button>)}</div>
 </AnchoredLayer></div>;
});
