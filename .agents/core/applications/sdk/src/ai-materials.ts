import type {ApplicationSDK} from './application-sdk';
import type {AIMaterial} from './ai-tasks';
import {APIError,type WorkbenchSession} from './apps/request-client.ts';
export function createAIMaterialClient(sdk:Pick<ApplicationSDK,'instanceId'|'getSession'|'request'>,fetcher:typeof fetch=fetch){return {
 async upload(metadata:{name:string;mimeType:string},blob:Blob,{signal}:{signal?:AbortSignal}={}):Promise<AIMaterial>{
  if(blob.size>128*1024*1024)throw new APIError('材料超过128 MiB。','AI_INPUT_TOO_LARGE');
  let auth=await sdk.getSession();
  for(let attempt=0;;attempt++){
   signal?.throwIfAborted();const response=await fetcher('/api/ai/material-upload?'+new URLSearchParams({instanceId:sdk.instanceId,name:metadata.name}),{method:'POST',signal,headers:{'Content-Type':metadata.mimeType,'X-KSF-Token':auth.token},body:blob});const body=await response.json();if(response.ok&&body.ok!==false)return body.data;
   if(attempt===0&&response.status===403&&body.error?.code==='WEB_SESSION_EXPIRED'){const fresh=await sdk.request<WorkbenchSession>('/api/workbench/session');if(fresh.token!==auth.token){auth=fresh;continue;}}
   throw new APIError(body.error?.message??'材料上传失败。',body.error?.code??'AI_UPLOAD_FAILED',body.data);
  }
 }
};}
