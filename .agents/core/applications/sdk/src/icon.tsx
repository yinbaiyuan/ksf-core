import {forwardRef, useCallback, type ComponentType, type HTMLAttributes, type SVGProps} from 'react';
import {useMotionActivity} from './motion-activity';
import {useElementRef} from './primitives/state';
import './icon.css';

export interface IconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'role' | 'aria-label' | 'aria-hidden'> {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  size?: number | string;
  spin?: boolean;
  rotate?: number;
  /** Omit for decoration. Nonempty labels expose one accessible image. */
  label?: string;
}
export const Icon = forwardRef<HTMLSpanElement, IconProps>(function Icon(
  {icon: Glyph, size = '1em', spin = false, rotate = 0, label, className = '', style, ...props}, ref,
) {
  const name = label?.trim(),activity=useMotionActivity<HTMLSpanElement>({enabled:spin}),[,assign]=useElementRef(ref),assignIcon=useCallback((node:HTMLSpanElement|null)=>{activity.ref.current=node;const cleanup=assign(node);if(typeof cleanup==='function')return()=>{activity.ref.current=null;cleanup();};},[assign]);
  return <span {...props} ref={assignIcon} data-motion-active={activity.active} className={`ksf-icon ${className}`.trim()}
    style={{width: size, height: size, transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style}} data-spin={spin || undefined} role={name ? 'img' : undefined}
    aria-label={name || undefined} aria-hidden={name ? undefined : true}>
    <Glyph width="100%" height="100%" aria-hidden="true" focusable="false"/>
  </span>;
});
