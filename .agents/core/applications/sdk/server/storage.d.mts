import type {ApplicationBackendContext,ApplicationStorageScope,ApplicationDataInspection,ApplicationMigrationReceipt} from '../src/application-sdk';
export interface JSONStoreDocument<T>{schemaVersion:number;revision:number;data:T}
export interface JSONStoreOptions<T>{name?:string;scope?:ApplicationStorageScope;schemaVersion?:number;initial?:T;validate?:(data:T)=>boolean;migrations?:Record<number,(data:unknown)=>T|Promise<T>>}
/** read/inspect never write; migrate explicitly commits through host-protected storage. */
export function createJSONStore<T=Record<string,unknown>>(context:Pick<ApplicationBackendContext,'storage'|'locks'>&Partial<Pick<ApplicationBackendContext,'dataDirectory'|'runtimeDataDirectory'>>,options?:JSONStoreOptions<T>):{
 read():Promise<JSONStoreDocument<T>>;
 inspect():Promise<ApplicationDataInspection>;
 migrate():Promise<{changed:false;document:JSONStoreDocument<T>}|({changed:true;document:JSONStoreDocument<T>}&ApplicationMigrationReceipt)>;
 update(action:(data:T)=>T|Promise<T>,options?:{revision?:number}):Promise<JSONStoreDocument<T>>;
};
