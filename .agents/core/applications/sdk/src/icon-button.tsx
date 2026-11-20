import {forwardRef} from 'react';
import {Button, type ButtonProps} from './button';
import {Icon, type IconProps} from './icon';
import './actions/controls.css';
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label' | 'icon'> {icon: IconProps['icon']; label: string}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {icon, label, title, className = '', ...props}, ref,
) {
  const name = label.trim();
  if (!name) throw Error('IconButton需要非空label。');
  return <Button {...props} ref={ref} aria-label={name} title={title ?? name} className={`ksf-icon-button ${className}`.trim()}><Icon icon={icon}/></Button>;
});
