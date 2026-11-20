import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {buildApplication} from '../build.mjs';

export async function runLocalApplication(root,args){
  let config={},build={};
  for(const [name,target] of [['ksf-local.json',config],['ksf-build.json',build]]){
    try{Object.assign(target,JSON.parse(await readFile(join(root,name),'utf8')));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const at=args.indexOf('--workspace'),workspace=at>=0?args[at+1]:config.workspace;
  if(!args.includes('--build-only')&&!workspace)throw Error('请通过 --workspace 或 ksf-local.json 的 workspace 指定本机 KSF。');
  const entry=await buildApplication(root,{...build,local:true,quiet:true});
  if(args.includes('--build-only'))return {ok:true,entry,applied:false,diagnostics:[]};
  const directory=resolve(root,workspace);
  const call=(action,input)=>new Promise((yes,no)=>{
    const child=spawn(process.execPath,[join(directory,'.agents/core/runtime/src/cli.js'),'app','local',action,entry.manifest.id,'--from','-','--json'],{cwd:directory,stdio:['pipe','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;if(stdout.length>2*1024*1024)child.kill();});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4096);});child.on('error',no);
    child.on('close',code=>{try{const result=JSON.parse(stdout);if(code!==0||!result.ok)throw Object.assign(Error(result.errors?.[0]?.message??stderr??'本地安装失败。'),{code:result.errors?.[0]?.code});yes(result.data);}catch(error){no(error);}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
  });
  const applied=await call('install',{appDirectory:root,packagePath:entry.packagePath,digest:entry.package.sha256,listing:entry.listing,mediaDirectory:entry.mediaDirectory,trusted:true,replaceSource:args.includes('--replace-source'),...(config.project?{project:config.project}:{}),...(config.repository?{repository:config.repository}:{})});
  return {ok:true,entry,applied,diagnostics:[]};
}
