import {suspendWindowContent} from '../overlay-boundary.ts';
import {OverlayStack,type OverlayLayer,type OverlayRegistration} from './overlay-stack.ts';
import {surfaceOwner} from './surface-owner.ts';
export interface OverlayDOMOptions {
 document:Document;
 windowRoot:(owner:string)=>HTMLElement|null;
 contentRoot:(owner:string)=>HTMLElement|null;
 toolbarRoot?:(owner:string)=>HTMLElement|null;
 globalRoots:()=>readonly HTMLElement[];
 fallbackFocus:(owner:string,scope:'window'|'global')=>HTMLElement|null;
 /** Host-owned pointer geometry takes Escape before layers. Never supplied by an application. */
 beforeEscape?:(event:KeyboardEvent)=>boolean;
}
interface Presentation {zIndex:string;pointerEvents:string;appliedZ:string;appliedPointer?:string;observer:MutationObserver}
interface BoundLayer {layer:OverlayLayer;input:Readonly<OverlayRegistration>;element:HTMLElement|null;trigger:HTMLElement|null;unlock:(()=>void)[];presentation:Map<HTMLElement,Presentation>;initialFocusPending:boolean}
import {afterOverlayCommit} from './overlay-commit.ts';
export {afterOverlayCommit};
/** Host-only DOM binding. Importing this module has no listeners or focus side effects. */
export function bindOverlayStack(stack:OverlayStack,options:OverlayDOMOptions):()=>void{
 const doc=options.document,documentView=doc.defaultView,records=new Map<symbol,BoundLayer>();
 if(!documentView)throw Object.assign(Error('弹层事件绑定需要活动的浏览器文档。'),{code:'UI_OVERLAY_DOCUMENT'});
 const view=documentView;
 let composing=false,compositionTarget:EventTarget|null=null,redirecting=false,disposed=false,blockPointerClickUntil=0,lastActiveOwner=stack.getActiveOwner();
 const node=(value:EventTarget|null):Node|null=>value&&typeof(value as Node).nodeType==='number'?value as Node:null;
 const visible=(value:HTMLElement|null):value is HTMLElement=>!!value&&value.isConnected&&!value.closest('[inert],[hidden]')&&value.getClientRects().length>0&&view?.getComputedStyle(value).visibility!=='hidden';
 const focus=(value:HTMLElement|null)=>{if(!visible(value)||value.matches(':disabled'))return false;value.focus({preventScroll:true});return doc.activeElement===value||value.contains(doc.activeElement);};
 const focusables=(root:HTMLElement)=>[...root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex],[contenteditable]:not([contenteditable="false"])')].filter(x=>x.tabIndex>=0&&!x.matches(':disabled')&&visible(x));
 const resolveElement=(record:BoundLayer)=>{record.element=record.input.element?.()??record.element;return record.element;};
 const rootsFor=(modal:OverlayLayer)=>[...records.values()].filter(r=>r.layer.token===modal.token||stack.isDescendant(r.layer.token,modal.token)).map(resolveElement).filter((x):x is HTMLElement=>!!x);
 const modal=()=>{const layers=stack.getSnapshot().filter(x=>x.modal&&(x.scope==='global'||x.owner===stack.getActiveOwner()));return layers.filter(x=>x.scope==='global').at(-1)??layers.at(-1);};
 const firstFocus=(layer:OverlayLayer)=>{const item=records.get(layer.token),element=item?resolveElement(item):null,initial=item?.input.initialFocus?.();return visible(initial??null)&&!initial!.matches(':disabled')?initial!:(element?(focusables(element)[0]??element):null);};
 const restore=(element:HTMLElement,prior:Presentation)=>{prior.observer.disconnect();if(element.style.zIndex===prior.appliedZ)element.style.zIndex=prior.zIndex;if(prior.appliedPointer&&element.style.pointerEvents===prior.appliedPointer)element.style.pointerEvents=prior.pointerEvents;};
 const present=(item:BoundLayer,index:number)=>{
  const panel=resolveElement(item),backdrop=item.input.backdrop?.()??null,desired=new Map<HTMLElement,number>();
  const base=(item.layer.scope==='global'?1000000:1000)+index*2;
  if(backdrop)desired.set(backdrop,base);if(panel)desired.set(panel,base+1);
  for(const [element,prior] of item.presentation)if(!desired.has(element)){restore(element,prior);item.presentation.delete(element);}
  for(const [element,z] of desired){let prior=item.presentation.get(element);if(!prior){const observer=new view.MutationObserver(()=>{const current=item.presentation.get(element);if(!disposed&&current&&records.get(item.layer.token)===item&&element.style.zIndex!==current.appliedZ)sync();});prior={zIndex:element.style.zIndex,pointerEvents:element.style.pointerEvents,appliedZ:String(z),observer};item.presentation.set(element,prior);observer.observe(element,{attributes:true,attributeFilter:['style']});}prior.appliedZ=String(z);if(element.style.zIndex!==prior.appliedZ)element.style.zIndex=prior.appliedZ;if(!element.style.pointerEvents){element.style.pointerEvents='auto';prior.appliedPointer='auto';}}
 };
 function sync(){
  if(disposed)return;const layers=stack.getSnapshot(),tokens=new Set(layers.map(x=>x.token)),removed=[...records.values()].filter(x=>!tokens.has(x.layer.token));
  const active=node(doc.activeElement),hadFocus=removed.some(x=>x.input.restoreFocus!==false&&x.element?.contains(active))||doc.activeElement===doc.body;
  for(const item of removed){item.unlock.forEach(f=>f());for(const [element,prior] of item.presentation)restore(element,prior);records.delete(item.layer.token);}
  const added:BoundLayer[]=[];
  for(const layer of layers){const prior=records.get(layer.token);if(prior){prior.layer=layer;resolveElement(prior);continue;}const input=stack.registration(layer.token)!;
   const opener=Object.hasOwn(input,'trigger')?input.trigger??null:(doc.activeElement instanceof view.HTMLElement?doc.activeElement as HTMLElement:null),element=input.element?.()??null;
   const item:BoundLayer={layer,input,element,trigger:opener,unlock:[],presentation:new Map(),initialFocusPending:input.autoFocus!==false};records.set(layer.token,item);added.push(item);
   if(layer.modal){const roots=layer.scope==='global'?[...options.globalRoots()]:[options.contentRoot(layer.owner),options.toolbarRoot?.(layer.owner)].filter((x):x is HTMLElement=>!!x);
    for(const other of records.values())if(other!==item&&other.element&&other.layer.scope===layer.scope&&(layer.scope==='global'||other.layer.owner===layer.owner)&&!other.element.contains(element))roots.push(other.element);
    for(const root of new Set(roots))if(!element||!root.contains(element))item.unlock.push(suspendWindowContent(root));
   }
  }
  layers.forEach((layer,index)=>present(records.get(layer.token)!,index));
  const top=stack.top();
  for(const item of records.values())if(top?.token===item.layer.token&&item.initialFocusPending&&(item.layer.modal||item.layer.kind==='menu'||item.input.autoFocus===true)&&(item.layer.scope==='global'||item.layer.owner===stack.getActiveOwner())){const target=firstFocus(item.layer);focus(target);if(target&&(doc.activeElement===target||target.contains(doc.activeElement)))item.initialFocusPending=false;}
  if(lastActiveOwner!==stack.getActiveOwner()&&top?.scope==='window'&&top.modal&&!records.get(top.token)?.element?.contains(doc.activeElement)&&!(doc.activeElement as Element|null)?.closest('.os-titlebar'))focus(firstFocus(top));
  lastActiveOwner=stack.getActiveOwner();
  if(removed.length&&hadFocus&&!added.length){
   const eligible=removed.filter(x=>x.input.restoreFocus!==false&&(x.layer.scope==='global'||x.layer.owner===stack.getActiveOwner()));
   const ancestors=eligible.filter(x=>!x.layer.parent||!removed.some(p=>p.layer.token===x.layer.parent)).reverse();
   const openers=ancestors.map(x=>x.trigger).filter((x):x is HTMLElement=>{if(!visible(x))return false;const owner=surfaceOwner(x);return !owner||owner===stack.getActiveOwner();});
   if(!openers.some(focus)){
    if(top)focus(firstFocus(top));else {const previous=ancestors[0];if(previous)focus(options.fallbackFocus(previous.layer.owner,previous.layer.scope));}
    // A picker caller can keep its trigger disabled until the close promise
    // settles. Retry after that commit only if focus, owner and layer stayed
    // unchanged; never take focus back from a later user action or another modal.
    const opener=openers[0],active=doc.activeElement,owner=stack.getActiveOwner(),topToken=top?.token??null;
    if(opener?.matches(':disabled'))void afterOverlayCommit().then(()=>{if(!disposed&&doc.activeElement===active&&stack.getActiveOwner()===owner&&(stack.top()?.token??null)===topToken)focus(opener);});
   }
  }
 }
 const key=(event:KeyboardEvent)=>{
  const targetOwner=event.target instanceof view.Element?surfaceOwner(event.target):null;
  if(targetOwner&&targetOwner!==stack.getActiveOwner())return;
  if(composing||event.isComposing||event.keyCode===229){if(event.key==='Escape'&&stack.top())event.stopImmediatePropagation();return;}
  if(event.defaultPrevented)return;
  if(event.key==='Escape'){if(options.beforeEscape?.(event))return;stack.handleEscape(event);return;}
  if(event.key!=='Tab')return;const current=modal();if(!current)return;
  if(current.scope==='window'&&!options.windowRoot(current.owner)?.contains(node(event.target)))return;
  const roots=rootsFor(current),all=roots.flatMap(focusables),first=all[0],last=all.at(-1),active=doc.activeElement;
  if(!all.length){event.preventDefault();focus(records.get(current.token)?.element??null);}
  else if(event.shiftKey&&(active===first||!all.includes(active as HTMLElement))){event.preventDefault();focus(last!);}
  else if(!event.shiftKey&&(active===last||!all.includes(active as HTMLElement))){event.preventDefault();focus(first);}
 };
 const pointer=(event:PointerEvent)=>{
  blockPointerClickUntil=0;if(event.defaultPrevented)return;let top=stack.top();const target=node(event.target);
  if(top?.kind==='tooltip'&&!top.policy.outside){const candidates=stack.getSnapshot().filter(x=>x.kind!=='tooltip'&&(x.scope==='global'||x.owner===stack.getActiveOwner()));top=candidates.filter(x=>x.scope==='global').at(-1)??candidates.at(-1)??null;}
  if(!top||!target)return;
  const item=records.get(top.token);if(item&&resolveElement(item)?.contains(target)||item?.trigger?.contains(target))return;
  if(top.kind==='menu'&&[...records.values()].some(record=>record.layer.kind==='menu'&&stack.isDescendant(top!.token,record.layer.token)&&resolveElement(record)?.contains(target)))return;
  if(top.scope==='window'&&!options.windowRoot(top.owner)?.contains(target)&&(top.modal||!top.policy.outside))return;
  if(top.scope==='window'&&(target as Element).closest?.('.os-titlebar'))return;
  if(!top.modal&&!top.policy.outside)return;
  stack.consume(event);blockPointerClickUntil=Date.now()+1000;
  if(top.policy.outside&&!top.closing)void stack.requestClose(top.token,'outside');
 };
 const click=(event:MouseEvent)=>{if(event.detail>0&&Date.now()<blockPointerClickUntil){blockPointerClickUntil=0;stack.consume(event);}};
 const focusIn=(event:FocusEvent)=>{
  if(composing&&event.target!==compositionTarget){composing=false;compositionTarget=null;}
  if(redirecting)return;const current=modal(),target=node(event.target);if(!current||!target||rootsFor(current).some(root=>root.contains(target)))return;
  if(current.scope==='window'&&(!options.windowRoot(current.owner)?.contains(target)||(target as Element).closest?.('.os-titlebar')))return;
  redirecting=true;try{focus(firstFocus(current));}finally{redirecting=false;}
 };
 const start=(event:CompositionEvent)=>{composing=true;compositionTarget=event.target;};const end=()=>{composing=false;compositionTarget=null;};
 doc.addEventListener('keydown',key,true);doc.addEventListener('pointerdown',pointer,true);doc.addEventListener('click',click,true);doc.addEventListener('focusin',focusIn,true);doc.addEventListener('compositionstart',start,true);doc.addEventListener('compositionend',end,true);view?.addEventListener('blur',end);
 const observer=new view.MutationObserver(()=>{if([...records.values()].some(record=>!record.element?.isConnected||record.input.element?.()!==record.element||record.input.backdrop&&!record.presentation.has(record.input.backdrop()!)))sync();});observer.observe(doc.body,{childList:true,subtree:true});
 const unsubscribe=stack.subscribe(sync);sync();return()=>{if(disposed)return;disposed=true;observer.disconnect();unsubscribe();doc.removeEventListener('keydown',key,true);doc.removeEventListener('pointerdown',pointer,true);doc.removeEventListener('click',click,true);doc.removeEventListener('focusin',focusIn,true);doc.removeEventListener('compositionstart',start,true);doc.removeEventListener('compositionend',end,true);view?.removeEventListener('blur',end);for(const record of records.values()){record.unlock.forEach(fn=>fn());for(const [element,prior] of record.presentation)restore(element,prior);}records.clear();};
}
