import {forwardRef,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {TextArea,type TextAreaProps,type ChoiceOption} from './inputs';
import {useValue,useElementRef,useFormReset} from '../primitives/state';
import {AnchoredLayer} from '../primitives/layer';
import {usePickerPresence} from '../date/picker-presence';
import {useWindowContext} from '../window-context';
import {mentionToken,insertMention,type MentionToken} from './mention-model';
import {MentionAnchor,type MentionAnchorPosition} from './mention-anchor';
import {EmptyIllustration} from '../primitives/empty-illustration';
import {Spinner} from '../spinner';
import './extended-inputs.css';
export interface MentionsProps extends Omit<TextAreaProps,'value'|'defaultValue'|'onValueChange'|'prefix'> {
 options:readonly ChoiceOption[];prefix?:string|readonly string[];renderOption?:(option:ChoiceOption)=>ReactNode;value?:string;defaultValue?:string;onValueChange?:(value:string)=>void;onMentionSelect?:(option:ChoiceOption,prefix:string)=>void;loading?:boolean;emptyContent?:ReactNode;
}
export const Mentions=forwardRef<HTMLTextAreaElement,MentionsProps>(function Mentions({options,prefix='@',renderOption,value,defaultValue='',onValueChange,onMentionSelect,loading=false,emptyContent,onChange,onKeyDown,onKeyUp,onSelect,onBlur,onScroll,onCompositionStart,onCompositionEnd,minRows=1,...props},ref){
 const [current,setCurrent,reset]=useValue(value,defaultValue,onValueChange),[draft,setDraft]=useState(current),[composing,setComposing]=useState(false),composition=useRef(false),[token,setToken]=useState<MentionToken|null>(null),[active,setActive]=useState(0);
 const [anchorPosition,setAnchorPosition]=useState<MentionAnchorPosition>({left:0,top:0,height:0,visible:false});
 const [input,assign]=useElementRef(ref),anchor=useRef<HTMLSpanElement>(null),caret=useRef<number|null>(null),context=useWindowContext(),id=useId(),enabled=!props.disabled&&!props.readOnly&&context.active&&context.enabled,text=composing?draft:current;
 const valid=token&&text.slice(token.start,token.start+token.prefix.length)===token.prefix&&text.slice(token.start+token.prefix.length,token.end)===token.query;
 const suggestions=options.filter(option=>option.value.toLocaleLowerCase().includes(token?.query.toLocaleLowerCase()??''));
 const expanded=!!token&&!!valid&&enabled&&!composing&&anchorPosition.visible,visible=usePickerPresence(expanded,enabled,anchor),lastOptions=useRef<readonly ChoiceOption[]>(suggestions);if(expanded)lastOptions.current=suggestions;
 const shown=expanded?suggestions:lastOptions.current,activeIndex=suggestions[active]&&!suggestions[active].disabled?active:suggestions.findIndex(option=>!option.disabled);
 const detect=(next:string,position:number)=>{if(!enabled||composition.current)return;const found=mentionToken(next,position,prefix);setToken(found);setActive(0);};
 const close=()=>setToken(null);
 useEffect(()=>{if(!enabled){setToken(null);composition.current=false;setComposing(false);}},[enabled]);
 useFormReset(input,value===undefined,()=>{reset();setDraft(defaultValue);setToken(null);caret.current=null;composition.current=false;setComposing(false);},props.form);
 const choose=(option:ChoiceOption)=>{if(!enabled||!token||!valid||option.disabled||loading)return;const next=insertMention(current,token,option.value);setCurrent(next.text);caret.current=next.caret;setToken(null);onMentionSelect?.(option,token.prefix);};
 useLayoutEffect(()=>{if(caret.current===null||!input.current)return;const point=Math.min(caret.current,input.current.value.length);caret.current=null;input.current.focus({preventScroll:true});input.current.setSelectionRange(point,point);},[current,token]);
 useEffect(()=>{if(!expanded||activeIndex<0)return;const panel=input.current?.ownerDocument.getElementById(`${id}-list`),row=panel?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`),viewport=panel?.firstElementChild as HTMLElement|null;if(row&&viewport){if(row.offsetTop<viewport.scrollTop)viewport.scrollTop=row.offsetTop;else if(row.offsetTop+row.offsetHeight>viewport.scrollTop+viewport.clientHeight)viewport.scrollTop=row.offsetTop+row.offsetHeight-viewport.clientHeight;}},[activeIndex,expanded,id]);
 return <div className="ksf-mentions"><TextArea {...props} style={{resize:'none',...props.style}} minRows={minRows} ref={assign} value={text} onValueChange={next=>{if(!enabled)return;setDraft(next);if(!composition.current)setCurrent(next);}}
  onChange={event=>{onChange?.(event);if(!composition.current)detect(event.currentTarget.value,event.currentTarget.selectionStart);}}
  onCompositionStart={event=>{composition.current=true;setComposing(true);onCompositionStart?.(event);}}
  onCompositionEnd={event=>{composition.current=false;setComposing(false);if(enabled){setCurrent(event.currentTarget.value);detect(event.currentTarget.value,event.currentTarget.selectionStart);}onCompositionEnd?.(event);}}
  onSelect={event=>{onSelect?.(event);if(!composition.current&&token)detect(event.currentTarget.value,event.currentTarget.selectionStart);}}
  onBlur={event=>{onBlur?.(event);close();}} onScroll={onScroll}
  onKeyUp={event=>{onKeyUp?.(event);if(!event.defaultPrevented&&!composition.current&&!event.nativeEvent.isComposing&&!['Escape','ArrowUp','ArrowDown','Enter','Tab'].includes(event.key))detect(event.currentTarget.value,event.currentTarget.selectionStart);}}
  onKeyDown={event=>{onKeyDown?.(event);if(event.defaultPrevented||!enabled||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||composition.current||!token)return;
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){if(!suggestions.length)return;event.preventDefault();const step=event.key==='ArrowDown'?1:-1;for(let n=1;n<=suggestions.length;n++){const at=(Math.max(0,activeIndex)+step*n+suggestions.length)%suggestions.length;if(!suggestions[at].disabled){setActive(at);break;}}}
   else if(event.key==='Enter'){event.preventDefault();if(loading)return;if(suggestions[activeIndex])choose(suggestions[activeIndex]);else close();}
   else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab')close();}}
  aria-controls={visible?`${id}-list`:undefined} aria-activedescendant={expanded&&activeIndex>=0?`${id}-option-${activeIndex}`:undefined}/>
 <MentionAnchor input={input} anchor={anchor} text={text} token={valid?token:null} enabled={enabled} onPosition={setAnchorPosition}/>
 <AnchoredLayer anchor={anchor} triggerRef={input} positionVersion={`${anchorPosition.left}:${anchorPosition.top}:${anchorPosition.height}`} open={visible} onClose={close} gap={4} role="listbox" id={`${id}-list`} aria-label="提及建议" aria-hidden={!expanded||undefined} inert={!expanded||undefined} data-closing={!expanded||undefined} className="ksf-choice-popup ksf-mentions-panel">
  <div className="ksf-combobox-options">{loading?<div className="ksf-mentions-loading"><Spinner label="正在查找" size="small"/></div>:shown.length?shown.map((option,index)=><button key={option.value} type="button" role="option" aria-selected={index===activeIndex} id={`${id}-option-${index}`} data-option-index={index} data-active={index===activeIndex||undefined} disabled={option.disabled} tabIndex={-1} className="ksf-combobox-option" onMouseDown={event=>event.preventDefault()} onPointerMove={()=>{if(enabled&&!option.disabled)setActive(index);}} onClick={()=>choose(option)}>{renderOption?renderOption(option):option.label}</button>):<div className="ksf-mentions-empty-item">{emptyContent??<div className="ksf-mentions-empty"><EmptyIllustration/><span>暂无数据</span></div>}</div>}</div>
 </AnchoredLayer></div>;
});
