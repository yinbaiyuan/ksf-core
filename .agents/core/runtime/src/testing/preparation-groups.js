import {loadCatalog,fail} from './catalog.js';
import {targets,assignedToTarget,createVerificationPlan} from './ci-plan.js';

// Preparation is read-only input work. A full run can derive it from the exact
// source before the canonical plan/audit finishes. Consumers still validate
// that canonical plan, native host and same-run seed provenance before testing.
export function selectPreparationGroups(root,{prepared,os,toolchains,full,groups=''},identity,host={platform:process.platform,architecture:process.arch}) {
 const invalid=()=>fail('TEST_CI_PREPARATION_INVALID','Preparation groups must match the source target and real native host.');
 if(typeof full!=='boolean'||typeof toolchains!=='boolean'||typeof groups!=='string')invalid();
 const target=targets.find(t=>t.prepared===prepared);
 if(!target||target.os!==os||target.toolchains!==toolchains||target.platform!==host.platform||target.architecture!==host.architecture)invalid();
 let supplied;
 if(groups){try{supplied=JSON.parse(groups);}catch{invalid();}}
 if(full){
  const include=createVerificationPlan(root,{full:true},identity).groups.filter(g=>g.prepared===prepared);
  if(!include.length||groups&&JSON.stringify(supplied)!==JSON.stringify({include}))invalid();
  return {include};
 }
 if(!supplied||!Array.isArray(supplied.include)||!supplied.include.length||supplied.include.length>target.limit)invalid();
 const catalog=loadCatalog(root),allowed=new Set(catalog.tests.filter(t=>assignedToTarget(t,target)).map(t=>t.path)),ids=new Set(),files=new Set();
 for(const g of supplied.include){
  if(!g||g.target!==target.target||g.prepared!==prepared||g.os!==os||g.platform!==host.platform||g.architecture!==host.architecture||g.toolchains!==toolchains||
   !['all','native','shared'].includes(g.profile)||typeof g.id!=='string'||!new RegExp('^'+target.target+'-[1-9][0-9]*$').test(g.id)||Number(g.id.slice(target.target.length+1))>target.limit||ids.has(g.id)||!Array.isArray(g.files)||!g.files.length)invalid();
  ids.add(g.id);
  for(const path of g.files){if(!allowed.has(path)||files.has(path))invalid();files.add(path);}
  const profile=target.profile==='all'&&g.files.every(path=>catalog.tests.find(t=>t.path===path).verification.lane==='native')?'native':target.profile;
  if(g.profile!==profile)invalid();
 }
 return supplied;
}
