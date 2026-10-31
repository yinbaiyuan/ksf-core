import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {atomicWrite,withStoreLock} from './publication.mjs';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
/** Reads never migrate. Conversion is explicit and committed by the host with a before-image. */
export function createJSONStore(context,{name='state.json',scope='user',schemaVersion=1,initial={},validate=()=>true,migrations={}}={}){
  function checked(data){
    try{const text=JSON.stringify(data);if(text===undefined||!isDeepStrictEqual(data,JSON.parse(text)))throw Error();}
    catch{fail('APP_DATA_INVALID','业务数据必须是无损 JSON。');}
    if(validate(data)!==true)fail('APP_DATA_INVALID','应用数据校验失败，原件已保留。');
    return data;
  }
  if(!Number.isSafeInteger(schemaVersion)||schemaVersion<1)fail('APP_DATA_INVALID','数据版本必须为正整数。');
  if(!/^[a-zA-Z0-9_-]+\.json$/.test(name))fail('APP_DATA_INVALID','数据文件名无效。');
  if(!['user','runtime'].includes(scope))fail('APP_STORAGE_SCOPE_INVALID','存储范围需要 user 或 runtime。');
  if(!migrations||typeof migrations!=='object'||Array.isArray(migrations)||Object.entries(migrations).some(([version,action])=>!/^[1-9]\d*$/.test(version)||!Number.isSafeInteger(Number(version))||Number(version)>=schemaVersion||typeof action!=='function'))fail('APP_DATA_MIGRATION_UNSUPPORTED','迁移必须按明确的较低来源版本登记。');
  const directory=scope==='runtime'?context.runtimeDataDirectory:context.dataDirectory,host=context.storage;
  if(!host&&!directory)fail('APP_STORAGE_SCOPE_UNAVAILABLE','当前宿主尚未提供此范围的存储。');
  const path=directory?join(directory,name):undefined;
  async function record(){
    if(host)return host.read(name,{scope});
    try{return {exists:true,text:await readFile(path,'utf8'),path};}catch(e){if(e.code==='ENOENT')return {exists:false,text:null,path};throw e;}
  }
  function parse(saved){
    if(!saved.exists)return {schemaVersion,revision:0,data:checked(structuredClone(initial))};
    let document;try{document=JSON.parse(saved.text);}catch{fail('APP_DATA_INVALID','应用数据损坏，原件已保留。');}
    if(!document||!Number.isSafeInteger(document.schemaVersion)||document.schemaVersion<1||!Number.isSafeInteger(document.revision)||document.revision<0||!Object.hasOwn(document,'data'))fail('APP_DATA_INVALID','应用存储封装无效，原件已保留。');
    return document;
  }
  function ready(document){
    if(document.schemaVersion!==schemaVersion)fail(Object.hasOwn(migrations,document.schemaVersion)?'APP_DATA_MIGRATION_REQUIRED':'APP_DATA_INCOMPATIBLE','应用数据版本不兼容，请先核对并显式迁移，原件已保留。');
    checked(document.data);return document;
  }
  const locked=action=>context.locks?context.locks.run('storage:'+(context.appId??directory??'local')+':'+scope+':'+name,action):directory?withStoreLock(directory,action):action();
  async function inspect(){
    if(host?.inspect){const result=await host.inspect(name,{scope});if(result.targetVersion!==schemaVersion)fail('APP_DATA_INCOMPATIBLE','SDK 数据版本与应用清单声明不一致。');return result;}
    const saved=await record(),document=parse(saved),state=!saved.exists?'missing':document.schemaVersion===schemaVersion?'current':Object.hasOwn(migrations,document.schemaVersion)?'migration-required':'unsupported';
    return {name,scope,path:saved.path,exists:saved.exists,etag:saved.etag??null,schemaVersion:saved.exists?document.schemaVersion:null,targetVersion:schemaVersion,state,migrateFrom:Object.keys(migrations).map(Number)};
  }
  async function read(){return ready(parse(await record()));}
  async function migrate(){return locked(async()=>{
    const status=await inspect(),saved=await record(),current=parse(saved);
    if(['missing','current'].includes(status.state))return {changed:false,document:ready(current)};
    if(status.state!=='migration-required'||!Object.hasOwn(migrations,current.schemaVersion))fail('APP_DATA_MIGRATION_UNSUPPORTED','没有明确支持的数据迁移路径。');
    if(!host?.migrate)fail('APP_STORAGE_MIGRATION_UNAVAILABLE','持久迁移需要宿主提供原件保护服务。');
    const data=checked(await migrations[current.schemaVersion](structuredClone(current.data)));
    if(current.revision===Number.MAX_SAFE_INTEGER)fail('APP_DATA_INVALID','存储 revision 已达上限，原件已保留。');
    const next={schemaVersion,revision:current.revision+1,data};
    const receipt=await host.migrate(name,{scope,text:JSON.stringify(next),ifMatch:saved.etag,fromVersion:current.schemaVersion,toVersion:schemaVersion});
    const verified=await record();if(verified.etag!==receipt.etag)fail('APP_DATA_CONFLICT','迁移提交后数据已变化，请检查实际版本。');
    return {...receipt,changed:true,document:ready(parse(verified))};
  });}
  return {read,inspect,migrate,update:async(action,{revision}={})=>locked(async()=>{
    const original=await record(),current=ready(parse(original));
    if(revision!==undefined&&revision!==current.revision)fail('APP_DATA_CONFLICT','应用数据已变化。');
    const data=checked(await action(structuredClone(current.data)));
    if(current.revision===Number.MAX_SAFE_INTEGER)fail('APP_DATA_INVALID','存储 revision 已达上限，原件已保留。');
    const next={schemaVersion,revision:current.revision+1,data};
    if(host)await host.write(name,JSON.stringify(next),{ifMatch:original.etag,scope});else await atomicWrite(path,JSON.stringify(next));
    return next;
  })};
}
