export type OverlayKind='tooltip'|'popover'|'menu'|'dialog'|'alert-dialog'|'sheet';
export type OverlayScope='window'|'global';
export type OverlayCloseReason='escape'|'outside'|'action'|'owner-removed'|'parent-removed'|'deactivated';
export interface OverlayPolicy {escape:boolean;outside:boolean;deactivate:boolean}
export interface OverlayLayer {
  readonly token:symbol;readonly owner:string;readonly scope:OverlayScope;readonly kind:OverlayKind;
  readonly parent:symbol|null;readonly modal:boolean;readonly order:number;
  readonly policy:Readonly<OverlayPolicy>;readonly closing:boolean;readonly error:string|null;
}
export interface OverlayRegistration {
  owner:string;scope?:OverlayScope;kind:OverlayKind;parent?:symbol|null;modal?:boolean;
  policy?:Partial<OverlayPolicy>;element?:()=>HTMLElement|null;backdrop?:()=>HTMLElement|null;trigger?:HTMLElement|null;
  autoFocus?:boolean;restoreFocus?:boolean;initialFocus?:()=>HTMLElement|null;
  onClose:(reason:OverlayCloseReason)=>void|boolean|Promise<void|boolean>;
}
export interface OverlayEvent {
  defaultPrevented?:boolean;isComposing?:boolean;keyCode?:number;
  preventDefault():void;stopPropagation():void;stopImmediatePropagation?():void;
}
interface Entry {layer:OverlayLayer;input:Readonly<OverlayRegistration>;pending?:Promise<boolean>}
const error=(message:string)=>Object.assign(Error(message),{code:'UI_OVERLAY_INVALID'});
/** One host-owned stack. DOM event/focus binding is separate from ownership and close facts. */
export class OverlayStack {
  private entries=new Map<symbol,Entry>();private listeners=new Set<()=>void>();
  private snapshot:readonly OverlayLayer[]=Object.freeze([]);private order=0;private active:string|null=null;
  private consumed=new WeakSet<object>();
  getSnapshot=():readonly OverlayLayer[]=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getActiveOwner=():string|null=>this.active;
  /** Host visibility commits can make an already-registered panel focusable. */
  reconcile=():void=>{this.publish();};
  private publish(){this.snapshot=Object.freeze([...this.entries.values()].map(x=>x.layer));for(const listener of this.listeners)listener();}
  private change(entry:Entry,patch:Partial<OverlayLayer>){entry.layer=Object.freeze({...entry.layer,...patch});this.publish();}
  registration=(token:symbol):Readonly<OverlayRegistration>|undefined=>this.entries.get(token)?.input;
  layer=(token:symbol):OverlayLayer|undefined=>this.entries.get(token)?.layer;
  top=(owner:string|null=this.active):OverlayLayer|null=>{
    const all=this.snapshot.filter(x=>x.scope==='global'||x.scope==='window'&&x.owner===owner);
    return all.filter(x=>x.scope==='global').at(-1)??all.at(-1)??null;
  };
  isDescendant=(token:symbol,ancestor:symbol):boolean=>{
    let current=this.entries.get(token)?.layer;const seen=new Set<symbol>();
    while(current?.parent&&!seen.has(current.parent)){if(current.parent===ancestor)return true;seen.add(current.parent);current=this.entries.get(current.parent)?.layer;}
    return false;
  };
  register=(input:OverlayRegistration):{token:symbol;dispose:()=>void}=>{
    if(!input||typeof input.owner!=='string'||!input.owner.trim()||input.owner.length>512||!['tooltip','popover','menu','dialog','alert-dialog','sheet'].includes(input.kind)||typeof input.onClose!=='function')throw error('弹层需要有效所有者、类型和关闭处理。');
    const scope=input.scope??'window';if(!['window','global'].includes(scope))throw error('弹层范围无效。');
    const parent=input.parent??null,prior=parent?this.entries.get(parent)?.layer:null;
    if(parent&&(!prior||prior.owner!==input.owner||prior.scope!==scope))throw error('父弹层必须仍存在且属于同一所有者与范围。');
    const modal=input.modal??['dialog','alert-dialog','sheet'].includes(input.kind);
    if(typeof modal!=='boolean')throw error('模态状态需要布尔值。');
    const policy={escape:true,outside:!modal&&input.kind!=='tooltip',deactivate:!modal,...input.policy};
    if(Object.values(policy).some(x=>typeof x!=='boolean'))throw error('弹层关闭策略需要布尔值。');
    const token=Symbol(input.kind),layer:OverlayLayer=Object.freeze({token,owner:input.owner,scope,kind:input.kind,parent,modal,order:++this.order,policy:Object.freeze(policy),closing:false,error:null});
    this.entries.set(token,{layer,input:Object.freeze({...input,scope,parent,modal,policy:layer.policy})});this.publish();
    return {token,dispose:()=>this.release(token)};
  };
  requestClose=(token:symbol,reason:OverlayCloseReason):Promise<boolean>=>{
    const entry=this.entries.get(token);if(!entry)return Promise.resolve(false);
    if(entry.pending)return entry.pending;if(entry.layer.closing)return Promise.resolve(false);
    // Allocate first so reentrant subscriptions cannot dispatch a second close.
    entry.pending=Promise.resolve().then(async()=>{
      try{if(this.entries.get(token)!==entry)return false;const answer=await entry.input.onClose(reason);if(!this.entries.has(token))return true;if(answer===false){this.change(entry,{closing:false});return false;}return true;}
      catch(issue){if(this.entries.has(token))this.change(entry,{closing:false,error:issue instanceof Error?issue.message:String(issue)});return false;}
      finally{entry.pending=undefined;}
    });this.change(entry,{closing:true,error:null});return entry.pending;
  };
  release=(token:symbol):void=>{
    if(!this.entries.has(token))return;
    const children=[...this.entries.values()].filter(x=>this.isDescendant(x.layer.token,token)).reverse();
    for(const child of children){this.entries.delete(child.layer.token);void Promise.resolve().then(()=>child.input.onClose('parent-removed')).catch(()=>{});}
    this.entries.delete(token);this.publish();
  };
  removeOwner=(owner:string):void=>{
    const own=[...this.entries.values()].filter(x=>x.layer.owner===owner);
    for(const entry of own)this.entries.delete(entry.layer.token); // Teardown does not dispatch stale view/business intents.
    if(own.length)this.publish(); // Window activation is a host fact, independent of layer disposal.
  };
  setActiveOwner=(owner:string|null):void=>{
    if(owner===this.active)return;const previous=this.active;this.active=owner;
    for(const entry of this.entries.values())if(entry.layer.scope==='window'&&entry.layer.owner===previous&&entry.layer.policy.deactivate)void this.requestClose(entry.layer.token,'deactivated');
    this.publish();
  };
  consume=(event:OverlayEvent):boolean=>{
    if(this.consumed.has(event))return false;this.consumed.add(event);
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();return true;
  };
  handleEscape=(event:OverlayEvent):boolean=>{
    if(event.defaultPrevented||event.isComposing||event.keyCode===229||this.consumed.has(event))return false;
    const top=this.top();if(!top)return false;this.consume(event);
    if(top.policy.escape&&!top.closing)void this.requestClose(top.token,'escape');return true;
  };
  /** Only the host can choose active owners or register a global layer on this stack. */
  forOwner=(owner:string)=>{
    let prior:readonly OverlayLayer[]|undefined,cached:readonly OverlayLayer[]=Object.freeze([]);
    return {
    register:(input:Omit<OverlayRegistration,'owner'|'scope'>)=>{
      if(Object.hasOwn(input,'owner')||Object.hasOwn(input,'scope'))throw error('应用弹层不能覆盖宿主分配的所有者或全局范围。');
      return this.register({...input,owner,scope:'window'});
    },
    getSnapshot:()=>{if(prior!==this.snapshot){prior=this.snapshot;cached=Object.freeze(this.snapshot.filter(x=>x.owner===owner&&x.scope==='window'));}return cached;},
    subscribe:this.subscribe,
    requestClose:(token:symbol,reason:OverlayCloseReason)=>this.entries.get(token)?.layer.owner===owner&&this.entries.get(token)?.layer.scope==='window'?this.requestClose(token,reason):Promise.resolve(false),
    release:(token:symbol)=>{if(this.entries.get(token)?.layer.owner===owner&&this.entries.get(token)?.layer.scope==='window')this.release(token);},
    };
  };
}
