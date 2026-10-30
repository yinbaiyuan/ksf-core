import {mkdir,writeFile,readFile,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {createExecutionGrants,checkedExecutionPath} from '../ai-tasks/execution-grants.js';
import {permissionConfig} from '../ai-tasks/executors/restricted-codex.js';
import {executionInventory} from '../ai-tasks/executors/execution-artifacts.js';
import {failure} from './protocol.js';
export async function prepareDesktopExecution(root,caller,reference,executable,project){
  const grants=createExecutionGrants(root),rule=await grants.resolveGrant(caller,reference);
  if(!project||project.name!==rule.target?.project?.name||project.scope!==rule.target?.project?.scope)throw failure('CODEX_EXECUTION_GRANT','项目与承接声明的 Desktop 项目不匹配。');
  if(rule.target?.provider!=='codex-desktop')throw failure('CODEX_EXECUTION_GRANT','声明未选择 Desktop 执行。');
  const base=join(root,'.agents/runtime-data/cooperation-desktop',reference.taskId),control=join(base,'control');await mkdir(control,{recursive:true,mode:0o700});await checkedExecutionPath(base);
  const work=await grants.prepare(rule,reference.taskId,base),configDir=join(control,'.codex');await mkdir(configDir,{recursive:true,mode:0o700});
  const config=permissionConfig({root,work,privateHome:configDir,shell:rule.scope.shell,network:rule.scope.network}).replace('[permissions.ksf-cooperation.network]',JSON.stringify(control)+' = "write"\n'+JSON.stringify(configDir)+' = "deny"\n[permissions.ksf-cooperation.network]');
  await writeFile(join(configDir,'config.toml'),config,{mode:0o600});
  const outside=await mkdtemp(join(tmpdir(),'ksf-desktop-boundary-')),allowed=join(work,'.ksf-desktop-probe'),blocked=join(outside,'private.txt');await writeFile(blocked,'blocked');
  const env={...process.env};delete env.CODEX_THREAD_ID;delete env.CODEX_TURN_ID;
  const probe=script=>spawnSync(executable,['sandbox','-P','ksf-cooperation','-C',control,'--',process.execPath,'-e',script],{cwd:control,env,encoding:'utf8',timeout:15000,maxBuffer:8192});
  const server=createServer(s=>s.end());await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{const ok=probe(`require('node:fs').writeFileSync(${JSON.stringify(allowed)},'ok')`),read=probe(`require('node:fs').readFileSync(${JSON.stringify(blocked)})`),escape=probe(`require('node:fs').writeFileSync(${JSON.stringify(join(outside,'escape'))},'bad')`),privateRead=probe(`require('node:fs').readFileSync(${JSON.stringify(join(configDir,'config.toml'))})`),net=probe(`const n=require('node:net').createConnection({host:'127.0.0.1',port:${server.address().port}});n.on('connect',()=>process.exit(0));n.on('error',()=>process.exit(77));setTimeout(()=>process.exit(78),1000)`);
    if(ok.status!==0||read.status===0||escape.status===0||privateRead.status===0||!rule.scope.network&&net.status===0)throw failure('CODEX_EXECUTION_ISOLATION_UNAVAILABLE','Desktop 原生权限探针未通过，等待 B 处理。');
  }finally{server.close();await rm(allowed,{force:true});await rm(outside,{recursive:true,force:true});}
  return {workingDirectory:control,workspaceRoots:[control,work],work,permissionProfile:'ksf-cooperation',grant:reference,before:await executionInventory(work)};
}
