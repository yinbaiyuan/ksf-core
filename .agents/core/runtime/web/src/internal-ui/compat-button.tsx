import type {ComponentProps} from 'react';
import {Button as CurrentButton} from './controls';
import {LegacyUIBoundary} from './compat-boundary';
export type LegacyButtonProps=ComponentProps<'button'>&{variant?:'default'|'ghost'|'outline'|null;size?:'default'|'icon'|'sm'|null;asChild?:boolean};
/** Retains old default ghost, 34/28px and implicit form submit. Visual roles use the current Button. */
export function Button({variant='ghost',size='default',style,asChild=false,type,className='',...props}:LegacyButtonProps){
 return <LegacyUIBoundary><CurrentButton {...props} asChild={asChild} type={type??'submit'} variant={variant==='default'?'primary':variant==='outline'?'secondary':'ghost'} data-legacy-size={size??'default'} className={className}
  style={{minHeight:size==='sm'?28:34,...(size==='sm'?{fontSize:12,padding:'4px 7px'}:size==='icon'?{width:34,height:34,padding:7}:{padding:'7px 10px'}),...style}}/></LegacyUIBoundary>;
}
