import type {SheetProps} from '@ksf/sdk/components/ui/sheet';
import {Sheet as CurrentSheet} from './overlays';
import {LegacyUIBoundary} from './compat-boundary';
import {useSurfaceScope} from './support/surface-context';
export type {SheetProps};
/** solid no longer selects another implementation; content is solid under the V1 role policy. */
export function Sheet({solid:_solid,presentation='drawer',modal=true,showHeader=true,...props}:SheetProps){
 const scope=useSurfaceScope();
 return <LegacyUIBoundary><CurrentSheet {...props} className={[scope,'ksf-sdk-surface',props.className].filter(Boolean).join(' ')} showHeader={showHeader} modal={modal} closePolicy={{outside:modal,deactivate:false}} data-legacy-presentation={presentation} data-sheet-scope="window"/></LegacyUIBoundary>;
}
