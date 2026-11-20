import type {ApplicationSDK,ApplicationBackendContext} from './application-sdk';
export type FileScope='workspace'|'user'|'runtime';
export interface FileRef {scope:FileScope;path:string}
export interface FileInfo {ref:FileRef;path:string;kind:'file'|'directory';size:number;modifiedAt:string;version:string;policy:string;writable:boolean;protection?:{code:string;message:string}}
export interface FileContent extends FileInfo {bytes:Uint8Array}
export interface TextFileContent extends FileInfo {text:string}
export interface FileChange {type:'create'|'update'|'delete'|'move'|'resync';ref:FileRef;previousRef?:FileRef;cursor?:string}
export interface TrashEntry {id:string;appId:string;ref:FileRef;kind:'file'|'directory';version:string;deletedAt:string;state:string}
export interface FileWrite {ref:FileRef;ifMatch?:string|null;operationId?:string}
export interface FileTransfer {ref:FileRef;destination:FileRef;version:string;operationId?:string}
export interface FilePickerOptions {scope?:FileScope;initialPath?:string;rootPath?:string;title?:string;extensions?:string[];suggestedName?:string}
const operationId=()=>globalThis.crypto.randomUUID();
export interface FileClient {
 stat(ref:FileRef):Promise<FileInfo>;exists(ref:FileRef):Promise<boolean>;list(ref:FileRef):Promise<FileInfo&{entries:FileInfo[]}>;
 read(ref:FileRef):Promise<FileContent>;readText(ref:FileRef):Promise<TextFileContent>;
 write(input:FileWrite&{bytes:Uint8Array}):Promise<FileInfo&{operationId:string}>;
 writeText(input:FileWrite&{text:string}):Promise<FileInfo&{operationId:string}>;
 mkdir(input:{ref:FileRef;recursive?:boolean;operationId?:string}):Promise<FileInfo>;
 copy(input:FileTransfer):Promise<FileInfo>;move(input:FileTransfer):Promise<FileInfo>;
 trash(input:{ref:FileRef;version:string;operationId?:string}):Promise<TrashEntry>;
 listTrash():Promise<TrashEntry[]>;restore(input:{trashId:string;destination?:FileRef;operationId?:string}):Promise<FileInfo>;
 purge(input:{trashId:string;confirm:true;operationId?:string}):Promise<unknown>;emptyTrash(input:{ids:string[];confirm:true;operationId?:string}):Promise<unknown>;
 operation(id:string):Promise<unknown>;
 watch(ref:FileRef,listener:(event:FileChange)=>void,onError?:(error:unknown)=>void):()=>void;
}
function common(call:<T=unknown>(method:string,input:unknown,signal?:AbortSignal)=>Promise<T>,prepare:(ref:FileRef)=>Promise<void>):Omit<FileClient,'read'|'write'|'writeText'>{
 const mutate=async<T>(method:string,input:object&{operationId?:string})=>{const id=input.operationId??operationId();try{return await call<T>(method,{...input,operationId:id});}catch(error){throw Object.assign(error as object,{operationId:id});}};
 return {
  stat:ref=>call('stat',ref),exists:ref=>call('exists',ref),list:ref=>call('list',ref),readText:ref=>call('readText',ref),
  mkdir:input=>mutate('mkdir',input),
  copy:async input=>{await prepare(input.ref);return mutate('copy',input);},move:async input=>{await prepare(input.ref);return mutate('move',input);},trash:async input=>{await prepare(input.ref);return mutate('trash',input);},
  listTrash:()=>call('listTrash',{}),restore:input=>mutate('restore',input),purge:input=>mutate('purge',input),emptyTrash:input=>mutate('emptyTrash',input),operation:id=>call('operation',id),
  watch(ref,listener,onError){const controller=new AbortController(),subscriptionId=operationId();let stopped=false,cursor:string|undefined;
   void(async()=>{while(!stopped){try{const batch=await call<{cursor:string;resync:boolean;events:FileChange[]}>('changes',{ref,cursor,subscriptionId,waitMs:10000},controller.signal);if(stopped)break;cursor=batch.cursor;if(batch.resync)listener({type:'resync',ref});for(const event of batch.events)listener(event);}catch(error){if(stopped)break;onError?.(error);cursor=undefined;await new Promise(r=>setTimeout(r,1000));}}})();
   return ()=>{stopped=true;controller.abort();void call('unwatch',{subscriptionId}).catch(()=>{});};
  },
 };
}
/** Dedicated backend service; byte data never travels through a frontend business call. */
export function createBackendFileClient(context:Pick<ApplicationBackendContext,'services'>):FileClient {
 const call=<T=unknown>(method:string,input:unknown)=>context.services.call<T>('files',method,[input]);
 return {...common(call,async()=>{}),read:ref=>call('read',ref),write:input=>call('write',{...input,operationId:input.operationId??operationId()}),writeText:input=>call('writeText',{...input,operationId:input.operationId??operationId()})};
}
export function createFileTransport(sdk:Pick<ApplicationSDK,'instanceId'|'appId'|'version'|'subscribe'|'request'|'getSession'|'resources'|'getSnapshot'|'overlays'>,fetcher:typeof fetch=fetch){
 const call=async<T=unknown>(method:string,input:unknown,signal?:AbortSignal)=>{const result=await sdk.request<T>('/api/files/'+method,{instanceId:sdk.instanceId,input},signal);if(['mkdir','copy','move','trash','restore','purge','emptyTrash'].includes(method)&&typeof window!=='undefined'){window.dispatchEvent(new Event('ksf:workspace-change'));if(method==='move'){const request=input as FileTransfer;if(request.ref.scope==='workspace'&&request.destination.scope==='workspace')window.dispatchEvent(new CustomEvent('ksf:files-moved',{detail:{previousPath:request.ref.path,path:request.destination.path}}));}}return result;};
 const prepare=async(ref:FileRef)=>{if(ref.scope==='workspace')await sdk.resources.prepare(ref.path);};
 const url=(ref:FileRef,extra:Record<string,string>={})=>'/api/files/content?'+new URLSearchParams({instanceId:sdk.instanceId,ref:JSON.stringify(ref),...extra});
 async function error(response:Response):Promise<never>{let body:any;try{body=await response.json();}catch{}throw Object.assign(Error(body?.error?.message??'文件操作失败。'),{code:body?.error?.code??'FILE_TRANSFER_FAILED',data:body?.data});}
 const base=common(call,prepare);
 async function upload(input:FileWrite&{blob:Blob;signal?:AbortSignal}){
  if(input.blob.size>128*1024*1024)throw Object.assign(Error('文件超过128 MiB。'),{code:'FILE_TOO_LARGE'});
  input.signal?.throwIfAborted();const bytes=await input.blob.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const id=input.operationId??operationId(),target=url(input.ref,{operationId:id,...(input.ifMatch?{ifMatch:input.ifMatch}:{})});let session=await sdk.getSession();
  try{for(let attempt=0;;attempt++){const response=await fetcher(target,{method:'POST',signal:input.signal,headers:{'Content-Type':'application/octet-stream','X-KSF-Token':session.token,'X-KSF-SHA256':hash},body:input.blob});
   if(response.ok){if(typeof window!=='undefined')window.dispatchEvent(new Event('ksf:workspace-change'));return (await response.json()).data as FileInfo&{operationId:string};}
   if(attempt===0&&response.status===403){const body=await response.clone().json().catch(()=>null);if(body?.error?.code==='WEB_SESSION_EXPIRED'){session=await sdk.request('/api/workbench/session');continue;}}
   return await error(response);
  }}catch(error){throw Object.assign(error as object,{operationId:id});}
 }
 async function read(ref:FileRef):Promise<FileContent>{const info=await base.stat(ref),response=await fetcher(url(ref,{ifMatch:info.version}),{cache:'no-store'});if(!response.ok)return error(response);return {...info,bytes:new Uint8Array(await response.arrayBuffer())};}
 const files={...base,read,readText:async(ref:FileRef)=>{const value=await read(ref);let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(value.bytes);}catch{throw Object.assign(Error('此文件不是UTF-8文本。'),{code:'WORKSPACE_BINARY'});}return {...value,bytes:undefined,text};},upload,write:(input:FileWrite&{bytes:Uint8Array})=>upload({...input,blob:new Blob([new Uint8Array(input.bytes)])}),writeText:(input:FileWrite&{text:string})=>upload({...input,blob:new Blob([input.text],{type:'text/plain;charset=utf-8'})}),
  async downloadURL(ref:FileRef){await prepare(ref);const info=await base.stat(ref);return url(ref,{ifMatch:info.version});},
  async download(ref:FileRef){const href=await files.downloadURL(ref),anchor=document.createElement('a');anchor.href=href;anchor.download=ref.path.split('/').at(-1)??'download';anchor.click();},
 };
 return files;
}
/** App-owned files only. Backend file.export returns path, name, sha256; host verifies ownership and bytes. */
export function createApplicationFileClient(sdk:Pick<ApplicationSDK,'instanceId'>){return {
 downloadURL(params:Record<string,unknown>):string{return '/api/apps/file-read?'+new URLSearchParams({instanceId:sdk.instanceId,params:JSON.stringify(params)});},
};}
