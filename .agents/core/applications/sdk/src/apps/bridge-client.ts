import {APIError,createWorkbenchClient} from './request-client.ts';
import type {ApplicationSDK2} from '../application-sdk';
type Bridge=Pick<ApplicationSDK2,'getSession'|'request'>;
/** Keep the page's original CSP nonce and reconstruct errors in the package's own realm. */
export function createSurfaceClient(fetcher?:typeof fetch){
  const native=createWorkbenchClient(fetcher);let bridge:Bridge|undefined;
  return {
    bind(value:Bridge){bridge={getSession:value.getSession,request:value.request};},
    getSession:()=>bridge?bridge.getSession():native.getSession(),
    async request<T>(url:string,input?:unknown,signal?:AbortSignal):Promise<T>{
      if(!bridge)return native.request<T>(url,input,signal);
      try{return await bridge.request<T>(url,input,signal);}catch(error){const issue=error as Error&{code?:string;data?:unknown};if(issue.code)throw new APIError(issue.message,issue.code,issue.data);throw error;}
    },
  };
}
