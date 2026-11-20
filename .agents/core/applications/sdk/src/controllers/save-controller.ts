import {randomId} from '../random-id.ts';

export type SaveStatus = 'loading'|'pending'|'saving'|'saved'|'failed'|'conflict'|'unknown';
export interface VersionedValue<T> {value:T; revision:string|null}
export interface SaveAttempt<T> {
  readonly operationId:string;
  readonly value:T;
  readonly baseRevision:string|null;
  readonly draftVersion:number;
}
export interface SaveIssue {code:string; message:string; outcomeUnknown:boolean}
export type SaveReconciliation<T> =
  | {kind:'saved'; record:VersionedValue<T>; confirmation:'value'|'operation'}
  | {kind:'failed'; issue:SaveIssue; record?:VersionedValue<T>}
  | {kind:'conflict'; record:VersionedValue<T>}
  | {kind:'unknown'; record?:VersionedValue<T>; retrySameAttempt?:boolean};
export interface SaveAdapter<T> {
  read():Promise<VersionedValue<T>>;
  /** Always submit this exact snapshot and base. An operation id is not an idempotency guarantee. */
  write(attempt:SaveAttempt<T>):Promise<VersionedValue<T>>;
  reconcile?(attempt:SaveAttempt<T>):Promise<SaveReconciliation<T>>;
  classifyError?(error:unknown):'failed'|'conflict'|'unknown';
}
export interface SaveView<T> {
  readonly value:T;
  readonly committed:VersionedValue<T>|null;
  readonly remote:VersionedValue<T>|null;
  readonly draftVersion:number;
  readonly status:SaveStatus;
  readonly ready:boolean;
  readonly dirty:boolean;
  readonly connection:'online'|'unavailable';
  readonly pending:SaveAttempt<T>|null;
  readonly confirmation:'value'|'operation'|null;
  /** True only after this adapter has explicitly allowed replay of the original CAS attempt. */
  readonly canRetrySameAttempt?:boolean;
  readonly error:SaveIssue|null;
}
export interface SaveControllerOptions<T> {
  initial:T;
  checkpoint?:SaveCheckpoint<T>;
  validate?:(value:T)=>unknown;
  equal?:(left:T,right:T)=>boolean;
  operationId?:()=>string;
  /** Persist the original intent before a domain write. Rejection prevents dispatch. */
  preserve?:(checkpoint:SaveCheckpoint<T>)=>Promise<void>;
}
export interface SaveCheckpoint<T> {
  readonly schemaVersion:1;
  readonly value:T;
  readonly committed:VersionedValue<T>|null;
  readonly draftVersion:number;
  readonly pending:SaveAttempt<T>|null;
}
const equalJSON=(left:unknown,right:unknown):boolean=>{
  if(Object.is(left,right))return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
  const keys=Object.keys(left),other=Object.keys(right);
  return keys.length===other.length&&keys.every(key=>Object.hasOwn(right,key)&&equalJSON((left as Record<string,unknown>)[key],(right as Record<string,unknown>)[key]));
};
function frozen<T>(value:T):T {
  const copy=structuredClone(value),visiting=new Set<object>();
  const freeze=(item:unknown):void=>{
    if(!item||typeof item!=='object'||Object.isFrozen(item))return;
    if(visiting.has(item)||!Array.isArray(item)&&![Object.prototype,null].includes(Object.getPrototypeOf(item)))throw TypeError('保存快照需要无循环的普通对象、数组或标量。');
    visiting.add(item);Object.values(item).forEach(freeze);visiting.delete(item);Object.freeze(item);
  };
  freeze(copy);return copy;
}
function issue(error:unknown,outcomeUnknown:boolean):SaveIssue {
  const value=error as {code?:string;message?:string};
  return {code:value?.code??(outcomeUnknown?'SAVE_RESULT_UNKNOWN':'SAVE_FAILED'),message:value?.message??String(error),outcomeUnknown};
}
const blocked=(message:string)=>Object.assign(Error(message),{code:'SAVE_UNRESOLVED'});

/** One explicit, serial writer. Subscription disposal never cancels an already submitted operation. */
export class SaveController<T> {
  private state:SaveView<T>;
  private listeners=new Set<()=>void>();
  private reading:Promise<void>|null=null;
  private writing:Promise<void>|null=null;
  private requested=false;
  private retrySameAttempt=false;
  private equal:(left:T,right:T)=>boolean;
  private validate:(value:T)=>unknown;
  private operationId:()=>string;
  private adapter:SaveAdapter<T>;
  private preserve?:SaveControllerOptions<T>['preserve'];
  constructor(adapter:SaveAdapter<T>,options:SaveControllerOptions<T>) {
    this.adapter=adapter;
    this.preserve=options.preserve;
    this.validate=options.validate??(()=>{});this.validate(options.initial);
    this.equal=options.equal??equalJSON;this.operationId=options.operationId??randomId;
    this.state=Object.freeze({value:frozen(options.initial),committed:null,remote:null,draftVersion:0,status:'loading',ready:false,dirty:false,connection:'online',pending:null,confirmation:null,error:null});
    if(options.checkpoint){
      const c=frozen(options.checkpoint);
      if(c.schemaVersion!==1||!Number.isSafeInteger(c.draftVersion)||c.draftVersion<0)throw TypeError('不支持的保存检查点。');
      this.validate(c.value);const committed=c.committed?this.record(c.committed):null;
      if(c.pending){const a=c.pending;this.validate(a.value);if(typeof a.operationId!=='string'||!a.operationId||!(a.baseRevision===null||typeof a.baseRevision==='string')||!Number.isSafeInteger(a.draftVersion)||a.draftVersion<0||a.draftVersion>c.draftVersion||!committed||a.baseRevision!==committed.revision)throw TypeError('保存检查点缺少原提交身份或基准。');}
      this.state=Object.freeze({...this.state,value:c.value,committed,draftVersion:c.draftVersion,pending:c.pending,dirty:!committed||!this.equal(c.value,committed.value),status:c.pending?'unknown':'loading',connection:'unavailable'});
    }
  }
  getSnapshot=():SaveView<T>=>this.state;
  getCheckpoint=():SaveCheckpoint<T>=>frozen({schemaVersion:1,value:this.state.value,committed:this.state.committed,draftVersion:this.state.draftVersion,pending:this.state.pending});
  subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(change:Partial<SaveView<T>>):void {
    const next={...this.state,...change};
    this.state=Object.freeze({...next,canRetrySameAttempt:this.retrySameAttempt&&next.status==='unknown'&&next.connection==='online'&&!!next.pending});
    for(const listener of this.listeners)listener();
  }
  private record(value:VersionedValue<T>):VersionedValue<T> {
    if(!value||!(value.revision===null||typeof value.revision==='string'))throw TypeError('保存适配器必须返回明确的版本。');
    this.validate(value.value);return frozen(value);
  }
  update=(change:T|((current:T)=>T)):void=>{
    const value=typeof change==='function'?(change as (current:T)=>T)(this.state.value):change;
    this.validate(value);const copy=frozen(value),dirty=!this.state.committed||!this.equal(copy,this.state.committed.value);
    this.publish({value:copy,draftVersion:this.state.draftVersion+1,dirty,
      status:this.state.pending?this.state.status:this.state.status==='conflict'?'conflict':dirty?'pending':this.state.ready?'saved':'loading',
      error:this.state.pending||this.state.status==='conflict'?this.state.error:null});
  };
  /** Polling is read-only. A dirty/held draft never silently acquires a newer write base. */
  refresh=(options:{preserveDraft?:boolean}={}):Promise<void>=>{
    if(this.reading)return this.reading;
    if(this.writing)return this.writing;
    if(this.state.pending)return this.reconcile();
    this.reading=(async()=>{
      try {
        const record=this.record(await this.adapter.read());
        if(this.state.dirty||options.preserveDraft){
          if(!this.state.committed||record.revision!==this.state.committed.revision)this.publish({remote:record,ready:true,status:'conflict',connection:'online',error:issue(Object.assign(Error('已保存值与当前草稿的基准不同；当前草稿已保留。'),{code:'SAVE_CONFLICT'}),false)});
          else this.publish({connection:'online',ready:true,...(this.state.status==='loading'?{status:this.state.dirty?'pending' as const:'saved' as const}:{})});
          return;
        }
        this.publish({value:record.value,committed:record,remote:null,ready:true,dirty:false,status:'saved',connection:'online',error:null,confirmation:null});
      } catch(error) {
        this.publish({connection:'unavailable',...(!this.state.dirty?{status:'failed' as const,error:issue(error,false)}:{})});
      } finally {this.reading=null;}
    })();return this.reading;
  };
  save=():Promise<void>=>{
    if(this.writing){this.requested=true;return this.writing;}
    if(!this.state.ready||!this.state.committed||this.state.pending||this.state.status==='conflict'||!this.state.dirty)return Promise.resolve();
    this.requested=true;
    this.writing=(async()=>{
      try {
        while(this.requested&&this.state.dirty&&!this.state.pending&&this.state.status!=='conflict'){
          this.requested=false;
          const attempt=frozen({operationId:this.operationId(),value:this.state.value,baseRevision:this.state.committed!.revision,draftVersion:this.state.draftVersion});
          await this.submit(attempt);
          if(['failed','unknown','conflict'].includes(this.state.status))break;
        }
      } finally {this.writing=null;this.requested=false;}
    })();return this.writing;
  };
  private accept(record:VersionedValue<T>,attempt:SaveAttempt<T>,confirmation:'value'|'operation'):void {
    const newer=this.state.draftVersion!==attempt.draftVersion;
    const value=newer?this.state.value:record.value,dirty=!this.equal(value,record.value);
    this.retrySameAttempt=false;
    this.publish({committed:record,value,remote:null,pending:null,ready:true,dirty,status:dirty?'pending':'saved',connection:'online',confirmation,error:null});
  }
  private async submit(attempt:SaveAttempt<T>,priorUnknown=false):Promise<void> {
    this.retrySameAttempt=false;this.publish({pending:attempt,status:'saving',error:null});
    let dispatched=false;
    try {if(this.preserve)await this.preserve(this.getCheckpoint());dispatched=true;this.accept(this.record(await this.adapter.write(attempt)),attempt,'operation');}
    catch(error) {
      if(!dispatched){this.publish({pending:priorUnknown?attempt:null,status:priorUnknown?'unknown':'failed',error:issue(Object.assign(Error('恢复记录未确认保存，本次业务写入未派发。'),{code:'SAVE_CHECKPOINT_FAILED',cause:error}),priorUnknown)});return;}
      let kind:'failed'|'conflict'|'unknown'='unknown';
      try{kind=this.adapter.classifyError?.(error)??'unknown';}catch{/* A broken classifier cannot make a submitted write look rejected. */}
      if(kind==='failed'&&!priorUnknown){this.publish({pending:null,status:'failed',error:issue(error,false)});return;}
      if(kind==='failed')kind='unknown'; // This retry's rejection does not settle an older uncertain write.
      this.publish({status:kind,error:issue(error,kind==='unknown')});
      if(this.adapter.reconcile)await this.reconcileAttempt(attempt,kind==='conflict');
      else if(kind==='conflict')this.publish({pending:null});
    }
  }
  private async reconcileAttempt(attempt:SaveAttempt<T>,knownConflict=false):Promise<void> {
    if(!this.adapter.reconcile)return;
    this.retrySameAttempt=false;
    try {
      const result=await this.adapter.reconcile(attempt);
      if(result.kind==='saved'){this.accept(this.record(result.record),attempt,result.confirmation);return;}
      this.retrySameAttempt=result.kind==='unknown'&&result.retrySameAttempt===true;
      const record=result.record?this.record(result.record):null;
      if(result.kind==='conflict'||knownConflict&&result.kind==='unknown')this.publish({pending:null,remote:record,status:'conflict',connection:'online',error:issue(Object.assign(Error('实例版本已变化；草稿未覆盖它，请比较后合并。'),{code:'SAVE_CONFLICT'}),false)});
      else if(result.kind==='failed')this.publish({pending:null,remote:record,status:'failed',connection:'online',error:result.issue});
      else this.publish({status:'unknown',remote:record,connection:'online',error:issue(Error('保存结果尚未确认；保留原请求身份，先核对再重试。'),true)});
    } catch(error) {this.publish({...(knownConflict?{pending:null}:{}),status:knownConflict?'conflict':'unknown',connection:'unavailable',error:issue(error,!knownConflict)});}
  }
  reconcile=():Promise<void>=>{
    if(this.writing)return this.writing;
    if(this.reading)return this.reading;
    const attempt=this.state.pending;if(!attempt)return this.refresh();
    this.reading=this.reconcileAttempt(attempt).finally(()=>{this.reading=null;});return this.reading;
  };
  /** Unknown writes are only replayed when the adapter explicitly permits this exact CAS attempt. */
  retry=async():Promise<void>=>{
    if(this.writing)return this.writing;
    if(!this.state.pending)return this.save();
    await this.reconcile();
    if(this.writing)return this.writing;
    const attempt=this.state.pending;
    if(!attempt||!this.retrySameAttempt)return;
    this.writing=this.submit(attempt,true).finally(()=>{this.writing=null;});await this.writing;
  };
  /** Explicit merge/rebase after the application has shown both versions. */
  merge=(value:T):void=>{
    if(this.writing||this.state.pending||!this.state.remote)throw blocked('先核对未决提交并取得远端版本，再合并。');
    this.validate(value);const record=this.state.remote,copy=frozen(value),dirty=!this.equal(copy,record.value);
    this.publish({committed:record,remote:null,value:copy,draftVersion:this.state.draftVersion+1,ready:true,dirty,status:dirty?'pending':'saved',error:null});
  };
  /** Discard reads current authority first; failure/new editing leaves the preview intact. */
  discard=async():Promise<boolean>=>{
    if(this.writing||this.state.pending)throw blocked('保存仍在处理中或结果待核实，不能丢弃请求身份。');
    const generation=this.state.draftVersion;
    try {
      const record=this.record(await this.adapter.read());
      if(this.state.draftVersion!==generation||this.state.pending||this.writing){this.publish({remote:record,connection:'online'});return false;}
      this.publish({value:record.value,committed:record,remote:null,draftVersion:generation+1,ready:true,dirty:false,status:'saved',connection:'online',error:null,confirmation:null});return true;
    } catch(error) {this.publish({connection:'unavailable',error:issue(error,false)});return false;}
  };
}
