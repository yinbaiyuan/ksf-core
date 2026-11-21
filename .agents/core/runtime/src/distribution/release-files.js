import {mkdir,open,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {checkedPath} from './files.js';
import {replaceFile} from '../platform/index.js';

// Release staging and new template directories contain independent files.
// Bound concurrent I/O while retaining durable writes and atomic publication.
// Drain every writer before returning an error so callers may remove staging.
export async function writeReleaseFiles(root,entries){
 let cursor=0,stopped=false;
 async function worker(){
  while(!stopped&&cursor<entries.length){
   const entry=entries[cursor++];let handle,temporary,owned=false;
   try{
    const target=checkedPath(root,entry.path);temporary=target+'.'+randomUUID()+'.tmp';
    await mkdir(dirname(target),{recursive:true});
    try{
     handle=await open(temporary,'wx',entry.mode);owned=true;
     await handle.writeFile(entry.bytes);await handle.sync();await handle.close();handle=undefined;
     await replaceFile(temporary,target);
    }finally{
     try{await handle?.close();}finally{if(owned)await rm(temporary,{force:true});}
    }
   }catch(error){stopped=true;throw error;}
  }
 }
 const settled=await Promise.allSettled(Array.from({length:Math.min(8,entries.length)},worker));
 const failure=settled.find(result=>result.status==='rejected');if(failure)throw failure.reason;
}
