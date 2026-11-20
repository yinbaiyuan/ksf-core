import type {ApplicationSnapshot,IconLayers,StoreApplication} from '../apps/application-model';
let layers:Record<string,IconLayers>={},fingerprint='',revision=0;
let originals=new Map<string,StoreApplication>();
const listeners=new Set<()=>void>();
export const iconLayerCatalog={
 replace(snapshot:ApplicationSnapshot){
  const next=Object.fromEntries(Object.entries(snapshot.iconLayers??{}).filter(([id,value])=>!value.releaseDigest||snapshot.installed.some(app=>app.id===id&&app.active.digest===value.releaseDigest)));
  const images=snapshot.installed.flatMap(app=>{
   const icon=app.active.listing?.icon??app.local?.listing?.icon;
   return icon?[[app.id,{appId:app.id,display:{manifest:app.active.manifest,source:app.active.source,listing:{icon}},candidate:null,latestPublishedVersion:null,unavailableReason:null}] as [string,StoreApplication]]:[];
  });
  const signature=JSON.stringify([next,images]);if(signature===fingerprint)return;
  originals=new Map(images);
  layers=next;fingerprint=signature;revision++;listeners.forEach(listener=>listener());
 },get:(id:string)=>layers[id],original:(id:string)=>originals.get(id),snapshot:()=>revision,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}
};
