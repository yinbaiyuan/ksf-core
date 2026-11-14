import {normalizeDistributionRoots} from '../sources/distribution.js';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import YAML from '../vendor/yaml/dist/index.js';
import {catalog} from '../objects/catalog.js';
import {referenceResults,resolveObject} from '../objects/references.js';
import {readTree} from '../objects/storage.js';
import {packageRoot,installedScopes} from './storage.js';
import {configuredSources} from '../sources/storage.js';
import {digest,fault} from '../store-catalog/protocol.js';
import {contentIdentity,groupsOf} from './content.js';
import {assertCurrentBindings} from './pins.js';

const fingerprint=value=>digest(JSON.stringify(value));
const fail=(code,message,details)=>{throw Object.assign(fault(code,message),{details});};
export function snapshotPacket(root,sourceId,installed){
 const tree=readTree(packageRoot(root,sourceId,installed.generation));return{sourceId,objects:installed.objects,files:tree.files.filter(f=>!['ksf-source.yaml','installed-manifest.json'].includes(f.path)).map(f=>({path:f.path,content:f.bytes.toString('base64'),sha256:f.digest,size:f.bytes.length,mode:f.mode&0o111?0o755:0o644}))};
}
export function proposedCatalog(root,state){return catalog(root,{linked:false,extraSources:[...configuredSources(root).filter(s=>!state.adopted.includes(s.id)),...installedScopes(root,{state})]});}
export function validateTransition(root,before,after,affected){
 const old=proposedCatalog(root,before),next=proposedCatalog(root,after),errors=[];
 for(const row of next.rows.filter(r=>affected.has(r.source)))errors.push(...row.errors,...referenceResults(next,row).filter(d=>d.error).map(d=>d.error));
 for(const issue of next.errors)if(affected.has(issue.source))errors.push(issue);
 // Definitions that were already invalid elsewhere do not block an independent
 // installation. Every previously valid exact reference must remain valid.
 for(const row of old.rows.filter(r=>!affected.has(r.source)&&!r.errors.length&&r.metadata.status!=='archived'))for(const reference of row.metadata.references??[]){const was=referenceResults(old,{...row,metadata:{...row.metadata,references:[reference]}})[0];if(was?.error)continue;const current=next.rows.find(r=>r.source===row.source&&r.id===row.id);if(current){const now=referenceResults(next,{...current,metadata:{...current.metadata,references:[reference]}})[0];if(now?.error)errors.push({...now.error,dependent:row.id});}}
 if(errors.length)fail('ABILITY_STORE_DEPENDENCY_CONFLICT','切换后依赖闭包不完整，已保留当前安装。',{errors});assertCurrentBindings(root,old,next);return next;
}
export function compositeImportPlan(root,state,packet,input={}){
 const groups=groupsOf(packet),incoming=groups.flatMap(group=>group.objects.map(object=>({group,object:{...object,publication:{...object.publication,verified:false},contentDigest:contentIdentity(group,object)}}))),existing=new Map(),snapshots=new Map();
 for(const [sourceId,p] of Object.entries(state.installed)){const snapshot=snapshotPacket(root,sourceId,p);snapshots.set(sourceId,snapshot);for(const object of p.objects){if(existing.has(object.id))fail('ABILITY_STORE_SOURCE_CONFLICT','本机同 ID 存在多个安装来源，请先显式处理。',{id:object.id});const requested=incoming.some(item=>item.object.id===object.id),actual=requested?contentIdentity(snapshot,object):object.contentDigest;if(requested&&object.contentDigest&&object.contentDigest!==actual)fail('ABILITY_STORE_INSTALLED_INTEGRITY','已安装能力的内容或资源已改变，请先恢复安装副本。',{id:object.id,sourceId});existing.set(object.id,{sourceId,object:{...object,contentDigest:actual}});}}
 const coreIds=new Set(catalog(root,{linked:false}).rows.filter(row=>row.source==='system'&&row.id).map(row=>row.id));for(const {object} of incoming)if(coreIds.has(object.id))fail('ABILITY_STORE_CORE_MANAGED','Core 基础能力随 Core 更新，不能从源或文件替换。',{id:object.id});
 const targetById=new Map(),reused=[],changed=new Set(),known={...(state.knownReleases??{})};
 for(const {group,object} of incoming){const prior=existing.get(object.id),key=object.id+'@'+object.version,history=known[key];if(history&&history!==object.contentDigest)fail('ABILITY_STORE_VERSION_REUSED','已知历史存在同版本不同内容。',{id:object.id,version:object.version});
  let target=group.sourceId;if(prior){if(prior.object.version===object.version){if(prior.object.contentDigest!==object.contentDigest)fail('ABILITY_STORE_VERSION_REUSED','同版本能力内容不同。',{id:object.id,version:object.version});target=prior.sourceId;reused.push({id:object.id,sourceId:target,publicationVerified:prior.object.publication?.verified===true});}
   else{const cmp=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];};if(cmp(object.version,prior.object.version)<0)fail('ABILITY_STORE_VERSION_CONFLICT','能力包低于已安装版本，请使用受控回退。',{id:object.id});if(prior.sourceId!==target&&prior.object.publication?.sourceId!==object.publication?.sourceId&&!input.switchSource)fail('ABILITY_STORE_SOURCE_CONFLICT','新版能力的来源与已装来源不同，请显式核对换源。',{id:object.id,from:prior.sourceId,to:target});target=input.switchSource?target:prior.sourceId;changed.add(object.id);}}
  else changed.add(object.id);targetById.set(object.id,target);known[key]=object.contentDigest;
 }
 const temp=join(root,'.agents/runtime-data/ability-store/previews',randomUUID()),targets=new Map();mkdirSync(temp,{recursive:true});
 try{
  for(const {group,object} of incoming){const sourceId=targetById.get(object.id);if(!targets.has(sourceId)){const old=state.installed[sourceId],path=join(temp,sourceId),snapshot=snapshots.get(sourceId);mkdirSync(path,{recursive:true});const files=new Map(snapshot?.files.map(f=>[f.path,f])??[]);targets.set(sourceId,{sourceId,path,origin:old?.origin??{id:sourceId,name:group.sourceName??packet.sourceName??sourceId,kind:'package',commit:null,dirty:false},roots:[...(old?.roots??[])],objects:new Map((old?.objects??[]).map(o=>[o.id,{...o,contentDigest:existing.get(o.id).object.contentDigest}])),files});}
   const target=targets.get(sourceId);if(!changed.has(object.id)){if(object.distribution)target.objects.set(object.id,{...target.objects.get(object.id),distribution:object.distribution});continue;}
   for(const path of target.files.keys())if(path.startsWith(object.relative+'/'))target.files.delete(path);
   const closure=group.files;for(const file of closure){const owner=group.objects.find(o=>file.path.startsWith(o.relative+'/'));if(owner&&owner.id!==object.id)continue;const prior=target.files.get(file.path);if(prior&&prior.sha256!==file.sha256&&!file.path.startsWith(object.relative+'/')){const consumed=[...target.objects.values()].filter(o=>o.id!==object.id&&!changed.has(o.id));for(const o of consumed){const snapshot=snapshots.get(sourceId);if(snapshot&&contentIdentity(snapshot,o)!==contentIdentity({...snapshot,files:[...snapshot.files.filter(f=>f.path!==file.path),file]},o))fail('ABILITY_STORE_RESOURCE_CONFLICT','共享资源改变了未选中能力，请提供相关能力的新版本。',{id:o.id,path:file.path});}}target.files.set(file.path,file);}
   const dependencies=object.dependencies.map(d=>({...d,source:d.source==='system'?'system':targetById.get(d.id)??d.source,...(d.source==='system'?{}:{contentDigest:incoming.find(v=>v.object.id===d.id)?.object.contentDigest??existing.get(d.id)?.object.contentDigest})}));target.objects.set(object.id,{...object,dependencies});
  }
  for(const id of packet.roots){const target=targets.get(targetById.get(id));if(!target.roots.includes(id))target.roots.push(id);}
  for(const target of targets.values())target.roots=normalizeDistributionRoots(target.roots,[...target.objects.values()]);
  // Removing a reference in a new product release retires its unused members.
  // Shared members and definitions used by personal/other sources stay intact.
  const keep=new Set(),visit=(sourceId,id)=>{const key=sourceId+':'+id;if(keep.has(key))return;keep.add(key);const object=targets.get(sourceId)?.objects.get(id)??state.installed[sourceId]?.objects.find(o=>o.id===id);for(const d of object?.dependencies??[])if(d.source!=='system')visit(d.source,d.id);};
  for(const [sourceId,installed] of Object.entries(state.installed))for(const id of targets.get(sourceId)?.roots??installed.roots)visit(sourceId,id);
  for(const [sourceId,target] of targets)for(const id of target.roots)visit(sourceId,id);
  const runtime=catalog(root);for(const row of runtime.rows.filter(r=>!targets.has(r.source)&&!state.installed[r.source]&&!r.errors.length))for(const d of referenceResults(runtime,row))if(d.id&&d.source!=='system'&&!d.error)visit(d.source,d.id);
  for(const target of targets.values())for(const id of target.objects.keys())if(!keep.has(target.sourceId+':'+id)){const object=target.objects.get(id);target.objects.delete(id);for(const file of target.files.keys())if(file.startsWith(object.relative+'/'))target.files.delete(file);}
  const candidate=structuredClone(state),plans=[];
  for(const target of targets.values()){
   target.roots=normalizeDistributionRoots(target.roots,[...target.objects.values()]);
   for(const file of target.files.values()){const path=join(target.path,file.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.from(file.content,'base64'),{mode:file.mode});}
   writeFileSync(join(target.path,'ksf-source.yaml'),YAML.stringify({kind:'ksf-ability-source',schema_version:2,id:target.sourceId,name:target.origin.name}));
   // Preview generations are deliberately never made authoritative.
   const generation=randomUUID(),objects=[...target.objects.values()];target.generation=generation;candidate.installed[target.sourceId]={generation,origin:target.origin,roots:target.roots,objects};
   plans.push({action:'import',sourceId:target.sourceId,origin:target.origin,roots:target.roots,objects,files:new Map([...target.files].map(([path,f])=>[path,{bytes:Buffer.from(f.content,'base64'),digest:f.sha256,mode:f.mode}])),directories:[],origins:[]});
  }
  const old=proposedCatalog(root,state),entries=installedScopes(root,{state}).filter(s=>!targets.has(s.id)),next=catalog(root,{linked:false,extraSources:[...configuredSources(root).filter(s=>!state.adopted.includes(s.id)),...entries,...[...targets.values()].map(t=>({id:t.sourceId,root:t.path,installed:true,objects:[...t.objects.values()]}))]});
  const affected=new Set(targets.keys()),errors=[];for(const row of next.rows.filter(r=>affected.has(r.source)))errors.push(...row.errors,...referenceResults(next,row).filter(r=>r.error).map(r=>r.error));errors.push(...next.errors.filter(e=>affected.has(e.source)));if(errors.length)fail('ABILITY_STORE_DEPENDENCY_CONFLICT','多来源能力闭包无法解析。',{errors});
  // Check personal definitions and work bindings against the actual proposed graph.
  for(const row of old.rows.filter(r=>!affected.has(r.source)&&!r.errors.length)){for(const ref of row.metadata.references??[]){const before=referenceResults(old,{...row,metadata:{...row.metadata,references:[ref]}})[0];if(before?.error)continue;const after=referenceResults(next,{...row,metadata:{...row.metadata,references:[ref]}})[0];if(after?.error)fail('ABILITY_STORE_EXTERNAL_DEPENDENCY','个人或其他能力仍依赖旧版本，请调整引用或延期。',{id:row.id,sourceId:row.source,reference:ref});}}
  assertCurrentBindings(root,old,next);for(const part of plans)for(const object of part.objects){object._row=next.rows.find(row=>row.id===object.id&&row.source===part.sourceId);object._catalog=next;}
  return{action:'import',sourceId:packet.sourceId,roots:packet.roots,objects:plans.flatMap(p=>p.objects.map(o=>({...o,sourceId:p.sourceId}))),plans,reused,knownReleases:known,group:[...changed],planDigest:fingerprint([packet,plans.map(p=>[p.sourceId,p.roots,p.objects.map(o=>[o.id,o.version,o.contentDigest])])]),dispose:()=>rmSync(temp,{recursive:true,force:true})};
 }catch(error){rmSync(temp,{recursive:true,force:true});throw error;}
}

export function rollbackAbilityPlan(root,state,input){
 const transactionId=state.previous?.[input.sourceId],record=state.history?.[transactionId];if(!record||!Object.values(record.changes).some(change=>change.before))fail('ABILITY_STORE_ROLLBACK_MISSING','没有保留可回退的安装代次。');const next=structuredClone(state),affected=new Set(Object.keys(record.changes));
 for(const [sourceId,change] of Object.entries(record.changes)){if(state.installed[sourceId]?.generation!==change.afterGeneration)fail('ABILITY_STORE_ROLLBACK_CHANGED','联动组在此后已有独立变更，请重新核对恢复范围。',{sourceId});if(change.before){const packet=snapshotPacket(root,sourceId,change.before);for(const object of change.before.objects){const actual=contentIdentity(packet,object),known=state.knownReleases?.[object.id+'@'+object.version];if(object.contentDigest&&object.contentDigest!==actual||known&&known!==actual)fail('ABILITY_STORE_ROLLBACK_INTEGRITY','历史安装代次的内容或资源已损坏，当前安装保留。',{id:object.id});}next.installed[sourceId]=change.before;}else delete next.installed[sourceId];}
 validateTransition(root,state,next,affected);return{action:'rollback',sourceId:input.sourceId,transactionId,restore:record.changes,group:[...affected],roots:Object.values(record.changes).flatMap(c=>c.before?.roots??[]),objects:Object.entries(record.changes).flatMap(([sourceId,c])=>(c.before?.objects??[]).map(o=>({...o,sourceId}))),planDigest:fingerprint(['rollback',transactionId,record])};
}
export function applyAbilityRollback(state,plan){for(const [sourceId,change] of Object.entries(plan.restore)){if(change.before)state.installed[sourceId]=change.before;else delete state.installed[sourceId];delete state.previous[sourceId];}if(!Object.values(state.previous).includes(plan.transactionId))delete state.history[plan.transactionId];}
