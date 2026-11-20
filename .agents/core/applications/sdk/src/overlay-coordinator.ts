import {OverlayStack,type OverlayRegistration,type OverlayLayer} from './controllers/overlay-stack.ts';
export type ScopedOverlayRegistration=Omit<OverlayRegistration,'owner'|'scope'>;
export interface OverlayAccess {
 claim(token:symbol,owner:string,close:()=>void):void;release(token:symbol):void;owner():string|null;
 register?:(input:ScopedOverlayRegistration)=>{token:symbol;dispose:()=>void};
 getSnapshot?:()=>readonly OverlayLayer[];subscribe?:(listener:()=>void)=>()=>void;
 parentOf?:(trigger:HTMLElement|null)=>symbol|null;
 isManaged?:()=>boolean;
}
/** Legacy claim keeps replacement semantics; new registrations form a nested stack. */
export function createOverlayCoordinator(){
 const stack=new OverlayStack(),legacy=new Map<symbol,{owner:string;close:()=>void;dispose:()=>void}>();let managed=false;
 const parentOf=(owner:string,scope:'window'|'global',trigger:HTMLElement|null,modalOnly=false)=>trigger?[...stack.getSnapshot()].reverse().find(x=>x.owner===owner&&x.scope===scope&&(!modalOnly||x.modal)&&stack.registration(x.token)?.element?.()?.contains(trigger))?.token??null:null;
 const claim=(token:symbol,owner:string,close:()=>void)=>{
  for(const [id,previous] of legacy)if(previous.owner===owner&&id!==token){legacy.delete(id);previous.close();previous.dispose();}
  const existing=legacy.get(token);if(existing){if(existing.owner!==owner)throw Object.assign(Error('已有弹层不能转移所有者。'),{code:'UI_OVERLAY_OWNER'});existing.close=close;return;}
  const registration=stack.register({owner,scope:owner==='standalone'?'global':'window',kind:'sheet',modal:true,policy:{outside:true},autoFocus:false,restoreFocus:false,element:()=>typeof document==='undefined'?null:[...document.querySelectorAll<HTMLElement>('[data-overlay-owner]')].reverse().find(x=>x.dataset.overlayOwner===owner&&x.matches('[role="dialog"],.sheet'))??null,onClose:()=>{legacy.get(token)?.close();}});
  legacy.set(token,{owner,close,dispose:registration.dispose});
 };
 const release=(token:symbol)=>{const old=legacy.get(token);if(old){legacy.delete(token);old.dispose();}else stack.release(token);};
 const access=(owner:string,scope:'window'|'global'):OverlayAccess=>{
  let prior:readonly OverlayLayer[]|undefined,cached:readonly OverlayLayer[]=Object.freeze([]);
  return {claim:(token,requested,close)=>{if(requested!==owner)throw Object.assign(Error('弹层所有者与宿主窗口不一致。'),{code:'UI_OVERLAY_OWNER'});claim(token,owner,close);},release:token=>{const old=legacy.get(token);if(old?.owner===owner)release(token);else if(stack.layer(token)?.owner===owner&&stack.layer(token)?.scope===scope)stack.release(token);},owner:()=>stack.getSnapshot().filter(x=>x.owner===owner&&x.scope===scope).at(-1)?.owner??null,
   register:input=>{if(Object.hasOwn(input,'owner')||Object.hasOwn(input,'scope'))throw Object.assign(Error('应用不能覆盖弹层所有者或全局范围。'),{code:'UI_OVERLAY_OWNER'});const modal=input.modal??['dialog','alert-dialog','sheet'].includes(input.kind);return stack.register({...input,parent:input.parent===undefined?parentOf(owner,scope,input.trigger??null,modal):input.parent,owner,scope});},
   parentOf:trigger=>parentOf(owner,scope,trigger),isManaged:()=>managed,subscribe:stack.subscribe,getSnapshot:()=>{if(prior!==stack.getSnapshot()){prior=stack.getSnapshot();cached=Object.freeze(prior.filter(x=>x.owner===owner&&x.scope===scope));}return cached;}};
 };
 const global=access('standalone','global');
 return {...global,claim,release,owner:()=>stack.getSnapshot().at(-1)?.owner??null,stack,forOwner:(owner:string)=>access(owner,'window'),setActiveOwner:stack.setActiveOwner,reconcile:stack.reconcile,setDOMBound:(value:boolean)=>{managed=value;},removeOwner:(owner:string)=>{for(const [id,value] of legacy)if(value.owner===owner)legacy.delete(id);stack.removeOwner(owner);}};
}
export const overlays=createOverlayCoordinator();
export type OverlayCoordinator=OverlayAccess;
