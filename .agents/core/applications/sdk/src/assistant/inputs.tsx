import {forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes} from 'react';
import {Button} from '../button';
import {TextArea} from '../text-area';
import {TextField} from '../text-field';
import {useElementRef, useFormReset, useValue} from '../primitives/state';
import './assistant.css';

export interface InlineSuggestionsProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'size'> {
  label: string; value?: string; defaultValue?: string; suggestions: readonly string[]; onValueChange?: (value: string) => void; onAccept?: (value: string) => void; loading?: boolean;
}
export const InlineSuggestions = forwardRef<HTMLInputElement, InlineSuggestionsProps>(function InlineSuggestions({label, value, defaultValue = '', suggestions, onValueChange, onAccept, loading = false, disabled, readOnly, onChange, onKeyDown, className = '', ...props}, ref) {
  const [text, setText, reset] = useValue(value, defaultValue, onValueChange), [dismissed, setDismissed] = useState(false), [scroll, setScroll] = useState(0), [input, assign] = useElementRef(ref), uid = useId();
  useFormReset(input, value === undefined, reset, props.form);
  const completion = !dismissed && !loading && !disabled && !readOnly && text ? suggestions.find(suggestion => suggestion.startsWith(text) && suggestion !== text) : undefined;
  const accept = () => {if (!completion) return; setText(completion); onAccept?.(completion); setDismissed(true); input.current?.focus();};
  return <div className="ksf-inline-suggestions"><label htmlFor={uid}>{label}</label><div className="ksf-inline-input"><div className="ksf-inline-ghost" aria-hidden="true"><span style={{transform: `translateX(-${scroll}px)`}}><span style={{visibility:'hidden'}}>{text}</span>{completion?.slice(text.length)}</span></div>
    <input {...props} ref={assign} id={uid} value={text} disabled={disabled} readOnly={readOnly} className={className} aria-describedby={[props['aria-describedby'], uid+'-hint'].filter(Boolean).join(' ')} onScroll={event => {props.onScroll?.(event); setScroll(event.currentTarget.scrollLeft);}} onChange={event => {onChange?.(event); if (!event.defaultPrevented) {setText(event.currentTarget.value); setDismissed(false);}}} onKeyDown={event => {onKeyDown?.(event); if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === 'Escape') setDismissed(true); if (completion && (event.key === 'Tab' && !event.shiftKey || event.key === 'ArrowRight' && event.currentTarget.selectionStart === text.length && event.currentTarget.selectionEnd === text.length)) {event.preventDefault(); accept();}}}/>
  </div><div className="ksf-inline-hint" id={uid+'-hint'}>{loading ? '正在获取建议…' : completion ? <><span>Tab 接受补全 · Escape忽略</span><Button size="small" variant="text" onClick={accept}>接受建议</Button></> : <span>建议由应用提供</span>}</div></div>;
});

export interface EditableProps {
  label: string; value: string; onSave: (value: string) => void | Promise<void>; disabled?: boolean;
  suggestion?: string; onRequestSuggestion?: (instruction: string) => void; suggesting?: boolean;
}
export const Editable = forwardRef<HTMLDivElement, EditableProps>(function Editable({label, value, onSave, disabled = false, suggestion, onRequestSuggestion, suggesting = false}, ref) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(value), [instruction, setInstruction] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), saving = useRef(false), edit = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  useEffect(() => {if (!editing) setDraft(value);}, [value, editing]);
  useEffect(() => {if (editing) edit.current?.focus();}, [editing]);
  const save = async () => {if (saving.current || disabled) return; saving.current = true; setBusy(true); setError(''); try {await onSave(draft); if (alive.current) setEditing(false);} catch (error) {if (alive.current) setError(error instanceof Error ? error.message : '保存失败，草稿保留。');} finally {saving.current = false; if (alive.current) setBusy(false);}};
  return <div ref={ref} className="ksf-assistant ksf-editable" role="group" aria-label={label}>
    {!editing ? <><p className="ksf-editable-value">{value || '暂无内容'}</p><Button size="small" disabled={disabled} onClick={() => {setDraft(value); setError(''); setEditing(true);}}>编辑{label}</Button></> : <>
      <TextArea ref={edit} label={label} value={draft} onValueChange={setDraft} disabled={busy || disabled} rows={3} onKeyDown={event => {if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === 'Escape' && !busy) {event.preventDefault(); setEditing(false);} if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {event.preventDefault(); void save();}}}/>
      {onRequestSuggestion && <div className="ksf-editable-instruction"><TextField label="修改要求" value={instruction} onValueChange={setInstruction} disabled={busy || suggesting} placeholder="例如：表达更简洁"/><Button size="small" loading={suggesting} disabled={busy || !instruction.trim()} onClick={() => onRequestSuggestion(instruction)}>获取修改建议</Button></div>}
      {suggestion !== undefined && <section className="ksf-editable-suggestion"><small>建议内容</small><p>{suggestion}</p><Button size="small" disabled={busy || disabled} onClick={() => setDraft(suggestion)}>采纳到草稿</Button></section>}
      {error && <p role="alert">{error}</p>}<div className="ksf-assistant-actions"><Button size="small" tone="primary" loading={busy} disabled={disabled} onClick={() => {void save();}}>保存修改</Button><Button size="small" disabled={busy} onClick={() => setEditing(false)}>取消编辑</Button></div>
    </>}
  </div>;
});
