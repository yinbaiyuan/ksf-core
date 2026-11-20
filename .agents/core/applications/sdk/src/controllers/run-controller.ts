import {randomId} from '../random-id.ts';
import {runIssue} from './run-adapters.ts';
import type {RunAdapter,RunIdentity,RunView,RunUpdate,RunAnswer,RunCheckpoint,RunActionReceipt} from './run-types.ts';
import {conversationAnchor} from './run-projections.ts';

const fail=(code:string,message:string)=>Object.assign(Error(message),{code,outcomeUnknown:false});
const terminal=(phase:string)=>['succeeded','failed','cancelled'].includes(phase);
const actionPending=(value:RunView)=>[value.cancellation,value.answer].some(item=>item&&['accepted','unknown'].includes(item.state));
function freezeOwned(value:unknown):void {if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freezeOwned);Object.freeze(value);}}
function copy<T>(value:T):T {
  const next=structuredClone(value),seen=new Set<object>();
  const freeze=(item:unknown):void=>{if(!item||typeof item!=='object'||Object.isFrozen(item))return;
    if(seen.has(item)||!Array.isArray(item)&&![Object.prototype,null].includes(Object.getPrototypeOf(item)))throw TypeError('运行锚点需要无循环的普通数据。');
    seen.add(item);Object.values(item).forEach(freeze);seen.delete(item);Object.freeze(item);
  };freeze(next);return next;
}
const sameRequest=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const sameIdentity=(a:RunIdentity,b:RunIdentity)=>a.source===b.source&&(a.source==='ai-task-v1'&&b.source==='ai-task-v1'?a.idempotencyKey===b.idempotencyKey&&(!a.aiTaskId||!b.aiTaskId||a.aiTaskId===b.aiTaskId):a.source==='codex-conversations-v1'&&b.source==='codex-conversations-v1'&&a.operationId===b.operationId&&(!a.threadId||!b.threadId||a.threadId===b.threadId)&&(!a.turnId||!b.turnId||a.turnId===b.turnId));

/** A view of service facts. Watching/unmounting never cancels business execution. */
export class RunController<Request> {
  private adapter:RunAdapter<Request>;
  private state:RunView<Request>;
  private listeners=new Set<()=>void>();
  private request:Request|null=null;
  private cursor:Parameters<RunAdapter<Request>['read']>[1];
  private generation=0;
  private submitting:Promise<void>|null=null;
  private reading:Promise<void>|null=null;
  private action:Promise<void>|null=null;
  private actionKind:'cancel'|'answer'|null=null;
  private cancelIdentity:{operationId:string;baseVersion?:string}|undefined;
  private answerIdentity:{operationId:string;input:RunAnswer}|undefined;
  private operationId:()=>string;
  private preserve?:(checkpoint:RunCheckpoint<Request>,kind:'submit'|'cancel'|'answer')=>Promise<void>;
  constructor(adapter:RunAdapter<Request>,options:{checkpoint?:RunCheckpoint<Request>;operationId?:()=>string;preserve?:(checkpoint:RunCheckpoint<Request>,kind:'submit'|'cancel'|'answer')=>Promise<void>}={}) {
    this.adapter=adapter;this.operationId=options.operationId??randomId;
    this.preserve=options.preserve;
    this.state=copy({source:adapter.source,identity:null,submission:{state:'idle',receipt:null},observation:null,connection:'idle',pending:null,cancellation:null,answer:null,previousResults:[],error:null});
    if(options.checkpoint){const point=copy(options.checkpoint);
      if(point.schemaVersion!==1||point.source!==adapter.source||!Array.isArray(point.previousResults)||!sameIdentity(adapter.identity(point.request),point.identity))throw fail('RUN_ARGUMENT','运行锚点版本或原请求身份不一致。');
      this.request=point.request;this.cancelIdentity=point.cancellation;this.answerIdentity=point.answer;
      this.publish({identity:point.identity,pending:{identity:point.identity,request:point.request},submission:{state:'unknown',receipt:null},previousResults:point.previousResults.slice(-5)});
      // Restored running/connected flags are never treated as new service facts.
    }
  }
  getSnapshot=():RunView<Request>=>this.state;
  subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private async preserveIntent(kind:'submit'|'cancel'|'answer'):Promise<void>{if(!this.preserve)return;try{await this.preserve(this.getCheckpoint()!,kind);}catch(error){throw Object.assign(fail('RUN_CHECKPOINT_FAILED','恢复记录未确认保存，本次操作未派发。'),{cause:error});}}
  private publish(change:Partial<RunView<Request>>):void {freezeOwned(change);this.state=Object.freeze({...this.state,...change});for(const listener of this.listeners)listener();}
  private stopObserved(fact:RunView<Request>['observation']):boolean {return fact?.stopConfirmed===true&&(terminal(fact.phase)||this.cancelIdentity?.baseVersion!==undefined&&fact.version!==this.cancelIdentity.baseVersion);}
  private acceptAnswer(result:RunActionReceipt):void {
    const identity=this.state.identity,native=result.native;
    if(identity?.source==='codex-conversations-v1'&&result.state==='confirmed'&&native&&native.threadId===identity.threadId&&native.turnId&&native.turnId!==conversationAnchor(identity)){
      const prior=this.state.observation?.result.record;this.cursor=undefined;
      this.publish({answer:copy(result),identity:copy({...identity,continuation:{operationId:result.operationId,turnId:native.turnId}}),observation:null,
        previousResults:prior&&prior.persistence!=='service-reported'?[...this.state.previousResults.filter(value=>value.runId!==prior.runId),prior].slice(-5):this.state.previousResults});
    }else this.publish({answer:copy(result)});
  }
  private apply(update:RunUpdate):void {
    const identity=update.observation?.identity??update.receipt?.identity??this.state.identity;
    if(identity&&this.state.identity&&!sameIdentity(identity,this.state.identity))throw Object.assign(Error('不能把其他请求的更新归入当前运行；原提交结果仍待核对。'),{code:'RUN_SOURCE_MISMATCH',outcomeUnknown:true});
    if(update.cursor)this.cursor=copy(update.cursor);
    const receipt=update.receipt?copy(update.receipt):undefined,observation=update.observation?copy(update.observation):this.state.observation;
    const cancellation=this.state.cancellation&&this.stopObserved(observation)?{...this.state.cancellation,state:'confirmed' as const}:this.state.cancellation;
    this.publish({identity:identity?copy(identity):null,connection:'connected',...(receipt?{submission:{state:receipt.state,receipt},pending:receipt.state==='unknown'&&this.request&&identity?copy({request:this.request,identity}):null}:{}),observation,cancellation,
      error:receipt?.error??update.observation?.error??null});
  }
  submit=(request:Request):Promise<void>=>{
    if(this.request!==null&&sameRequest(request,this.request))return this.submitting??this.refresh();
    if(this.submitting||this.action||actionPending(this.state)||this.state.submission.state==='unknown'||this.state.observation&&(!terminal(this.state.observation.phase)||this.state.observation.stopConfirmed!==true))return Promise.reject(fail('RUN_NOT_READY','先核对当前请求及停止事实，再开始另一项运行。'));
    const immutable=copy(request),identity=copy(this.adapter.identity(immutable));
    if(identity.source!==this.adapter.source)return Promise.reject(fail('RUN_SOURCE_MISMATCH','适配器返回了其他路径的请求身份。'));
    const generation=++this.generation,prior=this.state.observation?.result.record;
    this.request=immutable;this.cursor=undefined;this.cancelIdentity=undefined;this.answerIdentity=undefined;
    const previousResults=prior&&prior.persistence!=='service-reported'?[...this.state.previousResults.filter(value=>value.runId!==prior.runId),prior].slice(-5):this.state.previousResults;
    this.publish({identity,submission:{state:'submitting',receipt:null},pending:copy({identity,request:immutable}),observation:null,connection:'connecting',cancellation:null,answer:null,previousResults,error:null});
    this.submitting=(async()=>{
      try{if(this.preserve)await this.preserveIntent('submit');const update=await this.adapter.submit(immutable);if(generation===this.generation)this.apply(update);}
      catch(error){if(generation===this.generation){const problem=runIssue(error);this.publish({submission:{state:problem.outcomeUnknown?'unknown':'failed',receipt:null},connection:problem.outcomeUnknown?'disconnected':'connected',pending:problem.outcomeUnknown?copy({identity,request:immutable}):null,error:problem});}}
      finally{this.submitting=null;}
    })();return this.submitting;
  };
  refresh=():Promise<void>=>{
    if(this.submitting)return this.submitting;if(this.reading)return this.reading;
    const identity=this.state.identity,request=this.request;if(!identity||request===null||this.state.submission.state==='failed')return Promise.resolve();
    const generation=this.generation;
    this.reading=(async()=>{
      try{
        if(this.state.submission.state==='unknown'){const update=await this.adapter.reconcile(identity,request);if(generation!==this.generation)return;this.apply(update);}
        const current=this.state.identity;if(!current||generation!==this.generation||this.state.submission.state==='failed')return;
        let more=false;do{const update=await this.adapter.read(current,this.cursor);if(generation!==this.generation)return;this.apply(update);more=update.hasMore===true;}while(more);
        if(this.cancelIdentity&&this.adapter.cancelStatus&&this.state.cancellation?.state!=='failed'){const result=await this.adapter.cancelStatus(current,this.cancelIdentity.operationId);if(generation!==this.generation)return;this.publish({cancellation:copy(result)});}
        if(this.answerIdentity&&this.adapter.answerStatus&&this.state.answer?.state!=='failed'){const result=await this.adapter.answerStatus(current,this.answerIdentity.operationId);if(generation!==this.generation)return;this.acceptAnswer(result);}
        if(this.state.cancellation&&this.stopObserved(this.state.observation))this.publish({cancellation:Object.freeze({...this.state.cancellation,state:'confirmed'})});
      }catch(error){if(generation===this.generation)this.publish({connection:'disconnected',error:runIssue(error)});}
      finally{this.reading=null;}
    })();return this.reading;
  };
  retryOriginal=async():Promise<void>=>{
    if(this.submitting)return this.submitting;
    const originalGeneration=this.generation;await this.refresh();if(originalGeneration!==this.generation)return;
    const identity=this.state.identity,request=this.request;
    if(this.state.submission.state!=='unknown'&&!(this.state.submission.state==='failed'&&this.state.error?.outcomeUnknown===false))return;
    if(!identity||request===null||!this.adapter.retrySubmission)throw fail('RUN_NOT_READY','此适配器不允许自动重发；请继续核对原身份。');
    const generation=this.generation;this.publish({submission:{state:'submitting',receipt:this.state.submission.receipt}});
    this.submitting=(async()=>{try{if(this.preserve)await this.preserveIntent('submit');const update=await this.adapter.retrySubmission!(identity,request);if(generation===this.generation)this.apply(update);}
      catch(error){if(generation===this.generation){const problem=runIssue(error);this.publish({submission:{state:'unknown',receipt:this.state.submission.receipt},pending:copy({identity,request}),error:{...problem,outcomeUnknown:true}});}}
      finally{this.submitting=null;}})();await this.submitting;
  };
  cancel=():Promise<void>=>{
    if(this.action)return this.actionKind==='cancel'?this.action:Promise.reject(fail('RUN_NOT_READY','回答尚在提交，不能把它当作停止回执。'));
    if(this.cancelIdentity&&this.state.cancellation?.state!=='failed')return this.refresh();
    const identity=this.state.identity,observation=this.state.observation;
    if(!identity||observation?.capabilities.cancel.state!=='available')return Promise.reject(fail('RUN_NOT_READY','当前没有可确认、可停止的原运行。'));
    const operationId=this.operationId(),generation=this.generation;this.cancelIdentity={operationId,baseVersion:observation.version};this.actionKind='cancel';
    this.publish({cancellation:{operationId,state:'unknown',status:'requesting'}});
    this.action=(async()=>{try{if(this.preserve)await this.preserveIntent('cancel');const result=await this.adapter.cancel(identity,operationId);if(generation===this.generation)this.publish({cancellation:copy(result)});}
      catch(error){if(generation===this.generation){const problem=runIssue(error);this.publish({cancellation:{operationId,state:problem.outcomeUnknown?'unknown':'failed',status:'unconfirmed',error:problem}});}}
      finally{this.action=null;this.actionKind=null;}})();return this.action;
  };
  answer=(input:RunAnswer):Promise<void>=>{
    if(this.action)return this.actionKind==='answer'&&this.answerIdentity&&sameRequest(input,this.answerIdentity.input)?this.action:Promise.reject(fail('RUN_NOT_READY','当前交互仍在提交，请先核对原操作。'));
    const identity=this.state.identity,observation=this.state.observation;
    if(!identity||!this.adapter.answer||observation?.capabilities.publicQuestions.state!=='available')return Promise.reject(fail('RUN_ARGUMENT','此路径或当前状态不支持公开回答，请使用原生入口。'));
    if(this.state.cancellation&&['accepted','unknown'].includes(this.state.cancellation.state))return Promise.reject(fail('RUN_NOT_READY','停止请求尚待核对，不能继续提交回答。'));
    if(this.answerIdentity&&this.state.answer?.state!=='failed'&&(this.state.answer?.state!=='confirmed'||sameRequest(input,this.answerIdentity.input)))return this.refresh();
    if(!observation.questions.some(q=>q.version===input.version&&q.turnId===input.turnId&&q.request.type===input.request.type&&q.request.value===input.request.value))return Promise.reject(fail('RUN_ARGUMENT','问题版本或原生身份已变化，请重新读取。'));
    const operationId=this.operationId(),immutable=copy(input),generation=this.generation;this.answerIdentity={operationId,input:immutable};this.actionKind='answer';
    this.publish({answer:{operationId,state:'unknown',status:'requesting'}});
    this.action=(async()=>{try{if(this.preserve)await this.preserveIntent('answer');const result=await this.adapter.answer!(identity,immutable,operationId);if(generation===this.generation)this.acceptAnswer(result);}
      catch(error){if(generation===this.generation){const problem=runIssue(error);this.publish({answer:{operationId,state:problem.outcomeUnknown?'unknown':'failed',status:'unconfirmed',error:problem}});}}
      finally{this.action=null;this.actionKind=null;}})();return this.action;
  };
  private retryInteraction=async(kind:'cancel'|'answer'):Promise<void>=>{
    if(this.action){if(this.actionKind===kind)return this.action;throw fail('RUN_NOT_READY','其他交互仍在提交。');}
    const originalGeneration=this.generation;await this.refresh();if(originalGeneration!==this.generation)return;
    const identity=this.state.identity,receipt=kind==='cancel'?this.state.cancellation:this.state.answer;
    if(!identity||receipt?.state!=='unknown')return;
    const previous=kind==='cancel'?this.cancelIdentity:this.answerIdentity;
    if(!previous||kind==='cancel'&&!this.adapter.retryCancel||kind==='answer'&&(!this.adapter.retryAnswer||!this.answerIdentity))throw fail('RUN_NOT_READY','此适配器没有可安全重试的原交互，请继续核对原身份。');
    this.actionKind=kind;
    this.action=(async()=>{try{
      if(this.preserve)await this.preserveIntent(kind);
      const result=kind==='cancel'?await this.adapter.retryCancel!(identity,previous.operationId):await this.adapter.retryAnswer!(identity,this.answerIdentity!.input,previous.operationId);
      if(originalGeneration===this.generation){if(kind==='answer')this.acceptAnswer(result);else this.publish({cancellation:copy(result)});}
    }catch(error){if(originalGeneration===this.generation){const result={...receipt,error:{...runIssue(error),outcomeUnknown:true}};this.publish(kind==='cancel'?{cancellation:result}:{answer:result});}}
      finally{this.action=null;this.actionKind=null;}})();await this.action;
  };
  retryCancellation=():Promise<void>=>this.retryInteraction('cancel');
  retryAnswer=():Promise<void>=>this.retryInteraction('answer');
  openNative=async():Promise<unknown>=>{if(!this.state.identity||!this.adapter.openNative)throw fail('RUN_ARGUMENT','此路径没有原生界面入口。');return this.adapter.openNative(this.state.identity);};
  getCheckpoint=():RunCheckpoint<Request>|null=>this.request===null||!this.state.identity?null:copy({schemaVersion:1,source:this.adapter.source,request:this.request,identity:this.state.identity,...(this.cancelIdentity?{cancellation:this.cancelIdentity}:{}),...(this.answerIdentity?{answer:this.answerIdentity}:{}),previousResults:this.state.previousResults});
  /** Each watcher owns its timer. Disposing it does not send cancel/interrupt. */
  watch=({intervalMs=1000}:{intervalMs?:number}={}):(()=>void)=>{
    let disposed=false,running=false,timer:ReturnType<typeof setTimeout>|undefined;
    const needed=()=>{const fact=this.state.observation;return !!this.state.identity&&this.state.submission.state!=='failed'&&(!(fact&&terminal(fact.phase)&&fact.stopConfirmed===true)||actionPending(this.state)||this.state.submission.state==='unknown');};
    const tick=async()=>{timer=undefined;if(disposed||!needed())return;running=true;try{await this.refresh();}finally{running=false;}
      if(!disposed&&needed())timer=setTimeout(()=>void tick(),Math.max(250,intervalMs));
    };
    const changed=()=>{if(!needed()){clearTimeout(timer);timer=undefined;return;}if(!disposed&&!running&&timer===undefined)timer=setTimeout(()=>void tick(),0);};
    const off=this.subscribe(changed);changed();return()=>{disposed=true;clearTimeout(timer);off();};
  };
}
