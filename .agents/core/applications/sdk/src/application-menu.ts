export interface ApplicationMenuEvent { id:string; checked?:boolean }
export interface ApplicationMenuItem {
 id:string; label:string; placement?:'menubar'|'application'; disabled?:boolean; checked?:boolean; separator?:boolean; danger?:boolean;
 children?:ApplicationMenuItem[];
 onAction?:(event:ApplicationMenuEvent)=>void|Promise<unknown>;
}
export interface ApplicationMenuRegistration { update(items:ApplicationMenuItem[]):void; dispose():void }
/** Window-local registry. Validate before publication; stale disposals cannot remove replacements. */
export function createApplicationMenuRegistry(){
 let items:ApplicationMenuItem[]=[],owner:object|null=null;const listeners=new Set<()=>void>();
 function validate(input:ApplicationMenuItem[]){
  const ids=new Set<string>();let count=0;
  function visit(rows:ApplicationMenuItem[],depth:number):ApplicationMenuItem[]{
   if(!Array.isArray(rows)||depth>4)throw Error('应用菜单最多支持四层。');
   return rows.map(row=>{
    if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id.trim()||row.id.length>128||row.id.startsWith('ksf.')||ids.has(row.id)||++count>64)throw Error('应用菜单需要唯一 ID，最多 64 项；ksf. 前缀由宿主保留。');
    ids.add(row.id);
    if(typeof row.label!=='string'||!row.label.trim()||row.label.length>120)throw Error('菜单名称需要 1–120 个字符。');
    if(row.placement!==undefined&&(depth!==1||!['menubar','application'].includes(row.placement)))throw Error('placement 只支持顶层 menubar/application。');
    for(const key of ['disabled','checked','separator','danger'] as const)if(row[key]!==undefined&&typeof row[key]!=='boolean')throw Error('菜单状态必须是布尔值。');
    if(row.children!==undefined){if(row.onAction!==undefined||row.checked!==undefined||(!Array.isArray(row.children)||!row.children.length))throw Error('子菜单需要非空子项，不能同时声明点击动作或勾选状态。');return {id:row.id,label:row.label,...(row.placement?{placement:row.placement}:{}),...(row.disabled!==undefined?{disabled:row.disabled}:{}),...(row.separator!==undefined?{separator:row.separator}:{}),...(row.danger!==undefined?{danger:row.danger}:{}),children:visit(row.children,depth+1)};}
    if(typeof row.onAction!=='function')throw Error('菜单动作需要 onAction 回调。');
    return {id:row.id,label:row.label,...(row.placement?{placement:row.placement}:{}),...Object.fromEntries(['disabled','checked','separator','danger'].filter(key=>row[key as keyof ApplicationMenuItem]!==undefined).map(key=>[key,row[key as keyof ApplicationMenuItem]])),onAction:row.onAction};
   });
  }
  return visit(input,1);
 }
 function publish(next:ApplicationMenuItem[]){items=next;listeners.forEach(listener=>listener());}
 return {
  getSnapshot:()=>items,
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  register(input:ApplicationMenuItem[]):ApplicationMenuRegistration{
   let latest=validate(input),disposed=false;const identity={},running=new Set<string>();
   function find(rows:ApplicationMenuItem[],id:string,blocked=false):ApplicationMenuItem|undefined{for(const row of rows){const disabled=blocked||!!row.disabled;if(row.id===id)return disabled?{...row,disabled:true}:row;const child=row.children&&find(row.children,id,disabled);if(child)return child;}}
   function snapshot(rows:ApplicationMenuItem[]):ApplicationMenuItem[]{return rows.map(row=>row.children?{...row,children:snapshot(row.children)}:{...row,...(running.has(row.id)?{disabled:true}:{}),onAction:async event=>{if(disposed||owner!==identity||running.has(row.id))return;const current=find(latest,row.id);if(!current||current.disabled||current.children)return;running.add(row.id);publish(snapshot(latest));try{return await current.onAction?.(event);}finally{running.delete(row.id);if(!disposed&&owner===identity)publish(snapshot(latest));}}});}
   owner=identity;publish(snapshot(latest));
   return {update(value){if(disposed||owner!==identity)return;const next=validate(value),changed=JSON.stringify(next)!==JSON.stringify(latest);latest=next;if(changed)publish(snapshot(latest));},dispose(){if(disposed)return;disposed=true;if(owner===identity){owner=null;publish([]);}}};
  },
 };
}
