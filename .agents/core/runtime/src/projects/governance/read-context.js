import {AsyncLocalStorage} from 'node:async_hooks';

// One synchronous governance snapshot only. Never carry validation results into
// a subsequent read, save, overlay preview, or another project's request.
const reads=new AsyncLocalStorage();
export const withGovernanceRead=read=>reads.run(new Map(),read);
export function memoRead(group,key,read){
  const scope=reads.getStore();
  if(!scope)return read();
  let entries=scope.get(group);
  if(!entries){entries=new Map();scope.set(group,entries);}
  if(entries.has(key)){
    const prior=entries.get(key);
    if(prior.error)throw prior.error;
    return prior.value;
  }
  try{const value=read();entries.set(key,{value});return value;}
  catch(error){entries.set(key,{error});throw error;}
}
