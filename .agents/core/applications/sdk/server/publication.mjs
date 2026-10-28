import {open,readFile,rename,rm,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function atomicWrite(path,bytes){await mkdir(dirname(path),{recursive:true});const temporary=path+'.'+randomUUID()+'.tmp';let handle;try{handle=await open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;await rename(temporary,path);}finally{await handle?.close();await rm(temporary,{force:true});}}
export async function withStoreLock(directory,action,{lockName='.publication.lock'}={}){await mkdir(directory,{recursive:true});const path=directory+'/'+lockName;let lock;
 for(let attempt=0;attempt<100;attempt++){
  try{lock=await open(path,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,nonce:randomUUID()}));break;}catch(error){if(error.code!=='EEXIST')throw error;let raw;try{raw=await readFile(path,'utf8');const owner=JSON.parse(raw);if(Number.isSafeInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(probe){if(probe.code==='ESRCH'&&await readFile(path,'utf8')===raw){await rm(path);continue;}}}}catch{}await new Promise(r=>setTimeout(r,25));}
 }if(!lock)throw Object.assign(Error('应用源正由另一个构建更新，请稍后重试。'),{code:'APP_PUBLICATION_BUSY'});
 try{return await action();}finally{await lock.close();await rm(path,{force:true});}
}
