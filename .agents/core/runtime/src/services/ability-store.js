import {abilityHTTP,inspectHTTP,prepareHTTP} from '../ability-store/http.js';
import {decodeAbilityPackage,encodeAbilityPackage,validateAbilityPackage,MAX_ABILITY_PACKAGE} from '../ability-store/package.js';
import {DEFAULT_ABILITY_SOURCE} from '../ability-store/default-source.js';
import {existsSync,readFileSync,mkdirSync,rmSync,renameSync,lstatSync,cpSync,writeFileSync} from 'node:fs';
import {join,relative,resolve,dirname,isAbsolute,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import YAML from '../vendor/yaml/dist/index.js';
import {catalog,summary} from '../objects/catalog.js';
import {resolveObject,resolveDependency,referenceResults,problems} from '../objects/references.js';
import {types,validId,parseDependencyReference,fail} from '../objects/schema.js';
import {safeDirectory,readTree,withObjectLock} from '../objects/storage.js';
import {readSnapshot} from '../metadata/files.js';
import {parseFrontmatter} from '../metadata/frontmatter.js';
import {sha256} from '../shared/hash.js';
import {writeDurably} from '../shared/files.js';
import {gitExecutable} from '../platform/index.js';
import {inspectSource} from './sources.js';
import {configuredSources,within} from '../sources/storage.js';
import {readStore,saveStore,withStoreLock,packageRoot,storePath} from '../ability-store/storage.js';

const hash=value=>sha256(JSON.stringify(value));
const portable=value=>value.split(sep).join('/');
const packageOf=(state,id)=>Object.hasOwn(state.installed,id)?state.installed[id]:undefined;
const err=e=>({code:e.code??'ABILITY_STORE_FAILED',message:e.message});
const requireSource=(s,id)=>{const source=s.sources.find(x=>x.id===id);if(!source)fail('ABILITY_STORE_SOURCE_MISSING','能力源不存在，请重新添加。');return source;};
const checkedSource=(root,source)=>{const checked=['http','package'].includes(source.kind)?(()=>{const c=catalog(root,{linked:false,extraSources:[{id:source.id,root:source.path}]});return {catalog:c,errors:[...problems(c,{source:source.id}),...c.rows.filter(r=>r.source===source.id&&!r.errors.length).flatMap(r=>referenceResults(c,r).filter(r=>r.error).map(r=>r.error))]};})():inspectSource(root,source.path,source.id);if(checked.errors.length)fail('ABILITY_STORE_SOURCE_INVALID','能力源校验失败。',{errors:checked.errors});return checked;};
function git(path,args,{timeout=120000}={}){
 return new Promise((accept,reject)=>{
  const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_SSH_COMMAND:'ssh -oBatchMode=yes'};
  for(const key of Object.keys(env))if(/^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|SHALLOW_FILE|NAMESPACE|CONFIG.*|.*PATHSPECS)$/.test(key))delete env[key];
  const child=spawn(gitExecutable,['--no-replace-objects','-c','core.hooksPath='+join(path,'.ksf-no-hooks'),'-c','core.fsmonitor=false','-C',path,...args],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='',overflow=false;const timer=setTimeout(()=>{child.kill();},timeout);
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>4*1024*1024){overflow=true;child.kill();}});child.stderr.on('data',b=>{stderr+=b;if(stderr.length>4*1024*1024){overflow=true;child.kill();}});
  child.once('error',e=>{clearTimeout(timer);reject(Object.assign(new Error(e.code==='ENOENT'?'请先安装本机Git。':'Git无法启动。'),{code:'ABILITY_STORE_GIT_FAILED'}));});
  child.once('close',(code,signal)=>{clearTimeout(timer);if(code!==0||signal||overflow){const message=(stderr||'Git 操作失败，请检查地址、网络和本机仓库访问权限。').replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/g,'https://[redacted]@').slice(-2000);reject(Object.assign(new Error(message),{code:signal?'ABILITY_STORE_GIT_TIMEOUT':'ABILITY_STORE_GIT_FAILED'}));}else accept(stdout.trim());});
 });
}
async function origin(root,source){
 try{return {commit:await git(source.path,['rev-parse','HEAD'],{timeout:10000}),dirty:!!await git(source.path,['status','--porcelain'],{timeout:10000})};}catch{return {commit:null,dirty:true};}
}
export function abilityStoreCatalog(root){
 const {state,version}=readStore(root),items=new Map(),sources=[],errors=[];
 const runtime=catalog(root),personal=new Map(runtime.rows.filter(r=>r.source==='user'&&!r.errors.length).map(r=>[r.id,summary(r)]));
 for(const source of state.sources){
  if(source.kind==='http'){sources.push({...source,valid:true});continue;}
  let checked;try{checked=checkedSource(root,source);}catch(e){errors.push({...err(e),sourceId:source.id});}
  sources.push({...source,valid:!!checked,...(!checked?{error:errors.at(-1)}:{})});
  if(!source.enabled||!checked)continue;
  for(const row of checked.catalog.rows.filter(r=>r.source===source.id&&!r.errors.length&&r.metadata.status!=='archived'))items.set(source.id+':'+row.id,{key:source.id+':'+row.id,id:row.id,type:row.type,sourceId:source.id,sourceName:source.name,available:{...summary(row),digest:objectDigest(row)},dependencies:referenceResults(checked.catalog,row)});
 }
 for(const [sourceId,p] of Object.entries(state.installed))for(const object of p.objects){
  const key=sourceId+':'+object.id;let item=items.get(key);if(!item){item={key,id:object.id,type:object.id.split('.')[0],sourceId,sourceName:p.origin.name,dependencies:object.dependencies};items.set(key,item);}
  item.installed={...object,explicit:p.roots.includes(object.id),path:join(packageRoot(root,sourceId,p.generation),object.relative,types[object.id.split('.')[0]].entry)};
 }
 errors.push(...runtime.errors.filter(e=>state.installed[e.source]),...runtime.rows.filter(r=>state.installed[r.source]).flatMap(r=>r.errors.map(e=>({...e,sourceId:r.source}))));
 const abilities=[...items.values()].map(item=>({...item,personal:personal.get(item.id)??null,updateAvailable:!!item.installed&&!!item.available&&compareVersion(item.available.version,item.installed.version)>0}));
 return {version,sources,abilities,errors,complete:!errors.length,migrationSources:configuredSources(root).filter(s=>!state.adopted.includes(s.id)).map(s=>({id:s.id,path:s.root}))};
}
export const compareVersion=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];};
function objectDigest(row){const tree=readTree(row.directory);return hash({files:tree.files.map(f=>[f.path,f.digest,f.mode]),directories:tree.directories.map(d=>[d.path,d.mode])});}
function descriptor(c,row){
 return {...summary(row),relative:portable(relative(row.sourceRoot,row.directory)),digest:objectDigest(row),definitionDigest:row.digest,dependencies:referenceResults(c,row).filter(r=>r.id).map(({id,version,source})=>({id,version,source})),_row:row,_catalog:c};
}
function installedDescriptors(root,sourceId,p){
 if(!p)return new Map();const c=catalog(root);return new Map(p.objects.map(o=>{const row=resolveObject(c,{id:o.id,version:o.version},sourceId);return [o.id,{...o,_row:row,_catalog:c}];}));
}
function referencedBy(root,sourceId,id){
 const c=catalog(root),out=[];
 for(const row of c.rows.filter(r=>!r.errors.length&&r.metadata.status!=='archived'&&r.id!==id))for(const ref of row.metadata.references??[]){try{const resolved=resolveDependency(c,row,ref);if(resolved.kind!=='file'&&resolved.target.source===sourceId&&resolved.id===id){out.push({id:row.id,source:row.source,name:row.metadata.name});break;}}catch{/* Existing unrelated errors do not authorize removing a known dependency. */}}
 return out;
}
function collectFiles(objects){
 const files=new Map(),directories=new Set(),visited=new Set(),origins=[];
 function add(path,base){
  if(!within(base,path)||relative(base,path).split(sep).some(p=>['.git','.upstream'].includes(p)))fail('ABILITY_STORE_RESOURCE_INVALID','资源越过能力源边界。');
  const rel=portable(relative(base,path));let component=base;for(const segment of relative(base,path).split(sep)){component=join(component,segment);if(lstatSync(component).isSymbolicLink())fail('ABILITY_STORE_RESOURCE_INVALID','能力资源路径不能经过符号链接。');}const value=readSnapshot(path),digest=sha256(value.bytes);
  const before=files.get(rel);if(before&&before.digest!==digest)fail('ABILITY_STORE_RESOURCE_CONFLICT','共享资源版本不同，请一起更新此源中相关的已安装能力。',{path:rel});
  files.set(rel,{bytes:value.bytes,digest,mode:value.stat.mode&0o777});origins.push({path,digest});
  return value.bytes;
 }
 function references(c,row){
  const key=row.sourceRoot+':'+row.path;if(visited.has(key))return;visited.add(key);
  for(const ref of row.metadata.references??[]){const parsed=parseDependencyReference(ref);if(parsed.kind!=='file')continue;const target=resolveDependency(c,row,ref).target;if(!target.sourceRoot)continue;
   const bytes=add(target.target,row.sourceRoot);if(/\.md$/i.test(target.target)){const parsed=parseFrontmatter(bytes,target.target);references(c,{...row,path:target.target,metadata:parsed.values});}
  }
 }
 for(const o of objects){const row=o._row,tree=readTree(row.directory);for(const dir of tree.directories)directories.add(portable(relative(row.sourceRoot,join(row.directory,dir.path))));for(const file of tree.files)add(join(row.directory,file.path),row.sourceRoot);references(o._catalog,row);}
 return {files,directories:[...directories].sort(),origins};
}
function plan(root,state,input){
 const {action,sourceId,id}=input;
 if(action==='copy'){
  if(!validId(id))fail('INVALID_ARGUMENTS','请选择能力。');const p=packageOf(state,sourceId),o=p?.objects.find(o=>o.id===id);if(!o)fail('ABILITY_STORE_NOT_INSTALLED','请先安装该能力。');
  if(catalog(root).rows.some(r=>r.source==='user'&&r.id===id))fail('ABILITY_STORE_PERSONAL_EXISTS','已存在个人能力，请在KSF能力中编辑，不能覆盖。');
  const files=readTree(join(packageRoot(root,sourceId,p.generation),o.relative));return {action,sourceId,objects:[o],roots:[id],files:null,planDigest:hash([action,sourceId,o.digest,files.fingerprint]),personalPath:types[id.split('.')[0]].user+'/'+id};
 }
 if(action==='uninstall'){
  const p=packageOf(state,sourceId);if(!p?.objects.some(o=>o.id===id))fail('ABILITY_STORE_NOT_INSTALLED','该能力尚未安装。');
  const users=referencedBy(root,sourceId,id);
  const roots=p.roots.filter(v=>v!==id),all=installedDescriptors(root,sourceId,p),keep=new Set();const visit=id=>{if(keep.has(id))return;keep.add(id);for(const d of all.get(id)?.dependencies??[])if(d.source===sourceId)visit(d.id);};roots.forEach(visit);
  // Personal and system definitions may retain dependencies after their original
  // store root has been removed.
  for(const o of p.objects)if(o.id!==id&&referencedBy(root,sourceId,o.id).some(r=>r.source!==sourceId))visit(o.id);
  const dependents=users.filter(r=>r.source!==sourceId||keep.has(r.id));if(dependents.length)fail('ABILITY_STORE_REQUIRED','此能力仍被引用，暂时不能卸载：'+dependents.map(r=>r.name).join('、'),{dependents});
  const objects=[...all.values()].filter(o=>keep.has(o.id)),resources=collectFiles(objects);return {action,sourceId,roots,objects,...resources,removed:p.objects.filter(o=>!keep.has(o.id)).map(o=>o.id),origin:p.origin,planDigest:hash([action,id,roots,objects.map(o=>[o.id,o.digest]),[...resources.files].map(([p,f])=>[p,f.digest])])};
 }
 if(!['install','update','migrate'].includes(action))fail('INVALID_ARGUMENTS','未知安装操作。');
 let source=state.sources.find(s=>s.id===sourceId);if(action==='migrate'){const linked=configuredSources(root).find(s=>s.id===sourceId);if(!linked)fail('ABILITY_STORE_SOURCE_MISSING','原能力源不存在。');const checked=inspectSource(root,linked.root,sourceId);source={id:sourceId,name:checked.data.name,path:linked.root,kind:'local',enabled:true};}
 if(action!=='migrate'&&configuredSources(root).some(s=>s.id===sourceId)&&!state.adopted.includes(sourceId))fail('ABILITY_STORE_MIGRATION_REQUIRED','请先迁移原关联，以保留其中全部现有能力。');
 source??=requireSource(state,sourceId);if(!source.enabled)fail('ABILITY_STORE_SOURCE_DISABLED','请先启用此能力源。');
 const checked=checkedSource(root,source),c=checked.catalog,p=packageOf(state,sourceId),all=installedDescriptors(root,sourceId,p),replaced=new Set(),selected=new Map();
 const requested=action==='migrate'?c.rows.filter(r=>r.source===sourceId&&!r.errors.length).map(r=>r.id):(input.ids??[id]);
 if(!Array.isArray(requested)||!requested.length||requested.some(id=>!validId(id)))fail('INVALID_ARGUMENTS','请选择要安装或更新的能力。');
 const select=(id,version)=>{
  const row=resolveObject(c,{id,...(version?{version}:{})},sourceId);if(row.metadata.status==='archived'&&action!=='migrate')fail('ABILITY_STORE_ARCHIVED','归档能力不接受新的安装。');
  if(selected.has(id)){if(selected.get(id).version!==row.metadata.version)fail('ABILITY_STORE_DEPENDENCY_CONFLICT','依赖要求不同版本，无法同时安装。');return;}
  const d=descriptor(c,row);selected.set(id,d);replaced.add(id);
  for(const ref of row.metadata.references??[]){const dep=resolveDependency(c,row,ref);if(dep.kind!=='file'&&dep.target.source===sourceId)select(dep.id,dep.version);}
 };
 if(action==='update'&&requested.some(id=>!p?.objects.some(o=>o.id===id)))fail('ABILITY_STORE_NOT_INSTALLED','更新只接受已安装能力。');
 requested.forEach(id=>select(id));
 let again=true;while(again){again=false;const merged=new Map([...all,...selected]);for(const o of merged.values())for(const d of o.dependencies)if(d.source===sourceId&&merged.get(d.id)?.version!==d.version){if(selected.has(o.id))fail('ABILITY_STORE_DEPENDENCY_CONFLICT','无法同时满足精确版本依赖。');select(o.id);again=true;}}
 for(const [other,q] of Object.entries(state.installed))if(other!==sourceId)for(const id of selected.keys())if(q.objects.some(o=>o.id===id))fail('ABILITY_STORE_SOURCE_CONFLICT','该能力已从另一个源安装，请先卸载旧来源。',{id,source:other});
 for(const row of catalog(root).rows)if(row.sourceRoot&&row.source!==sourceId&&selected.has(row.id))fail('ABILITY_STORE_SOURCE_CONFLICT','另一个直接关联源提供同ID能力，请先明确保留哪个来源。',{id:row.id,source:row.source});
 const merged=new Map([...all,...selected]),roots=action==='update'?[...p.roots]:[...new Set([...(p?.roots??[]),...requested])],keep=new Set();const visit=id=>{if(keep.has(id))return;keep.add(id);for(const d of merged.get(id)?.dependencies??[])if(d.source===sourceId)visit(d.id);};roots.forEach(visit);
 const objects=[...merged.values()].filter(o=>keep.has(o.id));for(const o of objects)for(const d of o.dependencies)if(d.source==='system')resolveObject(c,{id:d.id,version:d.version},'system');
 const runtime=catalog(root),after={...runtime,rows:[...runtime.rows.filter(r=>r.source!==sourceId),...objects.map(o=>o._row)]};
 const blocked=[];for(const row of runtime.rows.filter(r=>r.source!==sourceId&&!r.errors.length&&r.metadata.status!=='archived'))for(const ref of row.metadata.references??[]){let before;try{before=resolveDependency(runtime,row,ref);}catch{continue;}if(before.kind==='file'||before.target.source!==sourceId)continue;try{resolveDependency(after,row,ref);}catch{blocked.push(row.metadata.name);break;}}
 if(blocked.length)fail('ABILITY_STORE_EXTERNAL_DEPENDENCY','个人或其他能力仍依赖旧版本，本次未更新：'+blocked.join('、'),{dependents:blocked});
 let resources;try{resources=collectFiles(objects);}catch(e){if(e.code==='ABILITY_STORE_RESOURCE_CONFLICT'&&selected.size<objects.length)return plan(root,state,{...input,ids:roots});throw e;}return {action,sourceId,source,origin:source,roots,objects,...resources,group:[...replaced],planDigest:hash([action,sourceId,roots,objects.map(o=>[o.id,o.version,o.digest]),[...resources.files].map(([p,f])=>[p,f.digest])])};
}
const publicPlan=p=>({action:p.action,sourceId:p.sourceId,planDigest:p.planDigest,objects:p.objects.map(({_row,_catalog,...o})=>o),roots:p.roots,group:p.group??[],removed:p.removed??[],personalPath:p.personalPath});
async function preparedPlan(root,state,input){const prepared=await prepareHTTP(root,state,input),source=prepared.sources.find(s=>s.id===input.sourceId),temporary=prepared!==state&&source?.kind==='http'?source.path:null;try{const result=plan(root,prepared,input);if(temporary){for(const object of result.objects){delete object.directory;delete object.path;delete object.source_root;}result.dispose=()=>rmSync(temporary,{recursive:true,force:true});}return result;}catch(e){if(temporary)rmSync(temporary,{recursive:true,force:true});throw e;}}
function importPlan(root,state,input){
 if(typeof input.package!=='string'||input.package.length>Math.ceil(MAX_ABILITY_PACKAGE/3)*4)fail('ABILITY_PACKAGE_INVALID','请选择有效能力包（最大20MiB）。');
 const bytes=Buffer.from(input.package,'base64'),packet=validateAbilityPackage(decodeAbilityPackage(bytes)),sourceId=packet.sourceId,installed=packageOf(state,sourceId);
 for(const object of packet.objects){const old=installed?.objects.find(o=>o.id===object.id);if(old&&compareVersion(object.version,old.version)<0)fail('ABILITY_STORE_VERSION_CONFLICT','能力包版本低于本机版本：'+object.id,{installed:old.version,packaged:object.version});}
 const path=join(root,'.agents/runtime-data/ability-store/previews',randomUUID());mkdirSync(path,{recursive:true});
 try{
  if(installed)cpSync(packageRoot(root,sourceId,installed.generation),path,{recursive:true});
  for(const f of packet.files){const target=join(path,f.path);safeDirectory(root,portable(relative(root,dirname(target))),{create:true});if(existsSync(target)&&lstatSync(target).isSymbolicLink())fail('ABILITY_PACKAGE_INVALID','能力包资源不能经过符号链接。');writeFileSync(target,Buffer.from(f.content,'base64'),{mode:f.mode});}
  const configured=state.sources.find(s=>s.id===sourceId),name=configured?.name??installed?.origin.name??packet.sourceName??sourceId;
  writeFileSync(join(path,'ksf-source.yaml'),YAML.stringify({kind:'ksf-ability-source',schema_version:2,id:sourceId,name}));
  const prepared=structuredClone(state);prepared.sources=prepared.sources.filter(s=>s.id!==sourceId);prepared.sources.push({id:sourceId,name,kind:'package',path,enabled:true});
  const p=plan(root,prepared,{action:'install',sourceId,ids:packet.roots});
  p.action='import';p.planDigest=hash(['import',sha256(bytes),p.planDigest]);p.origin=installed?.origin??(configured?{id:sourceId,name,kind:configured.kind,location:configured.location,commit:null,dirty:false}:{id:sourceId,name,kind:'package',commit:null,dirty:false});delete p.source;
  for(const object of p.objects){delete object.directory;delete object.path;delete object.source_root;}
  p.dispose=()=>rmSync(path,{recursive:true,force:true});return p;
 }catch(e){rmSync(path,{recursive:true,force:true});throw e;}
}
export function previewAbilityStore(root,input){const record=readStore(root);if(input.action==='import'){const p=importPlan(root,record.state,input);try{return {version:record.version,...publicPlan(p)};}finally{p.dispose();}}
 if(record.state.sources.find(s=>s.id===input.sourceId)?.kind==='http'&&['install','update'].includes(input.action))return preparedPlan(root,record.state,input).then(p=>{try{return {version:record.version,...publicPlan(p)};}finally{p.dispose?.();}});return {version:record.version,...publicPlan(plan(root,record.state,input))};}
/** Export selected abilities, recursive same-source dependencies and relative resources. */
export function packAbilityStore(root,input){
 if(typeof input.path!=='string'||typeof input.output!=='string'||!Array.isArray(input.ids)||!input.ids.length)fail('INVALID_ARGUMENTS','打包需要源目录path、能力ids和输出文件output。');
 const path=resolve(root,input.path),checked=inspectSource(root,path);if(checked.errors.length)fail('ABILITY_STORE_SOURCE_INVALID','能力源校验失败。',{errors:checked.errors});const sourceId=checked.data.id,c=checked.catalog,selected=new Map();
 const visit=(id,version)=>{const row=resolveObject(c,{id,...(version?{version}:{})},sourceId);if(selected.has(id)){if(selected.get(id).version!==row.metadata.version)fail('ABILITY_STORE_DEPENDENCY_CONFLICT','能力包依赖版本冲突。');return;}const o=descriptor(c,row);selected.set(id,o);for(const d of o.dependencies)if(d.source===sourceId)visit(d.id,d.version);else if(d.source!=='system')fail('ABILITY_STORE_DEPENDENCY_MISSING','能力包只支持同源或Core依赖。');};input.ids.forEach(id=>visit(id));
 const resources=collectFiles([...selected.values()]),objects=[...selected.values()].map(({_row,_catalog,path,directory,source_root,...o})=>o),packet={protocol:'ksf-ability-package-v1',sourceId,sourceName:checked.data.name,roots:[...new Set(input.ids)],objects,files:[...resources.files].map(([path,f])=>({path,content:f.bytes.toString('base64'),size:f.bytes.length,sha256:f.digest,mode:f.mode}))};validateAbilityPackage(packet);const bytes=encodeAbilityPackage(packet);if(bytes.length>MAX_ABILITY_PACKAGE)fail('ABILITY_PACKAGE_INVALID','能力包超过20MiB。');const output=resolve(root,input.output);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,bytes,{flag:'wx'});return {path:output,sourceId,objects:objects.map(o=>({id:o.id,version:o.version})),size:bytes.length,sha256:sha256(bytes)};
}

function publishGeneration(root,p){
 const generation=randomUUID(),path=packageRoot(root,p.sourceId,generation);safeDirectory(root,portable(relative(root,path)),{create:true});
 try{
  writeDurably(join(path,'ksf-source.yaml'),YAML.stringify({kind:'ksf-ability-source',schema_version:2,id:p.sourceId,name:p.origin.name}));mkdirSync(join(path,'能力'),{recursive:true});
  for(const dir of p.directories)safeDirectory(root,portable(relative(root,join(path,dir))),{create:true});
  for(const [rel,f] of p.files){const dest=join(path,rel);safeDirectory(root,portable(relative(root,dirname(dest))),{create:true});writeDurably(dest,f.bytes,{mode:f.mode});}
  for(const origin of p.origins)if(sha256(readSnapshot(origin.path).bytes)!==origin.digest)fail('ABILITY_STORE_SOURCE_CHANGED','源文件在安装时变化，请重新预览。');
  const objects=p.objects.map(({_row,_catalog,...o})=>o),c=catalog(root,{linked:false,extraSources:[{id:p.sourceId,root:path,installed:true,objects}]});
  for(const row of c.rows.filter(r=>r.source===p.sourceId)){const errors=[...row.errors,...referenceResults(c,row).filter(r=>r.error).map(r=>r.error)];if(errors.length)fail('ABILITY_STORE_INSTALL_INVALID','安装副本未通过校验。',{errors});}
  writeDurably(join(path,'installed-manifest.json'),JSON.stringify({objects:objects.map(o=>[o.id,o.version,o.digest])}));
  return {generation,origin:p.origin,roots:p.roots,objects,installedAt:new Date().toISOString()};
 }catch(e){rmSync(path,{recursive:true,force:true});throw e;}
}
function copyPersonal(root,state,p,operationId){
 const installed=packageOf(state,p.sourceId),base=packageRoot(root,p.sourceId,installed.generation),object=p.objects[0],source=join(base,object.relative),dest=join(root,p.personalPath);
 return withObjectLock(root,()=>{
  safeDirectory(root,types[object.type??object.id.split('.')[0]].user,{create:true});if(existsSync(dest))fail('ABILITY_STORE_PERSONAL_EXISTS','个人能力目录已存在，未覆盖。');
  const stage=join(dirname(dest),'.ksf-object-staging-'+randomUUID());mkdirSync(stage);
  try{
   const external=new Set();
   const copyExternal=(path,required=false)=>{
    if(!within(base,path)||relative(base,path).split(sep).some(v=>['.git','.upstream'].includes(v)))fail('ABILITY_STORE_RESOURCE_INVALID','个人资源越过安装边界。');
    if(external.has(path))return;external.add(path);
    if(!existsSync(path)){if(required)fail('ABILITY_STORE_RESOURCE_MISSING','个人复制需要的资源不存在。');return;}
    const stat=lstatSync(path);if(stat.isSymbolicLink())fail('ABILITY_STORE_RESOURCE_INVALID','个人资源不能是符号链接。');
    if(stat.isDirectory()){const tree=readTree(path);for(const d of tree.directories)mkdirSync(join(stage,'.ksf-store-source',relative(base,path),d.path),{recursive:true});for(const f of tree.files)copyExternal(join(path,f.path),true);return;}
    const bytes=readSnapshot(path).bytes,target=join(stage,'.ksf-store-source',relative(base,path));mkdirSync(dirname(target),{recursive:true});writeDurably(target,bytes,{mode:stat.mode&0o777});
    if(/\.md$/i.test(path)){const parsed=parseFrontmatter(bytes,path);for(const ref of parsed.values.references??[]){const r=parseDependencyReference(ref);if(r.kind==='file'&&!r.path.startsWith('/'))copyExternal(resolve(dirname(path),r.path),true);}for(const m of parsed.body.toString('utf8').matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g))if(!/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(m[1]))copyExternal(resolve(dirname(path),m[1].split(/[?#]/)[0]));}
   };
   const mapTarget=(file,href)=>{if(/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(href))return href;const split=href.match(/^([^?#]*)(.*)$/),target=resolve(dirname(file),split[1]);if(!within(base,target))fail('ABILITY_STORE_RESOURCE_INVALID','个人复制的相对资源越界。');if(!within(source,target))copyExternal(target);return portable(relative(dirname(join(stage,relative(source,file))),within(source,target)?join(stage,relative(source,target)):join(stage,'.ksf-store-source',relative(base,target))))+split[2];};
   for(const d of readTree(source).directories)mkdirSync(join(stage,d.path),{recursive:true});
   for(const f of readTree(source).files){let bytes=f.bytes;if(/\.md$/i.test(f.path)){const old=join(source,f.path),parsed=parseFrontmatter(bytes,old),metadata={...parsed.values};if(Array.isArray(metadata.references))metadata.references=metadata.references.map(ref=>{const v=parseDependencyReference(ref);return v.kind==='file'&&!v.path.startsWith('/')?(ref.startsWith('#')?'#':ref.startsWith('+')?'+':'')+(()=>{const target=resolve(dirname(old),v.path);if(!within(source,target))copyExternal(target,true);const href=mapTarget(old,v.path);return (href.startsWith('./')||href.startsWith('../'))?href:'./'+href;})():ref;});
    if(f.path===types[object.id.split('.')[0]].entry){metadata.user_revision=1;delete metadata.upstream;}
    const body=parsed.body.toString('utf8').replace(/(!?\[[^\]]*\]\()([^\s)]+)(\))/g,(_,a,href,z)=>a+mapTarget(old,href)+z);bytes=Buffer.from((parsed.state==='present'?'---\n'+YAML.stringify(metadata)+'---\n':'')+body);
   }const target=join(stage,f.path);mkdirSync(dirname(target),{recursive:true});writeDurably(target,bytes,{mode:f.mode|0o200});}
   writeDurably(join(stage,'.ksf-store-origin.json'),JSON.stringify({operationId,source:p.sourceId,id:object.id,version:object.version,digest:object.digest}));
   renameSync(stage,dest);return {id:object.id,source:'user',path:p.personalPath+'/'+types[object.id.split('.')[0]].entry};
  }catch(e){rmSync(stage,{recursive:true,force:true});throw e;}
 });
}
export async function mutateAbilityStore(root,operation,input={},hooks={}){
 if(typeof input.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(input.operationId)||typeof input.ifMatch!=='string')fail('INVALID_ARGUMENTS','操作需要operationId和当前状态版本ifMatch。');
 return withStoreLock(root,async()=>{
  const record=readStore(root),state=structuredClone(record.state),fingerprint=hash([operation,input]),prior=state.operations.find(o=>o.id===input.operationId);
  if(prior){if(prior.fingerprint!==fingerprint)fail('ABILITY_STORE_OPERATION_CONFLICT','操作标识已用于其他请求。');return {...prior.result,version:record.version,replayed:true};}
  if(record.version!==input.ifMatch)fail('ABILITY_STORE_CONFLICT','商店状态已变化，请刷新后重试。');let result;
  if(input.sourceId===DEFAULT_ABILITY_SOURCE.id&&['source-edit','source-toggle','source-remove'].includes(operation))fail('ABILITY_STORE_SOURCE_LOCKED','KSF公用能力源不可编辑、停用或移除。');
  if((operation==='source-add'||operation==='source-edit')&&input.kind==='http'){
   const d=await inspectHTTP(root,input.location),id=d.source.id,existing=state.sources.find(s=>s.id===id);if(id===DEFAULT_ABILITY_SOURCE.id||existing&&operation==='source-add')fail('ABILITY_STORE_SOURCE_EXISTS','此能力源已添加。');if(operation==='source-edit'&&id!==input.sourceId)fail('ABILITY_STORE_SOURCE_ID_CHANGED','源身份不同，请另行添加。');
   const source={id,name:d.source.name,kind:'http',location:input.location,enabled:existing?.enabled??true,checkedAt:new Date().toISOString()};state.sources=state.sources.filter(s=>s.id!==id);state.sources.push(source);result={source};
  }else if(operation==='source-add'||operation==='source-edit'){
   if(!['local','git'].includes(input.kind)||typeof input.location!=='string'||!input.location.trim()||/[\x00-\x1f\x7f]/.test(input.location))fail('INVALID_ARGUMENTS','请填写本地目录或Git地址。');
   let path=input.kind==='local'?resolve(root,input.location):null;
   if(!path){if(!/^(?:https?:\/\/[^\s]+|ssh:\/\/[^\s]+|[\w.-]+@[\w.-]+:[^\s]+)$/.test(input.location)||/^https?:\/\/[^/]*@/.test(input.location))fail('INVALID_ARGUMENTS','Git源支持HTTPS或SSH地址；请使用本机Git凭据。');const repos=safeDirectory(root,'repositories',{create:true});path=join(repos,'ability-source-'+randomUUID());await git(repos,['clone','--no-recurse-submodules','--',input.location,path]);}
   const checked=inspectSource(root,path);if(checked.errors.length)fail('ABILITY_STORE_SOURCE_INVALID','能力源校验失败。',{errors:checked.errors});const id=checked.data.id,existing=state.sources.find(s=>s.id===id);
   if(operation==='source-edit'&&id!==input.sourceId)fail('ABILITY_STORE_SOURCE_ID_CHANGED','新位置的能力源ID不同，请另行添加。');
   if(existing&&operation==='source-add')fail('ABILITY_STORE_SOURCE_EXISTS','此能力源已添加。');if(state.sources.some(s=>s.path===path&&s.id!==id))fail('ABILITY_STORE_SOURCE_EXISTS','该目录已经添加。');
   const source={id,name:checked.data.name,description:checked.data.description??'',kind:input.kind,path,location:input.location,enabled:existing?.enabled??true,checkedAt:new Date().toISOString()};state.sources=state.sources.filter(s=>s.id!==id);state.sources.push(source);result={source};
  }else if(['source-toggle','source-remove','refresh','check'].includes(operation)){
   const source=requireSource(state,input.sourceId);
   if(operation==='source-toggle'){if(typeof input.enabled!=='boolean')fail('INVALID_ARGUMENTS','启用状态无效。');source.enabled=input.enabled;}
   else if(operation==='source-remove')state.sources=state.sources.filter(s=>s.id!==source.id);
   else{try{if(operation==='refresh'&&source.kind==='git'){
     if(await git(source.path,['status','--porcelain']))fail('ABILITY_STORE_SOURCE_DIRTY','托管仓库有本地修改，请先处理；没有覆盖或拉取。');await git(source.path,['pull','--ff-only','--no-recurse-submodules']);
    }if(source.kind==='http')await abilityHTTP(root,source).open({refresh:true});else checkedSource(root,source);source.checkedAt=new Date().toISOString();delete source.refreshError;
   }catch(e){source.refreshError=err(e);source.checkedAt=new Date().toISOString();result={source,error:source.refreshError};}}
   result??={source,repositoryPreserved:true};
  }else if(['install','update','uninstall','migrate','copy','import'].includes(operation)){
   let p;
   // Reconcile a personal-directory publication interrupted before its receipt.
   const personal=validId(input.id)?join(root,types[input.id.split('.')[0]].user,input.id,'.ksf-store-origin.json'):null;
   if(operation==='copy'&&personal&&existsSync(personal)&&JSON.parse(readFileSync(personal)).operationId===input.operationId){result={id:input.id,source:'user',path:portable(relative(root,dirname(personal)))+'/'+types[input.id.split('.')[0]].entry};}
   else{p=operation==='import'?importPlan(root,state,input):await preparedPlan(root,state,{...input,action:operation});try{if(input.planDigest!==p.planDigest)fail('ABILITY_STORE_PREVIEW_CHANGED','安装计划已变化，请重新预览。');hooks.beforePublish?.();
    if(operation==='copy')result=copyPersonal(root,state,p,input.operationId);
    else{if(p.source)p.origin=p.source.kind==='http'?{id:p.source.id,name:p.source.name,kind:'http',location:p.source.location,catalogRevision:p.source.catalogRevision,commit:null,dirty:false}:{...p.origin,...await origin(root,p.source)};const installed=publishGeneration(root,p);state.installed[p.sourceId]=installed;if(operation==='migrate'){if(!state.sources.some(s=>s.id===p.sourceId))state.sources.push(p.source);state.adopted=[...new Set([...state.adopted,p.sourceId])];}result={...publicPlan(p),generation:installed.generation};}
    }finally{p.dispose?.();}
   }
   if(operation==='copy'&&!state.copies.some(c=>c.operationId===input.operationId))state.copies.push({...result,operationId:input.operationId,sourceId:input.sourceId});
  }else fail('INVALID_ARGUMENTS','未知能力商店操作。');
  state.operations.push({id:input.operationId,fingerprint,result});state.operations=state.operations.slice(-128);const version=saveStore(root,state,record.version);return {...result,version};
 });
}

/** Paged public directory. Local/Git scans stay local; HTTP loads only requested shards. */
export async function abilityStorePage(root,input={}){
 const local=abilityStoreCatalog(root),state=readStore(root).state,errors=[...local.errors],revisions={},cache={},limit=Math.max(1,Math.min(40,Number(input.limit)||40)),query=String(input.query??'').normalize('NFKC').trim().toLowerCase(),type=input.type??'',tab=input.tab??'abilities';
 const clients=new Map();for(const s of state.sources.filter(s=>s.enabled&&s.kind==='http'&&(!input.sourceId||s.id===input.sourceId)&&(!['installed','updates'].includes(tab)||state.installed[s.id]?.objects.length)))try{const client=abilityHTTP(root,s),catalog=await client.open({refresh:input.refresh==='1'||tab==='updates'});clients.set(s.id,client);revisions[s.id]=catalog.revision;cache[s.id]=catalog.freshness;}catch(e){errors.push({...err(e),sourceId:s.id});}
 const revision=hash([local.version,revisions,query,type,tab]);let position={source:0,inner:null,offset:0};if(input.cursor){try{const p=JSON.parse(Buffer.from(input.cursor,'base64url'));if(p.revision!==revision)fail('STORE_CURSOR_EXPIRED','目录已更新，请刷新后继续浏览。');position=p.position;}catch(e){if(e.code)throw e;fail('STORE_CURSOR_INVALID','目录游标无效。');}}
 const personal=new Map(catalog(root).rows.filter(r=>r.source==='user'&&!r.errors.length).map(r=>[r.id,summary(r)]));
 const overlay=(s,row)=>{const existing=local.abilities.find(a=>a.sourceId===s.id&&a.id===row.id),installed=existing?.installed;return {key:s.id+':'+row.id,id:row.id,type:row.type,sourceId:s.id,sourceName:s.name,available:{id:row.id,name:row.name,description:row.description,version:row.latestVersion,status:'active',digest:row.detail.sha256},installed,personal:existing?.personal??personal.get(row.id)??null,dependencies:[],updateAvailable:!!installed&&compareVersion(row.latestVersion,installed.version)>0};};
 const match=a=>(!type||a.type===type)&&(!query||`${a.id} ${a.available?.name??a.installed?.name} ${a.available?.description??a.installed?.description}`.normalize('NFKC').toLowerCase().includes(query));
 const abilities=[];let next=null;
 if(tab==='installed'||tab==='updates'){
  const candidates=[];for(const item of local.abilities.filter(a=>a.installed&&(!input.sourceId||a.sourceId===input.sourceId))){const client=clients.get(item.sourceId);let a=item;if(client)try{const d=await client.detail(item.id);if(d)a=overlay(state.sources.find(s=>s.id===item.sourceId),{...d,detail:{sha256:d.versions.sha256}});}catch(e){errors.push({...err(e),sourceId:item.sourceId});}if(match(a)&&(tab!=='updates'||a.updateAvailable))candidates.push(a);}
  abilities.push(...candidates.slice(position.offset,position.offset+limit));if(position.offset+limit<candidates.length)next={...position,offset:position.offset+limit};
 }else if(tab!=='sources'){
  const sources=state.sources.filter(s=>s.enabled&&(!input.sourceId||s.id===input.sourceId));for(let at=position.source;at<sources.length;at++){const s=sources[at],client=clients.get(s.id);if(s.kind==='http'&&!client)continue;
   if(client){try{const page=await client.list({query,type,limit:limit-abilities.length,cursor:at===position.source?position.inner:null});abilities.push(...page.items.map(row=>overlay(s,row)));if(page.nextCursor){next={source:at,inner:page.nextCursor,offset:0};break;}}catch(e){if(e.code==='STORE_CURSOR_EXPIRED')throw e;errors.push({...err(e),sourceId:s.id});}}
   else{const items=local.abilities.filter(a=>a.sourceId===s.id&&a.available&&match(a)),offset=at===position.source?position.offset:0,room=limit-abilities.length;abilities.push(...items.slice(offset,offset+room));if(offset+room<items.length){next={source:at,inner:null,offset:offset+room};break;}}
   if(abilities.length===limit){if(at+1<sources.length)next={source:at+1,inner:null,offset:0};break;}
  }
 }
 return {...local,sources:local.sources.map(s=>s.kind==='http'?{...s,valid:!errors.some(e=>e.sourceId===s.id),error:errors.find(e=>e.sourceId===s.id)}:s),abilities,revision,nextCursor:next?Buffer.from(JSON.stringify({revision,position:next})).toString('base64url'):null,errors,cache,complete:!errors.length};
}
export async function abilityStoreDetail(root,{sourceId,id}){
 const local=abilityStoreCatalog(root),source=readStore(root).state.sources.find(s=>s.id===sourceId),existing=local.abilities.find(a=>a.id===id&&a.sourceId===sourceId);if(source?.kind!=='http'||!source.enabled)return existing??null;
 try{const client=abilityHTTP(root,source),d=await client.detail(id);if(!d)return existing??null;const release=(await client.versions(id)).items[0];return {...existing,key:sourceId+':'+id,id,type:d.type,sourceId,sourceName:source.name,available:{id,name:d.name,description:d.description,version:d.latestVersion,status:release.status??'active',digest:release.package.sha256},personal:existing?.personal??catalog(root).rows.filter(r=>r.source==='user'&&r.id===id&&!r.errors.length).map(summary)[0]??null,dependencies:release.dependencies??[],updateAvailable:!!existing?.installed&&compareVersion(d.latestVersion,existing.installed.version)>0,revision:d.revision,freshness:d.freshness};}catch(e){if(existing)return {...existing,sourceError:err(e)};throw e;}
}
export async function abilityStoreVersions(root,input){const source=requireSource(readStore(root).state,input.sourceId);if(source.kind==='http')return abilityHTTP(root,source).versions(input.id,input);const item=await abilityStoreDetail(root,input);return {revision:readStore(root).version,items:item?.available?[item.available]:[],nextCursor:null};}
