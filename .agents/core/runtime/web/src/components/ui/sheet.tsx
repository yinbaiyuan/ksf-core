import type {ComponentProps} from 'react';
import {Sheet as SDKSheet} from '../../internal-ui/compat-sheet';
import {useWindowContext} from '../../window-context';
import {useHostTheme} from '../host-theme';
export function Sheet({className='',...props}:ComponentProps<typeof SDKSheet>) {
  const {id}=useWindowContext(),theme=useHostTheme();
  return <SDKSheet {...props} className={`${id==='standalone'?`host-surface ${theme} `:''}${className}`}/>;
}
