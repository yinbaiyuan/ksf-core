import {randomId} from '../random-id.ts';
import type {CloseGuard,CloseReason,CloseRequest,CloseResponse,SessionClosePromptState,SessionCloseChoice} from '../application-session.ts';
export type {SessionCloseChoice} from '../application-session.ts';
export interface CloseView {readonly phase:'idle'|'checking'|'closing'|'closed'|'failed';readonly request:CloseRequest|null;readonly error:string|null}
/** Owns one window's close transaction. Repeated close sources share the same promise. */
export class CloseCoordinator {
  private state:CloseView=Object.freeze({phase:'idle',request:null,error:null});
  private listeners=new Set<()=>void>();private pending:Promise<boolean>|null=null;
  private readonly options:{guards:()=>Iterable<CloseGuard>;commit:(request:CloseRequest)=>void|Promise<void>};
  constructor(options:{guards:()=>Iterable<CloseGuard>;commit:(request:CloseRequest)=>void|Promise<void>}){this.options=options;}
  getSnapshot=():CloseView=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(state:CloseView){this.state=Object.freeze(state);for(const listener of this.listeners)listener();}
  request=(reason:CloseReason='close'):Promise<boolean>=>{
    if(this.pending)return this.pending;if(this.state.phase==='closed')return Promise.resolve(true);
    const request=Object.freeze({requestId:randomId(),reason});
    this.pending=Promise.resolve().then(async()=>{
      try{
        const validations:(()=>boolean)[]=[];
        for(const guard of [...this.options.guards()]){const response=await guard(request);if(response?.status==='cancelled'){this.publish({phase:'idle',request:null,error:null});return false;}if(response?.status!=='ready')throw Error(response?.status==='failed'?response.message:'应用返回了无效的关闭响应。');if(response.validate!==undefined){if(typeof response.validate!=='function')throw Error('应用返回了无效的关闭校验。');validations.push(response.validate);}}
        if(validations.some(validate=>validate()!==true))throw Error('准备后又有新内容，窗口已保留。');
        this.publish({phase:'closing',request,error:null});await this.options.commit(request);this.publish({phase:'closed',request,error:null});return true;
      }catch(error){this.publish({phase:'failed',request,error:error instanceof Error?error.message:String(error)});return false;}
      finally{this.pending=null;}
    });this.publish({phase:'checking',request,error:null});return this.pending;
  };
}
export interface SessionCloseState extends SessionClosePromptState {readonly generation:string|number}
/** The app supplies its own accessible choice UI and authoritative save/discard/persistence actions. */
export function createSessionCloseGuard(options:{getState:()=>SessionCloseState;choose:(state:SessionCloseState,request:CloseRequest)=>SessionCloseChoice|Promise<SessionCloseChoice>;save:()=>Promise<boolean>;discard:()=>Promise<boolean>;persist:()=>Promise<boolean>}):CloseGuard{
  return async request=>{
    if(request.signal?.aborted)return {status:'cancelled'};
    const before=options.getState();
    if(before.running&&!before.canBackground)return {status:'failed',message:'当前执行无法安全转入后台，请保留窗口；停止执行需单独操作。'};
    const choice=before.dirty||before.unresolved?await options.choose(before,request):'preserve';
    if(request.signal?.aborted)return {status:'cancelled'};
    if(choice==='continue')return {status:'cancelled'};
    if(options.getState().generation!==before.generation)return {status:'failed',message:'内容在关闭选择期间已变化，请重新检查。'};
    if(choice==='save'||choice==='discard'){
      if(before.unresolved)return {status:'failed',message:'原请求仍待核对，不能用保存或放弃清除它的身份。'};
      if(!await (choice==='save'?options.save():options.discard()))return {status:'failed',message:choice==='save'?'保存未确认，窗口已保留。':'放弃未完成，窗口已保留。'};
      if(request.signal?.aborted)return {status:'cancelled'};
      const after=options.getState();if(after.dirty||after.unresolved)return {status:'failed',message:'仍有新草稿或待核实请求，窗口已保留。'};
    }else if(choice!=='preserve')return {status:'failed',message:'无效的关闭选择。'};
    const current=options.getState();if(current.running&&!current.canBackground)return {status:'failed',message:'执行能力已变化，当前窗口需要保留。'};
    if(!await options.persist())return {status:'failed',message:'恢复记录未确认持久保存，窗口已保留。'};
    if(request.signal?.aborted)return {status:'cancelled'};
    const latest=options.getState();if(latest.generation!==current.generation||latest.running&&!latest.canBackground)return {status:'failed',message:'持久保存期间内容或执行能力已变化，窗口已保留。'};
    return {status:'ready',validate:()=>{const state=options.getState();return !request.signal?.aborted&&state.generation===latest.generation&&!(state.running&&!state.canBackground);}} satisfies CloseResponse;
  };
}
