export type PreferenceStatus='loading'|'default'|'saving'|'saved'|'failed'|'conflict';
export interface ConfigurationSnapshot {etag:string;state:string;values:Record<string,unknown>;defaults:Record<string,unknown>;effective:Record<string,unknown>|null}
export type ConfigurationRequest=<R>(url:string,input?:unknown)=>Promise<R>;
export interface PreferenceSnapshot<T>{value:T;ready:boolean;status:PreferenceStatus;error:string;legacy:T|null;dirty:boolean;discardVersion:number}
const equal=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);

/** One serialized writer per domain. Drafts never acquire a newer base version silently. */
export class ConfigurationPreferences<T>{
 private state:PreferenceSnapshot<T>;private listeners=new Set<()=>void>();private etag:string|null=null;
 private timer:ReturnType<typeof setTimeout>|undefined;private writing=false;private generation=0;private held=false;private blocked=false;private loading:Promise<void>|null=null;
 readonly domain:string;readonly field:string;readonly fallback:T;
 private request:ConfigurationRequest;private storage?:Pick<Storage,'getItem'|'setItem'>;private legacyValue:T|null;private validate:(value:T)=>unknown;
 constructor(domain:string,field:string,fallback:T,request:ConfigurationRequest,storage?:Pick<Storage,'getItem'|'setItem'>,legacyValue:T|null=null,validate:(value:T)=>unknown=()=>{}){
  this.domain=domain;this.field=field;this.fallback=fallback;this.request=request;this.storage=storage;this.legacyValue=legacyValue;this.validate=validate;
  let value=fallback;try{const cache=JSON.parse(storage?.getItem(this.cacheKey)??'null');if(cache?.domain===domain){this.validate(cache.value);value=cache.value;}}catch{}
  let dismissed=false;try{dismissed=storage?.getItem(this.migrationKey)===JSON.stringify(legacyValue);}catch{}
  this.state={value,ready:false,status:'loading',error:'',legacy:dismissed?null:legacyValue,dirty:false,discardVersion:0};
 }
 private get cacheKey(){return 'ksf.config.cache.'+this.domain+'.v1';}
 private get migrationKey(){return 'ksf.config.migration.'+this.domain+'.v1';}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(change:Partial<PreferenceSnapshot<T>>){this.state={...this.state,...change};for(const listener of this.listeners)listener();}
 private valueOf(value:ConfigurationSnapshot){const next=(value.values[this.field]??value.defaults[this.field]??this.fallback) as T;this.validate(next);return next;}
 private cache(){try{this.storage?.setItem(this.cacheKey,JSON.stringify({domain:this.domain,value:this.state.value}));}catch{/* Cache is not the authority. */}}
 hold=(value:boolean)=>{this.held=value;};
 load=async()=>{
  if(this.loading)return this.loading;
  this.loading=(async()=>{try{
   const remote=await this.request<ConfigurationSnapshot>('/api/config/'+this.domain);
   if(this.state.dirty||this.held){if(this.etag!==null&&remote.etag!==this.etag){this.blocked=true;this.publish({status:'conflict',error:'实例配置已由其他页面修改；当前草稿已保留。'});}return;}
   this.etag=remote.etag;this.blocked=false;this.publish({value:this.valueOf(remote),ready:true,status:remote.state==='missing'?'default':'saved',error:''});this.cache();
  }catch(error){if(!this.state.dirty)this.publish({status:'failed',error:'无法读取实例设置：'+(error as Error).message});}finally{this.loading=null;}})();
  return this.loading;
 };
 update=(change:T|((current:T)=>T))=>{
  const value=typeof change==='function'?(change as (current:T)=>T)(this.state.value):change;
  this.generation++;this.publish({value,dirty:true,status:this.blocked?'conflict':'saving',error:this.blocked?'草稿保留；请先比较实例配置。':''});
  if(this.etag===null){this.blocked=true;this.publish({status:'failed',error:'尚未取得实例版本，草稿未保存。请重新读取后再修改。'});return;}
  clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),300);
 };
 /** Automatic, repeatable operations may re-read after conflict; manual drafts never do. */
 reconcile=async(transform:(current:T)=>T)=>{
  if(!this.state.ready||this.held||this.writing||this.loading||this.state.dirty||this.blocked||!['saved','default'].includes(this.state.status))return;
  const next=transform(this.state.value);if(equal(next,this.state.value))return;
  this.validate(next);this.update(next);const generation=this.generation;await this.flush();
  if(this.state.dirty&&this.generation===generation){
   // Only the automatic draft can be discarded. Recompute against fresh authority.
   this.blocked=false;this.publish({dirty:false});await this.load();
  }
 };
 flush=async()=>{
  clearTimeout(this.timer);if(this.writing||this.blocked||!this.state.dirty||this.etag===null)return;
  this.writing=true;const submitted=this.state.value,generation=this.generation,base=this.etag;
  try{
   const result=await this.request<ConfigurationSnapshot>('/api/config/'+this.domain,{operation:'write',values:{[this.field]:submitted},ifMatch:base});
   this.etag=result.etag;
   if(generation===this.generation){this.publish({value:this.valueOf(result),dirty:false,status:'saved',error:'',ready:true});this.cache();}
  }catch(error){
   // A timed-out write may already be durable. Reconcile before offering a retry.
   try{const current=await this.request<ConfigurationSnapshot>('/api/config/'+this.domain);
    if(equal(this.valueOf(current),submitted)){this.etag=current.etag;if(generation===this.generation){this.publish({dirty:false,status:'saved',error:''});this.cache();}}
    else{this.blocked=true;this.publish({status:current.etag!==base?'conflict':'failed',error:current.etag!==base?'实例配置已变化；当前草稿未覆盖它。':(error as Error).message});}
   }catch{this.blocked=true;this.publish({status:'failed',error:'保存结果尚未确认；草稿已保留，请先重新连接核对。'});}
  }finally{this.writing=false;if(this.state.dirty&&!this.blocked)this.timer=setTimeout(()=>void this.flush(),300);}
 };
 reload=async()=>{if(this.writing)return;clearTimeout(this.timer);this.generation++;this.blocked=false;this.held=false;this.publish({dirty:false,error:'',discardVersion:this.state.discardVersion+1});await this.load();};
 retry=async()=>{if(this.state.status==='conflict')return;this.blocked=false;await this.flush();};
 keepInstance=()=>{try{this.storage?.setItem(this.migrationKey,JSON.stringify(this.legacyValue));}catch{}this.publish({legacy:null});};
 importLegacy=async()=>{
  if(!this.state.ready||this.writing||this.state.legacy===null)return;
  // Explicit import uses the version the migration preview was based on.
  this.blocked=false;this.update(this.state.legacy);await this.flush();if(!this.state.dirty)this.keepInstance();
 };
}
