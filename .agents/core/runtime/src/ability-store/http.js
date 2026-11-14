import {distributionRequests} from '../sources/distribution.js';
import {join,dirname} from 'node:path';
import {mkdirSync,writeFileSync,rmSync,cpSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import YAML from '../vendor/yaml/dist/index.js';
import {createCatalogClient} from '../store-catalog/client.js';import {digest,fault} from '../store-catalog/protocol.js';
import {groupsOf,packetObjects,contentIdentity,contentFiles} from './content.js';
import {validateAbilityPackage,decodeAbilityPackage} from './package.js';
import {catalog} from '../objects/catalog.js';
import {packageRoot} from './storage.js';
import {validId} from '../objects/schema.js';
import {validSourceId} from '../sources/schema.js';
const clients=new Map();
export function abilityHTTP(root,source){const key=root+'\n'+source.id+'\n'+source.location;let client=clients.get(key);if(!client){client=createCatalogClient({url:source.location,kind:'abilities',sourceId:source.id,cacheDirectory:join(root,'.agents/runtime-data/ability-store/catalog',digest(key))});clients.set(key,client);}return client;}
export async function inspectHTTP(root,location){let url;try{url=new URL(location);}catch{throw fault('ABILITY_STORE_SOURCE_INVALID','请填写完整HTTP(S)目录地址。');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw fault('ABILITY_STORE_SOURCE_INVALID','目录地址不能包含凭据或片段。');const client=createCatalogClient({url:location,kind:'abilities'});const value=await client.open();if(!validSourceId(value.source.id)||value.source.name.length>80||!value.source.name.trim())throw fault('ABILITY_STORE_SOURCE_INVALID','源身份或名称无效。');return value;}
export async function httpRelease(root,source,id,version){const client=abilityHTTP(root,source);let token;do{const page=await client.versions(id,{cursor:token});if(!page)throw fault('ABILITY_STORE_NOT_FOUND','源中没有此能力。');const release=page.items.find(r=>!r.withdrawn&&(!version||r.version===version));if(release)return release;token=page.nextCursor;}while(token);throw fault('ABILITY_STORE_VERSION_MISSING','源中没有所需精确版本：'+id+'@'+version);}
/** Materialize only selected/installed IDs and their exact dependencies into an immutable preview. */
export async function prepareHTTP(root,state,input){const source=state.sources.find(s=>s.id===input.sourceId);if(source?.kind!=='http'||!['install','update'].includes(input.action))return state;
 if(!source.enabled)throw fault('ABILITY_STORE_SOURCE_DISABLED','请先启用此能力源。');
 const client=abilityHTTP(root,source),directory=await client.open({refresh:true}),selected=new Map(),installed=state.installed[source.id],requested=input.ids??(input.id?[input.id]:input.action==='update'?distributionRequests(installed?.roots??[],installed?.objects??[]):[]),runtime=catalog(root);
 if(!Array.isArray(requested)||!requested.length||requested.some(id=>!validId(id)))throw fault('INVALID_ARGUMENTS','请选择要安装或更新的能力。');
 const resolving=new Set();
 const visit=async(id,version)=>{if(selected.has(id)){if(version&&packetObjects(selected.get(id)).find(o=>o.id===id).version!==version)throw fault('ABILITY_STORE_DEPENDENCY_CONFLICT','依赖要求不同版本：'+id);return;}
  if(resolving.has(id))throw fault('ABILITY_STORE_NOT_FOUND','未找到可更新的发布入口：'+id);
  resolving.add(id);try{
  let release;try{release=await httpRelease(root,source,id,version);}catch(error){
   // Older stores explicitly installed library objects before the source moved
   // to partner products. Resolve a retired library through an already installed
   // parent, never by installing a new, unselected partner or ignoring a pin.
   if(input.action!=='update'||version||!['ABILITY_STORE_NOT_FOUND','ABILITY_STORE_VERSION_MISSING'].includes(error.code))throw error;
   for(const parent of installed?.objects.filter(o=>o.dependencies.some(d=>d.source===source.id&&d.id===id))??[]){
    if(resolving.has(parent.id))continue;
    try{await visit(parent.id);}catch(e){if(!['ABILITY_STORE_NOT_FOUND','ABILITY_STORE_VERSION_MISSING'].includes(e.code))throw e;continue;}
    if(selected.has(id)&&packetObjects(selected.get(id)).find(o=>o.id===id)?.distribution?.entry===false)return;
   }
   throw error;
  }
  const value=decodeAbilityPackage(await client.binary(release.package));validateAbilityPackage(value,{sourceId:source.id,id,version:release.version});if(packetObjects(value).find(o=>o.id===id)?.distribution?.entry===false&&!(input.action==='update'&&value.roots.some(id=>installed?.objects.some(o=>o.id===id))))throw fault('ABILITY_STORE_BUNDLED_MEMBER','请选择所属搭档整体安装或更新。');selected.set(id,value);for(const object of packetObjects(value))if(!selected.has(object.id))selected.set(object.id,value);if(value.protocol==='ksf-ability-package-v2')return;
  for(const d of value.objects.find(o=>o.id===id).dependencies){if(d.source===source.id)await visit(d.id,d.version);else if(d.source!=='system'||!runtime.rows.some(r=>r.source==='system'&&r.id===d.id&&r.metadata.version===d.version))throw fault('ABILITY_STORE_DEPENDENCY_MISSING','Core精确依赖不可用：'+d.id+'@'+d.version);}
  }finally{resolving.delete(id);}
 };
 for(const id of requested)await visit(id);
 // Keep unselected objects at their verified installed versions. Only a real
 // changed exact dependency can require fetching a reverse dependent's update.
 let again=true;while(again){again=false;for(const object of installed?.objects??[]){if(selected.has(object.id))continue;const changed=object.dependencies.some(d=>d.source===source.id&&selected.has(d.id)&&packetObjects(selected.get(d.id)).find(o=>o.id===d.id).version!==d.version);if(changed){for(const entry of distributionRequests([object.id],installed.objects))await visit(entry);again=true;}}}
 if([...selected.values()].some(value=>value.protocol==='ksf-ability-package-v2'||packetObjects(value).some(o=>o.distribution))){
  const objects=new Map(),files=new Map();for(const packet of selected.values())for(const group of groupsOf(packet)){for(const object of group.objects){const value={...object,publication:object.publication??{sourceId:group.sourceId,publisher:object.id.split('.')[1],verified:false},dependencies:object.dependencies.map(d=>({...d,source:d.source==='system'?'system':source.id}))};const prior=objects.get(object.id);if(prior&&prior.version!==value.version)throw fault('ABILITY_STORE_DEPENDENCY_CONFLICT','依赖要求不同精确版本：'+object.id);objects.set(object.id,value);}for(const file of group.files){if(files.has(file.path)&&files.get(file.path).sha256!==file.sha256)throw fault('ABILITY_STORE_RESOURCE_CONFLICT','多来源镜像资源冲突。');files.set(file.path,file);}}
  const group={sourceId:source.id,sourceName:source.name,roots:[...objects.keys()],objects:[...objects.values()],files:[...files.values()]};for(const object of group.objects){object.contentDigest=contentIdentity(group,object);object.contentManifest=contentFiles(group,object).map(f=>({path:f.path,sha256:f.sha256,mode:f.mode}));}
  return{...state,_composite:{protocol:'ksf-ability-package-v2',sourceId:source.id,roots:distributionRequests(requested,group.objects),groups:[group]},_delivery:{id:source.id,name:source.name,kind:'http',location:source.location,catalogRevision:directory.revision,commit:null,dirty:false}};
 }
 const path=join(root,'.agents/runtime-data/ability-store/previews',randomUUID());mkdirSync(path,{recursive:true});try{if(installed)cpSync(packageRoot(root,source.id,installed.generation),path,{recursive:true});for(const value of selected.values())for(const object of value.objects)rmSync(join(path,object.relative),{recursive:true,force:true});const files=new Map();
 for(const value of selected.values())for(const f of value.files){if(files.has(f.path)&&files.get(f.path)!==f.sha256)throw fault('ABILITY_STORE_RESOURCE_CONFLICT','能力包共享资源冲突。');files.set(f.path,f.sha256);const target=join(path,f.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,Buffer.from(f.content,'base64'),{mode:f.mode});}
 writeFileSync(join(path,'ksf-source.yaml'),YAML.stringify({kind:'ksf-ability-source',schema_version:2,id:source.id,name:source.name}));const next=structuredClone(state);next.sources=next.sources.map(s=>s.id===source.id?{...s,path,catalogRevision:directory.revision}:s);return next;}catch(e){rmSync(path,{recursive:true,force:true});throw e;}
}
