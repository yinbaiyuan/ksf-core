import type {ApplicationSessionStorage} from '../application-session.ts';
import {validateSessionKey,validateSessionValue} from '../session-contract.js';
import type {SaveAdapter,SaveAttempt,VersionedValue} from './save-controller.ts';

/** Persist a recovery checkpoint via the host's managed per-app storage, never localStorage. */
export function createSessionSaveAdapter<T>(storage:ApplicationSessionStorage,options:{key:string;recordVersion:number;initial:T}):SaveAdapter<T>{
  validateSessionKey(options.key,options.recordVersion);validateSessionValue(options.initial);
  const initial=structuredClone(options.initial);
  const read=async():Promise<VersionedValue<T>>=>{
    const result=await storage.read<T>(options.key,options.recordVersion);
    if(!result.exists)return {value:structuredClone(initial),revision:null};
    if(!result.record||result.record.recordVersion!==options.recordVersion||result.record.key!==options.key||typeof result.etag!=='string')throw TypeError('持久会话返回了不同的键或记录版本。');
    validateSessionValue(result.record.value);return {value:result.record.value,revision:result.etag};
  };
  const equal=(a:unknown,b:unknown):boolean=>{if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));};
  return {read,async write(attempt:SaveAttempt<T>){validateSessionValue(attempt.value);const result=await storage.write(options.key,{recordVersion:options.recordVersion,value:attempt.value,ifMatch:attempt.baseRevision});if(typeof result.etag!=='string')throw TypeError('持久会话缺少提交版本。');return {value:attempt.value,revision:result.etag};},
    async reconcile(attempt){const record=await read();if(equal(record.value,attempt.value))return {kind:'saved',record,confirmation:'value'};if(record.revision!==attempt.baseRevision)return {kind:'conflict',record};return {kind:'unknown',record,retrySameAttempt:true};},
    classifyError(error){const code=(error as {code?:string})?.code;if(code==='APP_DATA_CONFLICT')return 'conflict';if(['APP_SESSION_INVALID','APP_SESSION_VERSION','APP_SESSION_IDENTITY','APP_PATH_INVALID','APP_PERMISSION_REQUIRED'].includes(code??''))return 'failed';return 'unknown';}};
}
