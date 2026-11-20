import {useSyncExternalStore} from 'react';
import {Package} from 'lucide-react';
import type {ApplicationManifest} from '../../apps/application-model';
import {ApplicationIcon} from '../../apps/application-icon';
import {iconLayerCatalog} from '../icon-layer-catalog';

/** Shared desktop artwork anchor. Input stays on the caller; one layer paints the whole surface. */
export function LayeredApplicationIcon({appId,manifest}:{appId:string;manifest?:ApplicationManifest}){
 useSyncExternalStore(iconLayerCatalog.subscribe,iconLayerCatalog.snapshot);
 return <span className="desktop-layer-anchor" data-layer-app={appId}>{iconLayerCatalog.get(appId)?.invalid
  ?<span aria-hidden="true" className="desktop-app-icon desktop-invalid-icon"><Package size={32}/></span>
  :<ApplicationIcon appId={appId} manifest={manifest} app={iconLayerCatalog.original(appId)} variant="desktop"/>}</span>;
}
