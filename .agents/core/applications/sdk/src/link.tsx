import {forwardRef, type AnchorHTMLAttributes} from 'react';
import './actions/controls.css';
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {href: string}
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({className = '', target, rel, ...props}, ref) {
  const safeRel = target === '_blank' ? [...new Set([...(rel?.split(/\s+/).filter(Boolean) ?? []), 'noopener', 'noreferrer'])].join(' ') : rel;
  return <a {...props} ref={ref} target={target} rel={safeRel} className={`ksf-link ${className}`.trim()}/>;
});
