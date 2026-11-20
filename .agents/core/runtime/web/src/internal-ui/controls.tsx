import {useId,useLayoutEffect,useRef,useState,type ComponentProps,type ReactNode} from 'react';
import {Button as ButtonElement} from '../../../../applications/sdk/src/components/ui/button';
import {useUI} from './provider';
import {descriptionIds,useField} from './field';
import {parseNumberDraft,stepNumber} from './controls-model';
import {useComposedRef} from './refs';
import {valueChange,type UIValueChangeDetail,type UIChangeSource} from './events';

export type ControlTone='neutral'|'info'|'success'|'warning'|'danger';
export interface ButtonProps extends Omit<ComponentProps<'button'>,'children'> {
  children?:ReactNode;label?:ReactNode;icon?:ReactNode;variant?:'primary'|'secondary'|'ghost'|'danger';busy?:boolean;busyLabel?:ReactNode;
  disabledReason?:string;onActivate?:(event:React.MouseEvent<HTMLButtonElement>)=>void;
  asChild?:boolean;
}
/** Reuses the existing native/Slot button implementation; the new entry supplies explicit V1 defaults. */
export function Button({children,label,icon,variant='secondary',busy,busyLabel='处理中',disabled=false,disabledReason,onActivate,onClick,type='button',className='',asChild=false,...props}:ButtonProps){
  useUI();const content=label??children,iconOnly=!!icon&&(content==null||content==='');
  if(iconOnly&&!props['aria-label'])throw Error('图标按钮需要aria-label说明操作。');
  return <ButtonElement {...props} asChild={asChild} type={type} variant="ghost" data-ksf-component="button" data-variant={variant} data-icon-only={iconOnly||undefined} data-busy={busy||undefined} disabled={disabled} aria-disabled={disabled||busy||undefined} aria-busy={busy} aria-description={disabledReason} title={props.title??disabledReason} className={className}
    onClick={event=>{if(disabled||busy){event.preventDefault();event.stopPropagation();return;}onClick?.(event);if(!event.defaultPrevented)onActivate?.(event);}}>
    {asChild?content:<><span className="ksf-button-label" aria-hidden={busy||undefined}>{icon&&<span className="ksf-control-icon" aria-hidden="true">{icon}</span>}{content}</span>
    {busy!==undefined&&<span className="ksf-button-busy" aria-hidden={!busy}><span className="ksf-busy-indicator" aria-hidden="true"/><span className={iconOnly?'ksf-visually-hidden':undefined}>{busyLabel}</span></span>}</>}
  </ButtonElement>;
}
export interface LinkProps extends ComponentProps<'a'> {disabled?:boolean;disabledReason?:string;external?:boolean;onNavigate?:(event:React.MouseEvent<HTMLAnchorElement>)=>void;variant?:'inline'|'standalone'}
export function Link({disabled=false,disabledReason,external=false,onNavigate,onClick,variant='inline',children,href,rel,target,className='',...props}:LinkProps){
  useUI();if(disabled)return <span data-ksf-component="link" data-variant={variant} aria-disabled="true" aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} aria-description={disabledReason} title={props.title??disabledReason} className={className}>{children}</span>;
  return <a {...props} data-ksf-component="link" data-variant={variant} href={href} target={target??(external?'_blank':undefined)} rel={external?descriptionIds(rel,'noopener noreferrer'):rel} className={className} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!external&&(!target||target==='_self')&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)onNavigate?.(event);}}>{children}{external&&<span aria-hidden="true" className="ksf-external-mark">↗</span>}</a>;
}
export interface InputProps extends Omit<ComponentProps<'input'>,'children'|'size'|'value'|'defaultValue'> {value?:string;defaultValue?:string;invalid?:boolean;leading?:ReactNode;trailing?:ReactNode;clearable?:boolean;onValueChange?:(value:string,detail:UIValueChangeDetail)=>void}
export function Input({id,value,defaultValue,invalid=false,leading,trailing,clearable=false,onValueChange,onChange,disabled,readOnly,required,className='',ref,...props}:InputProps){
  const field=useField(),[local,setLocal]=useState(defaultValue??''),input=useRef<HTMLInputElement|null>(null),current=value??local,blocked=!!(disabled||field?.disabled),readonly=!!(readOnly||field?.readOnly);
  if(clearable&&!onValueChange)throw Error('可清空Input需要onValueChange，以便调用方接收清空意图。');
  const bind=useComposedRef(input,ref);
  return <span data-ksf-component="input" data-invalid={invalid||field?.invalid||undefined} data-disabled={blocked||undefined} data-readonly={readonly||undefined} className={className}>
    {leading&&<span className="ksf-control-leading">{leading}</span>}<input {...props} ref={bind} id={id??field?.id} value={value} defaultValue={value===undefined?defaultValue:undefined} disabled={blocked} readOnly={readonly} required={required??field?.required} aria-invalid={invalid||field?.invalid||props['aria-invalid']||undefined} aria-describedby={descriptionIds(props['aria-describedby'],field?.describedBy)} onChange={event=>{if(value===undefined)setLocal(event.target.value);onChange?.(event);onValueChange?.(event.target.value,valueChange('input'));}}/>
    {clearable&&current!==''&&!readonly&&!blocked&&<button type="button" aria-label="清空输入" className="ksf-input-clear" onClick={()=>{if(value===undefined){setLocal('');if(input.current)input.current.value='';}onValueChange?.('',valueChange('clear'));input.current?.focus();}}>×</button>}{trailing&&<span className="ksf-control-trailing">{trailing}</span>}
  </span>;
}
export interface TextareaProps extends ComponentProps<'textarea'> {invalid?:boolean;autoGrow?:boolean;maxRows?:number;onValueChange?:(value:string,detail:UIValueChangeDetail)=>void;onSubmitIntent?:()=>void}
export function Textarea({id,invalid=false,autoGrow=false,maxRows=10,rows=3,onValueChange,onChange,onKeyDown,onSubmitIntent,disabled,readOnly,required,className='',ref,...props}:TextareaProps){
  const ui=useUI(),field=useField(),element=useRef<HTMLTextAreaElement|null>(null);
  const resize=()=>{const node=element.current;if(!autoGrow||!node)return;const style=getComputedStyle(node),line=parseFloat(style.lineHeight)||(parseFloat(style.fontSize)||14)*1.57,padding=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom),border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth),min=rows*line+padding+border,max=Math.max(rows,maxRows)*line+padding+border;node.style.height='auto';node.style.height=Math.min(Math.max(node.scrollHeight+border,min),max)+'px';};
  useLayoutEffect(resize,[props.value,autoGrow,rows,maxRows,ui.variables?.['--ksf-font-body'],ui.resolved.density,props.style?.font,props.style?.fontSize,props.style?.lineHeight]);
  useLayoutEffect(()=>{const node=element.current;if(!node||!autoGrow)return;let width=node.clientWidth,frame=0;const observer=new ResizeObserver(()=>{if(node.clientWidth!==width){width=node.clientWidth;if(!frame)frame=requestAnimationFrame(()=>{frame=0;resize();});}});observer.observe(node);return()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);};},[autoGrow,rows,maxRows]);
  const bind=useComposedRef(element,ref);
  return <textarea {...props} ref={bind} id={id??field?.id} rows={rows} data-ksf-component="textarea" className={className} disabled={disabled||field?.disabled} readOnly={readOnly||field?.readOnly} required={required??field?.required} aria-invalid={invalid||field?.invalid||props['aria-invalid']||undefined} aria-describedby={descriptionIds(props['aria-describedby'],field?.describedBy)} onChange={event=>{resize();onChange?.(event);onValueChange?.(event.target.value,valueChange('input'));}} onKeyDown={event=>{onKeyDown?.(event);if(!event.defaultPrevented&&onSubmitIntent&&event.key==='Enter'&&(event.metaKey||event.ctrlKey)&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();onSubmitIntent();}}}/>;
}
export interface SelectOption {value:string;label:string;disabled?:boolean;group?:string}
export interface SelectProps extends Omit<ComponentProps<'select'>,'children'|'size'|'value'|'defaultValue'> {
  value?:string;defaultValue?:string;options:readonly SelectOption[];placeholder?:string;invalid?:boolean;readOnly?:boolean;onValueChange?:(value:string,detail:UIValueChangeDetail)=>void;
}
export function Select({id,value,defaultValue,options,placeholder,invalid=false,readOnly=false,onValueChange,onChange,onKeyDown,onPointerDown,disabled,required,className='',...props}:SelectProps){
  const field=useField(),[local,setLocal]=useState(defaultValue??(placeholder?'':options.find(option=>!option.disabled)?.value??''));
  const selected=value??local,readonly=readOnly||field?.readOnly;
  return <select {...props} id={id??field?.id} data-ksf-component="select" className={className} value={selected} disabled={disabled||field?.disabled}
    aria-readonly={readonly||undefined} required={required??field?.required} aria-invalid={invalid||field?.invalid||props['aria-invalid']||undefined}
    aria-describedby={descriptionIds(props['aria-describedby'],field?.describedBy)}
    onPointerDown={event=>{onPointerDown?.(event);if(readonly){event.preventDefault();event.currentTarget.focus();}}}
    onKeyDown={event=>{onKeyDown?.(event);if(readonly&&['ArrowUp','ArrowDown','Home','End','PageUp','PageDown',' ','Enter'].includes(event.key))event.preventDefault();}}
    onChange={event=>{if(readonly){event.currentTarget.value=selected;return;}if(value===undefined)setLocal(event.target.value);onChange?.(event);onValueChange?.(event.target.value,valueChange('selection'));}}>
    {placeholder&&<option value="" disabled>{placeholder}</option>}{options.map(option=><option key={option.value} value={option.value} disabled={option.disabled}>{option.group?option.group+' · ':''}{option.label}</option>)}
  </select>;
}
export interface CheckboxProps extends Omit<ComponentProps<'input'>,'children'|'type'|'checked'|'defaultChecked'|'onChange'|'size'> {checked?:boolean|'mixed';defaultChecked?:boolean;label?:ReactNode;description?:ReactNode;onCheckedChange?:(checked:boolean,detail:UIValueChangeDetail)=>void}
export function Checkbox({id,checked,defaultChecked=false,label,description,onCheckedChange,disabled,className='',ref,...props}:CheckboxProps){
  const field=useField(),generated=useId(),element=useRef<HTMLInputElement|null>(null),[local,setLocal]=useState(defaultChecked),value=checked??local,controlId=id??field?.id??generated;
  const latest=useRef(value);latest.current=value;
  useLayoutEffect(()=>{if(element.current)element.current.indeterminate=value==='mixed';},[value]);
  const bind=useComposedRef(element,ref);
  return <label data-ksf-component="checkbox" data-disabled={disabled||field?.disabled||undefined} className={className}><input {...props} ref={bind} id={controlId} type="checkbox" checked={value===true} disabled={disabled||field?.disabled} required={props.required??field?.required} aria-checked={value==='mixed'?'mixed':value} aria-readonly={props.readOnly||field?.readOnly||undefined} aria-labelledby={props['aria-labelledby']??(props['aria-label']?undefined:label!=null?controlId+'-choice-label':field?.labelId)} aria-describedby={descriptionIds(props['aria-describedby'],field?.describedBy,description!=null&&controlId+'-description')} onClick={event=>{if(props.readOnly||field?.readOnly){event.preventDefault();return;}props.onClick?.(event);}} onChange={event=>{if(props.readOnly||field?.readOnly)return;if(checked===undefined)setLocal(event.target.checked);onCheckedChange?.(event.target.checked,valueChange('toggle'));queueMicrotask(()=>{if(element.current)element.current.indeterminate=latest.current==='mixed';});}}/><span className="ksf-choice-label"><span id={controlId+'-choice-label'}>{label}</span>{description!=null&&<small id={controlId+'-description'}>{description}</small>}</span></label>;
}
export interface RadioOption {value:string;label:ReactNode;description?:ReactNode;disabled?:boolean}
export interface RadioGroupProps extends Omit<React.HTMLAttributes<HTMLFieldSetElement>,'onChange'> {value?:string;defaultValue?:string;name?:string;label:ReactNode;options:readonly RadioOption[];disabled?:boolean;required?:boolean;orientation?:'vertical'|'horizontal';onValueChange?:(value:string,detail:UIValueChangeDetail)=>void}
export function RadioGroup({value,defaultValue='',name,label,options,disabled=false,required=false,orientation='vertical',onValueChange,className='',...props}:RadioGroupProps){
  useUI();const generated=useId(),[local,setLocal]=useState(defaultValue),selected=value??local;
  return <fieldset {...props} data-ksf-component="radio-group" data-orientation={orientation} disabled={disabled} className={className}><legend>{label}</legend><div className="ksf-radio-options">{options.map(option=>{const optionId=generated+'-'+encodeURIComponent(option.value);return <label key={option.value} data-ksf-component="radio" data-disabled={disabled||option.disabled||undefined}><input type="radio" name={name??generated} value={option.value} checked={selected===option.value} disabled={option.disabled} required={required} aria-labelledby={optionId+'-label'} aria-describedby={option.description?optionId+'-description':undefined} onChange={()=>{if(value===undefined)setLocal(option.value);onValueChange?.(option.value,valueChange('selection'));}}/><span className="ksf-choice-label"><span id={optionId+'-label'}>{option.label}</span>{option.description&&<small id={optionId+'-description'}>{option.description}</small>}</span></label>;})}</div></fieldset>;
}
export interface SwitchProps extends Omit<CheckboxProps,'checked'|'onCheckedChange'> {checked?:boolean;busy?:boolean;onCheckedChange?:(checked:boolean,detail:UIValueChangeDetail)=>void}
export function Switch({id,checked,defaultChecked=false,label,description,disabled=false,busy=false,onCheckedChange,className='',...props}:SwitchProps){
  const field=useField(),generated=useId(),[local,setLocal]=useState(defaultChecked),value=checked??local,controlId=id??field?.id??generated;
  return <label data-ksf-component="switch" data-disabled={disabled||field?.disabled||undefined} data-busy={busy||undefined} className={className}><input {...props} id={controlId} type="checkbox" role="switch" checked={value} disabled={disabled||field?.disabled} aria-busy={busy||undefined} aria-disabled={disabled||field?.disabled||busy||undefined} aria-readonly={props.readOnly||field?.readOnly||undefined} aria-labelledby={props['aria-labelledby']??(props['aria-label']?undefined:label!=null?controlId+'-choice-label':field?.labelId)} aria-describedby={descriptionIds(props['aria-describedby'],field?.describedBy,description!=null&&controlId+'-description')} onClick={event=>{if(busy||props.readOnly||field?.readOnly){event.preventDefault();return;}props.onClick?.(event);}} onChange={event=>{if(busy||props.readOnly||field?.readOnly)return;if(checked===undefined)setLocal(event.target.checked);onCheckedChange?.(event.target.checked,valueChange('toggle'));}}/><span className="ksf-switch-track" aria-hidden="true"/><span className="ksf-choice-label"><span id={controlId+'-choice-label'}>{label}</span>{description!=null&&<small id={controlId+'-description'}>{description}</small>}</span></label>;
}
export interface SliderProps extends Omit<ComponentProps<'input'>,'children'|'type'|'value'|'defaultValue'|'onChange'|'size'> {value:number;min:number;max:number;step?:number;label:string;unit?:string;onValueChange:(value:number,detail:UIValueChangeDetail)=>void;onValueCommit?:(value:number,detail:UIValueChangeDetail)=>void}
export function Slider({id,value,min,max,step=1,label,unit='',onValueChange,onValueCommit,disabled,className='',...props}:SliderProps){
  const field=useField(),generated=useId(),controlId=id??field?.id??generated,dirty=useRef(false),readonly=props.readOnly||field?.readOnly;
  useLayoutEffect(()=>{if(readonly||disabled||field?.disabled)dirty.current=false;},[readonly,disabled,field?.disabled]);
  const commit=(next:number,source:UIChangeSource)=>{if(dirty.current){dirty.current=false;if(!readonly&&!disabled&&!field?.disabled)onValueCommit?.(next,valueChange('commit',source));}};
  return <div data-ksf-component="slider" className={className}>
    <div className="ksf-slider-heading"><label htmlFor={controlId}>{label}</label><output htmlFor={controlId}>{value}{unit}</output></div>
    <input {...props} id={controlId} type="range" value={value} min={min} max={max} step={step} disabled={disabled||field?.disabled}
      aria-readonly={readonly||undefined} aria-valuetext={props['aria-valuetext']??String(value)+unit} aria-describedby={descriptionIds(props['aria-describedby'],field?.describedBy)}
      onPointerDown={event=>{props.onPointerDown?.(event);if(readonly)event.preventDefault();}}
      onKeyDown={event=>{props.onKeyDown?.(event);if(readonly&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))event.preventDefault();}}
      onChange={event=>{if(readonly)return;dirty.current=true;onValueChange(Number(event.target.value),valueChange('input'));}}
      onPointerUp={event=>{props.onPointerUp?.(event);commit(Number(event.currentTarget.value),'pointer');}} onPointerCancel={event=>{props.onPointerCancel?.(event);dirty.current=false;}}
      onBlur={event=>{props.onBlur?.(event);commit(Number(event.currentTarget.value),'control');}}
      onKeyUp={event=>{props.onKeyUp?.(event);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))commit(Number(event.currentTarget.value),'keyboard');}}/>
  </div>;
}
export interface NumberInputProps extends Omit<InputProps,'value'|'defaultValue'|'type'|'onValueChange'|'min'|'max'|'step'> {draft:string;min?:number;max?:number;step?:number;unit?:string;onDraftChange:(draft:string,detail:UIValueChangeDetail)=>void;onCommit?:(value:number|null,detail:UIValueChangeDetail)=>void}
export function NumberInput({draft,min,max,step=1,unit,onDraftChange,onCommit,onBlur,onKeyDown,invalid=false,...props}:NumberInputProps){
  const field=useField(),[error,setError]=useState(''),generated=useId(),errorId=generated+'-number-error';
  const readonly=props.readOnly||field?.readOnly,blocked=props.disabled||field?.disabled;
  const result=parseNumberDraft(draft,{min,max,step,required:props.required??field?.required});
  const commit=(source:UIChangeSource)=>{if(readonly||blocked)return;if(!result.ok){setError(result.message);return;}setError('');onCommit?.(result.value,valueChange('commit',source));};
  const keyDown:NonNullable<InputProps['onKeyDown']>=event=>{
    onKeyDown?.(event);if(event.defaultPrevented||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||readonly||blocked)return;
    if(event.key==='Enter'){event.preventDefault();commit('keyboard');}
    else if(['ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();if(!result.ok){setError(result.message);return;}if(result.value===null)return;
      const next=stepNumber(result.value,step,event.key==='ArrowUp'?1:-1);if(!Number.isFinite(next)){setError('数值超出可表示范围');return;}
      if(next===result.value){setError('当前步长无法改变该数值');return;}
      if(min!==undefined&&next<min||max!==undefined&&next>max)return;
      setError('');onDraftChange(String(next),valueChange('step','keyboard'));onCommit?.(next,valueChange('step','keyboard'));
    }
  };
  return <span data-ksf-component="number-input">
    <Input {...props} value={draft} type="text" inputMode="decimal" role="spinbutton" aria-valuemin={min} aria-valuemax={max}
      aria-valuenow={result.ok?result.value??undefined:undefined} aria-valuetext={draft+(unit??'')}
      aria-describedby={descriptionIds(props['aria-describedby'],!!error&&errorId)} trailing={props.trailing??unit} invalid={invalid||!!error}
      onValueChange={(value,detail)=>{setError('');onDraftChange(value,detail);}} onBlur={event=>{onBlur?.(event);commit('control');}} onKeyDown={keyDown}/>
    {error&&<span id={errorId} className="ksf-field-error" role="alert">{error}</span>}
  </span>;
}
