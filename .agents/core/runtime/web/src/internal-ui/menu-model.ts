export interface MenuShape {id:string;label:string;children?:readonly MenuShape[]}
/** IDs describe opening intent, including descendants; never derive a target from selection later. */
export function menuIds(items:readonly MenuShape[]):ReadonlySet<string>{
 const ids=new Set<string>();
 const visit=(rows:readonly MenuShape[],depth:number)=>{
  if(depth>8)throw Error('菜单层级不能超过8层。');
  for(const item of rows){
   if(typeof item.id!=='string'||!item.id.trim()||item.id.length>512||typeof item.label!=='string'||!item.label.trim())throw Error('菜单项需要稳定ID和非空文字。');
   if(ids.has(item.id))throw Error('同一菜单树的ID不能重复。');ids.add(item.id);
   if(item.children)visit(item.children,depth+1);
  }
 };visit(items,0);return ids;
}
export function menuMatch(labels:readonly string[],query:string,start:number):number{
 const text=query.normalize('NFKC').toLocaleLowerCase();
 for(let step=1;step<=labels.length;step++){const index=(Math.max(-1,start)+step)%labels.length;if(labels[index].normalize('NFKC').toLocaleLowerCase().startsWith(text))return index;}
 return -1;
}
