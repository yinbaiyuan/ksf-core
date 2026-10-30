import type {ApplicationManifest,StoreApplication,StoreCatalog} from './application-model.ts';
import {storeImageURL} from './store-model.ts';
import {applicationLinkId} from '../../../../applications/sdk/src/shared/application-identities.js';
const aliases:Record<string,string>={'com.ksf.documentation':'manual','com.ksf.projects':'projects','com.ksf.knowledge':'knowledge','com.ksf.abilities':'abilities','com.ksf.app-store':'store','com.ksf.markdown':'documents','com.ksf.conversations':'flywheel','com.ksf.git':'git','com.ksf.terminal':'terminal','com.yinbaiyuan.daily-meeting':'meeting','com.yinbaiyuan.daily-brief':'brief','com.yinbaiyuan.camp-tasks':'tasks','com.ksf.cooperation-center':'cooperation','com.ksf.activity-monitor':'monitor'};
const known=new Set(['activity','knowledge','abilities','projects','store','documents','manual','conversations','flywheel','git','terminal','meeting','brief','tasks','lan','monitor','cooperation','handshake']);
export function applicationIconModel(id:string,manifest?:Pick<ApplicationManifest,'icon'>,app?:StoreApplication){
  const key=aliases[applicationLinkId(id)]??app?.display.manifest.icon??manifest?.icon??'';
  const image=app?.display.listing?.icon;
  return {key:known.has(key)?key:'package',imageURL:image&&app?storeImageURL(app,image):null};
}
/** Icon metadata is shared by Dock and Store; a slow/unreachable source never blocks Dock. */
export function createIconCatalog(read:()=>Promise<StoreCatalog>,now=Date.now){
  let applications=new Map<string,StoreApplication>(),fingerprint='',lastRead=-Infinity,pending:Promise<void>|undefined,revision=0;
  const listeners=new Set<()=>void>();
  const replace=(catalog:StoreCatalog)=>{
    const next=new Map(catalog.applications.map(app=>[app.appId,app]));
    const value=JSON.stringify([...next].map(([id,app])=>[id,applicationIconModel(id,undefined,app)]));
    applications=next;lastRead=now();if(value!==fingerprint){fingerprint=value;revision++;listeners.forEach(listener=>listener());}
  };
  return {replace,get:(id:string)=>applications.get(id),snapshot:()=>revision,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    refresh(){if(pending)return pending;if(now()-lastRead<60000)return Promise.resolve();lastRead=now();pending=read().then(replace).catch(()=>{}).finally(()=>{pending=undefined;});return pending;}};
}
