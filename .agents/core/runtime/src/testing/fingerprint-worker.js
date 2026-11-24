import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const invalid=()=>Object.assign(new Error('Input fingerprint worker returned incomplete results.'),{code:'TEST_INPUT_FINGERPRINT_FAILED'});
// One short-lived pool owns only the paths for this snapshot. Wait for every
// thread's exit, including failures, before its caller starts or cleans tests.
export async function hashFiles(files,{workers=4}={}){
  if(!Array.isArray(files)||files.some(path=>typeof path!=='string')||!Number.isInteger(workers)||workers<1||workers>4)throw invalid();
  const count=Math.min(workers,files.length),parts=Array.from({length:count},()=>[]);
  files.forEach((path,index)=>parts[index%count].push(path));
  const env={...process.env};for(const key of ['NODE_OPTIONS','NODE_V8_COVERAGE','NODE_TEST_CONTEXT'])delete env[key];
  const jobs=parts.map(paths=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:{protocol:'ksf-file-hashes-v1',paths},execArgv:[],env});
    let reply,failure,received=false;
    worker.on('message',value=>{if(received)failure??=invalid();received=true;reply=value;});
    worker.once('error',error=>{failure??=error;});
    worker.once('exit',code=>{
      if(failure)return reject(failure);
      if(code||!received)return reject(invalid());
      if(reply?.error)return reject(Object.assign(new Error(reply.error.message),reply.error));
      const expected=new Set(paths),seen=new Set();
      if(!Array.isArray(reply?.hashes)||reply.hashes.length!==paths.length)return reject(invalid());
      for(const entry of reply.hashes){
        if(!Array.isArray(entry)||entry.length!==2||!expected.has(entry[0])||seen.has(entry[0])||!/^[a-f0-9]{64}$/.test(entry[1]))return reject(invalid());
        seen.add(entry[0]);
      }
      resolve(reply.hashes);
    });
  }));
  const results=await Promise.allSettled(jobs),failure=results.find(result=>result.status==='rejected');
  if(failure)throw failure.reason;
  return new Map(results.flatMap(result=>result.value));
}
if(!isMainThread&&workerData?.protocol==='ksf-file-hashes-v1'){
  try{
    const hashes=workerData.paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]);
    parentPort.postMessage({hashes});
  }catch(error){parentPort.postMessage({error:{message:error.message,code:error.code,path:error.path,syscall:error.syscall}});}
}
