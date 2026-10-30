import type {ApplicationBackendContext} from './application-sdk';
import {createAIClient,type AIRequest,type AITask} from './ai-tasks.ts';
import {createCodexConversationsClient,type ConversationOperation,type ConversationProject} from './codex-conversations.ts';

export interface AIServiceIssue {service:'tasks'|'desktop';code:string;message:string}
export interface AITaskTarget {id:string;kind:'task';provider:'api'|'codex-cli';name:string;profileId:string;executorId:string;model:string|null;capabilities:string[];available:true}
export interface AIDesktopTarget {id:'codex-desktop';kind:'conversation';provider:'codex-desktop';name:string;capabilities:string[];available:boolean;requiresProject:true;issue?:AIServiceIssue}
export type AIServiceTarget=AITaskTarget|AIDesktopTarget;
export interface AIServiceCatalog {targets:AIServiceTarget[];issues:AIServiceIssue[]}
export type AIServiceStartRequest=
 |{kind:'task';profileId:string;request:Omit<AIRequest,'profileId'>}
 |{kind:'conversation';request:{operationId:string;project:ConversationProject;text:string;title?:string}};
export type AIServiceRun<T=unknown>={kind:'task';task:AITask<T>}|{kind:'conversation';operation:ConversationOperation};

/** Discovery is read-only. A selected path keeps its own contract and permissions. */
export function createAIServiceClient(context:Pick<ApplicationBackendContext,'services'>){
 const tasks=createAIClient(context),conversations=createCodexConversationsClient(context);
 function issue(service:AIServiceIssue['service'],error:unknown):AIServiceIssue{const value=error as {code?:string;message?:string};return {service,code:value?.code??'AI_SERVICE_UNAVAILABLE',message:value?.message??'AI 服务暂不可用。'};}
 return {
  tasks,conversations,
  async describe({kind,capabilities=[]}:{kind?:'task'|'conversation';capabilities?:string[]}={}):Promise<AIServiceCatalog>{
   const targets:AIServiceTarget[]=[],issues:AIServiceIssue[]=[];
   await Promise.all([
    kind!=='conversation'&&(async()=>{try{const value=await tasks.describe();const configured=value.profiles.map(profile=>{if(!['api','codex'].includes(profile.kind)||typeof profile.executorId!=='string')throw Object.assign(new Error('当前 Core 未提供执行路径信息，请使用配套版本。'),{code:'AI_SERVICE_CATALOG_UNSUPPORTED'});return {id:'task:'+profile.id,kind:'task' as const,provider:profile.kind==='codex'?'codex-cli' as const:'api' as const,name:profile.id,profileId:profile.id,executorId:profile.executorId,model:profile.model,capabilities:profile.capabilities,available:true as const};});targets.push(...configured);}catch(error){issues.push(issue('tasks',error));}})(),
    kind!=='task'&&(async()=>{let unavailable:AIServiceIssue|undefined;try{const value=await conversations.check();if(!value.available)unavailable=issue('desktop',{code:value.code,message:value.message});}catch(error){unavailable=issue('desktop',error);}if(unavailable)issues.push(unavailable);targets.push({id:'codex-desktop',kind:'conversation',provider:'codex-desktop',name:'Codex Desktop',capabilities:['conversation','project-context','interactive'],available:!unavailable,requiresProject:true,...(unavailable?{issue:unavailable}:{})});})(),
   ]);
   targets.sort((a,b)=>a.kind===b.kind?a.id.localeCompare(b.id):a.kind==='task'?-1:1);issues.sort((a,b)=>a.service.localeCompare(b.service));
   return {targets:targets.filter(target=>capabilities.every(value=>target.capabilities.includes(value))),issues};
  },
  async start<T=unknown>(input:AIServiceStartRequest):Promise<AIServiceRun<T>>{
   if(input?.kind==='task'&&typeof input.profileId==='string'&&input.profileId)return {kind:'task',task:await tasks.submit<T>({...input.request,profileId:input.profileId})};
   if(input?.kind==='conversation')return {kind:'conversation',operation:await conversations.create(input.request)};
   throw Object.assign(new Error('请选择有效的 AI 任务配置或 Codex Desktop 会话。'),{code:'AI_SERVICE_SELECTION_INVALID'});
  },
 };
}
