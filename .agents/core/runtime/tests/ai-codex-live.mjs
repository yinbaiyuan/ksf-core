// Explicit opt-in live acceptance. Uses synthetic material and the service
// account's existing Codex authentication; never reads/copies credential files.
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createWorkbenchAI } from '../src/services/ai-tasks.js';

assert.ok(process.env.KSF_AI_LIVE_CODEX_PATH,'Set KSF_AI_LIVE_CODEX_PATH to explicitly run live acceptance.');
const root=await mkdtemp(join(tmpdir(),'ksf-ai-live-')),ai=createWorkbenchAI(root);
const caller={appId:'example.meeting-acceptance',version:'1.0.0'};
try{
  await ai.config('connections',{revision:0,items:[{id:'codex',kind:'codex',enabled:true,executablePath:process.env.KSF_AI_LIVE_CODEX_PATH,concurrency:1}]});
  await ai.config('profiles',{revision:0,items:[{id:'text',executorId:'codex',enabled:true,timeoutMs:120000,maxAttempts:1,retryDelayMs:0,maxInputBytes:65536,maxOutputBytes:16384}]});
  const schema={type:'object',additionalProperties:false,properties:{summary:{type:'string'},decisions:{type:'array',items:{type:'string'}},actions:{type:'array',items:{type:'object',additionalProperties:false,properties:{task:{type:'string'},owner:{type:['string','null']},dueAt:{type:['string','null']},sourceId:{type:'string'}},required:['task','owner','dueAt','sourceId']}},openQuestions:{type:'array',items:{type:'string'}}},required:['summary','decisions','actions','openQuestions']};
  const accepted=await ai.submit(caller,{contractVersion:'ai-task-v1',idempotencyKey:'synthetic-meeting-v1',profileId:'text',instruction:'将虚构早会转写整理为中文纪要。只采用明确事实，决定与提议区分，未明确的负责人和日期必须是 null；行动引用原段落 ID。不要调用工具。',inputs:[{kind:'text',text:'S1 林：决定周五先完成客厅灯光验收。S2 陈：我来整理灯光验收清单，明天交。S3 林：建议未来考虑语音控制，但还没有决定。S4 林：另需复核网络覆盖，负责人和时间下次确定。'}],outputSpec:{format:'json',schema}});
  let task;const end=Date.now()+135000;
  do{task=await ai.get(caller,accepted.aiTaskId);if(['succeeded','failed','reconciling','cancelled'].includes(task.status))break;await new Promise(resolve=>setTimeout(resolve,500));}while(Date.now()<end);
  assert.equal(task.status,'succeeded',JSON.stringify(task));
  assert.ok(task.output.value.decisions.some(v=>v.includes('灯光')));
  assert.ok(!task.output.value.decisions.some(v=>v.includes('语音')));
  assert.ok(task.output.value.actions.some(v=>v.task.includes('网络')&&v.owner===null&&v.dueAt===null));
  assert.ok(task.output.value.actions.every(v=>/^S[1-4]$/.test(v.sourceId)));
  const evidence={kind:'live-codex-synthetic-material',at:new Date().toISOString(),task,assertions:['schema','explicit-decision','proposal-is-not-decision','unknown-owner-and-date','source-ids']};
  if(process.argv[2]){await mkdir(dirname(process.argv[2]),{recursive:true});await writeFile(process.argv[2],JSON.stringify(evidence,null,2)+'\n');}
  console.log(JSON.stringify({ok:true,aiTaskId:task.aiTaskId,status:task.status,attempts:task.execution.attempts.length,cli:task.execution.attempts[0].cliVersion,usage:task.usage}));
}finally{await ai.close();await rm(root,{recursive:true,force:true});}
