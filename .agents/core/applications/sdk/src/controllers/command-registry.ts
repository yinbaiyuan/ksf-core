export interface CommandScope {kind:'global'|'window'|'local'|'overlay';owner?:string;id?:string;layer?:symbol}
export interface CommandDefinition {id:string;label:string;shortcut:string;scope:CommandScope;enabled?:boolean;allowEditable?:boolean;repeat?:boolean;execute:()=>unknown|Promise<unknown>}
export type ScopedCommandDefinition=Omit<CommandDefinition,'scope'>&{scope?:Omit<CommandScope,'owner'>};
export interface CommandView {readonly id:string;readonly label:string;readonly shortcut:string;readonly displayShortcut:string;readonly scope:Readonly<CommandScope>;readonly enabled:boolean;readonly busy:boolean;readonly error:string|null}
export type CommandInvocation={status:'executed';value:unknown}|{status:'disabled'|'busy'|'unavailable'}|{status:'failed';error:string};
export interface CommandContext {activeOwner:string|null;scopePath?:readonly string[];overlay?:{token:symbol;owner:string;scope:'window'|'global';modal?:boolean;kind?:string};modal?:{token:symbol;owner:string;scope:'window'|'global'};editable?:boolean}
export interface ShortcutEvent {key:string;metaKey?:boolean;ctrlKey?:boolean;shiftKey?:boolean;altKey?:boolean;repeat?:boolean;isComposing?:boolean;keyCode?:number;defaultPrevented?:boolean;getModifierState?:(name:string)=>boolean;preventDefault():void;stopPropagation():void;stopImmediatePropagation?():void}
interface Chord {key:string;meta:boolean;ctrl:boolean;alt:boolean;shift:boolean;aria:string;display:string}
interface Entry {token:symbol;definition:Readonly<CommandDefinition>;chord:Chord;busy:boolean;error:string|null}
const fail=(message:string)=>Object.assign(Error(message),{code:'UI_COMMAND_INVALID'});
const normalizeKey=(key:string)=>({' ':'space',esc:'escape',return:'enter',plus:'+',minus:'-'}[key.toLowerCase()]??key.toLowerCase());
function chordOf(value:string,mac:boolean):Chord{
 if(typeof value!=='string'||!value.trim()||value.length>100)throw fail('命令需要有效快捷键。');
 const parts=value.split('+').map(x=>x.trim().toLowerCase());if(parts.some(x=>!x)||parts.length>5)throw fail('快捷键使用明确的单个组合键。');
 const key=normalizeKey(parts.pop()!),mods=new Set(parts);if(mods.size!==parts.length||parts.some(x=>!['primary','meta','ctrl','alt','shift'].includes(x)))throw fail('快捷键修饰键无效或重复。');
 const meta=mods.has('meta')||mac&&mods.has('primary'),ctrl=mods.has('ctrl')||!mac&&mods.has('primary'),alt=mods.has('alt'),shift=mods.has('shift');
 if(['meta','ctrl','alt','shift','primary','dead','unidentified','process'].includes(key)||!(key.length===1||/^(?:enter|escape|space|tab|backspace|delete|home|end|pageup|pagedown|arrow(?:up|down|left|right)|f(?:[1-9]|1[0-9]|2[0-4]))$/.test(key)))throw fail('快捷键主键无效。');
 const shown=key.length===1?key.toUpperCase():({escape:'Escape',enter:'Enter',space:'Space',tab:'Tab'}[key]??key[0].toUpperCase()+key.slice(1));
 return {key,meta,ctrl,alt,shift,aria:[ctrl?'Control':null,alt?'Alt':null,shift?'Shift':null,meta?'Meta':null,shown].filter(Boolean).join('+'),display:mac?[ctrl?'⌃':'',alt?'⌥':'',shift?'⇧':'',meta?'⌘':'',shown].join(''):[ctrl?'Ctrl':null,alt?'Alt':null,shift?'Shift':null,meta?'Meta':null,shown].filter(Boolean).join('+')};
}
function nativeReserved(chord:Pick<Chord,'key'|'meta'|'ctrl'|'alt'|'shift'>,mac:boolean):boolean{
 const primary=mac?chord.meta:chord.ctrl;
 return primary&&!chord.alt&&(['q','w','t','n','l','r','o','p','+','-','0'].includes(chord.key)||/^[1-9]$/.test(chord.key))||chord.alt&&chord.key==='f4'||chord.key==='tab'&&(chord.meta||chord.ctrl);
}
/** Internal host input policies reuse the same native-key exclusions as command registration. */
export function isNativeShortcutReserved(event:ShortcutEvent,platform:'darwin'|'win32'|'linux'):boolean{return nativeReserved({key:normalizeKey(event.key),meta:!!event.metaKey,ctrl:!!event.ctrlKey,alt:!!event.altKey,shift:!!event.shiftKey},platform==='darwin');}
export function isNativeEditingShortcut(event:ShortcutEvent,platform:'darwin'|'win32'|'linux'):boolean{return !!(platform==='darwin'?event.metaKey:event.ctrlKey)&&!event.altKey&&['a','c','v','x','z','y'].includes(normalizeKey(event.key));}
const sameScope=(a:CommandScope,b:CommandScope)=>a.kind===b.kind&&a.owner===b.owner&&a.id===b.id&&a.layer===b.layer;
/** Host routes one key to one current scope. Labels are derived from actual registrations. */
export class CommandRegistry {
 private mac:boolean;private entries=new Map<symbol,Entry>();private snapshot:readonly CommandView[]=Object.freeze([]);private listeners=new Set<()=>void>();private consumed=new WeakSet<object>();
 constructor(options:{platform:'darwin'|'win32'|'linux'}){this.mac=options.platform==='darwin';}
 getSnapshot=():readonly CommandView[]=>this.snapshot;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 removeOwner=(owner:string):void=>{let changed=false;for(const [token,entry] of this.entries)if(entry.definition.scope.owner===owner){this.entries.delete(token);changed=true;}if(changed)this.publish();};
 private publish(){this.snapshot=Object.freeze([...this.entries.values()].map(e=>Object.freeze({id:e.definition.id,label:e.definition.label,shortcut:e.chord.aria,displayShortcut:e.chord.display,scope:e.definition.scope,enabled:e.definition.enabled!==false,busy:e.busy,error:e.error})));for(const listener of this.listeners)listener();}
 private validate(value:CommandDefinition,token?:symbol):{definition:Readonly<CommandDefinition>;chord:Chord}{
  if(!value||typeof value.id!=='string'||!value.id.trim()||value.id.length>128||typeof value.label!=='string'||!value.label.trim()||value.label.length>120||typeof value.execute!=='function')throw fail('命令需要有限的ID、名称和执行处理。');
  const scope=value.scope;if(!scope||!['global','window','local','overlay'].includes(scope.kind)||scope.kind!=='global'&&(typeof scope.owner!=='string'||!scope.owner.trim())||scope.kind==='local'&&(typeof scope.id!=='string'||!scope.id.trim())||scope.kind==='overlay'&&typeof scope.layer!=='symbol')throw fail('命令作用范围或所有者无效。');
  for(const flag of [value.enabled,value.allowEditable,value.repeat])if(flag!==undefined&&typeof flag!=='boolean')throw fail('命令状态需要布尔值。');
  const chord=chordOf(value.shortcut,this.mac);if(nativeReserved(chord,this.mac))throw fail('此快捷键保留给原生宿主或浏览器。');
  for(const [id,entry] of this.entries)if(id!==token&&entry.definition.scope.owner===scope.owner){if(entry.definition.id===value.id||sameScope(entry.definition.scope,scope)&&entry.chord.aria===chord.aria)throw fail('同一所有者不能重复注册命令ID或相同范围的快捷键。');}
  return {definition:Object.freeze({...value,scope:Object.freeze({...scope})}),chord};
 }
 register=(value:CommandDefinition)=>{
  const next=this.validate(value),token=Symbol(value.id);this.entries.set(token,{token,...next,busy:false,error:null});this.publish();let disposed=false;
  return {update:(input:CommandDefinition)=>{if(disposed)return;const entry=this.entries.get(token);if(!entry)return;if(input.id!==entry.definition.id||!sameScope(input.scope,entry.definition.scope))throw fail('注册更新不能转移命令身份或范围。');const next=this.validate(input,token),changed=next.definition.label!==entry.definition.label||next.definition.enabled!==entry.definition.enabled||next.chord.aria!==entry.chord.aria;Object.assign(entry,next);if(changed)this.publish();},dispose:()=>{if(disposed)return;disposed=true;if(this.entries.delete(token))this.publish();}};
 };
 private rank(scope:CommandScope,context:CommandContext):number{
  const top=context.overlay,modal=context.modal??(top?.modal!==false?top:undefined);
  if(scope.kind==='overlay'){
   const layer=top&&scope.layer===top.token&&scope.owner===top.owner?top:modal&&scope.layer===modal.token&&scope.owner===modal.owner&&top?.scope!=='global'?modal:undefined;
   if(!layer)return -1;const depth=scope.id?context.scopePath?.indexOf(scope.id)??-1:0;
   return depth<0?-1:(layer===top?12000:9000)+(scope.id?1000-depth:0);
  }
  // A transient menu does not erase the modal boundary underneath it.
  if(modal&&(modal.scope==='global'||scope.kind!=='global'))return -1;
  if(top?.scope==='global'&&scope.kind!=='global')return -1;
  if(top&&scope.kind!=='global'&&scope.owner!==top.owner)return -1;
  if(scope.kind!=='global'&&scope.owner!==context.activeOwner)return -1;
  if(scope.kind==='global')return 0;if(scope.kind==='window')return 100;
  const at=context.scopePath?.indexOf(scope.id!)??-1;return at<0?-1:1000-at;
 }
 private run(entry:Entry):Promise<CommandInvocation>{
  if(entry.definition.enabled===false)return Promise.resolve({status:'disabled'});if(entry.busy)return Promise.resolve({status:'busy'});
  const definition=entry.definition;entry.busy=true;entry.error=null;this.publish();
  return Promise.resolve().then(async():Promise<CommandInvocation>=>{if(this.entries.get(entry.token)!==entry)return {status:'unavailable'};if(entry.definition.enabled===false)return {status:'disabled'};return {status:'executed',value:await definition.execute()};}).catch((issue):CommandInvocation=>{entry.error=issue instanceof Error?issue.message:String(issue);return {status:'failed',error:entry.error};}).finally(()=>{entry.busy=false;if(this.entries.get(entry.token)===entry)this.publish();});
 }
 invoke=(owner:string,id:string,context:CommandContext):Promise<CommandInvocation>=>{
  const entry=[...this.entries.values()].find(x=>x.definition.id===id&&x.definition.scope.owner===owner);if(!entry||this.rank(entry.definition.scope,context)<0)return Promise.resolve({status:'unavailable'});return this.run(entry);
 };
 handle=(event:ShortcutEvent,context:CommandContext):boolean=>{
  if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.getModifierState?.('AltGraph')||this.consumed.has(event))return false;
  const key=normalizeKey(event.key),macPrimary=this.mac?event.metaKey:event.ctrlKey;
  if(context.editable&&macPrimary&&!event.altKey&&['a','c','v','x','z','y'].includes(key))return false;
  const matches=[...this.entries.values()].map(entry=>({entry,rank:this.rank(entry.definition.scope,context)})).filter(({entry:e,rank})=>rank>=0&&e.chord.key===key&&e.chord.meta===!!event.metaKey&&e.chord.ctrl===!!event.ctrlKey&&e.chord.alt===!!event.altKey&&e.chord.shift===!!event.shiftKey).sort((a,b)=>b.rank-a.rank);
  const entry=matches[0]?.entry;if(!entry)return false;
  if(context.editable&&!entry.definition.allowEditable)return false;
  this.consumed.add(event);event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  if(entry.definition.enabled===false||entry.busy||event.repeat&&!entry.definition.repeat)return true;
  void this.run(entry);return true;
 };
 forOwner=(owner:string,context:()=>CommandContext=()=>({activeOwner:owner}))=>{
  const bind=(input:ScopedCommandDefinition):CommandDefinition=>{if(typeof input?.id!=='string'||input.id.startsWith('ksf.')||input.scope?.kind==='global'||input.scope&&Object.hasOwn(input.scope,'owner'))throw fail('应用不能注册宿主命令或覆盖所有者。');return {...input,scope:{kind:'window',...input.scope,owner}};};
  return {register:(input:ScopedCommandDefinition)=>{const handle=this.register(bind(input));return {update:(next:ScopedCommandDefinition)=>handle.update(bind(next)),dispose:handle.dispose};},describe:(id:string)=>this.snapshot.find(x=>x.id===id&&x.scope.owner===owner),invoke:(id:string)=>this.invoke(owner,id,context()),subscribe:this.subscribe};
 };
}
export type ApplicationCommands=ReturnType<CommandRegistry['forOwner']>;
