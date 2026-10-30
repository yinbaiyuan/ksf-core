import type {ApplicationSDK} from './application-sdk';
/** App-owned files only. Backend file.export returns path, name, sha256; host verifies ownership and bytes. */
export function createApplicationFileClient(sdk:Pick<ApplicationSDK,'instanceId'>){return {
 downloadURL(params:Record<string,unknown>):string{return '/api/apps/file-read?'+new URLSearchParams({instanceId:sdk.instanceId,params:JSON.stringify(params)});},
};}
