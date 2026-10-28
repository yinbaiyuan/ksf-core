import type { ApplicationBackendContext } from './application-sdk';
export interface ConversationProject {name:string;scope:'current'|'archived'}
export interface ConversationOperation {operationId:string;method:string;status:'queued'|'preparing'|'opening'|'dispatching'|'accepted'|'succeeded'|'unknown'|'failed';threadId:string|null;turnId?:string;error?:{code:string;message:string;outcomeUnknown:boolean};createdAt:string;updatedAt:string}
export interface NativeRequestRef {type:'number'|'string';value:string}
export interface ConversationQuestion {request:NativeRequestRef;turnId:string;questions:{id:string;header?:string;question:string;options?:{label:string;description?:string}[]}[]}
export interface ConversationMessage {id:string;turnId:string;role:'user'|'assistant';text:string;phase?:string;truncated?:boolean}
export interface ConversationSnapshot {threadId:string;version:string;title:string;status:'idle'|'running'|'question'|'approval';turnId:string|null;questions:ConversationQuestion[];approvals:boolean;plan:{text:string;revision:string;turnId:string}|null;messages:ConversationMessage[];ksf:{taskId:string|null;route:unknown;chat:unknown;hookState:'observed'|'unconfirmed'}}
export interface ConversationEvents {version:string;changed:boolean;events:{seq:number;type:'snapshot'}[];snapshot:ConversationSnapshot|null}
export interface ConversationHistory {version:string;total:number;nextOffset:number|null;records:ConversationMessage[]}
export function createCodexConversationsClient(context:Pick<ApplicationBackendContext,'services'>) {
  function call<T>(method:string,params:unknown={}):Promise<T>{if(!context.services)throw new Error('Codex 会话需要 SDK v2 公共服务桥。');return context.services.call<T>('codex-conversations',method,[params]);}
  return {
    check:()=>call<{available:boolean;message?:string;code?:string;contractVersion:'codex-conversations-v1'}>('check'),
    create:(params:{operationId:string;project:ConversationProject;text:string;title?:string})=>call<ConversationOperation>('create',params),
    attach:(params:{taskId:string;project:ConversationProject})=>call<{attached:boolean;threadId?:string;reason?:string}>('attach',params),
    read:(threadId:string)=>call<ConversationSnapshot>('read',{threadId}),
    history:(params:{threadId:string;offset?:number;limit?:number;version?:string})=>call<ConversationHistory>('history',params),
    send:(params:{operationId:string;threadId:string;text:string;mode:'new'|'steer';expectedTurnId?:string})=>call<ConversationOperation>('send',params),
    events:(threadId:string,afterVersion?:string)=>call<ConversationEvents>('events',{threadId,afterVersion}),
    interrupt:(params:{operationId:string;threadId:string;expectedTurnId:string})=>call<ConversationOperation>('interrupt',params),
    answer:(params:{operationId:string;threadId:string;version:string;request?:NativeRequestRef;answers?:Record<string,string[]>;planRevision?:string})=>call<ConversationOperation>('answer',params),
    openDesktop:(threadId:string)=>call<{opened:boolean}>('openDesktop',{threadId}),
    operation:(operationId:string)=>call<ConversationOperation>('operation',{operationId}),
  };
}
