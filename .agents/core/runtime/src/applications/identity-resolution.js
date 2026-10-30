import {LEGACY_APPLICATION_IDS} from './identities.js';

// An alias is usable only after this installation recorded its identity migration.
export function resolveInstalledApplicationId(installed,id){
  if(Object.hasOwn(installed,id))return id;
  const target=Object.hasOwn(LEGACY_APPLICATION_IDS,id)?LEGACY_APPLICATION_IDS[id]:null;
  return target&&installed[target]?.legacyIds?.includes(id)?target:id;
}
