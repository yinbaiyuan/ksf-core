function invalid(message){throw Object.assign(new TypeError(message),{code:'APP_SESSION_INVALID'});}
export function validateSessionKey(key,recordVersion){
  if(typeof key!=='string'||!key.trim()||key.length>256||/[\u0000-\u001f\u007f]/.test(key)||!Number.isSafeInteger(recordVersion)||recordVersion<1)invalid('会话需要有限的稳定键与正整数记录版本。');
}
export function validateSessionValue(value){
  const visiting=new Set();
  function visit(v,depth){
    if(depth>64)invalid('会话层级过深。');
    if(v===null||typeof v==='string'||typeof v==='boolean')return;
    if(typeof v==='number'&&Number.isFinite(v))return;
    if(!v||typeof v!=='object'||(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))||visiting.has(v))invalid('会话只能保存无循环的JSON数据。');
    visiting.add(v);if(Array.isArray(v)&&(Object.keys(v).length!==v.length||Object.keys(v).some((key,index)=>key!==String(index))))invalid('会话数组不能有空位或附加字段。');
    for(const k of Reflect.ownKeys(v)){if(Array.isArray(v)&&k==='length')continue;if(typeof k!=='string'||!Object.getOwnPropertyDescriptor(v,k)?.enumerable||Object.getOwnPropertyDescriptor(v,k)?.get)invalid('会话不能包含隐藏字段或访问器。');visit(v[k],depth+1);}visiting.delete(v);
  }
  visit(value,0);const text=JSON.stringify(value);
  if(new TextEncoder().encode(text).byteLength>512*1024)invalid('单条持久会话不能超过512KiB。');
}
