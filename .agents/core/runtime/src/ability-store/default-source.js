export const DEFAULT_ABILITY_SOURCE=Object.freeze({id:'ksf-abilities',name:'KSF 公用能力源',kind:'http',location:'https://yinbaiyuan.github.io/ksf-abilities/index.json',enabled:true,locked:true,default:true});
export function withDefaultAbilitySource(sources){return [{...DEFAULT_ABILITY_SOURCE},...sources.filter(s=>s.id!==DEFAULT_ABILITY_SOURCE.id).map(({locked,default:preferred,...s})=>s)];}
