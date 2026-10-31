import {spawn} from 'node:child_process';
import {mkdir,stat,rename,appendFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {waitForServiceTransition} from './service-manager.js';

// One supervisor per host captures both native stderr and JS output without
// PowerShell transcoding. Each stream has backpressure and two bounded files.
export async function superviseService(root,{port,reason,attemptId}){
  const existing=await waitForServiceTransition(root);
  if(existing.state==='running')return 0;
  if(existing.state!=='stopped')throw Object.assign(Error('现有后台需要核对。'),{code:existing.code??'SERVICE_START_FAILED'});
  const home=join(root,'.agents/runtime-data/service');await mkdir(home,{recursive:true});
  let writes=Promise.resolve();
  function write(name,chunk){
    const data=chunk.length>2*1024*1024?chunk.subarray(-2*1024*1024):chunk,path=join(home,name);
    writes=writes.catch(()=>{}).then(async()=>{
      const size=(await stat(path).catch(e=>{if(e.code==='ENOENT')return {size:0};throw e;})).size;
      if(size+data.length>2*1024*1024){await rm(path+'.1',{force:true});await rename(path,path+'.1');}
      await appendFile(path,data,{mode:0o600});
    });return writes;
  }
  const child=spawn(process.execPath,[fileURLToPath(new URL('./service-entry.js',import.meta.url)),root,String(port),reason,attemptId??''],{cwd:dirname(process.execPath),windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,KSF_SERVICE_WORKER:'1'}});
  for(const [stream,name] of [[child.stdout,'service.log'],[child.stderr,'service.err']])stream.on('data',chunk=>{
    stream.pause();void write(name,chunk).catch(error=>process.stderr.write('SERVICE_LOG_FAILED: '+error.message+'\n')).finally(()=>stream.resume());
  });
  const stop=()=>{if(child.connected)child.send({type:'ksf-service-stop'},()=>{});else if(child.exitCode===null)child.kill('SIGTERM');};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1));});}
  finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);await writes.catch(()=>{});}
}
