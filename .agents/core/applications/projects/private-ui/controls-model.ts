export interface NumberConstraints {min?:number;max?:number;step?:number;required?:boolean}
/** Editing retains its exact text. Only an explicit commit validates or produces a number. */
export function parseNumberDraft(draft:string,{min,max,step=1,required=false}:NumberConstraints={}):{ok:true;value:number|null}|{ok:false;message:string}{
  if((min!==undefined&&!Number.isFinite(min))||(max!==undefined&&!Number.isFinite(max))||!Number.isFinite(step)||step<=0||(min!==undefined&&max!==undefined&&min>max))return {ok:false,message:'数值范围或步长配置无效'};
  const text=draft.trim();if(!text)return required?{ok:false,message:'请输入数值'}:{ok:true,value:null};
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)||!Number.isFinite(Number(text)))return {ok:false,message:'请输入完整数值'};
  const value=Number(text);if(min!==undefined&&value<min)return {ok:false,message:'不能小于 '+min};if(max!==undefined&&value>max)return {ok:false,message:'不能大于 '+max};return {ok:true,value};
}
/** Preserve common decimal steps without rounding large integers or arbitrary text drafts. */
export function stepNumber(value:number,step:number,direction:1|-1):number{
  const places=(value:number)=>{const [mantissa,exponent='0']=String(value).toLowerCase().split('e');return Math.max(0,(mantissa.split('.')[1]?.length??0)-Number(exponent));};
  const precision=Math.max(places(value),places(step)),scale=10**precision;
  if(precision<=15&&Number.isSafeInteger(Math.round(value*scale))&&Number.isSafeInteger(Math.round(step*scale))){
    const integer=Math.round(value*scale)+direction*Math.round(step*scale);
    if(Number.isSafeInteger(integer))return integer/scale;
  }
  return value+direction*step;
}
