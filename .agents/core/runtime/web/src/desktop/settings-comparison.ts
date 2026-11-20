/** Configuration values are JSON data; compare leaves so a long unchanged profile cannot hide the changed field. */
export function configurationDifferences(draft:unknown,latest:unknown):{field:string;draft:unknown;latest:unknown}[]{
 const result:{field:string;draft:unknown;latest:unknown}[]=[];
 const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
 function visit(left:unknown,right:unknown,path:string){
  if(JSON.stringify(left)===JSON.stringify(right))return;
  if(object(left)&&object(right)){for(const key of new Set([...Object.keys(left),...Object.keys(right)]))visit(left[key],right[key],path?path+'.'+key:key);return;}
  result.push({field:path||'设置',draft:left===undefined?'未设置':left,latest:right===undefined?'未设置':right});
 }
 visit(draft,latest,'');return result;
}
