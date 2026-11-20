import type {ChoiceOption} from './inputs';
export function transferLists(options:readonly ChoiceOption[],values:readonly string[]){
 const byId=new Map(options.map(option=>[option.value,option]));
 return {source:options.filter(option=>!values.includes(option.value)),target:[...new Set(values)].flatMap(id=>byId.has(id)?[byId.get(id)!]:[])};
}
export function transferSelection(ids:readonly string[],options:readonly ChoiceOption[]){
 const allowed=new Set(options.filter(option=>!option.disabled).map(option=>option.value));
 return [...new Set(ids)].filter(id=>allowed.has(id));
}
export function moveTransfer(values:readonly string[],selected:readonly string[],options:readonly ChoiceOption[],direction:'add'|'remove'){
 const lists=transferLists(options,values),valid=transferSelection(selected,direction==='add'?lists.source:lists.target);
 return direction==='add'?[...valid,...values.filter(id=>!valid.includes(id))]:values.filter(id=>!valid.includes(id));
}
export function transferRange(selected:readonly string[],options:readonly ChoiceOption[],anchor:string|null,id:string,checked:boolean,shift:boolean){
 const from=options.findIndex(option=>option.value===anchor),to=options.findIndex(option=>option.value===id);
 const ids=shift&&from>=0&&to>=0?options.slice(Math.min(from,to),Math.max(from,to)+1).filter(option=>!option.disabled).map(option=>option.value):[id];
 return checked?[...new Set([...selected,...ids])]:selected.filter(key=>!ids.includes(key));
}
