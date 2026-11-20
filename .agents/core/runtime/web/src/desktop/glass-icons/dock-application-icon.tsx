import {useSyncExternalStore} from 'react';
import {LayoutGrid,Package} from 'lucide-react';
import {HOST_LAUNCHER_ICON_ID} from '../../../../src/applications/icon-layers/keys.js';
import {ApplicationIcon} from '../../apps/application-icon';
import type {ApplicationManifest} from '../../apps/application-model';
import {iconLayerCatalog} from '../icon-layer-catalog';

/** Only Dock artwork participates; the button keeps its menu, focus and drag target. */
export function DockApplicationIcon({appId,manifest}:{appId:string;manifest?:ApplicationManifest}){
 useSyncExternalStore(iconLayerCatalog.subscribe,iconLayerCatalog.snapshot);
 return <span className="desktop-layer-anchor dock-layer-anchor" data-layer-app={appId}>{iconLayerCatalog.get(appId)?.invalid?<span aria-hidden="true" className="app-icon desktop-invalid-icon"><Package size={18}/></span>:<ApplicationIcon appId={appId} manifest={manifest} app={iconLayerCatalog.original(appId)} variant="dock"/>}</span>;
}

/** Host-owned launcher artwork uses the same managed PNG layers as applications. */
export function DockLauncherIcon(){
 return <span className="desktop-layer-anchor dock-layer-anchor launcher-icon" data-layer-app={HOST_LAUNCHER_ICON_ID}><span className="app-icon launcher-icon"><LayoutGrid size={27}/></span></span>;
}
