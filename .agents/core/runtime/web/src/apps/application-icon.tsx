import {useState,useSyncExternalStore} from 'react';
import {Activity,Handshake,BookOpen,BookMarked,Disc3,GitBranch,Grid2X2,LibraryBig,MessagesSquare,Package,Puzzle,Terminal} from 'lucide-react';
import type {ApplicationManifest,StoreApplication,StoreCatalog} from './application-model';
import {request} from './client';
import {applicationIconModel,createIconCatalog} from './application-icon-model';
import {AppStoreIcon} from './app-store-icon';
import {applicationEmblems} from './application-emblems';
import './application-icon.css';
export const applicationIcons=createIconCatalog(()=>request<StoreCatalog>('/api/apps/catalog'));
const glyphs:Record<string,typeof Package>={cooperation:Handshake,handshake:Handshake,activity:Activity,documents:BookOpen,manual:BookMarked,knowledge:LibraryBig,abilities:Puzzle,git:GitBranch,projects:Grid2X2,conversations:MessagesSquare,flywheel:Disc3,terminal:Terminal,store:AppStoreIcon};
export function ApplicationIcon({appId,manifest,app,variant='store'}:{appId:string;manifest?:Pick<ApplicationManifest,'icon'>;app?:StoreApplication;variant?:'dock'|'store'|'detail'|'desktop'|'status'}){
  useSyncExternalStore(applicationIcons.subscribe,applicationIcons.snapshot);
  const model=applicationIconModel(appId,manifest,app??applicationIcons.get(appId)),Glyph=glyphs[model.key]??Package,Emblem=applicationEmblems[model.key],[failed,setFailed]=useState<string|null>(null);
  return <span aria-hidden="true" data-app-icon={appId} data-icon={model.key} className={`application-icon ${variant==='dock'?'app-icon':variant==='desktop'?'desktop-app-icon':variant==='status'?'status-app-icon':'store-app-icon'} ${variant==='detail'?'is-large':''}`}>
    {model.imageURL&&failed!==model.imageURL?<img src={model.imageURL} alt="" loading={['dock','desktop','status'].includes(variant)?'eager':'lazy'} onError={()=>setFailed(model.imageURL)}/>:Emblem?<Emblem/>:<Glyph size={32} strokeWidth={1.6}/>}
  </span>;
}
