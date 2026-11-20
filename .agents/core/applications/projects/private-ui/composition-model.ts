/** Shared identity validation; index positions never become application identities. */
export function stableIds<T>(items:readonly T[],getId:(item:T)=>string):readonly string[]{
 const ids=items.map(getId),seen=new Set<string>();
 for(const id of ids){if(typeof id!=='string'||!id.trim()||seen.has(id))throw Error('列表需要非空且唯一的稳定ID。');seen.add(id);}
 return ids;
}
export function splitRange(available:number,minFirst:number,minSecond:number,min=0,max=100){
 if(![available,minFirst,minSecond,min,max].every(Number.isFinite)||available<0||minFirst<0||minSecond<0||min<0||max>100||min>max)throw Error('分栏尺寸与约束无效。');
 const low=Math.max(min,available?minFirst/available*100:0),high=Math.min(max,available?100-minSecond/available*100:100);
 return {min:Math.min(100,low),max:Math.max(0,high),fits:available>0&&low<=high};
}
export function constrainSplit(value:number,range:ReturnType<typeof splitRange>):number{
 if(!Number.isFinite(value))throw Error('分栏比例需要有限数值。');
 return range.fits?Math.max(range.min,Math.min(range.max,value)):Math.max(0,Math.min(100,value));
}
/** Count Unicode code points so an export/preview boundary never splits a surrogate pair. */
export function previewText(text:string,limit:number){
 if(!Number.isInteger(limit)||limit<1||limit>1000000)throw Error('预览长度需要为1至1000000的整数。');
 const points:string[]=[];let total=0;for(const point of text){if(total<limit)points.push(point);total++;}return {text:points.join(''),truncated:total>limit,total};
}
