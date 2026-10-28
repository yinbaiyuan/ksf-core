import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {atomicWrite,withStoreLock} from './publication.mjs';
/** Atomic JSON updates. Unknown schemas and failed migrations never replace the original. */
export function createJSONStore(context,{name='state.json',schemaVersion=1,initial={},validate=()=>true,migrate}={}){
 function checked(data){let serialized;try{serialized=JSON.stringify(data);if(serialized===undefined||!isDeepStrictEqual(data,JSON.parse(serialized)))throw Error();}catch{throw Object.assign(Error('业务数据必须是无损 JSON。'),{code:'APP_DATA_INVALID'});}if(validate(data)!==true)throw Object.assign(Error('应用数据校验失败，原件已保留。'),{code:'APP_DATA_INVALID'});return data;}
 if(!Number.isSafeInteger(schemaVersion)||schemaVersion<1)throw Error('数据版本必须为正整数。');
 if(!/^[a-zA-Z0-9_-]+\.json$/.test(name))throw Error('数据文件名无效。');const path=join(context.dataDirectory,name);
 const host=context.storage;
 const readText=async()=>{if(!host)return readFile(path,'utf8');const record=await host.read(name);if(!record.exists)throw Object.assign(Error('数据尚不存在'),{code:'ENOENT'});return record.text;};
 async function read(){let document;try{document=JSON.parse(await readText());}catch(error){if(error.code==='ENOENT')return{schemaVersion,revision:0,data:checked(structuredClone(initial))};throw error;}if(document.schemaVersion!==schemaVersion){if(!migrate)throw Error('应用数据版本不兼容，原件已保留。');document={...document,schemaVersion,data:await migrate(document.data,document.schemaVersion)};}checked(document.data);if(!Number.isSafeInteger(document.revision)||document.revision<0)throw Error('应用数据无效，原件已保留。');return document;}
 const locked=action=>context.locks?context.locks.run('storage:'+name,action):withStoreLock(context.dataDirectory,action);
 return {read,update:async(action,{revision}={})=>locked(async()=>{const original=host?await host.read(name):null;const current=await read();if(revision!==undefined&&revision!==current.revision)throw Object.assign(Error('应用数据已变化。'),{code:'APP_DATA_CONFLICT'});const data=await action(structuredClone(current.data));checked(data);const next={schemaVersion,revision:current.revision+1,data};if(host)await host.write(name,JSON.stringify(next),{ifMatch:original.etag});else await atomicWrite(path,JSON.stringify(next));return next;})};
}
