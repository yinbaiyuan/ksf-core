import {open,readFile,rm,mkdir,link} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {platform} from '../platform/index.js';

export const serviceError=(code,message,data)=>Object.assign(new Error(message),{code,status:409,data});
const identities=new Map();let ownStart;
export function liveIdentity(record){
  if(!Number.isSafeInteger(record?.pid)||!record.processStart)return false;
  try{process.kill(record.pid,0);}catch(error){if(error.code==='ESRCH')return false;}
  const key=record.pid+':'+record.processStart,cached=identities.get(key);if(cached&&cached.until>Date.now())return cached.live;
  let live;try{live=platform.processStart(record.pid)===record.processStart;}catch{try{process.kill(record.pid,0);live=true;}catch(error){live=error.code!=='ESRCH';}}
  if(identities.size>512)identities.clear();identities.set(key,{live,until:Date.now()+500});return live;
}
export function processIdentity(){ownStart??=platform.processStart(process.pid);return {pid:process.pid,processStart:ownStart,nonce:randomUUID()};}
export async function acquireServiceLock(path,{timeoutMs=0}={}){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const identity=processIdentity(),deadline=Date.now()+timeoutMs;
  for(;;){
    try{const claim=path+'.claim.'+identity.nonce;try{const file=await open(claim,'wx',0o600);try{await file.writeFile(JSON.stringify(identity));await file.sync();}finally{await file.close();}await link(claim,path);}finally{await rm(claim,{force:true});}
      return async()=>{try{const value=JSON.parse(await readFile(path,'utf8'));if(value.nonce===identity.nonce)await rm(path);}catch(e){if(e.code!=='ENOENT')throw e;}};
    }catch(e){if(e.code!=='EEXIST')throw e;}
    let value;try{value=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')continue;
      // A lock writer can briefly expose an empty file. Never unlink it on sight.
      if(Date.now()>=deadline)throw serviceError('SERVICE_LOCK_INVALID','启动锁尚未写完或已损坏，请用 service doctor 核对。');
      await new Promise(r=>setTimeout(r,80));continue;
    }
    if(!liveIdentity(value)){
      // Serialize stale recovery, then re-read: two recoverers must never unlink a new owner.
      let releaseRecovery;try{releaseRecovery=await acquireServiceLock(path+'.reap',{timeoutMs:1000});}catch{await new Promise(r=>setTimeout(r,80));continue;}
      try{let current;try{current=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}if(current.nonce===value.nonce&&!liveIdentity(current))await rm(path,{force:true});}finally{await releaseRecovery();}continue;
    }
    if(Date.now()>=deadline)throw serviceError('SERVICE_ALREADY_RUNNING','当前实例已有服务或正在启动。');
    await new Promise(r=>setTimeout(r,100));
  }
}
