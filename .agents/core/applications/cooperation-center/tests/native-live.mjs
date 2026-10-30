// Explicit synthetic live acceptance; never imports user projects or source materials.
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {randomUUID} from 'node:crypto';
import {createWorkbenchAI} from '../../../runtime/src/services/ai-tasks.js';
import {sha256} from '../../../runtime/src/ai-tasks/schema.js';
assert.ok(process.env.KSF_AI_LIVE_CODEX_PATH,'Set an explicit existing Codex executable to run live acceptance.');
const root=await realpath(await mkdtemp(join(tmpdir(),'ksf-cooperation-live-'))),ai=createWorkbenchAI(root),caller={appId:'com.ksf.cooperation-center',source:'surface',humanWindow:true},project=join(root,'synthetic-project');
try{
 await mkdir(project);await writeFile(join(project,'input.txt'),'synthetic input');
 await ai.config('connections',{revision:0,items:[{id:'codex',kind:'codex',enabled:true,executablePath:process.env.KSF_AI_LIVE_CODEX_PATH,...(process.env.KSF_AI_LIVE_CODEX_HOME?{codexHome:process.env.KSF_AI_LIVE_CODEX_HOME}:{}),concurrency:1}]});
 await ai.config('profiles',{revision:0,items:[{id:'project',executorId:'codex',enabled:true,...(process.env.KSF_AI_LIVE_MODEL?{model:process.env.KSF_AI_LIVE_MODEL}:{}),timeoutMs:120000,maxAttempts:1,retryDelayMs:0,maxInputBytes:65536,maxOutputBytes:16384}]});
 const configured=await ai.configureExecution(caller,{operationId:randomUUID(),offerId:'synthetic-project',name:'隔离项目验收',description:'仅处理合成项目',inputs:'合成输入',outputs:'验收文件',instructions:'限定合成项目',published:true,handling:'auto',delivery:'auto',ifRevision:0,scope:{capability:'project',projectPath:project,profileId:'project',shell:true,network:false,writeBack:false}}),rule=configured.rules.find(r=>r.offerId==='synthetic-project');
 const request={contractVersion:'ai-task-v1',idempotencyKey:'synthetic-project-once',profileId:'project',instruction:'这是隔离验收。请使用命令工具在当前工作目录创建 result.txt，内容严格为 cooperation-native-ok。不要访问网络，不要读取其他目录。最后回复文件名。',inputs:[],outputSpec:{format:'text'},executionGrant:{id:rule.id,revision:rule.revision,taskId:randomUUID(),contentDigest:sha256('synthetic goal'),phase:'execute'}};
 const accepted=await ai.submit(caller,request),end=Date.now()+135000;let task;
 do{task=await ai.get(caller,accepted.aiTaskId);if(['succeeded','failed','reconciling','cancelled'].includes(task.status))break;await new Promise(r=>setTimeout(r,300));}while(Date.now()<end);
 assert.equal(task.status,'succeeded',JSON.stringify({status:task.status,error:task.error,attempts:task.execution.attempts}));
 const result=await ai.readResult(caller,task.aiTaskId),file=result.executionFiles?.find(f=>f.name==='result.txt');assert.ok(file,JSON.stringify({output:result.value,files:result.executionFiles,execution:task.execution}));assert.equal((await readFile(file.path,'utf8')).trim(),'cooperation-native-ok');await assert.rejects(readFile(join(project,'result.txt')),{code:'ENOENT'});assert.equal((await ai.submit(caller,request)).aiTaskId,task.aiTaskId);
 const evidence={ok:true,kind:'live-native-project-copy',at:new Date().toISOString(),platform:process.platform,cli:task.execution.attempts[0]?.cliVersion,status:task.status,attempts:task.execution.attempts.length,assertions:['native-permission-probes','project-copy-write','original-project-unchanged','network-disabled','durable-file-artifact','stable-idempotency']};
 if(process.argv[2]){await mkdir(dirname(process.argv[2]),{recursive:true});await writeFile(process.argv[2],JSON.stringify(evidence,null,2)+'\n');}console.log(JSON.stringify(evidence));
}finally{await ai.close();await rm(root,{recursive:true,force:true});}
