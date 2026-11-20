import type {ReactNode} from 'react';
import {useWindowContext} from '../../../../applications/sdk/src/window-context';
import {useMaterial} from '../../../../applications/sdk/src/components/material-provider';
import {overlays} from '../../../../applications/sdk/src/overlay-coordinator';
import {UIProvider,useOptionalUI} from './provider';
/** Finite old-props adapter for the current host. No listener, persistence or renderer is installed here. */
export function LegacyUIBoundary({children,asChild=false}:{children:ReactNode;asChild?:boolean}){
 const parent=useOptionalUI(),context=useWindowContext(),{settings}=useMaterial();
 if(parent&&(context.id==='standalone'||parent.environment.owner===context.id))return children;
 const global=context.id==='standalone';
 return <UIProvider asChild={asChild} style={asChild?undefined:{display:'contents'}} role={global?'shell':'content'}
  config={{theme:settings.themeMode,motion:settings.motion?'system':'reduced'}}
  environment={{owner:context.id,active:context.active,enabled:context.enabled,visible:context.enabled,toolbarHost:context.toolbarHost,contentHost:context.contentHost,overlayHost:context.overlayHost??(global?document.querySelector<HTMLElement>('[data-ksf-global-overlays]'):null),overlays:context.overlays??(global?overlays:undefined),commands:context.commands,capabilities:{frost:typeof CSS!=='undefined'&&CSS.supports('backdrop-filter','blur(1px)'),glass:false}}}>{children}</UIProvider>;
}
