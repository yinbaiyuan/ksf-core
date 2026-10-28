// Shared service lifecycle for platform-specific manual launchers.
import {startWebServer} from '../src/services/web.js';
import {platform} from '../src/platform/index.js';
import {atomicJSON,safeDirectory,readJSON} from '../src/shared/durable-json.js';
import {join,resolve} from 'node:path';
import {rm,appendFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const root=resolve(process.argv[2]),port=Number(process.argv[3]??4317);
const directory=join(root,'.agents/runtime-data/web'),record=join(directory,'session.json'),stopFile=join(directory,'stop.json');
await safeDirectory(root,directory);
const log=join(directory,'workbench.log');
const writeLog=(level,values)=>{void appendFile(log,`${new Date().toISOString()} ${level} ${values.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' ')}\n`).catch(()=>{});};
console.log=(...values)=>writeLog('INFO',values);console.error=(...values)=>writeLog('ERROR',values);
const nonce=randomUUID(),started=platform.processStart(process.pid);
let server,timer,closing=false;
async function close(){
  if(closing)return;closing=true;clearInterval(timer);
  try{await server?.close();}
  finally{
    if((await readJSON(record,null))?.nonce===nonce)await rm(record,{force:true});
    if((await readJSON(stopFile,null))?.nonce===nonce)await rm(stopFile,{force:true});
  }
}
try{
  server=await startWebServer({root,port});
  await atomicJSON(record,{schemaVersion:1,pid:process.pid,started,nonce,root,url:server.url});
  console.log(JSON.stringify({ready:true,pid:process.pid,root,url:server.url}));
  timer=setInterval(()=>{void readJSON(stopFile,null).then(request=>{if(request?.nonce===nonce&&request.pid===process.pid)return close();}).catch(error=>console.error(error.message));},500);
  process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
}catch(error){await close();console.error(error.code??'WEB_START_FAILED',error.message);process.exitCode=1;}
