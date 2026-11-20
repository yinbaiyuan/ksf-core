import {validateSessionValue} from '../session-contract.js';
const invalid=message=>{throw Object.assign(Error(message),{code:'UI_DOCUMENT_INVALID',status:409});};
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const keys=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))invalid('窗口恢复记录含不支持的字段，原件已保留。');};
function rectangle(value){keys(value,['x','y','width','height']);if(!['x','y','width','height'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key])&&Math.abs(value[key])<=32768)||value.width<0||value.height<0)invalid('窗口恢复尺寸无效。');return {x:value.x,y:value.y,width:value.width,height:value.height};}
/** Host window metadata only. Application drafts and operation identities stay in their own B3 sessions. */
export function parseDocumentWindowSet(value){
 try{validateSessionValue(value);}catch{invalid('窗口恢复记录必须是有界JSON数据，原件已保留。');}
 keys(value,['schemaVersion','frontendReleaseId','windows','activeId','desktop','activeGroupId']);
 if(value.schemaVersion!==1)invalid('窗口恢复记录版本不兼容，原件已保留。');
 if(typeof value.frontendReleaseId!=='string'||!/^[a-f0-9]{64}$/.test(value.frontendReleaseId)||!Array.isArray(value.windows)||value.windows.length>50||typeof value.desktop!=='boolean'||!text(value.activeGroupId,256)||!value.activeGroupId)invalid('窗口恢复元数据无效。');
 const ids=new Set(),windows=value.windows.map(window=>{
  keys(window,['id','appId','releaseDigest','search','bounds','normal','mode','minimized','z','object']);
  if(!text(window.id,128)||!window.id||ids.has(window.id)||!text(window.appId,80)||!/^com\.[a-z0-9-]+\.[a-z][a-z0-9-]*$/.test(window.appId)||!text(window.search,8192)||!['normal','max','left','right'].includes(window.mode)||typeof window.minimized!=='boolean'||!Number.isSafeInteger(window.z)||window.z<0)invalid('窗口身份或状态无效。');
  if(window.releaseDigest!==undefined&&(typeof window.releaseDigest!=='string'||!/^[a-f0-9]{64}$/.test(window.releaseDigest)))invalid('应用包恢复摘要无效。');ids.add(window.id);
  let object;if(window.object!==undefined){if(window.object===null)object=null;else{keys(window.object,['title','detail']);if(!text(window.object.title,512)||window.object.detail!==undefined&&!text(window.object.detail,2048))invalid('窗口对象标题无效。');object={title:window.object.title,...(window.object.detail!==undefined?{detail:window.object.detail}:{})};}}
  return {id:window.id,appId:window.appId,...(window.releaseDigest!==undefined?{releaseDigest:window.releaseDigest}:{}),search:window.search,bounds:rectangle(window.bounds),normal:rectangle(window.normal),mode:window.mode,minimized:window.minimized,z:window.z,...(object!==undefined?{object}:{})};
 });
 if(value.activeId!==null&&(!text(value.activeId,128)||!ids.has(value.activeId)))invalid('恢复的活动窗口不在窗口组内。');
 return {schemaVersion:1,frontendReleaseId:value.frontendReleaseId,windows,activeId:value.activeId,desktop:value.desktop,activeGroupId:value.activeGroupId};
}
