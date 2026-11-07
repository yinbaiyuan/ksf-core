export function textBase64(text){
  const bytes=new TextEncoder().encode(text);let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
}
export function reconcileNote(base,mine,latest){
  if(mine===latest.text)return {text:mine,base:latest,conflict:false};
  if(mine===base.text)return {text:latest.text,base:latest,conflict:false};
  if(latest.text===base.text)return {text:mine,base:latest,conflict:false};
  return {text:mine,base,conflict:true,latest};
}
