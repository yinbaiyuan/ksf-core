import type { ApplicationBackendContext } from './application-sdk';

export type AIStatus='queued'|'running'|'retry_wait'|'reconciling'|'succeeded'|'failed'|'cancelled';
export interface AIRequest {
  contractVersion:'ai-task-v1'; idempotencyKey:string;profileId:string;instruction:string;
  inputs:({kind:'text';name?:string;text:string}|{kind:'material';materialId:string;sha256:string})[];
  outputSpec:{format:'text';mediaType?:'text/plain'|'text/markdown'}|{format:'json';schema:Record<string,unknown>};
  methodRefs?:[];context?:Record<string,unknown>;requirements?:string[];deadlineAt?:string;
  limits?:{maxAttempts?:number;timeoutMs?:number;maxOutputBytes?:number};
}
export interface AIError {code:string;message:string;outcomeUnknown:boolean}
export interface AIAttempt {attemptId:string;startedAt:string;finishedAt?:string;stopConfirmed:boolean;executionOutcome:'running'|'completed'|'failed'|'unknown';pid?:number;processStart?:string;threadId?:string;turnId?:string;responseId?:string;[key:string]:unknown}
export interface AITimestamps {receivedAt:string;updatedAt:string;startedAt?:string;finishedAt?:string;cancelRequestedAt?:string}
export interface AIResult<T=unknown> {resultId:string;format:'text'|'json';value:T;sha256:string}
export interface AITask<T=unknown> {
  aiTaskId:string;application:{appId:string;version?:string;releaseDigest?:string};status:AIStatus;revision:number;context:Record<string,unknown>;
  output:{format:'text'|'json';value:T;artifacts:{resultId:string;sha256:string}[]}|null;
  warnings:string[];timestamps:AITimestamps;usage:unknown;
  error:AIError|null;
  execution:{executorId:string;profileId:string;profileRevision:number;connectionRevision:number;model:string|null;attempts:AIAttempt[]};
}
export interface AIEvents<T=unknown> {events:{seq:number;type:string;status:AIStatus;at:string}[];afterSeq:number;hasMore?:boolean;snapshot:AITask<T>}
export interface AIServiceDescription {contractVersion:'ai-task-v1';limits:{requestBytes:number;textMaterialBytes:number;uploadBytes:number};profiles:{id:string;model:string|null;capabilities:string[];limits:{maxInputBytes:number;maxOutputBytes:number;timeoutMs:number;maxAttempts:number}}[]}
export interface AIMaterial {materialId:string;version:number;sha256:string;size:number;mimeType:string;name:string}
export function createAIClient(context:Pick<ApplicationBackendContext,'services'>) {
  function call<T>(method:string,...params:unknown[]):Promise<T>{if(!context.services)throw new Error('AI 服务需要 SDK v2 公共服务桥。');return context.services.call<T>('ai',method,params);}
  return {
    describe:()=>call<AIServiceDescription>('describe'),
    submit:<T=unknown>(request:AIRequest)=>call<AITask<T>>('submit',request),
    get:<T=unknown>(id:string)=>call<AITask<T>>('get',id),
    readResult:<T=unknown>(id:string)=>call<AIResult<T>>('readResult',id),
    cancel:<T=unknown>(id:string)=>call<AITask<T>>('cancel',id),
    events:<T=unknown>(id:string,afterSeq=0)=>call<AIEvents<T>>('events',id,afterSeq),
    register:(metadata:{name:string;mimeType:string},text:string)=>call<AIMaterial>('register',metadata,text),
    async *watch<T=unknown>(id:string,{afterSeq=0,signal,intervalMs=1000}:{afterSeq?:number;signal?:AbortSignal;intervalMs?:number}={}) {
      let cursor=afterSeq;
      while(!signal?.aborted){const batch=await call<AIEvents<T>>('events',id,cursor);cursor=batch.afterSeq;yield batch;const more=batch.hasMore??batch.afterSeq<batch.snapshot.revision;if(more)continue;if(['succeeded','failed','cancelled','reconciling'].includes(batch.snapshot.status))return;
        await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(signal?.reason??new Error('已停止订阅。'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},Math.max(250,intervalMs));signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();});
      }
    },
  };
}
