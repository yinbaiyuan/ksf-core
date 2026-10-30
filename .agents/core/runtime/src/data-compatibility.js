import {lstat,readFile,readdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {assert,problem} from './services/workbench-common.js';
import {validateManifest,assertCompatible,validVersion} from './applications/protocol.js';

const currentContract=JSON.parse(readFileSync(new URL('../../data-compatibility.json',import.meta.url),'utf8'));
async function ordinary(root,path){
  const rel=relative(root,path);assert(rel&&!rel.startsWith('..')&&!rel.includes(':'),'CORE_DATA_PATH_INVALID','兼容检查路径越界。');
  let current=root;
  for(const segment of rel.split(/[\\/]/)){current=join(current,segment);const stat=await lstat(current);assert(!stat.isSymbolicLink(),'CORE_DATA_PATH_INVALID','兼容检查不跟随符号链接。');}
  return lstat(path);
}
async function json(root,path){
  const stat=await ordinary(root,path);assert(stat.isFile()&&stat.size<=64*1024*1024,'CORE_DATA_INVALID','兼容检查需要有界普通 JSON 文件。');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await readFile(path)));}catch(e){throw problem('CORE_DATA_INVALID','持久数据损坏，请保留原件。',409,{path});}
}
function contract(value){
  assert(value?.schemaVersion===1&&Array.isArray(value.sdkVersions)&&value.sdkVersions.every(Number.isSafeInteger)&&Array.isArray(value.formats),'CORE_DATA_CONTRACT_INVALID','目标 Core 缺少有效的数据兼容契约。');
  const ids=new Set();
  for(const entry of value.formats){assert(typeof entry.id==='string'&&!ids.has(entry.id)&&typeof entry.versionField==='string'&&Array.isArray(entry.versions)&&entry.versions.length>0,'CORE_DATA_CONTRACT_INVALID','目标 Core 数据格式声明无效。');ids.add(entry.id);}
  return value;
}
/** Executes no candidate code and mutates no store. Locators are owned by this Core. */
export async function inspectCoreDataCompatibility(root,targetCore,{applicationState}={}){
  root=resolve(root);targetCore=resolve(targetCore);
  let target;try{target=contract(await json(targetCore,join(targetCore,'data-compatibility.json')));}catch(error){if(error.code==='ENOENT')throw problem('CORE_DATA_CONTRACT_INVALID','目标 Core 缺少数据兼容契约，无法安全切换。',409);throw error;}
  const build=await json(targetCore,join(targetCore,'build.json'));assert(validVersion(build.version),'CORE_DATA_CONTRACT_INVALID','目标 Core 版本无效。');
  const formats=new Map(target.formats.map(f=>[f.id,f])),errors=[];let filesChecked=0;
  const gap=(e,path,format)=>errors.push({code:e.code??'CORE_DATA_INVALID',message:e.message,path:relative(root,path),...(format?{format}:{}),...(e.data?.actual!==undefined?{actual:e.data.actual}:{})});
  // A fixed legacy locator keeps pre-rename Core-owned data checked during the
  // one-time identity switch. The format declaration remains authoritative.
  for(const owner of contract(currentContract).formats.flatMap(format=>[format,...(format.legacyRoots??[]).map(root=>({...format,root}))])){
    const folder=join(root,owner.root),pattern=new RegExp(owner.pattern),reader=formats.get(owner.id);
    async function walk(path,depth=0){
      if(depth>16)throw problem('CORE_DATA_INVALID','持久数据目录层级超限。');
      const stat=await ordinary(root,path);assert(stat.isDirectory(),'CORE_DATA_INVALID','持久数据入口必须是目录。');
      for(const entry of await readdir(path,{withFileTypes:true})){
        const file=join(path,entry.name),name=relative(folder,file).split('\\').join('/');
        if(entry.isSymbolicLink()){gap(problem('CORE_DATA_PATH_INVALID','持久数据符号链接无法核验。'),file,owner.id);continue;}
        if(entry.isDirectory()&&owner.recursive&&depth<(owner.maxDepth??16)){await walk(file,depth+1);continue;}
        if(!entry.isFile()||!pattern.test(name))continue;
        try{
          let document;if(owner.versionField==='$bytes'){const stat=await ordinary(root,file);assert(stat.isFile()&&stat.size===owner.byteLength,'CORE_DATA_INVALID','固定格式身份文件长度无效。');document=await readFile(file);}else document=await json(root,file);filesChecked++;
          const shape=owner.shape?.kind==='git-ledger'?Array.isArray(document)&&document.length<=500&&document.every(item=>typeof item?.requestId==='string'&&typeof item.fingerprint==='string'&&typeof item.operation?.id==='string'&&typeof item.operation.status==='string'):Object.entries(owner.shape??{}).every(([key,type])=>type==='counter'?Number.isSafeInteger(document?.[key])&&document[key]>=0:type==='digest'?typeof document?.[key]==='string'&&/^[a-f0-9]{64}$/.test(document[key]):type==='object'?document?.[key]!==null&&typeof document?.[key]==='object'&&!Array.isArray(document[key]):type==='string'&&typeof document?.[key]==='string');
          const actual=owner.versionField==='$bytes'&&document.length===owner.byteLength||owner.versionField==='$shape'&&shape?1:document?.[owner.versionField];
          if(!reader||reader.versionField!==owner.versionField||(owner.versionField==='$bytes'&&reader.byteLength!==owner.byteLength)||(owner.versionField==='$shape'&&JSON.stringify(reader.shape)!==JSON.stringify(owner.shape))||!reader.versions.includes(actual))throw problem('CORE_DATA_INCOMPATIBLE','目标 Core 无法读取现有数据格式。',409,{actual});
        }catch(e){gap(e,file,owner.id);}
      }
    }
    try{await walk(folder);}catch(e){if(e.code!=='ENOENT')gap(e,folder,owner.id);}
  }
  const index=join(root,'.agents/user-data/applications/state.json');
  try{
    const state=applicationState??await json(root,index);
    assert(state.schemaVersion===1&&state.installed&&typeof state.installed==='object','APP_STATE_INVALID','应用安装索引无效。');
    for(const [appId,app] of Object.entries(state.installed)){
      for(const release of [app.active,app.pending].filter(Boolean))try{
        validateManifest(release.manifest);
        assert(target.sdkVersions.includes(release.manifest.sdkVersion),'APP_SDK_INCOMPATIBLE','目标 Core 不支持已安装应用协议。');
        assertCompatible(release.manifest,{coreVersion:build.version});
      }catch(e){errors.push({appId,code:e.code??'APP_CORE_INCOMPATIBLE',message:e.message});}
    }
  }catch(e){if(e.code!=='ENOENT')gap(e,index);}
  return {compatible:errors.length===0,targetVersion:build.version,filesChecked,errors};
}
export async function assertCoreDataCompatibility(root,targetCore){
  const result=await inspectCoreDataCompatibility(root,targetCore);
  if(!result.compatible)throw problem('CORE_DATA_INCOMPATIBLE','目标 Core 与当前持久数据或应用要求不兼容；原件已保留。',409,result);
  return result;
}
