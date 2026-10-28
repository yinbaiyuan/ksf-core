import {mainWindow,type StoreApplication,type InstalledApplication,type StoreImage} from './application-model.ts';
export const compareStoreVersions=(a:string,b:string)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];};
export type StoreAction='install'|'update'|'open'|'enable'|'installed'|'pending'|'unavailable';
export function storeAction(item:StoreApplication,local?:InstalledApplication):{kind:StoreAction;label:string;disabled?:boolean}{
 if(local?.pending)return{kind:'pending',label:'等待切换',disabled:true};
 if(item.candidate&&(!local||compareStoreVersions(item.candidate.manifest.version,local.active.manifest.version)>0))return{kind:local?'update':'install',label:local?'更新':'安装'};
 if(local){if(!local.enabled)return{kind:'enable',label:'启用'};return mainWindow(local.active.manifest)?{kind:'open',label:'打开'}:{kind:'installed',label:'已安装',disabled:true};}
 return{kind:'unavailable',label:'暂不可用',disabled:true};
}
export function storeImageURL(app:StoreApplication,image:StoreImage){return '/api/apps/media?'+new URLSearchParams({sourceId:app.display.source.id,appId:app.appId,version:app.display.manifest.version,digest:image.sha256});}
export const storePage=(search:URLSearchParams)=>({tab:['apps','updates','installed','sources'].includes(search.get('storeTab')??'')?search.get('storeTab')!:'apps',selected:search.get('storeApp'),query:search.get('storeQuery')??''});

export const hasStoreUpdate=(item:StoreApplication,local?:InstalledApplication)=>['update','pending'].includes(storeAction(item,local).kind);
