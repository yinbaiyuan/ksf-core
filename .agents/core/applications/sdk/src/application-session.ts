/** Persistent UI recovery data. The host supplies instance/app identity; the app owns the record schema. */
export interface ApplicationSessionRecord<T=unknown> {
  schemaVersion:1; instanceId:string; appId:string; key:string; recordVersion:number;
  appVersion:string; updatedAt:string; value:T;
}
export interface ApplicationSessionRead<T=unknown> {exists:boolean;etag:string|null;record:ApplicationSessionRecord<T>|null}
export interface ApplicationSessionStorage {
  read<T=unknown>(key:string,recordVersion:number):Promise<ApplicationSessionRead<T>>;
  write<T=unknown>(key:string,input:{recordVersion:number;value:T;ifMatch:string|null}):Promise<{etag:string;record:ApplicationSessionRecord<T>}>;
}
export type CloseReason='close'|'reload'|'upgrade';
export interface SessionClosePromptState {readonly dirty:boolean;readonly unresolved:boolean;readonly running:boolean;readonly canBackground:boolean}
export type SessionCloseChoice='save'|'discard'|'preserve'|'continue';
export interface CloseRequest {readonly requestId:string;readonly reason:CloseReason;readonly signal?:AbortSignal}
/** validate is a synchronous preparation token; reload requires it at the actual navigation boundary. */
export type CloseResponse={status:'ready';validate?:()=>boolean}|{status:'cancelled'}|{status:'failed';message:string};
export type CloseGuard=(request:CloseRequest)=>CloseResponse|Promise<CloseResponse>;
