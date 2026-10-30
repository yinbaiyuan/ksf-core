import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildApplication} from '../build.mjs';
import {decodePackage} from '../server/protocol.js';

test('a separate headless business application can build and select task or Desktop through the public SDK export',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-ai-selection-')),app=join(root,'app'),store=join(root,'store');t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(app);
 const sdk=fileURLToPath(new URL('..',import.meta.url));await mkdir(join(app,'node_modules/@ksf'),{recursive:true});await symlink(sdk,join(app,'node_modules/@ksf/sdk'),'dir');
 await writeFile(join(app,'package.json'),JSON.stringify({name:'synthetic-ai-workflow',type:'module',dependencies:{'@ksf/sdk':'file:'+sdk}}));
 await writeFile(join(app,'manifest.json'),JSON.stringify({schemaVersion:1,minCoreVersion:'0.3.0',dataStores:[],sdkVersion:1,id:'com.example.ai-selection',version:'1.0.0',name:'Synthetic AI workflow',description:'Selection acceptance only',backend:{runtime:'node',entry:'backend/index.mjs',lifecycle:'on-demand'},permissions:['codex-conversations']}));
 await writeFile(join(app,'backend.mjs'),"import {createAIServiceClient} from '@ksf/sdk/ai-services';import {createCapabilitiesClient} from '@ksf/sdk/capabilities';export function activate(context){const ai=createAIServiceClient(context);return {call(method,input){if(method==='capability')return createCapabilitiesClient(context).read(input);if(method==='choices')return ai.describe();if(method==='start')return ai.start(input);throw Error('unknown');}}}");
 const entry=await buildApplication(app,{storeDirectory:store,quiet:true}),pkg=decodePackage(await readFile(join(store,entry.package.url))),code=pkg.files.get('backend/index.mjs');
 const modulePath=join(root,'business.mjs');await writeFile(modulePath,code.data);const module=await import(pathToFileURL(modulePath).href);
 const calls=[],business=module.activate({services:{async call(service,method,params){calls.push([service,method,params]);if(service==='capabilities')return {id:params[0].ref,source:'system',definition_digest:'d'.repeat(64)};if(method==='describe')return {profiles:[{id:'synthetic-cli',executorId:'local',kind:'codex',model:null,capabilities:['text','json']}]};if(method==='check')return {available:true};return method==='submit'?{aiTaskId:'synthetic-task',status:'queued'}:{operationId:params[0].operationId,status:'queued'};}}});
 const choices=await business.call('choices');assert.deepEqual(choices.targets.map(x=>x.provider),['codex-cli','codex-desktop']);
 const task=await business.call('start',{kind:'task',profileId:'synthetic-cli',request:{contractVersion:'ai-task-v1',idempotencyKey:'stable-task',instruction:'synthetic',inputs:[],outputSpec:{format:'text'}}});assert.equal(task.kind,'task');
 const conversation=await business.call('start',{kind:'conversation',request:{operationId:'stable-operation',project:{name:'Synthetic',scope:'current'},text:'原始业务请求\r\n'}});assert.equal(conversation.kind,'conversation');assert.equal(calls.at(-1)[2][0].text,'原始业务请求\r\n');const method=await business.call('capability',{ref:'competency.ksf.work-review'});assert.equal(method.id,'competency.ksf.work-review');assert.deepEqual(calls.map(x=>x[1]).sort(),['check','create','describe','read','submit']);
});
