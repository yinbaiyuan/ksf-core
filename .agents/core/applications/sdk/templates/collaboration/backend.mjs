import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const channel='team.workflow.v1';
const validID=id=>typeof id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
const validAddress=value=>value&&/^[a-f0-9]{64}$/.test(value.nodeId)&&value.endpoint?.kind==='app'&&typeof value.endpoint.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value.endpoint.id);
const sameAddress=(a,b)=>a?.nodeId===b?.nodeId&&a?.endpoint?.kind===b?.endpoint?.kind&&a?.endpoint?.id===b?.endpoint?.id;
const fail=(message,code='TEAM_INPUT_INVALID')=>{throw Object.assign(Error(message),{code});};
const text=value=>{const result=value??'';if(typeof result!=='string'||Buffer.byteLength(result)>128*1024)fail('正文最多 128 KiB；更长内容请作为附件发送。');return result;};
function attachments(value=[]){
 if(!Array.isArray(value)||value.length>20||value.some(item=>!validID(item?.materialId)))fail('附件需要本应用准备的材料引用，单次最多 20 个。');
 return value.map(item=>({materialId:item.materialId}));
}

export async function activate(ctx){
 const path=join(ctx.dataDirectory,'workflow.json');await mkdir(ctx.dataDirectory,{recursive:true});
 const initial=()=>({schemaVersion:1,tasks:{},requests:{},events:{},operations:{}});
 let state;try{state=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state=initial();}
 if(state.schemaVersion!==1||!state.tasks||!state.requests||!state.events||!state.operations)throw Object.assign(Error('工作流数据版本不兼容，请保留原件。'),{code:'TEAM_DATA_INCOMPATIBLE'});
 async function persist(){try{await ctx.storage.write('workflow.json',JSON.stringify(state));}catch(error){const record=await ctx.storage.read('workflow.json');state=record.exists?JSON.parse(record.text):initial();throw error;}}
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 async function sendBody(outbox){
  const {operationId,to,body}=outbox,file=join(ctx.dataDirectory,operationId+'.json');
  await writeFile(file,JSON.stringify(body));let material;
  try{material=await ctx.messages.registerFile({path:file,name:'workflow.json',mediaType:'application/json'});}finally{await rm(file,{force:true});}
  return ctx.messages.send({operationId,to,channel,payloadPartId:'body',parts:[{partId:'body',materialId:material.materialId},...(outbox.attachments??[]).map((item,index)=>({partId:'file-'+index,materialId:item.materialId}))]});
 }
 async function dispatch(outbox,replayed=false){
  try{return await ctx.messages.status(outbox.operationId);}catch(e){if(e.code!=='COMM_OPERATION_NOT_FOUND')throw e;}
  // Once attempted, an absent receipt is not permission to replay a side effect.
  if(outbox.attempted||replayed)fail('原操作没有可确认的投递记录；输入已保存，请核对后决定是否重新发送。','TEAM_SEND_UNCONFIRMED');
  outbox.attempted=true;await persist();return sendBody(outbox);
 }
 async function call(method,input={}){
  if(method==='inspect')return ctx.locks.run('workflow',()=>structuredClone(state));
  if(method==='send.status')return ctx.messages.status(input.operationId);
  if(method==='send.reconcile')return ctx.messages.reconcile(input.operationId);
  if(method==='peers')return ctx.peers.list();
  return ctx.locks.run('workflow',async()=>{
   if(!validID(input.operationId))fail('写操作需要稳定的 UUID operationId。');
   const signature=digest({method,input}),prior=state.operations[input.operationId];
   if(prior){if(prior.signature!==signature)fail('同一 operationId 已绑定其他内容。');return prior.outbox?{...prior.result,delivery:await dispatch(prior.outbox,true)}:prior.result;}
   let result,outbox;
   if(method==='task.create'){
    const taskId=input.taskId??randomUUID();if(!validID(taskId)||state.tasks[taskId]||typeof input.title!=='string'||!input.title.trim()||input.title.length>1000)fail('目标任务 ID 或标题无效。');
    state.tasks[taskId]={taskId,title:input.title,status:'open',rounds:[]};result={taskId};
   }else if(method==='task.send'){
    const task=state.tasks[input.taskId],requestId=input.requestId??randomUUID();if(!task||!validID(requestId)||state.requests[requestId]||!validAddress(input.to))fail('任务、协作轮次或接收应用无效。');
    const content=text(input.text),files=attachments(input.attachments);
    // This local association permits optional replies; it is not a remote commitment.
    state.requests[requestId]={requestId,taskId:task.taskId,status:'waiting',expectedFrom:structuredClone(input.to)};task.rounds.push(requestId);task.status='waiting';
    outbox={operationId:input.operationId,to:structuredClone(input.to),body:{kind:'task',taskId:task.taskId,requestId,title:task.title,text:content,attachmentIds:files.map((_,index)=>'file-'+index)},attachments:files};result={taskId:task.taskId,requestId};
   }else if(method==='task.accept'||method==='task.ignore'){
    const request=state.requests[input.requestId];if(!request?.from||request.status!=='received')fail('没有待处理的来访任务。');
    request.status=method==='task.accept'?'accepted':'ignored';result={requestId:request.requestId,status:request.status};
   }else if(method==='task.complete'){
    const request=state.requests[input.requestId];if(!request?.from||request.status!=='accepted')fail('请先选择继续处理，再保存本地成果。');
    request.result={text:text(input.text),completedAt:new Date().toISOString()};request.status='completed';result={requestId:request.requestId,status:request.status};
   }else if(method==='task.feedback'){
    const request=state.requests[input.requestId];if(!request?.from||!['received','accepted','completed','feedback-sent'].includes(request.status))fail('没有可反馈的来访任务。');
    if(request.status==='feedback-sent'){const previous=request.feedbackOperationId;if(!previous)fail('请先核对旧反馈记录。');const original=await ctx.messages.status(previous);if(!['failed','cancelled'].includes(original.status))fail('原反馈尚未确认失败，不能重新发送。','TEAM_SEND_UNCONFIRMED');}
    const content=text(input.text??request.result?.text),files=attachments(input.attachments);if(!content.trim()&&!files.length)fail('请提供反馈文字或附件。');
    outbox={operationId:input.operationId,to:request.from,body:{kind:'feedback',taskId:request.taskId,requestId:request.requestId,text:content,attachmentIds:files.map((_,index)=>'file-'+index)},attachments:files};request.status='feedback-sent';request.feedbackOperationId=input.operationId;result={taskId:request.taskId,requestId:request.requestId};
   }else if(method==='task.approve'){
    const request=state.requests[input.requestId];if(request?.status!=='review')fail('此轮次尚无待审批反馈。');request.status='approved';state.tasks[request.taskId].status='open';result={requestId:request.requestId,status:'approved'};
   }else fail('未知业务命令。');
   state.operations[input.operationId]={signature,result,...(outbox?{outbox}:{})};await persist();return outbox?{...result,delivery:await dispatch(outbox)}:result;
  });
 }
 async function onMessage(event){
  if(event.channel!==channel||!validID(event.messageId)||event.eventId!==event.messageId)fail('消息通道或标识无效。');
  await ctx.locks.run('workflow',async()=>{
   if(state.events[event.eventId])return;
   const message=await ctx.messages.read(event.messageId),manifest=message.manifest,source=manifest.from;
   if(!validAddress(source)||!sameAddress(source,event.from))fail('消息来源与已认证记录不一致。');
   const part=manifest.parts.find(v=>v.partId===manifest.payloadPartId);if(!part||part.byteLength>1024*1024)fail('示例应用的业务 JSON 不能超过 1 MiB，附件保留为消息材料。');
   const material=await ctx.messages.readPart(event.messageId,part.partId);let body;
   try{body=JSON.parse(await readFile(material.path,'utf8'));}catch(e){if(e instanceof SyntaxError)fail('业务信封不是有效 JSON。');throw e;}
   if(!body||!validID(body.taskId)||!validID(body.requestId)||!['task','feedback'].includes(body.kind))fail('业务信封无效。');
   const content=text(body.text),ids=body.attachmentIds??[],used=new Set([part.partId]);
   if(!Array.isArray(ids)||ids.length>20)fail('附件清单无效。');
   const files=ids.map(id=>{const item=manifest.parts.find(value=>value.partId===id);if(!item||used.has(id))fail('附件部件缺失或重复。');used.add(id);return {...item,messageId:event.messageId};});
   if(used.size!==manifest.parts.length)fail('消息部件与业务附件清单不一致。');
   if(body.kind==='task'){
    if(typeof body.title!=='string'||!body.title.trim()||body.title.length>1000)fail('来访任务标题无效。');
    if(state.requests[body.requestId])fail('协作轮次已存在。');
    state.tasks[body.taskId]??={taskId:body.taskId,title:body.title,status:'received',rounds:[]};state.tasks[body.taskId].rounds.push(body.requestId);
    state.requests[body.requestId]={taskId:body.taskId,requestId:body.requestId,status:'received',from:source,text:content,attachments:files,messageId:event.messageId};
   }else{
    const request=state.requests[body.requestId];if(!request||request.status!=='waiting'||request.taskId!==body.taskId||!sameAddress(request.expectedFrom,source))fail('反馈没有匹配到本应用记录的请求及来源。');
    request.status='review';request.feedback={messageId:event.messageId,text:content,attachments:files};state.tasks[body.taskId].status='review';
   }
   state.events[event.eventId]=true;await persist();
  });
 }
 // Activation only takes custody. Local accept/ignore/complete never send or run tools.
 return {call,onMessage};
}

export async function prepareData(ctx){
 const saved=await ctx.storage.read('workflow.json');if(!saved.exists)return;
 let state;try{state=JSON.parse(saved.text);}catch{throw Object.assign(Error('工作流数据损坏，请保留原件。'),{code:'TEAM_DATA_INCOMPATIBLE'});}
 if(state.schemaVersion!==1||!state.tasks||!state.requests||!state.events||!state.operations)throw Object.assign(Error('工作流数据版本不兼容，请保留原件。'),{code:'TEAM_DATA_INCOMPATIBLE'});
}
