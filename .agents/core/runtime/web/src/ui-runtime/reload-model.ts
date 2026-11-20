import {randomId} from '../../../../applications/sdk/src/random-id.ts';
import type {CloseRequest} from '../../../../applications/sdk/src/application-session';
export type ReloadPreparation={status:'ready';validate:()=>boolean}|{status:'cancelled'}|{status:'failed';message:string};
export interface ReloadParticipant {id:string;name:string;prepare:(request:CloseRequest)=>ReloadPreparation|Promise<ReloadPreparation>}
export interface ReloadSnapshot<T> {topology:string;value:T}
export interface ReloadReceipt {resumeToken:string}
export interface ReloadState {readonly phase:'idle'|'preparing'|'committing'|'reloading'|'failed';readonly request:CloseRequest|null;readonly participant:string|null;readonly error:string|null}
interface ReloadOptions<T>{participants:()=>readonly ReloadParticipant[];snapshot:()=>ReloadSnapshot<T>;freeze:()=>()=>void;checkpoint:(request:CloseRequest,value:T)=>Promise<ReloadReceipt>;navigate:(receipt:ReloadReceipt)=>void;cancelNavigation:(receipt:ReloadReceipt)=>void}
/** One document transaction; no participant is unmounted by prepare or checkpoint failure. */
export class DocumentReloadCoordinator<T> {
 private state:ReloadState=Object.freeze({phase:'idle',request:null,participant:null,error:null});
 private listeners=new Set<()=>void>();private pending:Promise<boolean>|null=null;private unlock:(()=>void)|undefined;private receipt:ReloadReceipt|undefined;private disposed=false;private abort:AbortController|undefined;
 private readonly options:ReloadOptions<T>;
 constructor(options:ReloadOptions<T>){this.options=options;}
 getSnapshot=():ReloadState=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(state:ReloadState){this.state=Object.freeze(state);for(const listener of this.listeners)listener();}
 private unfreeze(){this.unlock?.();this.unlock=undefined;}
 request=(reason:'reload'|'upgrade'='reload'):Promise<boolean>=>{
  if(this.disposed)return Promise.resolve(false);if(this.pending)return this.pending;if(this.state.phase==='reloading')return Promise.resolve(true);
  const controller=new AbortController();this.abort=controller;const request=Object.freeze({requestId:randomId(),reason,signal:controller.signal});
  const cancelled=()=>Object.assign(Error('本次重载已取消，当前页面已保留。'),{code:'UI_RELOAD_CANCELLED'});
  const wait=<V>(value:V|Promise<V>):Promise<V>=>new Promise((resolve,reject)=>{const abort=()=>{controller.signal.removeEventListener('abort',abort);reject(cancelled());};controller.signal.addEventListener('abort',abort,{once:true});Promise.resolve(value).then(result=>{controller.signal.removeEventListener('abort',abort);resolve(result);},error=>{controller.signal.removeEventListener('abort',abort);reject(error);});if(controller.signal.aborted)abort();});
  this.pending=Promise.resolve().then(async()=>{
   try{
    if(this.disposed)return false;
    if(controller.signal.aborted)throw cancelled();
    const before=this.options.snapshot(),participants=[...this.options.participants()],identities=participants.map(p=>p.id);
    if(new Set(identities).size!==identities.length)throw Error('重载参与者身份重复，当前页面已保留。');
    this.unlock=this.options.freeze();const prepared:{participant:ReloadParticipant;result:Extract<ReloadPreparation,{status:'ready'}>}[]=[];
    for(const participant of participants){
     if(this.disposed)return false;this.publish({phase:'preparing',request,participant:participant.name,error:null});
     const result=await wait(participant.prepare(request));
     if(result?.status==='cancelled'){this.publish({phase:'idle',request:null,participant:null,error:null});return false;}
     if(result?.status!=='ready'||typeof result.validate!=='function')throw Error(participant.name+'：'+(result?.status==='failed'?result.message:'尚未提供可核对的重载保全协议。'));
     prepared.push({participant,result});
    }
    const validate=()=>{
     if(this.disposed)throw Error('页面已结束，本次重载取消。');
     if(controller.signal.aborted)throw cancelled();
     if(this.options.snapshot().topology!==before.topology||this.options.participants().map(p=>p.id).join('\0')!==identities.join('\0'))throw Error('窗口或应用已变化，请重新检查后重载。');
     for(const entry of prepared)if(entry.result.validate()!==true)throw Error(entry.participant.name+'：准备后又有新内容，当前页面已保留。');
    };
    validate();this.publish({phase:'committing',request,participant:null,error:null});
    if(controller.signal.aborted)throw cancelled();
    const receipt=await wait(this.options.checkpoint(request,before.value));
    if(!receipt||typeof receipt.resumeToken!=='string'||!receipt.resumeToken)throw Error('窗口恢复记录未确认，当前页面已保留。');
    // The durable acknowledgement may take time. Recheck all tokens synchronously at the actual navigation boundary.
    validate();this.receipt=receipt;this.options.navigate(receipt);this.publish({phase:'reloading',request,participant:null,error:null});return true;
   }catch(error){if(!this.disposed)this.publish(controller.signal.aborted?{phase:'idle',request:null,participant:null,error:null}:{phase:'failed',request,participant:null,error:error instanceof Error?error.message:String(error)});return false;}
   finally{this.pending=null;if(this.abort===controller)this.abort=undefined;if(this.state.phase!=='reloading')this.unfreeze();}
  });this.publish({phase:'preparing',request,participant:null,error:null});return this.pending;
 };
 cancelPreparation=():boolean=>{if(!this.abort||!['preparing','committing'].includes(this.state.phase))return false;this.abort.abort();return true;};
 dismissFailure=()=>{if(this.state.phase==='failed')this.publish({phase:'idle',request:null,participant:null,error:null});};
 /** Stop the pending browser navigation and clear its local resume handle before editing resumes. */
 continueCurrentPage=():boolean=>{if(this.state.phase!=='reloading'||!this.receipt)return false;try{this.options.cancelNavigation(this.receipt);}catch(error){this.publish({...this.state,error:error instanceof Error?error.message:String(error)});return false;}this.receipt=undefined;this.unfreeze();this.publish({phase:'idle',request:null,participant:null,error:null});return true;};
 dispose=()=>{this.disposed=true;this.abort?.abort();this.unfreeze();this.listeners.clear();};
}
