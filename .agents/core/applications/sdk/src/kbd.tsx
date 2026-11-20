import {forwardRef, type HTMLAttributes} from 'react';
import './kbd.css';

export type KbdProps = HTMLAttributes<HTMLElement>;
/** Visual keyboard notation only; does not register or handle shortcuts. */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd({className = '', ...props}, ref) {
  return <kbd {...props} ref={ref} className={`ksf-kbd ${className}`.trim()}/>;
});
