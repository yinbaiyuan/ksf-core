import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import YAML from '../vendor/yaml/dist/index.js';
import {createCatalogClient} from '../store-catalog/client.js';import {digest,fault} from '../store-catalog/protocol.js';
import {validateAbilityPackage,decodeAbilityPackage} from './package.js';import {DEFAULT_ABILITY_SOURCE} from './default-source.js';
import {catalog} from '../objects/catalog.js';
import {validSourceId} from '../sources/schema.js';
const bundled=fileURLToPath(new URL('../../../ability-store/',import.meta.url)),clients=new Map();
export function abilityHTTP(root,source){const key=root+'\n'+source.id+'\n'+source.location;let client=clients.get(key);if(!client){client=createCatalogClient({url:source.location,kind:'abilities',sourceId:source.id,cacheDirectory:join(root,'.agents/runtime-data/ability-store/catalog',digest(key)),...(source.id===DEFAULT_ABILITY_SOURCE.id?{baselineDirectory:bundled}:{})});clients.set(key,client);}return client;}
export async function inspectHTTP(root,location){let url;try{url=new URL(location);}catch{throw fault('ABILITY_STORE_SOURCE_INVALID','请填写完整HTTP(S)目录地址。');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw fault('ABILITY_STORE_SOURCE_INVALID','目录地址不能包含凭据或片段。');const client=createCatalogClient({url:location,kind:'abilities'});const value=await client.open();if(!validSourceId(value.source.id)||value.source.name.length>80||!value.source.name.trim())throw fault('ABILITY_STORE_SOURCE_INVALID','源身份或名称无效。');return value;}
export async function httpRelease(root,source,id,version){const client=abilityHTTP(root,source);let token;do{const page=await client.versions(id,{cursor:token});if(!page)throw fault('ABILITY_STORE_NOT_FOUND','源中没有此能力。');const release=page.items.find(r=>!version||r.version===version);if(release)return release;token=page.nextCursor;}while(token);throw fault('ABILITY_STORE_VERSION_MISSING','源中没有所需精确版本：'+id+'@'+version);}
/** Materialize only selected/installed IDs and their exact dependencies into an immutable preview. */
export async function prepareHTTP(root,state,input){const source=state.sources.find(s=>s.id===input.sourceId);if(source?.kind!=='http'||!['install','update'].includes(input.action))return state;
 if(!source.enabled)throw fault('ABILITY_STORE_SOURCE_DISABLED','请先启用此能力源。');
 const client=abilityHTTP(root,source),directory=await client.open({refresh:true}),selected=new Map(),requested=input.ids??[input.id],runtime=catalog(root);
 const visit=async(id,version)=>{if(selected.has(id)){if(version&&selected.get(id).object.version!==version)throw fault('ABILITY_STORE_DEPENDENCY_CONFLICT','依赖要求不同版本：'+id);return;}
  const release=await httpRelease(root,source,id,version),value=decodeAbilityPackage(await client.binary(release.package));validateAbilityPackage(value,{sourceId:source.id,id,version:release.version});selected.set(id,value);
  for(const d of value.object.dependencies){if(d.source===source.id)await visit(d.id,d.version);else if(d.source!=='system'||!runtime.rows.some(r=>r.source==='system'&&r.id===d.id&&r.metadata.version===d.version))throw fault('ABILITY_STORE_DEPENDENCY_MISSING','Core精确依赖不可用：'+d.id+'@'+d.version);}
 };
 for(const id of requested)await visit(id);
 // Reverse dependents are the installed set, never the entire remote directory.
 for(const o of state.installed[source.id]?.objects??[])if(!selected.has(o.id)){try{await visit(o.id);}catch(e){if(e.code!=='ABILITY_STORE_NOT_FOUND')throw e;}}
 const path=join(root,'.agents/runtime-data/ability-store/previews',randomUUID());mkdirSync(path,{recursive:true});try{const files=new Map();
 for(const value of selected.values())for(const f of value.files){if(files.has(f.path)&&files.get(f.path)!==f.sha256)throw fault('ABILITY_STORE_RESOURCE_CONFLICT','能力包共享资源冲突。');files.set(f.path,f.sha256);const target=join(path,f.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,Buffer.from(f.content,'base64'),{mode:f.mode});}
 writeFileSync(join(path,'ksf-source.yaml'),YAML.stringify({kind:'ksf-ability-source',schema_version:2,id:source.id,name:source.name}));const next=structuredClone(state);next.sources=next.sources.map(s=>s.id===source.id?{...s,path,catalogRevision:directory.revision}:s);return next;}catch(e){rmSync(path,{recursive:true,force:true});throw e;}
}
