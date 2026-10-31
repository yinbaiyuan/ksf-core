import {randomUUID} from 'node:crypto';
import {open,rename,rm,lstat,mkdir,readFile} from 'node:fs/promises';
import {join,relative,dirname,resolve} from 'node:path';
import {replaceFile,syncDirectory,retryFileRead} from '../platform/index.js';
export {replaceFile,syncDirectory};
const invalidData=message=>{throw Object.assign(new Error(message),{code:'DURABLE_DATA_INVALID',status:400});};
export async function safeDirectory(root,path,{invalid=invalidData}={}){
 const base=resolve(root),rel=relative(base,resolve(path));if(rel.startsWith('..')||rel.includes(':'))invalid('数据路径越界。');
 let current=base;for(const item of rel.split(/[\\/]/).filter(Boolean)){current=join(current,item);let created=false;try{await mkdir(current,{mode:0o700});created=true;}catch(e){if(e.code!=='EEXIST')throw e;}const stat=await lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink())invalid('数据目录不能是符号链接。');if(created)await syncDirectory(dirname(current));}
}
export async function atomicJSON(path,value){
 const temporary=path+'.'+randomUUID()+'.tmp';let fd;
 try{fd=await open(temporary,'wx',0o600);await fd.writeFile(JSON.stringify(value)+'\n');await fd.sync();await fd.close();fd=undefined;await replaceFile(temporary,path);await syncDirectory(dirname(path));}finally{await fd?.close();await rm(temporary,{force:true});}
}
// Windows readers and file scanners can transiently deny replacement. Never delete the old record.
export async function readJSON(path,fallback,{invalid=invalidData}={}){try{return await retryFileRead(async()=>{const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)invalid('持久记录不是有效普通文件。');return JSON.parse(await readFile(path,'utf8'));});}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return structuredClone(fallback);if(e instanceof SyntaxError)invalid('持久记录损坏，请保留原件。');throw e;}}
