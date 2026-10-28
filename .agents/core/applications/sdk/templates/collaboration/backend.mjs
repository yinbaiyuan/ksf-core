import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const channel='team.workflow.v1',validID=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const fail=message=>{throw Object.assign(Error(message),{code:'TEAM_INPUT_INVALID'});};
export async function activate(ctx){
 const path=join(ctx.dataDirectory,'workflow.json');await mkdir(ctx.dataDirectory,{recursive:true});
 const initial=()=>({schemaVersion:1,tasks:{},requests:{},events:{},operations:{}});
 let state;try{state=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state=initial();}
 if(state.schemaVersion!==1||!state.tasks||!state.requests||!state.events||!state.operations)throw Object.assign(Error('工作流数据版本不兼容，请保留原件。'),{code:'TEAM_DATA_INCOMPATIBLE'});
 async function persist(){try{await ctx.storage.write('workflow.json',JSON.stringify(state));}catch(error){const record=await ctx.storage.read('workflow.json');state=record.exists?JSON.parse(record.text):initial();throw error;}}
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 async function sendBody(operationId,to,body){const file=join(ctx.dataDirectory,operationId+'.json');await writeFile(file,JSON.stringify(body));const material=await ctx.messages.registerFile({path:file,name:'workflow.json',mediaType:'application/json'});return ctx.messages.send({operationId,to,channel,payloadPartId:'body',parts:[{partId:'body',materialId:material.materialId}]});}
 // Persist the business outbox before calling transport. A retry queries the original operation.
 async function dispatch(outbox){try{return await ctx.messages.status(outbox.operationId);}catch(e){if(e.code!=='COMM_OPERATION_NOT_FOUND')throw e;return sendBody(outbox.operationId,outbox.to,outbox.body);}}
 async function call(method,input={}){
  if(method==='inspect')return structuredClone(state);
  if(method==='send.status')return ctx.messages.status(input.operationId);
  if(method==='send.reconcile')return ctx.messages.reconcile(input.operationId);
  if(method==='peers')return ctx.peers.list();
  return ctx.locks.run('workflow',async()=>{
   if(!validID(input.operationId))fail('写操作需要稳定的 UUID operationId。');
   const signature=digest({method,input}),prior=state.operations[input.operationId];
   if(prior){if(prior.signature!==signature)fail('同一 operationId 已绑定其他内容。');return prior.outbox?{...prior.result,delivery:await dispatch(prior.outbox)}:prior.result;}
   let result,outbox;
   if(method==='task.create'){
    const taskId=input.taskId??randomUUID();if(!validID(taskId)||state.tasks[taskId]||typeof input.title!=='string'||!input.title.trim()||input.title.length>1000)fail('目标任务 ID 或标题无效。');
    state.tasks[taskId]={taskId,title:input.title,status:'open',rounds:[]};result={taskId};
   }else if(method==='task.send'){
    const task=state.tasks[input.taskId],requestId=input.requestId??randomUUID();if(!task||!validID(requestId)||state.requests[requestId]||!input.to?.nodeId||input.to?.endpoint?.kind!=='app')fail('任务、协作轮次或接收应用无效。');
    // Register the feedback wait before the remote request can arrive.
    state.requests[requestId]={requestId,taskId:task.taskId,status:'waiting',expectedFrom:input.to};task.rounds.push(requestId);task.status='waiting';
    outbox={operationId:input.operationId,to:input.to,body:{kind:'task',taskId:task.taskId,requestId,title:task.title,text:String(input.text??'')}};result={taskId:task.taskId,requestId};
   }else if(method==='task.accept'){
    const request=state.requests[input.requestId];if(!request?.from||request.status!=='received')fail('没有可接受的来访任务。');request.status='accepted';result={requestId:request.requestId,status:request.status};
   }else if(method==='task.feedback'){
    const request=state.requests[input.requestId];if(!request?.from||!['received','accepted'].includes(request.status))fail('没有可反馈的来访任务。');
    outbox={operationId:input.operationId,to:request.from,body:{kind:'feedback',taskId:request.taskId,requestId:request.requestId,text:String(input.text??'')}};request.status='feedback-sent';result={taskId:request.taskId,requestId:request.requestId};
   }else if(method==='task.approve'){
    const request=state.requests[input.requestId];if(request?.status!=='review')fail('此轮次尚无待审批反馈。');request.status='approved';state.tasks[request.taskId].status='open';result={requestId:request.requestId,status:'approved'};
   }else fail('未知业务命令。');
   state.operations[input.operationId]={signature,result,...(outbox?{outbox}:{})};await persist();return outbox?{...result,delivery:await dispatch(outbox)}:result;
  });
 }
 async function onMessage(event){
  const message=await ctx.messages.read(event.messageId),part=message.manifest.parts.find(v=>v.partId===message.manifest.payloadPartId);if(!part||part.byteLength>1024*1024)fail('示例应用的业务 JSON 不能超过 1 MiB，附件保留为消息材料。');
  const material=await ctx.messages.readPart(event.messageId,part.partId),body=JSON.parse(await readFile(material.path,'utf8'));
  if(!validID(body.taskId)||!validID(body.requestId)||!['task','feedback'].includes(body.kind))fail('业务信封无效。');
  await ctx.locks.run('workflow',async()=>{
   if(state.events[event.eventId])return;
   if(body.kind==='task'){
    const existing=state.requests[body.requestId];if(existing)fail('协作轮次已存在。');
    state.tasks[body.taskId]??={taskId:body.taskId,title:String(body.title??''),status:'received',rounds:[]};state.tasks[body.taskId].rounds.push(body.requestId);
    state.requests[body.requestId]={taskId:body.taskId,requestId:body.requestId,status:'received',from:event.from,text:body.text,messageId:event.messageId};
   }else{
    const request=state.requests[body.requestId];if(!request||request.status!=='waiting'||request.taskId!==body.taskId||request.expectedFrom?.nodeId!==event.from.nodeId||request.expectedFrom?.endpoint?.id!==event.from.endpoint.id||request.expectedFrom?.endpoint?.kind!==event.from.endpoint.kind)fail('反馈没有匹配到本应用等待的任务及来源。');
    request.status='review';request.feedback={messageId:event.messageId,text:body.text};state.tasks[body.taskId].status='review';
   }
   state.events[event.eventId]=true;await persist();
  });
 }
 // This example rests while waiting. The next message activates onMessage and resumes its own run.
 return {call,onMessage};
}
