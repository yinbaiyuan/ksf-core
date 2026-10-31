import {withAsyncFileLock} from '../shared/async-lock.js';
import {join,dirname,relative,resolve} from 'node:path';
import {lstat,open,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {safeDirectory,replaceFile,syncDirectory,atomicJSON} from '../shared/durable-json.js';
import {createCoordinator,digest,assert,problem} from './workbench-common.js';
import {platform} from '../platform/index.js';

const MAX_DATA=8*1024*1024;
export function jsonDataVersion(text,path){
  let value;try{value=JSON.parse(text);}catch{throw problem('APP_DATA_INVALID','应用 JSON 数据损坏，原件已保留。',400,{path});}
  assert(value&&typeof value==='object'&&!Array.isArray(value)&&Number.isSafeInteger(value.schemaVersion)&&value.schemaVersion>0,'APP_DATA_INVALID','应用数据缺少有效的 schemaVersion，原件已保留。');
  return value.schemaVersion;
}
/** Storage owns file durability; applications own conversion and business validation. */
export function createApplicationStorage(root,{fault}={}) {
  root=resolve(root);
  const homes={user:join(root,'.agents/user-data/applications/data'),runtime:join(root,'.agents/runtime-data/applications/data')};
  const locks=createCoordinator(),inflight=new Map();
  const declaration=(caller,name,scope)=>caller.dataStores?.find(s=>s.name===name&&s.scope===scope);
  function pathFor(caller,name,scope='user'){
    assert(Object.hasOwn(homes,scope),'APP_STORAGE_SCOPE_INVALID','存储范围需要 user 或 runtime。');
    assert(/^[a-z][a-z0-9.-]{1,79}$/.test(caller.appId??'')&&typeof name==='string'&&/^[a-zA-Z0-9_-]+\.(json|md|txt)$/.test(name)&&platform.validSegment(name),'APP_PATH_INVALID','应用数据文件名无效。');
    return join(homes[scope],caller.appId,name);
  }
  async function checkParent(path){
    let current=root;
    for(const segment of relative(root,dirname(path)).split(/[\\/]/)){
      current=join(current,segment);const stat=await lstat(current);
      assert(stat.isDirectory()&&!stat.isSymbolicLink(),'APP_DATA_INVALID','应用数据目录不能是符号链接。');
    }
  }
  async function read(caller,name,options={}){
    const scope=options?.scope??'user',path=pathFor(caller,name,scope);let file;
    try{
      await checkParent(path);const before=await lstat(path);
      assert(before.isFile()&&!before.isSymbolicLink()&&before.size<=MAX_DATA,'APP_DATA_INVALID','应用数据必须是 8 MiB 以内的普通文件。');
      file=await open(path,'r');const stat=await file.stat();
      assert(stat.dev===before.dev&&stat.ino===before.ino&&stat.size<=MAX_DATA,'APP_DATA_CONFLICT','应用数据在读取时变化。',409);
      const bytes=await file.readFile();assert(bytes.length<=MAX_DATA,'APP_DATA_INVALID','应用数据超过大小限制。');
      let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw problem('APP_DATA_INVALID','应用数据不是有效 UTF-8，原件已保留。',409,{path});}
      return {exists:true,text,etag:digest(bytes),path};
    }catch(e){if(e.code==='ENOENT')return {exists:false,text:null,etag:null,path};throw e;}
    finally{await file?.close();}
  }
  async function inspect(caller,name,options={}){
    const scope=options?.scope??'user',store=declaration(caller,name,scope);
    assert(store,'APP_DATA_UNDECLARED','此文件未声明为受管数据。');
    const record=await read(caller,name,{scope});
    const schemaVersion=record.exists?jsonDataVersion(record.text,record.path):null;
    const state=!record.exists?'missing':schemaVersion===store.schemaVersion?'current':store.migrateFrom.includes(schemaVersion)?'migration-required':'unsupported';
    return {name,scope,path:record.path,exists:record.exists,etag:record.etag,schemaVersion,targetVersion:store.schemaVersion,migrateFrom:store.migrateFrom,state};
  }
  async function inspectAll(caller){
    const stores=[],errors=[];
    for(const store of caller.dataStores??[]){try{stores.push(await inspect(caller,store.name,{scope:store.scope}));}catch(e){errors.push({name:store.name,scope:store.scope,code:e.code??'APP_DATA_INVALID',message:e.message});}}
    return {appId:caller.appId,compatible:errors.length===0&&stores.every(s=>['missing','current'].includes(s.state)),canPrepare:errors.length===0&&stores.every(s=>s.state!=='unsupported'),stores,errors};
  }
  function checkReady(result){
    if(result.errors.length)throw problem(result.errors[0].code,result.errors[0].message,409,result);
    if(result.stores.some(s=>s.state==='unsupported'))throw problem('APP_DATA_INCOMPATIBLE','应用无法读取当前数据格式，原件已保留。',409,result);
    if(!result.compatible)throw problem('APP_DATA_MIGRATION_REQUIRED','应用需要先完成声明的数据迁移。',409,result);
    return result;
  }
  async function publish(path,text){
    const temp=path+'.'+randomUUID()+'.tmp';let file,replaced=false;
    try{
      file=await open(temp,'wx',0o600);await file.writeFile(text);await file.sync();await file.close();file=undefined;
      await fault?.('before-replace',{path});await replaceFile(temp,path);replaced=true;
      await fault?.('after-replace',{path});await syncDirectory(dirname(path));
    }catch(e){if(replaced)e.data={...e.data,outcomeUnknown:true,path};throw e;}
    finally{await file?.close();await rm(temp,{force:true});}
  }
  function tracked(caller,action){
    const pending=inflight.get(caller.appId)??new Set();inflight.set(caller.appId,pending);
    const promise=Promise.resolve().then(action);pending.add(promise);
    return promise.finally(()=>{pending.delete(promise);if(!pending.size)inflight.delete(caller.appId);});
  }
  function write(caller,name,text,options={}){return tracked(caller,async()=>{
    const scope=options?.scope??'user',path=pathFor(caller,name,scope),store=declaration(caller,name,scope);
    assert(typeof text==='string'&&Buffer.byteLength(text)<=MAX_DATA,'APP_DATA_INVALID','应用数据必须是 8 MiB 以内的文本。');
    if(store)assert(jsonDataVersion(text,path)===store.schemaVersion,'APP_DATA_INCOMPATIBLE','写入数据版本与应用声明不符。');
    await safeDirectory(root,dirname(path));
    return locks.run(path,()=>withAsyncFileLock(path+'.lock',async()=>{
      const current=await read(caller,name,{scope});
      if(store&&current.exists)assert(jsonDataVersion(current.text,path)===store.schemaVersion,'APP_DATA_MIGRATION_REQUIRED','请先迁移，不能用普通写入覆盖其他版本的数据。',409);
      if(Object.hasOwn(options??{},'ifMatch'))assert(options.ifMatch===current.etag,'APP_DATA_CONFLICT','应用数据已变化，请重读后合并。',409);
      await publish(path,text);return {path,etag:digest(text)};
    }));
  });}
  function migrate(caller,name,input){return tracked(caller,async()=>{
    const {scope='user',text,ifMatch,fromVersion,toVersion}=input??{},path=pathFor(caller,name,scope),store=declaration(caller,name,scope);
    assert(store,'APP_DATA_UNDECLARED','迁移只能处理当前应用声明的数据。');
    assert(toVersion===store.schemaVersion&&store.migrateFrom.includes(fromVersion)&&fromVersion<toVersion,'APP_DATA_MIGRATION_UNSUPPORTED','未声明此数据迁移路径。');
    assert(typeof ifMatch==='string'&&typeof text==='string'&&Buffer.byteLength(text)<=MAX_DATA&&jsonDataVersion(text,path)===toVersion,'APP_DATA_INVALID','迁移候选、目标版本或原件条件无效。');
    await checkParent(path);
    return locks.run(path,()=>withAsyncFileLock(path+'.lock',async()=>{
      const current=await read(caller,name,{scope});
      assert(current.exists&&current.etag===ifMatch,'APP_DATA_CONFLICT','迁移原件已变化，请重读后核对。',409);
      assert(jsonDataVersion(current.text,path)===fromVersion,'APP_DATA_CONFLICT','迁移来源版本已变化。',409);
      const migrationId=randomUUID(),base=scope==='user'?'.agents/user-data':'.agents/runtime-data';
      const folder=join(root,base,'applications/migrations',caller.appId,migrationId);
      await safeDirectory(root,folder);
      await fault?.('before-backup',{path,folder});
      const before=join(folder,'before.json');let fd;
      try{fd=await open(before,'wx',0o600);await fd.writeFile(current.text);await fd.sync();}finally{await fd?.close();}
      const metadata={schemaVersion:1,migrationId,appId:caller.appId,scope,name,fromVersion,toVersion,beforeEtag:current.etag,afterEtag:digest(text),packageDigest:caller.releaseDigest??null,createdAt:new Date().toISOString(),state:'prepared'};
      await atomicJSON(join(folder,'migration.json'),metadata);await syncDirectory(folder);
      await fault?.('backup-written',{path,folder});
      const latest=await read(caller,name,{scope});assert(latest.etag===ifMatch,'APP_DATA_CONFLICT','迁移备份后原件已变化。',409);
      await publish(path,text);
      const saved=await read(caller,name,{scope});assert(saved.etag===metadata.afterEtag,'APP_DATA_CONFLICT','迁移提交后数据出现并发变化。',409);
      await atomicJSON(join(folder,'migration.json'),{...metadata,state:'committed'}).catch(e=>{e.data={...e.data,outcomeUnknown:true,path};throw e;});
      return {path,etag:saved.etag,fromVersion,toVersion,backupRef:relative(root,before),migrationId};
    }));
  });}
  return {read,write,inspect,inspectAll,checkReady,migrate,pending:appId=>inflight.get(appId)?.size??0,async wait(appId){while(inflight.get(appId)?.size)await Promise.allSettled([...inflight.get(appId)]);}};
}
