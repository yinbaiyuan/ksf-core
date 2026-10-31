import {readdir,lstat,readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {sha256,requireAI} from '../schema.js';
export async function executionInventory(work){
  const files={};let count=0;
  async function scan(at,depth=0){requireAI(depth<40,'AI_EXECUTION_OUTPUT_INVALID','成果目录层级超限。');for(const entry of await readdir(at,{withFileTypes:true})){
    if(['.git','node_modules','.codex','.ssh'].includes(entry.name))continue;
    const path=join(at,entry.name),name=relative(work,path).split('\\').join('/'),st=await lstat(path);
    requireAI(!st.isSymbolicLink()&&(st.isDirectory()||st.isFile()),'AI_EXECUTION_OUTPUT_INVALID','成果不能包含符号链接或特殊文件。');
    if(st.isDirectory())await scan(path,depth+1);else{requireAI(++count<=10000&&st.size<=32*1024*1024,'AI_EXECUTION_OUTPUT_INVALID','项目文件数量或大小超过成果范围。');files[name]={sha256:sha256(await readFile(path)),size:st.size};}
  }}
  await scan(work);return files;
}
export async function collectExecutionArtifacts(work,before,destination){
  const after=await executionInventory(work),changed=Object.keys(after).filter(name=>before[name]?.sha256!==after[name].sha256),deleted=Object.keys(before).filter(name=>!after[name]);
  requireAI(changed.reduce((n,name)=>n+after[name].size,0)<=32*1024*1024,'AI_EXECUTION_OUTPUT_INVALID','变更成果超过 32 MiB。');
  await mkdir(destination,{recursive:true,mode:0o700});const files=[];
  for(const name of changed){const digest=after[name].sha256,path=join(destination,digest);await copyFile(join(work,name),path);requireAI(sha256(await readFile(path))===digest,'AI_EXECUTION_OUTPUT_INVALID','成果在收集时发生变化。');files.push({name,path,sha256:digest,size:after[name].size,mediaType:'application/octet-stream'});}
  if(changed.length||deleted.length){const bytes=Buffer.from(JSON.stringify({protocol:'ksf-project-changes-v1',changed:changed.map(name=>({name,...after[name]})),deleted},null,2));const digest=sha256(bytes),path=join(destination,digest);await writeFile(path,bytes,{mode:0o600});files.push({name:'项目变更清单.json',path,sha256:digest,size:bytes.length,mediaType:'application/json'});}
  return files;
}
