import {open,link,unlink,rm,rmdir,rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {platform} from '../platform/index.js';
import {replaceFile,syncDirectory} from './durable-json.js';

/** Publish without deleting an existing destination first, on every platform. */
export async function publishTemporary(temp,target,{replace=false,directory=false}={}){
 let published=false;
 try{
  if(replace)await replaceFile(temp,target);
  else if(directory){let reservation;try{reservation=await platform.reserveDirectoryRename(target);await rename(temp,target);reservation=null;}finally{if(reservation)await rmdir(target).catch(()=>{});}}
  else {await link(temp,target);await unlink(temp);}
  published=true;await syncDirectory(dirname(target));
 }catch(error){if(published)error.data={...error.data,outcomeUnknown:true,path:target};throw error;}
}
export async function createDurableFile(target,bytes,{mode=0o644}={}){
 const temp=join(dirname(target),'.ksf-file-'+randomUUID());let handle;
 try{handle=await open(temp,'wx',mode);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;await publishTemporary(temp,target);}
 finally{await handle?.close();await rm(temp,{force:true});}
}
