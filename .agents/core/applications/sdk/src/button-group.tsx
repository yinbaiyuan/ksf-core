import {forwardRef, type HTMLAttributes} from 'react';
import './actions/controls.css';
export interface ButtonGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label'> {
  label: string; orientation?: 'horizontal' | 'vertical'; attached?: boolean;
}
/** Grouping only: each native button keeps its normal Tab and activation behavior. */
export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  {label, orientation = 'horizontal', attached = false, className = '', ...props}, ref,
) {
  return <div {...props} ref={ref} role="group" aria-label={label} className={`ksf-button-group ${className}`.trim()} data-orientation={orientation} data-attached={attached}/>;
});
