import {readFileSync,lstatSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {safePath} from '../user-data/storage.js';
import {sha256} from '../shared/hash.js';
import {readFileSnapshot,sameIdentity,withTemporaryFile} from '../shared/files.js';
import {replaceFileSync,syncDirectorySync} from '../platform/index.js';
import {acquireServiceLock} from '../services/service-lock.js';
import {safeDirectory} from '../shared/durable-json.js';

export const configError = (code,message,status=400,data) => Object.assign(new Error(message), {code,status,data});
export const canonical = value => JSON.stringify(sort(value));
function sort(value) { return Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,sort(value[key])])) : value; }
export const valueVersion = value => sha256(canonical(value));
export function expectConfig(before, ifMatch) {
  if (ifMatch !== 'missing' && !/^[a-f0-9]{64}$/.test(ifMatch ?? '')) throw configError('INVALID_ARGUMENTS','请提供 read 返回的版本或 missing。');
  if (before.etag !== ifMatch) throw configError('CONFIG_CONFLICT','配置已变化，请保留草稿并重新读取比较。',409,{expected:ifMatch,actual:before.etag});
}
export function readConfigFile(root,path,{text=false}={}) {
  const target=safePath(root,path); let entry;
  try { entry=lstatSync(target); } catch(error) { if(error.code==='ENOENT') return {path,target,state:'missing',etag:'missing',document:null}; throw error; }
  if(!entry.isFile() || entry.size>1024*1024) throw configError('CONFIG_INVALID','配置应为不超过 1 MiB 的普通文件。');
  const {bytes,stat}=readFileSnapshot(target,{entry,validateOpen(a,b){if(!sameIdentity(a,b))throw configError('CONFIG_CONFLICT','读取时配置变化。',409);},validateRead(a,b){if(!sameIdentity(a,b))throw configError('CONFIG_CONFLICT','读取时配置变化。',409);}});
  let document; try {const source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); document=text ? source : JSON.parse(source.replace(/^\uFEFF/,''));} catch {throw configError('CONFIG_INVALID','配置不是有效 UTF-8 或 JSON，请保留原件。');}
  return {path,target,state:'present',etag:sha256(bytes),document,stat};
}
export function publishConfigFile(root,before,document,{text=false}={}) {
  const bytes=Buffer.from(text ? document : JSON.stringify(document,null,2)+'\n');
  if(bytes.length>1024*1024)throw configError('CONFIG_INVALID','配置超过 1 MiB。');
  const target=safePath(root,before.path,{createParents:true}),temporary=target+'.'+randomUUID()+'.tmp';
  return withTemporaryFile(temporary,bytes,{mode:before.stat ? before.stat.mode&0o777 : 0o600},file=>{
    const current=readConfigFile(root,before.path,{text});expectConfig(current,before.etag);
    if(before.stat && !sameIdentity(before.stat,current.stat))throw configError('CONFIG_CONFLICT','发布前配置被外部编辑，请重新读取。',409);
    replaceFileSync(file,target);syncDirectorySync(dirname(target));return sha256(bytes);
  });
}
export async function withConfigLock(root,key,action) {
  const path=join(root,'.agents/runtime-data/configuration/locks',sha256(key)+'.lock');
  await safeDirectory(root,dirname(path));
  const release=await acquireServiceLock(path,{timeoutMs:5000});try{return await action();}finally{await release();}
}
