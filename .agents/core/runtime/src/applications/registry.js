import {readFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {atomicJSON} from '../shared/durable-json.js';
import {assert} from '../services/workbench-common.js';
import {sameManifest} from './protocol.js';
const key = e => [e.manifest.id,e.manifest.version,e.manifest.target??'*',e.manifest.nodeAbi??'*'].join(':');
/** Validated remote/cache/baseline resolver under one immutable source identity. */
export function createRegistryResolver({directory, cacheDirectory, fetchIndex, validate, now=Date.now, offlineOnly=false}) {
  let pending;
  async function baseline(){return validate(await readFile(join(directory,'index.json')),true);}
  async function resolve({bundled=false}={}) {
    const local=await baseline();
    if(bundled||offlineOnly)return {entries:local.map(e=>({...e,resource:'baseline',publicationKnown:false})),freshness:{kind:'baseline',checkedAt:null,latestConfirmed:false}};
    if(pending)return pending;
    pending=(async()=>{
      let remote,checkedAt,kind='live',error;
      // Invalid remote directories and identity/digest conflicts must fail closed.
      let bytes;try{bytes=await fetchIndex();}catch(e){error=String(e.message);}
      if(bytes){remote=await validate(bytes,false);checkedAt=new Date(now()).toISOString();await mkdir(cacheDirectory,{recursive:true,mode:0o700});await atomicJSON(join(cacheDirectory,'registry.json'),{checkedAt,index:JSON.parse(bytes)});}
      else {
        kind='baseline';
        try{const saved=JSON.parse(await readFile(join(cacheDirectory,'registry.json'),'utf8'));remote=await validate(Buffer.from(JSON.stringify(saved.index)),false);checkedAt=saved.checkedAt;kind='cache';}catch(e){if(e.code!=='ENOENT')throw e;}
      }
      const entries=new Map(local.map(e=>[key(e),{...e,resource:'baseline',publicationKnown:false}]));
      for(const e of remote??[]){const old=entries.get(key(e));assert(!old||old.package.sha256===e.package.sha256&&old.package.size===e.package.size&&sameManifest(old.manifest,e.manifest),'APP_VERSION_REUSED','公用源与离线资源的同版本摘要冲突，已停止安装。',409);entries.set(key(e),{...e,publicationKnown:true,resource:old?'baseline':'remote',...(old?{baselinePackage:old.package.url,baselineListing:old.listing}: {})});}
      return {entries:[...entries.values()],freshness:{kind,checkedAt:checkedAt??null,latestConfirmed:kind==='live',...(error?{error}: {})}};
    })().finally(()=>{pending=undefined;});return pending;
  }
  return {resolve,baseline};
}
