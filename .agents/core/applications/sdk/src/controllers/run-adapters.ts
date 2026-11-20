import type {AIRequest,AITask,AIResult,createAIClient} from '../ai-tasks.ts';
import type {ConversationOperation,createCodexConversationsClient} from '../codex-conversations.ts';
import type {RunAdapter,RunIdentity,RunReceipt,RunUpdate,RunActionReceipt,RunIssue} from './run-types.ts';
import {projectAITask,projectConversation,conversationAnchor} from './run-projections.ts';

export type AITaskRunClient=Pick<ReturnType<typeof createAIClient>,'submit'|'get'|'events'|'readResult'|'cancel'>&Partial<Pick<ReturnType<typeof createAIClient>,'lookup'>>;
export type DesktopRunClient=Pick<ReturnType<typeof createCodexConversationsClient>,'create'|'send'|'read'|'events'|'operation'|'interrupt'|'answer'|'openDesktop'>;
export type DesktopRunRequest=
  | {kind:'create';params:Parameters<DesktopRunClient['create']>[0]}
  | {kind:'send';params:Parameters<DesktopRunClient['send']>[0]};
const fail=(code:string,message:string)=>Object.assign(Error(message),{code,outcomeUnknown:false});
const requireTask=(identity:RunIdentity):Extract<RunIdentity,{source:'ai-task-v1'}>=>{
  if(identity.source!=='ai-task-v1')throw fail('RUN_SOURCE_MISMATCH','任务与会话身份不能混用。');return identity;
};
const requireDesktop=(identity:RunIdentity):Extract<RunIdentity,{source:'codex-conversations-v1'}>=>{
  if(identity.source!=='codex-conversations-v1')throw fail('RUN_SOURCE_MISMATCH','任务与会话身份不能混用。');return identity;
};
export function runIssue(error:unknown):RunIssue {
  const value=error as {code?:string;message?:string;outcomeUnknown?:boolean;data?:{outcomeUnknown?:boolean}};
  const known=/^(?:RUN_(?:SOURCE_MISMATCH|NOT_READY|ARGUMENT)|AI_(?:REQUEST_INVALID|IDEMPOTENCY_CONFLICT|CALLER_INVALID|PROFILE_UNAVAILABLE|CAPABILITY_UNSUPPORTED|INPUT_TOO_LARGE)|CODEX_(?:ARGUMENT|PLATFORM_UNSUPPORTED|NOT_ATTACHED|QUESTION_STALE|TURN_CHANGED|EXECUTION_GRANT|OPERATION_CONFLICT))$/.test(value?.code??'');
  return {code:value?.code??'RUN_CONNECTION_UNAVAILABLE',message:value?.message??String(error),outcomeUnknown:value?.outcomeUnknown===true||value?.data?.outcomeUnknown===true||!known&&value?.outcomeUnknown!==false};
}

export function createAITaskRunAdapter(client:AITaskRunClient):RunAdapter<AIRequest> {
  const results=new Map<string,AIResult>();
  const identity=(request:AIRequest):Extract<RunIdentity,{source:'ai-task-v1'}>=>({source:'ai-task-v1',idempotencyKey:request.idempotencyKey});
  async function update(task:AITask,base:Extract<RunIdentity,{source:'ai-task-v1'}>):Promise<RunUpdate>{
    const current={...base,aiTaskId:task.aiTaskId},artifact=task.output?.artifacts[0];let result=results.get(task.aiTaskId),resultError:RunIssue|undefined;
    if(result&&result.sha256!==artifact?.sha256)result=undefined;
    if(task.status==='succeeded'&&!result){try{result=await client.readResult(task.aiTaskId);
      if(!artifact||result.resultId!==artifact.resultId||result.sha256!==artifact.sha256)throw Object.assign(Error('结果摘要或任务身份不一致，请先核对。'),{code:'RUN_RESULT_MISMATCH',outcomeUnknown:true});
      if(results.size>=16)results.delete(results.keys().next().value!);results.set(task.aiTaskId,result);
    }catch(error){result=undefined;resultError=runIssue(error);}}
    const observation=projectAITask(task,current,result);
    if(resultError)observation.result={state:'unknown',record:null,error:resultError};
    return {receipt:{identity:current,state:'accepted',status:task.status},observation};
  }
  const taskId=(base:RunIdentity)=>{const value=requireTask(base);if(!value.aiTaskId)throw fail('RUN_NOT_READY','原请求尚未取得任务身份，请先核对提交。');return value;};
  const missing=(id:Extract<RunIdentity,{source:'ai-task-v1'}>,unsupported=false):RunUpdate=>({receipt:{identity:id,state:'unknown',status:unsupported?'lookup-unavailable':'missing',error:{code:unsupported?'RUN_LOOKUP_UNSUPPORTED':'RUN_REQUEST_NOT_FOUND',message:unsupported?'此客户端未提供只读请求查询；保留原身份，不能把提交当作查询。':'尚未查到原请求；保留原幂等键，显式重试前不创建任务。',outcomeUnknown:true}}});
  const cancelReceipt=(task:AITask,operationId:string,id:Extract<RunIdentity,{source:'ai-task-v1'}>):RunActionReceipt=>({operationId,state:projectAITask(task,id).stopConfirmed===true&&['cancelled','succeeded','failed'].includes(task.status)?'confirmed':task.timestamps.cancelRequestedAt?'accepted':'unknown',status:task.status});
  const cancel:RunAdapter<AIRequest>['cancel']=async(base,operationId)=>{const id=taskId(base);return cancelReceipt(await client.cancel(id.aiTaskId!),operationId,id);};
  return {source:'ai-task-v1',identity,
    async submit(request){return update(await client.submit(request),identity(request));},
    async retrySubmission(base,request){const id=requireTask(base);if(id.idempotencyKey!==request.idempotencyKey)throw fail('RUN_ARGUMENT','重试必须保留原幂等键和请求。');return update(await client.submit(request),id);},
    async reconcile(base,request){const id=requireTask(base);if(id.idempotencyKey!==request.idempotencyKey)throw fail('RUN_ARGUMENT','核对必须保留原幂等键和请求。');
      if(id.aiTaskId)return update(await client.get(id.aiTaskId),id);
      if(!client.lookup)return missing(id,true);
      const found=await client.lookup(id.idempotencyKey);return found?update(found,id):missing(id);
    },
    async read(base,cursor){const id=requireTask(base);if(!id.aiTaskId)return missing(id,!client.lookup);if(cursor&&cursor.source!=='ai-task-v1')throw fail('RUN_SOURCE_MISMATCH','事件游标不属于此执行路径。');
      const batch=await client.events(id.aiTaskId!,cursor?.source==='ai-task-v1'?cursor.afterSeq:0),next=await update(batch.snapshot,id);
      return {...next,cursor:{source:'ai-task-v1',afterSeq:batch.afterSeq},hasMore:batch.hasMore??batch.afterSeq<batch.snapshot.revision};
    },
    cancel,retryCancel:cancel,
    async cancelStatus(base,operationId){const id=taskId(base);return cancelReceipt(await client.get(id.aiTaskId!),operationId,id);},
  };
}

const desktopReceipt=(operation:ConversationOperation,base:Extract<RunIdentity,{source:'codex-conversations-v1'}>):RunReceipt=>({
  identity:{...base,...(operation.threadId?{threadId:operation.threadId}:{}),...(operation.turnId?{turnId:operation.turnId}:{})},
  state:operation.status==='failed'?'failed':operation.status==='unknown'?'unknown':'accepted',status:operation.status,...(operation.error?{error:operation.error}:{}),
});
const actionReceipt=(operation:ConversationOperation,kind:'cancel'|'answer'):RunActionReceipt=>({operationId:operation.operationId,state:operation.status==='failed'?'failed':operation.status==='unknown'?'unknown':kind==='answer'&&operation.status==='succeeded'?'confirmed':'accepted',status:operation.status,...(operation.error?{error:operation.error}:{}),...(operation.threadId?{native:{threadId:operation.threadId,...(operation.turnId?{turnId:operation.turnId}:{})}}:{})});

export function createDesktopRunAdapter(client:DesktopRunClient):RunAdapter<DesktopRunRequest> {
  const identity=(request:DesktopRunRequest):Extract<RunIdentity,{source:'codex-conversations-v1'}>=>({source:'codex-conversations-v1',operationId:request.params.operationId,...(request.kind==='send'?{threadId:request.params.threadId,...(request.params.expectedTurnId?{turnId:request.params.expectedTurnId}:{})}:{})});
  async function operation(base:Extract<RunIdentity,{source:'codex-conversations-v1'}>):Promise<RunReceipt>{
    try{return desktopReceipt(await client.operation(base.operationId),base);}
    catch(error){if((error as {code?:string}).code==='CODEX_OPERATION_MISSING')return {identity:base,state:'unknown',status:'missing',error:{code:'CODEX_OPERATION_MISSING',message:'尚未查到原操作回执；保留原操作身份，不创建新执行。',outcomeUnknown:true}};throw error;}
  }
  const thread=(base:RunIdentity)=>{const id=requireDesktop(base);if(!id.threadId)throw fail('RUN_NOT_READY','尚未取得原生会话身份，请先核对原操作。');return id;};
  const actionStatus=async(base:RunIdentity,operationId:string,kind:'cancel'|'answer'):Promise<RunActionReceipt>=>{requireDesktop(base);
    try{return actionReceipt(await client.operation(operationId),kind);}catch(error){if((error as {code?:string}).code==='CODEX_OPERATION_MISSING')return {operationId,state:'unknown',status:'missing',error:{code:'CODEX_OPERATION_MISSING',message:'尚未查到原交互回执；保留原身份，不重发。',outcomeUnknown:true}};throw error;}
  };
  const cancel:RunAdapter<DesktopRunRequest>['cancel']=async(base,operationId)=>{const id=thread(base),turnId=conversationAnchor(id);if(!turnId)throw fail('RUN_NOT_READY','停止需要准确的原轮次身份。');return actionReceipt(await client.interrupt({operationId,threadId:id.threadId!,expectedTurnId:turnId}),'cancel');};
  const answer:NonNullable<RunAdapter<DesktopRunRequest>['answer']>=async(base,input,operationId)=>{const id=thread(base);if(!conversationAnchor(id)||conversationAnchor(id)!==input.turnId)throw fail('RUN_ARGUMENT','回答必须属于当前原轮次。');
      if(!input.answers||!Object.keys(input.answers).length||Object.values(input.answers).some(value=>typeof value!=='string'||!value.trim()||value.length>8000))throw fail('RUN_ARGUMENT','每题只接受一个有效字符串回答。');
      return actionReceipt(await client.answer({operationId,threadId:id.threadId!,version:input.version,request:input.request,answers:Object.fromEntries(Object.entries(input.answers).map(([key,value])=>[key,[value]]))}),'answer');
    };
  return {source:'codex-conversations-v1',identity,
    async submit(request){const result=await (request.kind==='create'?client.create(request.params):client.send(request.params));return {receipt:desktopReceipt(result,identity(request))};},
    async retrySubmission(base,request){const id=requireDesktop(base);if(id.operationId!==request.params.operationId)throw fail('RUN_ARGUMENT','重试必须保留原操作编号。');
      const result=await (request.kind==='create'?client.create(request.params):client.send(request.params));return {receipt:desktopReceipt(result,id)};
    },
    async reconcile(base,request){const id=requireDesktop(base);if(id.operationId!==request.params.operationId)throw fail('RUN_ARGUMENT','核对必须使用原操作编号。');return {receipt:await operation(id)};},
    async read(base,cursor){const id=requireDesktop(base);if(cursor&&cursor.source!=='codex-conversations-v1')throw fail('RUN_SOURCE_MISMATCH','事件游标不属于此执行路径。');
      const receipt=await operation(id),current=requireDesktop(receipt.identity);if(receipt.state==='failed'||!current.threadId||!current.turnId)return {receipt};
      if(current.continuation){const linked=await client.operation(current.continuation.operationId);
        if(linked.method!=='answer'||linked.status!=='succeeded'||linked.threadId!==current.threadId||linked.turnId!==current.continuation.turnId)throw Object.assign(Error('后续轮次尚未取得原公开回答的确认，请继续核对原交互。'),{code:'RUN_CONTINUATION_UNCONFIRMED',outcomeUnknown:true});
      }
      if(cursor?.source==='codex-conversations-v1'){
        const batch=await client.events(current.threadId,cursor.version);return {receipt,...(batch.snapshot?{observation:projectConversation(batch.snapshot,current)}:{}),cursor:{source:'codex-conversations-v1',version:batch.version}};
      }
      const snapshot=await client.read(current.threadId);return {receipt,observation:projectConversation(snapshot,current),cursor:{source:'codex-conversations-v1',version:snapshot.version}};
    },
    cancel,retryCancel:cancel,
    cancelStatus:(base,operationId)=>actionStatus(base,operationId,'cancel'),
    answer,retryAnswer:answer,
    answerStatus:(base,operationId)=>actionStatus(base,operationId,'answer'),
    async openNative(base){const id=thread(base);return client.openDesktop(id.threadId!);},
  };
}
