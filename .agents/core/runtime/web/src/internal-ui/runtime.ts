// Private complete-document identity. No component registry or renderer contract.
let descriptor:Readonly<{frontendReleaseId:string}>|undefined;
export function getUIRuntime(){
 if(descriptor)return descriptor;
 const element=document.getElementById('ksf-frontend-runtime')??document.getElementById('ksf-ui-runtime-descriptor');
 if(!element||element.tagName!=='SCRIPT'||element.getAttribute('type')!=='application/json')throw Error('工作台缺少完整前端版本标识。');
 const value=JSON.parse(element.textContent??'');if(!/^[a-f0-9]{64}$/.test(value.frontendReleaseId??''))throw Error('前端版本标识无效。');
 return descriptor=Object.freeze({frontendReleaseId:value.frontendReleaseId});
}
