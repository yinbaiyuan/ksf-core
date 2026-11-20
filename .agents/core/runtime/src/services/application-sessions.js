import {createApplicationStorage} from './application-storage.js';
import {assert,digest} from './workbench-common.js';
import {validateSessionKey,validateSessionValue} from '../../../applications/sdk/src/session-contract.js';

/** The existing app storage owns atomicity, cross-process CAS, durable bytes and symlink checks. */
export function createApplicationSessions(root,{instanceId,storage=createApplicationStorage(root),now=()=>new Date().toISOString()}={}){
  assert(typeof instanceId==='string'&&instanceId.length>0,'APP_SESSION_INSTANCE','缺少当前实例身份。');
  const target=(caller,key)=>{
    const name='ui-session-'+digest(key)+'.json';
    return {name,caller:{...caller,dataStores:[{name,scope:'user',schemaVersion:1,migrateFrom:[]}]}};
  };
  function checked(record,caller,key,recordVersion){
    assert(record&&record.schemaVersion===1&&record.instanceId===instanceId&&record.appId===caller.appId&&record.key===key,'APP_SESSION_IDENTITY','持久会话不属于当前实例、应用或会话键，原件已保留。',409);
    assert(record.recordVersion===recordVersion,'APP_SESSION_VERSION','持久会话记录版本不兼容，原件已保留。',409);
    assert(typeof record.appVersion==='string'&&typeof record.updatedAt==='string'&&Number.isFinite(Date.parse(record.updatedAt)),'APP_SESSION_INVALID','持久会话元数据损坏，原件已保留。',409);
    validateSessionValue(record.value);return record;
  }
  async function read(caller,{key,recordVersion}={}){
    validateSessionKey(key,recordVersion);const t=target(caller,key),raw=await storage.read(t.caller,t.name);
    if(!raw.exists)return {exists:false,etag:null,record:null};
    let record;try{record=JSON.parse(raw.text);}catch{assert(false,'APP_SESSION_INVALID','持久会话不是有效JSON，原件已保留。',409);}
    return {exists:true,etag:raw.etag,record:checked(record,caller,key,recordVersion)};
  }
  async function write(caller,input={}){
    const {key,recordVersion,value,ifMatch}=input;validateSessionKey(key,recordVersion);validateSessionValue(value);
    assert(Object.hasOwn(input,'ifMatch')&&(ifMatch===null||typeof ifMatch==='string'),'APP_SESSION_VERSION','会话写入需要明确的原版本。');
    const current=await read(caller,{key,recordVersion});assert(current.etag===ifMatch,'APP_DATA_CONFLICT','会话已被另一窗口更新，请比较后合并。',409);
    const record={schemaVersion:1,instanceId,appId:caller.appId,key,recordVersion,appVersion:caller.version,updatedAt:now(),value};
    const t=target(caller,key),saved=await storage.write(t.caller,t.name,JSON.stringify(record)+'\n',{ifMatch});
    return {etag:saved.etag,record};
  }
  return {read,write};
}
