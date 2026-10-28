import type {ApplicationManifest,StoreApplication,StoreCatalog} from './application-model.ts';
import {storeImageURL} from './store-model.ts';
const aliases:Record<string,string>={'ksf.projects':'projects','app-store':'store',markdown:'documents'};
const known=new Set(['projects','store','documents','conversations','git','terminal']);
export function applicationIconModel(id:string,manifest?:Pick<ApplicationManifest,'icon'>,app?:StoreApplication){
  const key=aliases[id]??app?.display.manifest.icon??manifest?.icon??'';
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
