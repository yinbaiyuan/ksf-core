import {LEGACY_APPLICATION_IDS} from './identities.js';

// An alias is usable only after this installation recorded its identity migration.
export function resolveInstalledApplicationId(installed,id){
  if(Object.hasOwn(installed,id))return id;
  const target=Object.hasOwn(LEGACY_APPLICATION_IDS,id)?LEGACY_APPLICATION_IDS[id]:null;
  if(target&&installed[target]?.legacyIds?.includes(id))return target;
  const matches=Object.entries(installed).filter(([,app])=>app.legacyIds?.includes(id));if(matches.length>1)throw Object.assign(Error('历史应用身份存在多个迁移目标。'),{code:'APP_ID_AMBIGUOUS'});return matches[0]?.[0]??id;
}
