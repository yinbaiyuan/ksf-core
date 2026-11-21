/** Numeric configuration remains a string until a user submits the editor. */
export function configurationNumber(text:string,label:string,min:number,max=Number.MAX_SAFE_INTEGER,integer=true){
 const value=text.trim();
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))throw new Error(`${label}需要填写有效数值。`);
 const number=Number(value);
 if(!Number.isFinite(number)||integer&&!Number.isSafeInteger(number)||number<min||number>max)throw new Error(`${label}应为 ${min} 至 ${max===Number.MAX_SAFE_INTEGER?'允许上限':max} 之间的${integer?'整数':'数值'}。`);
 return number;
}
