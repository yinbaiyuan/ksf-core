import type {StoreEntry} from './application-model.ts';
import {APIError,createWorkbenchClient} from '../../../../applications/sdk/src/apps/request-client.ts';

export interface ImportPreview extends StoreEntry {
  importId:string;fileName:string;expiresAt:number;action:'install'|'update'|'installed'|'pending';currentVersion:string|null;
}
export function validateImportFile(file:Pick<File,'name'|'size'>){
  if(!/\.ksfapp$/i.test(file.name))throw new APIError('请选择 .ksfapp 应用包。','APP_IMPORT_INVALID');
  if(file.size===0)throw new APIError('应用包为空。','APP_IMPORT_INVALID');
  if(file.size>32*1024*1024)throw new APIError('应用包不能超过 32 MiB。','APP_PACKAGE_TOO_LARGE');
}
/** Only the explicit confirmation endpoint installs. Upload errors never replay installation. */
export async function uploadApplicationPackage(file:File,expectedInstanceId:string,signal?:AbortSignal,fetcher:typeof fetch=fetch):Promise<ImportPreview>{
  validateImportFile(file);
  // Obtain a fresh token for binary upload, preserving the page's workspace identity.
  const auth=await createWorkbenchClient(fetcher).getSession();
  if(auth.instanceId!==expectedInstanceId)throw new APIError('工作台已切换到其他实例，请重新打开应用商店。','WORKBENCH_INSTANCE_CHANGED');
  signal?.throwIfAborted();
  const response=await fetcher('/api/apps/import/preview?'+new URLSearchParams({name:file.name}),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/octet-stream','X-KSF-Token':auth.token},body:file,signal});
  const result=await response.json();
  if(!response.ok||result.ok===false)throw new APIError(result.error?.message??'读取应用包失败，请重新选择。',result.error?.code??'APP_IMPORT_FAILED');
  return result.data;
}
