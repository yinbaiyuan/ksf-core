import {useState,useSyncExternalStore} from 'react';
import {BookOpen,GitBranch,Grid2X2,MessagesSquare,Package,Terminal} from 'lucide-react';
import type {ApplicationManifest,StoreApplication,StoreCatalog} from './application-model';
import {request} from './client';
import {applicationIconModel,createIconCatalog} from './application-icon-model';
import {AppStoreIcon} from './app-store-icon';
import './application-icon.css';
export const applicationIcons=createIconCatalog(()=>request<StoreCatalog>('/api/apps/catalog'));
const glyphs:Record<string,typeof Package>={documents:BookOpen,git:GitBranch,projects:Grid2X2,conversations:MessagesSquare,terminal:Terminal,store:AppStoreIcon};
export function ApplicationIcon({appId,manifest,app,variant='store'}:{appId:string;manifest?:Pick<ApplicationManifest,'icon'>;app?:StoreApplication;variant?:'dock'|'store'|'detail'}){
  useSyncExternalStore(applicationIcons.subscribe,applicationIcons.snapshot);
  const model=applicationIconModel(appId,manifest,app??applicationIcons.get(appId)),Glyph=glyphs[model.key]??Package,[failed,setFailed]=useState<string|null>(null);
  return <span aria-hidden="true" data-app-icon={appId} data-icon={model.key} className={`application-icon ${variant==='dock'?'app-icon':'store-app-icon'} ${variant==='detail'?'is-large':''}`}>
    {model.imageURL&&failed!==model.imageURL?<img src={model.imageURL} alt="" loading={variant==='dock'?'eager':'lazy'} onError={()=>setFailed(model.imageURL)}/>:<Glyph size={32} strokeWidth={1.6}/>}
  </span>;
}
