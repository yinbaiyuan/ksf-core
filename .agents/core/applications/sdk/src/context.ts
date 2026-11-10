import type { ApplicationBackendContext } from './application-sdk';
export interface ContextIdentity {host:string;sessionId:string}
export interface ContextAbility {ref:string;source:string}
export interface CurrentWork {
 schemaVersion:1;goal:string;status:'active'|'paused';ownership:Record<string,unknown>;
 relatedTargets?:Record<string,unknown>[];executor:ContextAbility|null;methods:ContextAbility[];
 files:{path:string;purpose:string}[];taskRef?:string|null;
}
export interface ContextItem {
 kind:'ability'|'file';fingerprint:string;purposes:string[];source:string;path:string;
 ref?:string;state:string;object?:Record<string,unknown>;file?:{content:string|null;state:string;path:string;sha256:string|null};
}
export interface ContextDelivery {bindingEtag:string;cacheEtag:string;generation:string;manifestDigest:string;baseOnly:boolean;extras:ContextAbility[]}
export interface WorkContext {
 complete:boolean;mode:string;chatId:string|null;bindingEtag:string;current:CurrentWork|null;generation:string;
 active:ContextItem[];pending:ContextItem[];retired:ContextItem[];bodies?:ContextItem[];delivery?:ContextDelivery|null;
 errors:{code:string;message:string}[];
}
/** Explicit native identity; no cwd inference, implicit adoption, or automatic delivery acknowledgment. */
export function createWorkContextClient(context:Pick<ApplicationBackendContext,'services'>,identity:ContextIdentity){
 const call=<T>(method:string,input:Record<string,unknown>={})=>context.services.call<T>('work-context',method,[{...input,identity}]);
 return {
  read:()=>call<{complete:boolean;etag:string;current:CurrentWork|null}>('read'),
  bind:(current:CurrentWork|null,ifMatch:string)=>call<{complete:boolean;etag:string;current:CurrentWork|null;changed:boolean}>('bind',{current,ifMatch}),
  current:(input:{manifestOnly?:boolean;extras?:ContextAbility[]}={})=>call<WorkContext>('current',input),
  accept:(delivery:ContextDelivery)=>call<{complete:boolean;generation:string;remembered:number}>('accept',{delivery}),
  reset:()=>call<{complete:boolean;generation:string}>('reset'),
 };
}
