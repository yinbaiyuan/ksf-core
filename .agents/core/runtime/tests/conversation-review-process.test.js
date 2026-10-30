import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplicationManager } from '../src/applications/manager.js';
import { createTaskReviewSource } from '../src/services/task-review.js';
import { PROTOCOL, turnPath, taskPath } from '../src/task-capture/storage.js';

test('installed resident application survives real child-process restarts and preserves review, archive and suggestions', async t => {
  const root = await mkdtemp(join(tmpdir(),'ksf-rv-process-')), store = join(root,'store'), taskId='a'.repeat(64), at='2026-10-28T02:00:00Z';
  await mkdir(store); const sourceStore=fileURLToPath(new URL('../../applications/store/',import.meta.url));
  const index=JSON.parse(await readFile(join(sourceStore,'index.json'),'utf8')), entry=index.apps.filter(e=>e.manifest.id==='com.ksf.conversations').sort((a,b)=>b.manifest.version.localeCompare(a.manifest.version,undefined,{numeric:true}))[0];
  await copyFile(join(sourceStore,entry.package.url),join(store,entry.package.url)); await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[entry]}));
  const ownership={state:'none'}, turn={protocol:PROTOCOL,taskId,turnId:'first',revision:1,policy:'capture',status:'completed',startedAt:at,updatedAt:at,completedAt:at,declarations:[],issues:[],routes:[{eventId:'route',at,snapshot:{summary:'完成示例核对',status:'completed',ownership,project:{state:'none'},references:[],relatedTargets:[],abilities:[]}}],messages:[{id:'u',role:'user',at,phase:'user',content:[{type:'text',text:'核对示例结果'}],revisions:[]},{id:'f',role:'assistant',at,phase:'final_answer',content:[{type:'text',text:'示例核对已完成'}],revisions:[]}]};
  for(const [path,value]of [[turnPath(taskId,'first'),turn],[taskPath(taskId)+'/task.json',{protocol:PROTOCOL,taskId,title:'进程恢复示例'}]]){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),JSON.stringify(value));}
  const source=createTaskReviewSource(root),requests=new Map();let outcome='running',manager;
  const services={tasks:{reviewSources:input=>source.sources(input),readReviewTurn:input=>source.read(input)},ai:{
    describe:async()=>({profiles:[{id:'fixture',capabilities:['text','json'],limits:{}}]}),
    submit:async(_caller,request)=>{const previous=[...requests.values()].find(r=>r.request.idempotencyKey===request.idempotencyKey);if(previous)return{aiTaskId:previous.id,status:outcome};const id='ai-'+requests.size;requests.set(id,{id,request});return{aiTaskId:id,status:outcome};},
    get:async()=>({status:outcome,error:null}),
    readResult:async(_caller,id)=>{const request=requests.get(id).request,input=JSON.parse(request.inputs[0].text);if(request.context.stepId.startsWith('extract-'))return{value:{facts:[{key:'示例核对',title:'示例核对',goal:'核对结果',result:'对话报告完成',stage:'implemented',openItems:[],citations:[input.messages[0].sourceId]}],notes:'仅有声明',artifacts:[]}};
      const citations=Object.keys(input.sourceMap);return{value:{summary:'示例结果仅有对话声明',workItems:[{key:'示例核对',title:'示例核对',goal:'核对结果',result:'对话报告完成',stage:'implemented',openItems:[],citations}],findings:[],suggestions:[{key:'示例证据',type:'quality',targetKey:'chat:'+taskId,problem:'补充验收证据',change:'补充可核查的回执',reason:'声明不足以证明验收',validation:'核对回执',citations,method:{scenario:'',input:'',steps:[],output:'',limits:''}}],chatClosures:[{taskId,closed:true,reason:'原请求明确完成',openItems:[],unknownOperations:[],citations}]}};
    }}};
  const start=async()=>{manager=createApplicationManager(root,{storeDirectory:store,defaultSource:null,services});await manager.snapshot();await manager.startBackground();};
  t.after(async()=>{await manager?.close();await rm(root,{recursive:true,force:true});});
  await start();await manager.invoke('com.ksf.conversations','review.configure',{enabled:false,profileId:'fixture',timeZone:'Asia/Shanghai',time:'06:00'});
  const accepted=await manager.invoke('com.ksf.conversations','review.generate',{date:'2026-10-28'});
  async function until(action,predicate){const deadline=Date.now()+8000;do{const value=await action();if(predicate(value))return value;await new Promise(r=>setTimeout(r,20));}while(Date.now()<deadline);throw Error('进程恢复未在期限内完成：'+JSON.stringify((await manager.invoke('com.ksf.conversations','review.overview')).runs));}
  await until(async()=>requests.size,n=>n===1);const oldPid=(await manager.runtimeSnapshot('com.ksf.conversations')).applications[0].runtimes[0].pid;
  await manager.close();outcome='succeeded';await start();
  const report=await until(()=>manager.invoke('com.ksf.conversations','review.read',{id:accepted.id}),Boolean);
  const newPid=(await manager.runtimeSnapshot('com.ksf.conversations')).applications[0].runtimes[0].pid;assert.notEqual(oldPid,newPid);assert.equal(requests.size,2);
  const receipt=await manager.invoke('com.ksf.conversations','review.confirm',{id:report.id,revision:report.revision,archiveTaskIds:[taskId],operationId:'fixture-confirm'});assert.deepEqual(receipt.archived,[taskId]);
  await manager.close();await start();assert.equal((await manager.invoke('com.ksf.conversations','chats.list',{state:'archived'})).total,1);assert.equal((await manager.invoke('com.ksf.conversations','suggestions.list'))[0].status,'pending');
});
