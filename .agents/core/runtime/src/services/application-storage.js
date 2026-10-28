import {withAsyncFileLock} from '../shared/async-lock.js';
import {join,dirname} from 'node:path';
import {lstat,readFile,open,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {safeDirectory,replaceFile,syncDirectory} from '../shared/durable-json.js';
import {createCoordinator,digest,assert} from './workbench-common.js';
import {platform} from '../platform/index.js';
export function createApplicationStorage(root) {
 const home=join(root,'.agents/user-data/applications/data'),locks=createCoordinator();
 const pathFor=(caller,name)=>{assert(/^[a-z][a-z0-9.-]{1,79}$/.test(caller.appId??'')&&typeof name==='string'&&/^[a-zA-Z0-9_-]+\.(json|md|txt)$/.test(name)&&platform.validSegment(name),'APP_PATH_INVALID','应用数据文件名无效。');return join(home,caller.appId,name);};
 async function read(caller,name){const path=pathFor(caller,name);try{await safeDirectory(root,dirname(path));const stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=8*1024*1024,'APP_DATA_INVALID','应用数据必须是 8 MiB 以内的普通文件。');const text=await readFile(path,'utf8');return {exists:true,text,etag:digest(text),path};}catch(e){if(e.code==='ENOENT')return {exists:false,text:null,etag:null,path};throw e;}}
 async function write(caller,name,text,options={}){const path=pathFor(caller,name);assert(typeof text==='string'&&Buffer.byteLength(text)<=8*1024*1024,'APP_DATA_INVALID','应用数据必须是 8 MiB 以内的文本。');await safeDirectory(root,dirname(path));return locks.run(path,()=>withAsyncFileLock(path+'.lock',async()=>{const current=await read(caller,name);if(Object.hasOwn(options??{},'ifMatch'))assert(options.ifMatch===current.etag,'APP_DATA_CONFLICT','应用数据已变化，请重读后合并。',409);const temp=path+'.'+randomUUID()+'.tmp';let fd;try{fd=await open(temp,'wx',0o600);await fd.writeFile(text);await fd.sync();await fd.close();fd=undefined;await replaceFile(temp,path);await syncDirectory(dirname(path));return {path,etag:digest(text)};}finally{await fd?.close();await rm(temp,{force:true});}}));}
 return {read,write};
}
