import {forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode} from 'react';
import {useElementRef, useFormReset, useValue} from '../primitives/state';
import {AnchoredLayer} from '../primitives/layer';
import {ControlIcon} from '../primitives/control-icons';
import {EmptyIllustration} from '../primitives/empty-illustration';
import {useWindowContext} from '../window-context';
import {usePickerPresence} from '../date/picker-presence';
import {FieldShell, type FieldPresentation} from './inputs';
import {ChoiceTrigger} from './choice-trigger';
import {cascadePath, cascadeSearch, type CascadeOption} from './cascade-model';
import './extended-inputs.css';
export type {CascadeOption} from './cascade-model';

export interface CascaderProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'defaultValue' | 'onChange'>, FieldPresentation {
  options: readonly CascadeOption[];
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
  placeholder?: string;
  clearable?: boolean;
  name?: string;
  searchable?: boolean;
  selectParents?: boolean;
  onBrowsePathChange?: (path: readonly string[]) => void;
}

function highlightPath(text:string,query:string):ReactNode {const needle=query.trim().toLocaleLowerCase();if(!needle)return text;const lower=text.toLocaleLowerCase(),parts:ReactNode[]=[];let start=0,at=lower.indexOf(needle);while(at>=0){parts.push(text.slice(start,at),<span key={at} className="ksf-cascader-keyword">{text.slice(at,at+needle.length)}</span>);start=at+needle.length;at=lower.indexOf(needle,start);}parts.push(text.slice(start));return parts;}

export const Cascader = forwardRef<HTMLButtonElement, CascaderProps>(function Cascader({options,value,defaultValue=[],onValueChange,label,description,error,variant='outlined',status='default',size='medium',placeholder='请选择',clearable=true,searchable=false,selectParents=false,onBrowsePathChange,name,id:providedId,className='',onClick,...props}, ref) {
  const generated = useId(), id = providedId ?? generated;
  const [current,setCurrent,reset] = useValue<readonly string[]>(value,defaultValue,next => onValueChange?.([...next]));
  const [draft,setDraft] = useState<readonly string[]>(current), [query,setQuery] = useState(''), [open,setOpen] = useState(false);
  const [button,assign] = useElementRef(ref), anchor = useRef<HTMLDivElement>(null), context = useWindowContext(), original = useRef(defaultValue);
  const buttons = useRef(new Map<string,HTMLButtonElement>()), pendingFocus = useRef<string | null>(null), pendingColumn = useRef<number | null>(null);
  const enabled = !props.disabled && context.active && context.enabled, visible = usePickerPresence(open,enabled,anchor);
  const resolved = cascadePath(options,current), labels = resolved.nodes.map(node => node.label), selection = labels.join(' / ');
  const levels: (readonly CascadeOption[])[] = [options];
  let branch = options;
  for (const choice of draft) {
    const node = branch.find(option => option.value === choice);
    if (!node?.children?.length) break;
    levels.push(node.children); branch = node.children;
  }
  const needle = query.trim().toLocaleLowerCase();
  const results = needle ? cascadeSearch(options,selectParents).filter(entry => entry.names.join(' / ').toLocaleLowerCase().includes(needle)) : [];
  useFormReset(button,value === undefined,() => {reset();setDraft(original.current);setOpen(false);setQuery('');},props.form);
  useEffect(() => {if (!enabled) {setOpen(false);setQuery('');}},[enabled]);
  useEffect(() => {setDraft(current);},[current]);
  useEffect(() => {if (!open && !visible) {setQuery('');setDraft(current);}},[open,visible,current]);
  useLayoutEffect(() => {
    if(!open||!enabled)return;
    if(pendingColumn.current!==null){const column=pendingColumn.current,first=levels[column]?.find(node=>!node.disabled);if(first){pendingFocus.current=`${column}:${first.value}`;pendingColumn.current=null;}}
    const target = pendingFocus.current && buttons.current.get(pendingFocus.current);
    if (target) {pendingFocus.current = null; target.focus({preventScroll: true});}
  },[draft,query,open,options]);
  const focus = (key: string) => {pendingFocus.current = key; const target = buttons.current.get(key); if (target) {pendingFocus.current = null; target.focus({preventScroll: true});}};
  const close = (restore = false) => {pendingFocus.current=null;pendingColumn.current=null;setOpen(false);if (restore && enabled) button.current?.focus({preventScroll:true});};
  const begin = (keyboard = false) => {
    if (!enabled) return;
    pendingFocus.current=null;pendingColumn.current=null;setDraft(current);setQuery('');setOpen(true);
    if (keyboard && !searchable) {
      const first = options.find(node => node.value === current[0] && !node.disabled) ?? options.find(node => !node.disabled);
      if (first) pendingFocus.current = `0:${first.value}`;
    }
  };
  const selectPath = (path: readonly string[]) => {if (path.length!==current.length || path.some((part,index)=>part!==current[index])) setCurrent([...path]);};
  const commit = (path: readonly string[]) => {
    const candidate = cascadePath(options,path), last = candidate.nodes.at(-1);
    if (!enabled || !path.length || !candidate.complete || candidate.disabled || !last || !selectParents && last.children?.length) return;
    selectPath(path);close(true);
  };
  const browse = (column: number,node: CascadeOption,keyboard = false) => {
    if (!enabled || node.disabled) return;
    const path = [...draft.slice(0,column),node.value], candidate = cascadePath(options,path);
    if (!candidate.complete || candidate.disabled) return;
    setDraft(path);onBrowsePathChange?.(path);
    if (node.children?.length) {
      if (selectParents) selectPath(path);
      if (keyboard) {pendingColumn.current=column+1;const first = node.children.find(child => !child.disabled);if (first) pendingFocus.current = `${column+1}:${first.value}`;}
    } else commit(path);
  };
  const columnKeys = (event: KeyboardEvent<HTMLElement>,column: number,node: CascadeOption) => {
    if (!enabled || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const list = levels[column].filter(item => !item.disabled), at = list.findIndex(item => item.value === node.value);
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? list[0] : event.key === 'End' ? list.at(-1) : list[(at + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
      if (next) {setDraft([...draft.slice(0,column),next.value]);focus(`${column}:${next.value}`);}
    } else if (event.key === 'ArrowRight' && node.children?.length) {event.preventDefault();browse(column,node,true);}
    else if (event.key === 'ArrowLeft' && column > 0) {event.preventDefault();focus(`${column-1}:${draft[column-1]}`);}
    else if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();browse(column,node,true);}
    else if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();close(true);}
    else if (event.key === 'Tab') close();
  };
  const navigate = (event: KeyboardEvent<HTMLElement>) => {
    if (!enabled || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Escape' && open) {event.preventDefault();event.stopPropagation();close(true);}
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) begin(true);
      else if (needle) {const index = results.findIndex(entry => !entry.disabled);if (index >= 0) focus(`result:${index}`);}
      else {const first = options.find(node => node.value === draft[0] && !node.disabled) ?? options.find(node => !node.disabled);if (first) focus(`0:${first.value}`);}
    } else if (event.key === 'Enter' && open) {event.preventDefault();if (needle) {const first=results.find(entry=>!entry.disabled);if(first)commit(first.path);} else commit(draft);}
    else if (event.key === 'Tab') close();
  };
  const bind = (key: string,node: HTMLButtonElement | null) => {
    if (node) {buttons.current.set(key,node);if (pendingFocus.current === key) {pendingFocus.current = null;node.focus({preventScroll:true});}}
    else buttons.current.delete(key);
  };
  const describedBy = [props['aria-describedby'],description ? `${id}-help` : '',error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <FieldShell {...{id,label,description,error,variant,status}}><div ref={anchor} className="ksf-choice-anchor">
    <ChoiceTrigger {...{id,label,size,placeholder,searchable,query,describedBy}} open={open&&enabled} disabled={props.disabled}
      selected={selection} selectedText={selection} onQuery={setQuery} onNavigate={navigate} panelId={`${id}-panel`}
      invalid={!!error||status==='error'} buttonRef={assign} buttonProps={{...props,className}}
      onToggle={event => {onClick?.(event);if (!event.defaultPrevented && enabled) open ? close() : begin();}}
      onClear={clearable&&(current.length||query.length) ? () => {if (enabled) {if(current.length)setCurrent([]);close(true);}} : undefined}/>
    <AnchoredLayer anchor={anchor} open={visible} onClose={() => close()} onBlur={event => {const next=event.relatedTarget as Node|null;if(next&&!event.currentTarget.contains(next)&&!anchor.current?.contains(next))close();}}
      gap={4} matchWidth={!!needle} role="dialog" id={`${id}-panel`} aria-label={`${label??'级联'}选项`}
      aria-hidden={!open||undefined} inert={!open||undefined} data-closing={!open||undefined} className="ksf-choice-popup ksf-cascader-panel">
      {needle ? <div className="ksf-cascader-results">{results.length ? results.map((entry,index) => <button key={entry.path.join('/')} ref={node=>bind(`result:${index}`,node)} type="button" className="ksf-cascade-option" disabled={entry.disabled} tabIndex={-1}
        onMouseDown={event=>event.preventDefault()} onClick={()=>commit(entry.path)} onKeyDown={event=>{
          if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
          if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const step=event.key==='ArrowDown'?1:-1;for(let n=1;n<=results.length;n++){const at=(index+step*n+results.length)%results.length;if(!results[at].disabled){focus(`result:${at}`);break;}}}
          else if(event.key==='Enter'||event.key===' '){event.preventDefault();commit(entry.path);}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==='Tab')close();
        }}><span>{highlightPath(entry.names.join(' / '),query)}</span></button>) : <div className="ksf-choice-empty"><EmptyIllustration/><span>暂无数据</span></div>}</div>
      : <div className="ksf-cascader-columns">{options.length ? levels.map((level,column) => <ul key={column} className="ksf-cascader-column" role="listbox" aria-label={`第${column+1}级选项`}>
        {level.map(node=><li key={node.value} role="presentation"><button type="button" ref={element=>bind(`${column}:${node.value}`,element)} role="option" aria-selected={draft[column]===node.value} aria-haspopup={node.children?.length?'listbox':undefined}
          disabled={node.disabled} tabIndex={-1} className="ksf-cascade-option" onMouseDown={event=>event.preventDefault()} onClick={()=>browse(column,node)} onKeyDown={event=>columnKeys(event,column,node)}>
          <span>{node.label}</span>{!!node.children?.length&&<ControlIcon name="RightOutlined"/>}</button></li>)}
      </ul>) : <div className="ksf-choice-empty"><EmptyIllustration/><span>暂无数据</span></div>}</div>}
    </AnchoredLayer>
  </div>{name&&current.map((item,index)=><input key={index} type="hidden" name={name} value={item} form={props.form} disabled={props.disabled}/>)}</FieldShell>;
});
