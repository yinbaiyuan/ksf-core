import {useLayoutEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref} from 'react';
import {ControlIcon} from '../primitives/control-icons';
import {useElementRef} from '../primitives/state';

interface ChoiceTriggerProps {
  id: string;
  label?: string;
  open: boolean;
  disabled?: boolean;
  size: 'small' | 'medium' | 'large';
  selected: ReactNode;
  selectedText: string;
  placeholder: string;
  searchable: boolean;
  query: string;
  onQuery: (query: string) => void;
  onNavigate: (event: KeyboardEvent<HTMLElement>) => void;
  onToggle: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  onClear?: () => void;
  buttonRef: Ref<HTMLButtonElement>;
  buttonProps: ButtonHTMLAttributes<HTMLButtonElement>;
  panelId: string;
  describedBy?: string;
  invalid?: boolean;
  tags?: readonly {id: string; label: string; disabled?: boolean}[];
  overflowCount?: number;
  onRemoveTag?: (id: string) => void;
}

/** Public ref remains a real button; the search editor belongs to this composite field. */
export function ChoiceTrigger({id,label,open,disabled,size,selected,selectedText,placeholder,searchable,query,onQuery,onNavigate,onToggle,onClear,buttonRef,buttonProps,panelId,describedBy,invalid,tags,overflowCount=0,onRemoveTag}: ChoiceTriggerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [button,assign] = useElementRef(buttonRef);
  const editing = open && searchable && !disabled;
  useLayoutEffect(() => { if (editing) input.current?.focus({preventScroll: true}); }, [editing]);
  const editor = editing && <input ref={input} className={`ksf-choice-search${tags ? ' ksf-choice-tag-search' : ''}`} role="combobox" aria-label={label?.startsWith('搜索') ? label : `搜索${label ?? '选项'}`}
    aria-autocomplete="list" aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId}
    aria-describedby={describedBy} autoComplete="off" value={query} placeholder={tags?.length ? '' : selectedText || placeholder}
    data-selected-placeholder={!!selectedText || undefined} onChange={event => onQuery(event.target.value)} onKeyDown={onNavigate}/>;
  return <div className="ksf-choice-trigger" data-size={size} data-disabled={disabled || undefined} data-open={open || undefined} data-invalid={invalid || undefined} data-has-clear={!!onClear || undefined} data-multiple={!!tags||undefined}>
    <button {...buttonProps} ref={assign} type="button" id={id} role={editing ? undefined : 'combobox'} disabled={disabled}
      className={`ksf-choice-button ${buttonProps.className ?? ''}`.trim()} aria-label={buttonProps['aria-label']??label??(selectedText||placeholder)} aria-haspopup="dialog"
      aria-expanded={open} aria-controls={panelId} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      aria-hidden={editing || undefined} tabIndex={editing ? -1 : buttonProps.tabIndex}
      onClick={onToggle}
      onKeyDown={event => {buttonProps.onKeyDown?.(event); if (!event.defaultPrevented) onNavigate(event);}}>
      <span className="ksf-choice-selection" data-placeholder={!selectedText || undefined} data-editing={editing || !!tags?.length || undefined}>{selectedText ? selected : placeholder}</span>
      <span className="ksf-choice-arrow" aria-hidden="true"><ControlIcon name={editing ? 'SearchOutlined' : 'DownOutlined'}/></span>
    </button>
    {!tags && editor}
    {tags && (!!tags.length || editing) && <div className="ksf-choice-tags" role="list" aria-label={`已选${label ?? '选项'}`}>
      {tags.map(tag=><span key={tag.id} className="ksf-choice-tag" role="listitem" title={tag.label}>
        <span>{tag.label}</span>{onRemoveTag&&!disabled&&!tag.disabled&&<button type="button" tabIndex={-1} aria-label={`移除${tag.label}`}
          onMouseDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();onRemoveTag(tag.id);(editing?input.current:button.current)?.focus({preventScroll:true});}}><ControlIcon name="CloseOutlined"/></button>}
      </span>)}
      {!!overflowCount&&<span className="ksf-choice-tag ksf-choice-tag-overflow" role="listitem">+ {overflowCount} ...</span>}
      {editor}
    </div>}
    {onClear && !disabled && <button type="button" tabIndex={-1} className="ksf-choice-clear" aria-label={`清空${label ?? '选择'}`}
      onMouseDown={event => event.preventDefault()} onClick={event => {event.stopPropagation(); onClear();}}><ControlIcon name="CloseCircleFilled"/></button>}
  </div>;
}
