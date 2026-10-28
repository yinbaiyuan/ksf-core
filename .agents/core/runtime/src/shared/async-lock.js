import {open,readFile,rm,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
/** Process lock: preserve unknown/live owners; recover a dead owner only after rechecking identity. */
export async function withAsyncFileLock(path,action){
 let owned;
 for(let attempt=0;attempt<100;attempt++){
  let fd;
  try{fd=await open(path,'wx',0o600);await fd.writeFile(JSON.stringify({pid:process.pid,nonce:randomUUID()}));await fd.sync();owned=await fd.stat();await fd.close();break;}
  catch(error){await fd?.close();if(error.code!=='EEXIST')throw error;try{const raw=await readFile(path,'utf8'),owner=JSON.parse(raw);if(Number.isSafeInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(probe){if(probe.code==='ESRCH'&&await readFile(path,'utf8')===raw){await rm(path);continue;}}}}catch{}await new Promise(resolve=>setTimeout(resolve,25));}
 }
 if(!owned)throw Object.assign(new Error('应用数据正由其他进程更新，请稍后重试。'),{code:'APP_DATA_BUSY',status:409});
 try{return await action();}finally{try{const current=await lstat(path);if(current.ino===owned.ino&&current.dev===owned.dev)await rm(path);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
