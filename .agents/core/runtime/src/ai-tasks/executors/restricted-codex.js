import {mkdir,copyFile,writeFile,chmod,readFile,mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {spawnSync} from 'node:child_process';
import {join,dirname,resolve} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {createExecutionGrants,checkedExecutionPath} from '../execution-grants.js';
import {supportedCodexVersion} from './codex-compatibility.js';
import {executionInventory} from './execution-artifacts.js';
import {requireAI} from '../schema.js';
const q=JSON.stringify;
export function permissionConfig({root,work,privateHome,shell,network}){
  return `approval_policy = "never"\nweb_search = "disabled"\ndefault_permissions = "ksf-cooperation"\n[permissions.ksf-cooperation.filesystem]\n":minimal" = "read"\n${process.platform==='darwin'?'"/System/Library" = "read"\n"/usr" = "read"\n':''}${q(resolve(root))} = "deny"\n${q(join(homedir(),'.codex'))} = "deny"\n${q(join(homedir(),'.agents'))} = "deny"\n${q(dirname(process.execPath))} = "read"\n${q(work)} = "write"\n${q(privateHome)} = "deny"\n[permissions.ksf-cooperation.network]\nenabled = ${network}\n[shell_environment_policy]\ninherit = "none"\n[features]\nshell_tool = ${shell}\ncode_mode_host = ${shell}\napps = false\nplugins = false\nhooks = false\nmulti_agent = false\nmulti_agent_v2 = false\nmemories = false\nshell_snapshot = false\nbrowser_use = false\ncomputer_use = false\n`;
}
export async function prepareRestrictedCodex({root,task,store,connection,env,executablePath}){
  const cli=spawnSync(executablePath,['--version'],{env,encoding:'utf8',timeout:10000,maxBuffer:8192});requireAI(cli.status===0&&supportedCodexVersion(cli.stdout??''),'AI_CLI_VERSION_UNSUPPORTED','当前 Codex CLI 版本不支持已验证的受限执行。');
  requireAI(['darwin','win32','linux'].includes(process.platform),'AI_EXECUTION_ISOLATION_UNAVAILABLE','当前平台没有受限执行适配器。');
  const rule=await createExecutionGrants(root).resolveGrant(task.caller,task.request.executionGrant);
  const base=join(store.runtime,'executions',task.aiTaskId);await mkdir(base,{recursive:true,mode:0o700});
  const work=await createExecutionGrants(root).prepare(rule,task.aiTaskId,base),privateHome=join(base,'codex-home');await mkdir(privateHome,{recursive:true,mode:0o700});
  await checkedExecutionPath(base);const authHome=connection.codexHome??env.CODEX_HOME??join(homedir(),'.codex');
  await copyFile(join(authHome,'auth.json'),join(privateHome,'auth.json'));await chmod(join(privateHome,'auth.json'),0o600);
  await writeFile(join(privateHome,'config.toml'),permissionConfig({root,work,privateHome,shell:rule.scope.shell,network:rule.scope.network}),{mode:0o600});
  const selected={...env,CODEX_HOME:privateHome};
  // Probe the exact native policy before handing it to the model. Fail closed.
  const probe=async()=>{
    const outside=await mkdtemp(join(tmpdir(),'ksf-scope-probe-')),allowed=join(work,'.ksf-scope-probe'),blocked=join(outside,'private.txt');await writeFile(blocked,'blocked');
    const run=script=>spawnSync(executablePath,['sandbox','-P','ksf-cooperation','-C',work,'--',process.execPath,'-e',script],{cwd:work,env:selected,encoding:'utf8',timeout:15000,maxBuffer:8192});
    const server=createServer(socket=>socket.end());await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    try{
      const write=run(`require('node:fs').writeFileSync(${q(allowed)},'scope-ok')`);
      const read=run(`require('node:fs').readFileSync(${q(blocked)})`);
      const escape=run(`require('node:fs').writeFileSync(${q(join(outside,'escape'))},'blocked')`);
      const privateRead=run(`require('node:fs').readFileSync(${q(join(privateHome,'auth.json'))})`);
      const network=run(`const n=require('node:net').createConnection({host:'127.0.0.1',port:${server.address().port}});n.on('connect',()=>process.exit(0));n.on('error',()=>process.exit(77));setTimeout(()=>process.exit(78),1200);`);
      requireAI((rule.scope.network||network.status!==0)&&write.status===0&&read.status!==0&&escape.status!==0&&privateRead.status!==0,'AI_EXECUTION_ISOLATION_UNAVAILABLE','原生权限探针未通过，任务转交 B 处理。',{data:{write:write.status,read:read.status,escape:escape.status,privateRead:privateRead.status,network:network.status,diagnostic:write.stderr.slice(0,2000)}});
    }finally{server.close();await rm(allowed,{force:true});await rm(outside,{recursive:true,force:true});}
  };
  await probe();return {work,privateHome,finalPath:join(base,'final.txt'),before:await executionInventory(work),shell:rule.scope.shell,network:rule.scope.network,env:selected,grant:rule};
}
