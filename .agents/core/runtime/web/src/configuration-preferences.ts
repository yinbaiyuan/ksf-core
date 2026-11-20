import {SaveController,createConfigurationMutationSaveAdapter} from '../../../applications/sdk/src/controllers.ts';
import type {ConfigurationRecord,ConfigurationRequest as Request} from '../../../applications/sdk/src/controllers.ts';
export type PreferenceStatus='loading'|'default'|'pending'|'saving'|'saved'|'failed'|'conflict'|'unknown';
export type ConfigurationSnapshot=ConfigurationRecord;
export type ConfigurationRequest=Request;
export interface PreferenceSnapshot<T>{value:T;ready:boolean;status:PreferenceStatus;error:string;legacy:T|null;dirty:boolean;discardVersion:number}
interface PreferenceDraft<T>{value:T;reset:boolean}

/** Compatibility wrapper: browser migration/cache policy stays here; the SDK owns write concurrency. */
export class ConfigurationPreferences<T>{
 private state:PreferenceSnapshot<T>;private listeners=new Set<()=>void>();private controller:SaveController<PreferenceDraft<T>>;
 private timer:ReturnType<typeof setTimeout>|undefined;private held=false;private manual=false;private missing=false;private automaticVersion:number|null=null;
 readonly domain:string;readonly field:string;readonly fallback:T;
 private storage?:Pick<Storage,'getItem'|'setItem'>;private legacyValue:T|null;private validate:(value:T)=>unknown;
 private defaultsValue:T;
 constructor(domain:string,field:string,fallback:T,request:ConfigurationRequest,storage?:Pick<Storage,'getItem'|'setItem'>,legacyValue:T|null=null,validate:(value:T)=>unknown=()=>{}){
  this.domain=domain;this.field=field;this.fallback=fallback;this.defaultsValue=fallback;this.storage=storage;this.legacyValue=legacyValue;this.validate=validate;
  let value=fallback;try{const cache=JSON.parse(storage?.getItem(this.cacheKey)??'null');if(cache?.domain===domain){validate(cache.value);value=cache.value;}}catch{}
  let dismissed=false;try{dismissed=storage?.getItem(this.migrationKey)===JSON.stringify(legacyValue);}catch{}
  this.state={value,ready:false,status:'loading',error:'',legacy:dismissed?null:legacyValue,dirty:false,discardVersion:0};
  this.controller=new SaveController(createConfigurationMutationSaveAdapter<PreferenceDraft<T>>({request,domain,valueReconciliation:true,
   select:record=>{this.missing=record.state==='missing';const defaults=(record.defaults[field]??fallback) as T;validate(defaults);this.defaultsValue=structuredClone(defaults);const next=(record.values[field]??defaults) as T;validate(next);return {value:next,reset:false};},values:next=>({[field]:next.value}),intent:next=>next.reset?{operation:'reset',fields:[field]}:{operation:'write'},
  }),{initial:{value,reset:false},validate:next=>validate(next.value)});
  this.controller.subscribe(()=>this.sync());
 }
 private get cacheKey(){return 'ksf.config.cache.'+this.domain+'.v1';}
 private get migrationKey(){return 'ksf.config.migration.'+this.domain+'.v1';}
 getSnapshot=()=>this.state;
 /** Manual settings editors share this original controller; they do not create another configuration owner. */
 getSaveSnapshot=()=>this.controller.getSnapshot();
 getDefaults=()=>structuredClone(this.defaultsValue);
 get isManualEditing(){return this.manual;}
 beginManual=()=>{clearTimeout(this.timer);this.manual=true;this.held=true;this.publish({});};
 endManual=()=>{if(!this.controller.getSnapshot().dirty&&!this.controller.getSnapshot().pending){this.manual=false;this.held=false;this.publish({});}};
 edit=(change:T|((current:T)=>T))=>{if(!this.manual)throw Error('请先进入手动设置编辑。');this.updateValue(change);};
 resetDraft=()=>{if(!this.manual)throw Error('请先进入手动设置编辑。');this.controller.update({value:this.getDefaults(),reset:true});};
 reconcileSave=()=>this.controller.reconcile();
 resolveConflict=(value:T)=>this.controller.merge({value,reset:false});
 keepDraftOnLatest=()=>this.controller.merge(this.controller.getSnapshot().value);
 discardDraft=async()=>{clearTimeout(this.timer);if(this.controller.getSnapshot().pending)await this.controller.reconcile();if(this.controller.getSnapshot().pending||this.controller.getSnapshot().status==='saving')return false;const discarded=await this.controller.discard();if(discarded)this.publish({discardVersion:this.state.discardVersion+1});return discarded;};
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(change:Partial<PreferenceSnapshot<T>>){this.state={...this.state,...change};for(const listener of this.listeners)listener();}
 private sync(){
  const next=this.controller.getSnapshot();
  this.publish({value:next.value.value,ready:next.ready,dirty:next.dirty,status:next.status==='saved'&&this.missing?'default':next.status,error:next.error?.message??''});
  if(next.status==='saved'&&next.committed)try{this.storage?.setItem(this.cacheKey,JSON.stringify({domain:this.domain,value:next.committed.value.value}));}catch{/* Cache is not authority. */}
 }
 private schedule(){clearTimeout(this.timer);if(!this.manual&&this.state.ready&&this.state.status==='pending')this.timer=setTimeout(()=>void this.flush(),300);}
 hold=(value:boolean)=>{this.held=value;};
 load=async()=>{await this.controller.refresh({preserveDraft:this.held||this.manual});};
 private updateValue(change:T|((current:T)=>T)){this.controller.update(current=>({value:typeof change==='function'?(change as (current:T)=>T)(current.value):change,reset:false}));}
 update=(change:T|((current:T)=>T))=>{this.updateValue(change);this.schedule();};
 flush=async()=>{clearTimeout(this.timer);await this.controller.save();this.schedule();};
 /** Repeatable automatic transforms can be recomputed; manual and unknown drafts retain their identity. */
 reconcile=async(transform:(current:T)=>T)=>{
  const current=this.controller.getSnapshot();
  if(this.held||current.status==='saving')return;
  if(current.pending&&this.automaticVersion===current.draftVersion){await this.controller.retry();return;}
  if(!current.ready||current.dirty||current.status!=='saved')return;
  const next=transform(current.value.value);this.validate(next);
  if(JSON.stringify(next)===JSON.stringify(current.value.value))return;
  this.update(next);const generation=this.controller.getSnapshot().draftVersion;this.automaticVersion=generation;
  await this.flush();const result=this.controller.getSnapshot();
  if(result.dirty&&result.draftVersion===generation&&!result.pending&&['conflict','failed'].includes(result.status))await this.controller.discard();
 };
 reload=async()=>{
  clearTimeout(this.timer);if(this.controller.getSnapshot().pending){await this.controller.reconcile();return;}
  if(this.controller.getSnapshot().pending||this.state.status==='saving')return;
  if(await this.controller.discard()){this.held=false;this.publish({discardVersion:this.state.discardVersion+1});}
 };
 retry=async()=>{clearTimeout(this.timer);await this.controller.retry();this.schedule();};
 keepInstance=()=>{try{this.storage?.setItem(this.migrationKey,JSON.stringify(this.legacyValue));}catch{}this.publish({legacy:null});};
 importLegacy=async()=>{
  if(!this.state.ready||this.state.status==='saving'||this.state.legacy===null||this.controller.getSnapshot().pending)return;
  this.update(this.state.legacy);await this.flush();if(!this.state.dirty)this.keepInstance();
 };
}
