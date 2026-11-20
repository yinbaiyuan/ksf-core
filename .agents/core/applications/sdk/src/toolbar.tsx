import {forwardRef, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes} from 'react';
import {Button} from './button';
import {Icon, type IconProps} from './icon';
import {DropdownMenu} from './dropdown-menu';
import {fitToolbar} from './actions/toolbar-model';
import './actions/toolbar.css';
export interface ToolbarAction {id: string; label: string; icon?: IconProps['icon']; group?: string; priority?: number; disabled?: boolean; pressed?: boolean; onAction: () => void | Promise<unknown>}
export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label'> {label: string; items: readonly ToolbarAction[]}
export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar({label, items, className = '', onKeyDown, onFocusCapture, onBlurCapture, ...props}, ref) {
  const root = useRef<HTMLDivElement>(null), measurement = useRef<HTMLDivElement>(null), ownedFocus = useRef(false), live = useRef(true);
  const [hidden, setHidden] = useState(new Set<string>()), [active, setActive] = useState<string | null>(items.find(item => !item.disabled)?.id ?? null), [error, setError] = useState('');
  useEffect(() => {live.current = true; return () => {live.current = false;};}, []);
  useLayoutEffect(() => {
    const element = root.current, measure = measurement.current; if (!element || !measure) return;
    const update = () => {
      const widths = new Map([...measure.querySelectorAll<HTMLElement>('[data-measure-action]')].map(node => [node.dataset.measureAction!, node.offsetWidth]));
      const style = getComputedStyle(element), available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
      const more = measure.querySelector<HTMLElement>('[data-measure-more]')!.offsetWidth;
      const values = new Set(fitToolbar(items, widths, available, more));
      setHidden(previous => previous.size === values.size && [...values].every(id => previous.has(id)) ? previous : values);
    };
    update(); const observer = new ResizeObserver(update); observer.observe(element); for (const child of measure.children) observer.observe(child);
    return () => observer.disconnect();
  }, [items]);
  const visible = items.filter(item => !hidden.has(item.id)), overflow = items.filter(item => hidden.has(item.id));
  const stops: (string | null)[] = [...visible.filter(item => !item.disabled).map(item => item.id), ...(overflow.length ? [null] : [])];
  const focused = stops.includes(active) ? active : hidden.has(active ?? '') ? null : stops[0];
  const controls = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter(button => button.closest('[role="toolbar"]') === root.current && !button.disabled && !button.closest('[aria-hidden="true"],[role="menu"]'));
  const keyOf = (button: HTMLButtonElement) => button.dataset.toolbarAction ?? null;
  useLayoutEffect(() => {
    if (active === focused) return;
    setActive(focused ?? null);
    if (ownedFocus.current) controls().find(button => keyOf(button) === focused)?.focus();
  }, [active, focused]);
  const invoke = (item: ToolbarAction) => {
    setError(''); try {Promise.resolve(item.onAction()).catch(issue => {if (live.current) setError(issue instanceof Error ? issue.message : String(issue));});}
    catch (issue) {setError(issue instanceof Error ? issue.message : String(issue));}
  };
  return <>
    <div {...props} role="toolbar" aria-label={label} aria-orientation="horizontal" className={`ksf-content-toolbar ${className}`.trim()}
      ref={element => {root.current = element; if (typeof ref === 'function') ref(element); else if (ref) ref.current = element;}}
      onFocusCapture={event => {onFocusCapture?.(event); ownedFocus.current = true; const button = (event.target as Element).closest('button'); if (button) setActive(keyOf(button));}}
      onBlurCapture={event => {onBlurCapture?.(event); if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) ownedFocus.current = false;}}
      onKeyDown={event => {onKeyDown?.(event); if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !root.current?.contains(event.target as Node) || (event.target as Element).closest('[role="menu"]')) return;
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const buttons = controls(); if (!buttons.length) return;
        const index = buttons.indexOf(root.current.ownerDocument.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault(); buttons[next]?.focus();
      }}>
      {visible.map((item, index) => <span className="ksf-content-toolbar-action" key={item.id}>
        {index > 0 && item.group !== visible[index - 1].group && <span className="ksf-content-toolbar-separator" role="separator" aria-orientation="vertical"/>}
        <Button data-toolbar-action={item.id} disabled={item.disabled} aria-pressed={item.pressed} tone={item.pressed ? 'primary' : 'neutral'} variant={item.pressed ? 'soft' : 'outlined'} tabIndex={item.id === focused ? 0 : -1} onClick={() => invoke(item)}>{item.icon && <Icon icon={item.icon}/>}<span>{item.label}</span></Button>
      </span>)}
      {!!overflow.length && <DropdownMenu label={`${label}更多操作`} trigger="更多" items={overflow.map(item => ({id: item.id, label: item.label, disabled: item.disabled, checked: item.pressed, onAction: item.onAction}))}
        triggerProps={{className: 'ksf-content-toolbar-more', tabIndex: focused === null ? 0 : -1}}/>}
      <div ref={measurement} aria-hidden="true" className="ksf-content-toolbar-measurement">
        {items.map(item => <span key={item.id} data-measure-action={item.id} className="ksf-content-toolbar-measure">{item.icon && <Icon icon={item.icon}/>}<span>{item.label}</span></span>)}
        <span data-measure-more="" className="ksf-content-toolbar-measure"><span>更多</span><span className="ksf-menu-trigger-arrow">▾</span></span>
      </div>
    </div>
    {error && <p className="ksf-menu-feedback" role="alert">{error}</p>}
  </>;
});
