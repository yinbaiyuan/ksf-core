import {check} from './store.mjs';
import {inputFields,fieldValues} from '../../sdk/server/workflow-contract.mjs';
export const manualOffer=()=>({offerId:'manual',revision:1,name:'手动处理',description:'通用请求，由本实例手动判断和处理。',inputs:'说明目标并提供必要材料。',outputs:'由承接方根据实际情况交付。',handling:'manual',delivery:'confirm'});
export const publicOffer=rule=>({...Object.fromEntries(['offerId','revision','name','description','inputs','outputs','handling','delivery'].map(k=>[k,rule[k]])),...(rule.inputFields?.length?{inputFields:inputFields(rule.inputFields)}:{})});
export const offerCatalog=(state,features=[])=>({revision:state.revision,offers:state.instanceMatches===false?[manualOffer()]:state.rules.filter(r=>r.published&&(features.includes('workflow-offers-v1')||r.handling!=='workflow'&&!r.inputFields?.length)).map(publicOffer)});
export function checkedOffer(value){
  check(value&&typeof value.offerId==='string'&&/^[a-zA-Z0-9-]{1,96}$/.test(value.offerId)&&Number.isSafeInteger(value.revision)&&value.revision>0,'声明编号或版本无效。');
  for(const [key,max] of [['name',80],['description',4000],['inputs',2000],['outputs',2000]])check(typeof value[key]==='string'&&value[key].length<=max,'公开声明内容无效。');
  check(['manual','plan','auto','workflow'].includes(value.handling)&&['auto','confirm'].includes(value.delivery),'公开处理方式无效。');
  if(value.offerId==='manual')return manualOffer();
  return publicOffer(value);
}
export function matchOffer(state,selection={}){
  const offerId=selection.offerId??'manual',revision=selection.offerRevision??(offerId==='manual'?1:0);
  if(offerId==='manual')return {offer:manualOffer(),rule:null,basis:'手动处理：等待 B 判断和处理'};
  const rule=state.instanceMatches!==false?state.rules.find(r=>r.offerId===offerId):null;
  const reason=!rule?'声明不存在':!rule.published?'声明已下架或尚未发布':rule.revision!==revision?'声明版本已变化':null;
  if(reason)return {offer:selection.offer?checkedOffer(selection.offer):null,rule:null,basis:reason+'，等待 B 处理；不会自动改选其他声明'};
  try{fieldValues(rule.inputFields??[],selection.offerInputs??{});}catch(e){return {offer:publicOffer(rule),rule:null,basis:e.message+'，等待 B 处理'};}
  return {offer:publicOffer(rule),rule:structuredClone(rule),basis:`按承接声明“${rule.name}” v${rule.revision}处理`};
}
