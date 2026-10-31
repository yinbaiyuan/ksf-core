import type {ApplicationSDK} from './application-sdk';
import type {WorkspaceFile,TreeEntry} from './workspace-types';
export type {WorkspaceFile,TreeEntry};
const query=(path:string,input:Record<string,string>)=>path+'?'+new URLSearchParams(input);
/** This client is bound to one surface. It never owns an application's business state. */
export function createWorkspaceClient(sdk:Pick<ApplicationSDK,'request'|'resources'>){
 const changed=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('ksf:workspace-change'));};
 const write=async<T>(method:string,input:unknown)=>{const result=await sdk.request<T>('/api/workspace/'+method,input);changed();return result;};
 return {
  tree:(path='')=>sdk.request<{path:string;version:string;entries:TreeEntry[]}>(query('/api/workspace/tree',{path})),
  read:(path:string)=>sdk.request<WorkspaceFile>(query('/api/workspace/file',{path})),
  search:(q:string,path='')=>sdk.request<{matches:unknown[];errors:unknown[];truncated:boolean}>(query('/api/workspace/search',{q,path})),
  save:(input:{path:string;text:string;version:string})=>write<WorkspaceFile>('save',input),
  create:(input:{path:string;kind:'file'|'directory';text?:string})=>write<{path:string}>('create',input),
  unlock:(path:string)=>write<WorkspaceFile>('unlock',{path}),
  async move(input:{path:string;destination:string;version:string}){await sdk.resources.prepare(input.path);const result=await write<{path:string;previousPath:string}>('move',input);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ksf:files-moved',{detail:{previousPath:result.previousPath,path:result.path}}));return result;},
  upload:(input:{path:string;name:string;base64:string})=>write<{path:string;relativePath:string}>('upload',input),
  mediaURL:(path:string)=>query('/api/workspace/media',{path}),
  prepare:sdk.resources.prepare,
 };
}
