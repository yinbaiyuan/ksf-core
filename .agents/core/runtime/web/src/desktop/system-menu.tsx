import type { Ref } from 'react';
import { KsfLogo } from '../components/ksf-mark';
import {useEffect} from 'react';
import {useInstanceName} from '../instance-preferences';

export function SystemMenu({ open, expanded, anchor }: { open: () => void; expanded: boolean; anchor: Ref<HTMLButtonElement> }) {
  const name=useInstanceName();useEffect(()=>{document.title=name+' · KSF工作台';},[name]);
  return <button ref={anchor} type="button" className="ksf-system-trigger" title={name} aria-label="KSF 系统设置" aria-haspopup="dialog" aria-expanded={expanded} onClick={open}><KsfLogo /></button>;
}
