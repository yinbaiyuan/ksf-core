import type {CloseGuard} from '../../../../applications/sdk/src/application-session';
import type {ReloadParticipant} from './reload-model';
const entries=new Map<string,ReloadParticipant>(),listeners=new Set<()=>void>();
export const reloadParticipants={list:()=>[...entries.values()],subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},register:(entry:ReloadParticipant)=>{entries.set(entry.id,entry);for(const listener of listeners)listener();let disposed=false;return()=>{if(disposed)return;disposed=true;if(entries.get(entry.id)===entry){entries.delete(entry.id);for(const listener of listeners)listener();}};}};
/** Ordinary close permission does not imply that an unknown legacy view can be reconstructed. */
export function createReloadParticipant(options:{id:string;name:string;isAlive:()=>boolean;guards:()=>readonly CloseGuard[];legacyCount:()=>number}):ReloadParticipant{
 return {id:options.id,name:options.name,prepare:async request=>{
  if(request.signal?.aborted)return {status:'cancelled'};
  if(!options.isAlive())return {status:'failed',message:'应用仍在启动或已失效，请保留当前页面。'};
  const guards=[...options.guards()];
  if(!guards.length||options.legacyCount())return {status:'failed',message:'此应用尚未提供可靠的重载保全；请先结束该窗口的交互，当前页面会继续保留。'};
  const validations:(()=>boolean)[]=[];
  for(const guard of guards){const result=await guard(request);if(request.signal?.aborted)return {status:'cancelled'};if(result?.status==='cancelled'||result?.status==='failed')return result;if(result?.status!=='ready'||typeof result.validate!=='function')return {status:'failed',message:'应用尚未提供可核对的重载准备令牌。'};validations.push(result.validate);}
  return {status:'ready',validate:()=>{const current=options.guards();return !request.signal?.aborted&&options.isAlive()&&!options.legacyCount()&&current.length===guards.length&&guards.every((guard,index)=>current[index]===guard)&&validations.every(validate=>validate()===true);}};
 }};
}
