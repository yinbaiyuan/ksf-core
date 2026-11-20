import type {ReloadParticipant} from '../ui-runtime/reload-model';
interface SettingsReloadView {open:boolean;location:string;epoch:number;dirty:boolean;busy:boolean;unresolved:boolean}
/** Settings drafts stay in the current document until explicitly saved/discarded by their owning controller. */
export function createSettingsReloadParticipant(id:string,read:()=>SettingsReloadView):ReloadParticipant{
 const ready=(value:SettingsReloadView)=>value.open&&!value.dirty&&!value.busy&&!value.unresolved;
 return {id,name:'系统设置',prepare:()=>{
  const before=read();
  if(!ready(before))return {status:'failed',message:'当前设置有未保存的修改或未决提交。请先保存或放弃修改，再重载。'};
  return {status:'ready',validate:()=>{const current=read();return ready(current)&&current.epoch===before.epoch&&current.location===before.location;}};
 }};
}
