import {superviseService} from './service-supervisor.js';
import {atomicJSON} from '../communication/contracts.js';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {startWebServer} from './web.js';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function runService(root,{port=1313,reason='manual',attemptId}={}){
  let instance;
  try{if(process.env.KSF_SERVICE_WORKER!=='1')return await superviseService(root,{port,reason,attemptId});instance=await startWebServer({root,port,reason,attemptId});}
  catch(error){if(['SERVICE_ALREADY_RUNNING','SERVICE_START_SUPERSEDED'].includes(error.code))return 0;await mkdir(join(root,'.agents/runtime-data/service'),{recursive:true});await atomicJSON(join(root,'.agents/runtime-data/service/last-start.json'),{at:Date.now(),attemptId,code:error.code??'SERVICE_START_FAILED',message:error.message});process.stderr.write(JSON.stringify({ok:false,code:error.code??'SERVICE_START_FAILED',message:error.message})+'\n');return 1;}
  process.stdout.write(JSON.stringify({ok:true,service:'ksf-core',url:instance.url,pid:process.pid,startedAt:instance.startedAt})+'\n');
  return new Promise(resolve=>{let stopping=false;const stop=()=>{if(stopping)return;stopping=true;process.off('SIGINT',stop);process.off('SIGTERM',stop);process.off('message',onMessage);process.off('disconnect',stop);instance.server.off('ksf-stop',stop);instance.close().then(()=>resolve(0),e=>{process.stderr.write(e.message+'\n');resolve(1);});};const onMessage=message=>{if(message?.type==='ksf-service-stop')stop();};process.on('message',onMessage);process.once('disconnect',stop);process.once('SIGINT',stop);process.once('SIGTERM',stop);instance.server.once('ksf-stop',stop);});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const code=await runService(process.argv[2],{port:Number(process.argv[3]),reason:process.argv[4],attemptId:process.argv[5]||undefined});if(process.env.KSF_SERVICE_WORKER==='1')process.exit(code);else process.exitCode=code;}
