import type { Ref } from 'react';
import { KsfLogo } from '../components/ksf-mark';

export function SystemMenu({ open, expanded, anchor }: { open: () => void; expanded: boolean; anchor: Ref<HTMLButtonElement> }) {
  return <button ref={anchor} type="button" className="ksf-system-trigger" aria-label="KSF 系统设置" aria-haspopup="dialog" aria-expanded={expanded} onClick={open}><KsfLogo /></button>;
}
