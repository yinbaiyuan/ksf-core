import type {ApplicationStorage,ApplicationStorageScope} from '../application-sdk.ts';
import type {SaveAdapter,SaveAttempt,SaveReconciliation,VersionedValue} from './save-controller.ts';

export interface ConfigurationRecord {
  etag:string;state:string;values:Record<string,unknown>;defaults:Record<string,unknown>;
  effective:Record<string,unknown>|null;
}
export type ConfigurationRequest=<R>(url:string,input?:unknown)=>Promise<R>;
export type ConfigurationSaveIntent={operation:'write'}|{operation:'reset';fields?:readonly string[];confirmation?:'removed-overrides'|'value'};
export function classifySaveError(error:unknown):'failed'|'conflict'|'unknown' {
  const value=error as {code?:string;outcomeUnknown?:boolean;data?:{outcomeUnknown?:boolean};status?:number};
  if(value?.outcomeUnknown||value?.data?.outcomeUnknown)return 'unknown';
  if(/CONFLICT/.test(value?.code??''))return 'conflict';
  if(/(?:INVALID|DENIED|FORBIDDEN|UNSUPPORTED|UNDECLARED|INCOMPATIBLE|REQUIRED|NOT_FOUND)$/.test(value?.code??''))return 'failed';
  return 'unknown';
}
function equalJSON(left:unknown,right:unknown):boolean {
  if(Object.is(left,right))return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
  const keys=Object.keys(left);return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&equalJSON((left as Record<string,unknown>)[key],(right as Record<string,unknown>)[key]));
}
interface ConfigurationSaveOptions<T> {
  request:ConfigurationRequest;domain:string;select:(record:ConfigurationRecord)=>T;
  values:(value:T)=>Record<string,unknown>;valueReconciliation?:boolean;
}
/** Confirms persisted values only. Runtime application/effects remain the domain service's responsibility. */
export function createConfigurationSaveAdapter<T>({request,domain,select,values,valueReconciliation}:ConfigurationSaveOptions<T>):SaveAdapter<T>{return configurationSaveAdapter({request,domain,select,values,valueReconciliation});}
/** Requires ui.save-reset; older hosts must reject this distinct export before loading the app. */
export function createConfigurationMutationSaveAdapter<T>(options:ConfigurationSaveOptions<T>&{intent:(value:T)=>ConfigurationSaveIntent}):SaveAdapter<T>{return configurationSaveAdapter(options);}
function configurationSaveAdapter<T>({request,domain,select,values,valueReconciliation=false,intent}:ConfigurationSaveOptions<T>&{
  /** Pure projection of the original draft; encode reset intent in the checkpoint value, not a mutable side flag. */
  intent?:(value:T)=>ConfigurationSaveIntent;
}):SaveAdapter<T> {
  const url='/api/config/'+encodeURIComponent(domain);
  const record=(input:ConfigurationRecord):VersionedValue<T>=>({value:select(input),revision:input.etag});
  const read=async()=>record(await request<ConfigurationRecord>(url));
  const intentOf=(value:T):ConfigurationSaveIntent=>{
    try{const selected=intent?.(value)??{operation:'write'};
      if(!selected||!['write','reset'].includes(selected.operation))throw Error('未知配置保存意图。');
      if(selected.operation==='reset'){
        const fields=selected.fields;if(fields!==undefined&&(!Array.isArray(fields)||!fields.length||fields.some(key=>typeof key!=='string'||!key.trim())||new Set(fields).size!==fields.length))throw Error('恢复默认需要非空且唯一的字段名。');
        if(selected.confirmation!==undefined&&!['removed-overrides','value'].includes(selected.confirmation))throw Error('未知恢复默认核对方式。');
        return Object.freeze({...selected,...(fields?{fields:Object.freeze([...fields])}:{})});
      }return Object.freeze({operation:'write'});
    }catch(error){throw Object.assign(Error(error instanceof Error?error.message:String(error)),{code:'SAVE_INPUT_INVALID'});}
  };
  return {read,classifyError:classifySaveError,
    write:async attempt=>{
      const selected=intentOf(attempt.value);
      if(selected.operation==='reset')return record(await request<ConfigurationRecord>(url,{operation:'reset',ifMatch:attempt.baseRevision,...(selected.fields?{fields:[...selected.fields]}:{})}));
      let patch:Record<string,unknown>;
      try{patch=values(attempt.value);}catch(error){throw Object.assign(Error(error instanceof Error?error.message:String(error)),{code:'SAVE_INPUT_INVALID'});}
      return record(await request<ConfigurationRecord>(url,{operation:'write',ifMatch:attempt.baseRevision,values:patch}));
    },
    async reconcile(attempt):Promise<SaveReconciliation<T>> {
      const raw=await request<ConfigurationRecord>(url),current=record(raw),selected=intentOf(attempt.value);
      if(!valueReconciliation)return {kind:'unknown',record:current};
      const removed=selected.operation==='reset'&&selected.confirmation!=='value'?(selected.fields?selected.fields.every(key=>!Object.hasOwn(raw.values,key)):Object.keys(raw.values).length===0):null;
      if(removed===true||removed===null&&equalJSON(values(current.value),values(attempt.value)))return {kind:'saved',record:current,confirmation:'value'};
      if(current.revision!==attempt.baseRevision)return {kind:'conflict',record:current};
      // A read of the old base cannot prove a timed-out request has stopped.
      // Only a pure value CAS may safely retry the same snapshot/base/identity.
      return {kind:'unknown',record:current,retrySameAttempt:true};
    },
  };
}
/** The storage adapter synchronizes a file value; it does not certify downstream side effects. */
export function createApplicationStorageSaveAdapter<T>(storage:Pick<ApplicationStorage,'read'|'write'>,name:string,options:{
  initial:T;scope?:ApplicationStorageScope;parse:(text:string)=>T;serialize:(value:T)=>string;
}):SaveAdapter<T> {
  const read=async():Promise<VersionedValue<T>>=>{
    const value=await storage.read(name,{scope:options.scope});
    return {value:value.exists?options.parse(value.text!):structuredClone(options.initial),revision:value.etag};
  };
  return {read,classifyError:classifySaveError,
    async write(attempt:SaveAttempt<T>){const result=await storage.write(name,options.serialize(attempt.value),{scope:options.scope,ifMatch:attempt.baseRevision});return {value:attempt.value,revision:result.etag};},
    async reconcile(attempt){
      const current=await read();
      if(options.serialize(current.value)===options.serialize(attempt.value))return {kind:'saved',record:current,confirmation:'value'};
      return current.revision!==attempt.baseRevision?{kind:'conflict',record:current}:{kind:'unknown',record:current,retrySameAttempt:true};
    },
  };
}
