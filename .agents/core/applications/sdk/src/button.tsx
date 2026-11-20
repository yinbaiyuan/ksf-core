import {forwardRef, useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode} from 'react';
import {useWindowContext} from './window-context';
import {useElementRef} from './primitives/state';
import {useMotionActivity} from './motion-activity';
import {ControlIcon} from './primitives/control-icons';
import './button.css';

export type ButtonVariant = 'outlined' | 'solid' | 'soft' | 'text' | 'dashed';
export type ButtonTone = 'neutral' | 'primary' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  shape?: 'default' | 'round' | 'circle';
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: 'start' | 'end';
  wave?: boolean;
  ghost?: boolean;
  autoSpace?: boolean;
}

/** A native button. Use inside View or another public theme boundary. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {variant = 'outlined', tone = 'neutral', size = 'medium', shape = 'default', loading = false, fullWidth = false,
    icon, iconPosition = 'start', wave = true, ghost = false, autoSpace = true, type = 'button', disabled, children, className = '', style, onClick, ...props}, ref,
) {
  const [waveKey, setWaveKey] = useState(0), context=useWindowContext(),activity=useMotionActivity<HTMLButtonElement>({enabled:loading||waveKey>0}),[,assign]=useElementRef(ref),nativeRef=useCallback((node:HTMLButtonElement|null)=>{activity.ref.current=node;return assign(node);},[assign]),sequence = useRef(0), waveWindow = useRef<Window | null>(null);
  useEffect(() => {
    if (!waveKey) return;
    const media = waveWindow.current?.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {if (media?.matches) setWaveKey(0);};
    media?.addEventListener('change', stop);
    const view=waveWindow.current,timer = view?.setTimeout(() => setWaveKey(current => current === waveKey ? 0 : current), 2200);
    return () => {if(timer!==undefined)view?.clearTimeout(timer); media?.removeEventListener('change', stop);};
  }, [waveKey]);
  const colors = tone === 'neutral' ? {accent: 'foreground', surface: 'surface', onAccent: 'background'}
    : {accent: tone, surface: `${tone}-surface`, onAccent: 'on-primary'};
  const spaced=autoSpace&&!icon&&variant!=='text'&&typeof children==='string'&&/^[\u4e00-\u9fa5]{2}$/.test(children),content=spaced?children[0]+' '+children[1]:children;
  const adornment = loading ? <ControlIcon name="LoadingOutlined" className="ksf-button-spinner"/>
    : icon ? <span className="ksf-button-icon" aria-hidden="true">{icon}</span> : null;
  return <button {...props} ref={nativeRef} type={type} disabled={disabled || loading} aria-busy={loading || undefined} aria-label={props['aria-label']??(spaced?children as string:undefined)}
    className={`ksf-button ${className}`.trim()} data-ksf-button-variant={variant} data-tone={tone} data-size={size} data-shape={shape}
    data-animated={activity.active} data-ghost={ghost || undefined} data-full-width={fullWidth || undefined} data-loading={loading || undefined}
    onClick={event => {
      const view = event.currentTarget.ownerDocument.defaultView;
      if (context.active && context.enabled && wave && !disabled && !loading && variant !== 'text' && props['aria-disabled'] !== true && props['aria-disabled'] !== 'true' && !view?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        waveWindow.current = view; setWaveKey(++sequence.current);
      }
      onClick?.(event);
    }}
    style={{'--ksf-button-accent': `var(--ksf-color-${colors.accent})`, '--ksf-button-surface': `var(--ksf-color-${colors.surface})`, '--ksf-button-on-accent': `var(--ksf-color-${colors.onAccent})`, ...style} as CSSProperties}>
    {iconPosition === 'start' && adornment}{content}{iconPosition === 'end' && adornment}
    {waveKey > 0 && <span key={waveKey} aria-hidden="true" className="ksf-button-wave" onAnimationEnd={event => {event.stopPropagation(); if(event.animationName.endsWith('ksf-button-wave-fade'))setWaveKey(current => current === waveKey ? 0 : current);}}/>}
  </button>;
});
