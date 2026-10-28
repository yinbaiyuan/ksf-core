// Isolated browser acceptance server; all model responses use synthetic fixtures.
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { startWebServer } from '../src/services/web.js';
import { createApplicationManager } from '../src/applications/manager.js';
import { createWorkbenchAI } from '../src/services/ai-tasks.js';
const root=await mkdtemp(join(tmpdir(),'ksf-ai-browser-')),storeDirectory=resolve(process.argv[2]);
const ai=createWorkbenchAI(root);await ai.config('connections',{revision:0,items:[{id:'fixture-api',kind:'api',enabled:true,protocolId:'openai-responses-v1',baseURL:'https://example.invalid/v1',credentialRef:'env:SYNTHETIC_FIXTURE_KEY',concurrency:1}]});await ai.config('profiles',{revision:0,items:[{id:'fixture-text',executorId:'fixture-api',enabled:true,model:'synthetic-model',timeoutMs:10000,maxAttempts:1,retryDelayMs:0,maxInputBytes:1000000,maxOutputBytes:16384}]});await ai.close();
const manager=createApplicationManager(root,{storeDirectory});const catalog=JSON.parse(await readFile(join(storeDirectory,'index.json'),'utf8'));for(const entry of catalog.apps)await manager.install({trusted:true,sourceId:'builtin',appId:entry.manifest.id,version:entry.manifest.version,digest:entry.package.sha256});await manager.close();
const server=await startWebServer({root,port:0,capture:false,applications:{storeDirectory},ai:{env:{SYNTHETIC_FIXTURE_KEY:'fixture-not-an-api-key'},fetcher:async()=>new Response(JSON.stringify({id:'resp_browser_fixture',status:'completed',model:'synthetic-model',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'虚构早会的灯光验收安排。',decisions:[{text:'周五完成灯光验收。',sourceIds:['S1']}],actions:[{text:'复核网络覆盖。',owner:null,dueAt:null,sourceIds:['S3']}],openQuestions:['语音控制尚未决定。']})}]}]}))}});
console.log(JSON.stringify({url:server.url,root,mode:'synthetic-browser-fixture'}));
async function close(){await server.close();await rm(root,{recursive:true,force:true});process.exit(0);}process.on('SIGTERM',close);process.on('SIGINT',close);
