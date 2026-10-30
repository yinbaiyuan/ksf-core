import {workflowBinding,inputFields} from '../../../applications/sdk/server/workflow-contract.mjs';
import {mkdir,readFile,lstat,realpath,cp,readdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname,parse,relative,isAbsolute} from 'node:path';
import {hostname,homedir} from 'node:os';
import {atomicJSON,readJSON,safeDirectory} from './store.js';
import {requireAI,sha256,canonical} from './schema.js';
const APP='com.ksf.cooperation-center';
const manual=()=>({id:'manual',offerId:'manual',name:'手动处理',description:'通用请求，由本实例手动判断和处理。',inputs:'说明目标并提供必要材料。',outputs:'由承接方根据实际情况交付。',handling:'manual',delivery:'confirm',published:true,revision:1,instructions:'',scope:null,builtin:true});
const contains=(base,path)=>{const rel=relative(base,path);return !rel||!rel.startsWith('..')&&!isAbsolute(rel);};
export async function checkedExecutionPath(path){
  requireAI(typeof path==='string'&&path===resolve(path),'AI_EXECUTION_SCOPE_INVALID','执行目录需要绝对路径。');
  let at=parse(path).root;for(const part of path.slice(at.length).split(/[\\/]/)){at=join(at,part);const st=await lstat(at);requireAI(!st.isSymbolicLink(),'AI_EXECUTION_SCOPE_INVALID','授权路径不能包含符号链接。');}
  requireAI((await lstat(path)).isDirectory(),'AI_EXECUTION_SCOPE_INVALID','执行目录必须存在。');return realpath(path);
}
export function createExecutionGrants(root){
  const home=join(root,'.agents/runtime-data/ai/execution-grants');
  async function identity(){const value=await readJSON(join(root,'.agents/runtime-data/communication/identity/device.json'),null);return sha256(canonical([await realpath(root),hostname(),value?.nodeId??null]));}
  async function read(caller){
    requireAI(caller.appId===APP,'AI_EXECUTION_FORBIDDEN','此接口仅供合作中心。',{status:403});
    let value=await readJSON(join(home,'rules.json'),{schemaVersion:2,revision:0,rules:[manual()]});
    requireAI([1,2,3].includes(value.schemaVersion)&&Array.isArray(value.rules),'AI_STORAGE_INVALID','承接声明存储损坏。');
    const instanceMatches=!value.instance||value.instance===await identity();
    if(value.schemaVersion===1){
      const original=value;
      value={schemaVersion:2,revision:original.revision+1,instance:original.instance??await identity(),rules:[manual(),...original.rules.map(r=>({...r,id:sha256(APP+':offer:legacy-'+r.id),offerId:'legacy-'+r.id,name:'原合作规则草稿',description:'由旧的指定实例规则迁移，请核对后发布。',inputs:'',outputs:'',instructions:'',published:false,revision:1,legacy:{ruleId:r.id,peerId:r.peerId,revision:r.revision}})).map(({peerId,...r})=>r)],migration:{from:1,digest:sha256(canonical(original))}};
      if(instanceMatches){
        await safeDirectory(root,home);
        const backup=join(home,'rules.v1.'+value.migration.digest+'.json');
        try{await writeFile(backup,JSON.stringify(original,null,2)+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;requireAI(sha256(canonical(await readJSON(backup,null)))===value.migration.digest,'AI_STORAGE_INVALID','旧规则备份冲突。');}
        await atomicJSON(join(home,'rules.json'),value);
      }
    }
    if(value.schemaVersion===2&&instanceMatches){
      await safeDirectory(root,home);const original=value,backup=join(home,'rules.v2.'+sha256(canonical(original))+'.json');
      try{await writeFile(backup,JSON.stringify(original,null,2)+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;requireAI(canonical(await readJSON(backup,null))===canonical(original),'AI_STORAGE_INVALID','声明备份冲突。');}
      value={...value,schemaVersion:3};await atomicJSON(join(home,'rules.json'),value);
    }
    requireAI(value.rules.some(r=>canonical(r)===canonical(manual())),'AI_STORAGE_INVALID','默认手动声明不可修改。');
    return {...value,instanceMatches};
  }
  async function configure(caller,input,{validate}={}){
    requireAI(caller.source==='surface'&&caller.humanWindow===true,'AI_HUMAN_REQUIRED','规则授权只能在本实例的合作中心窗口设置。',{status:403});
    const current=await read(caller);
    requireAI(input.peerId===undefined&&typeof input.offerId==='string'&&/^[a-zA-Z0-9-]{1,96}$/.test(input.offerId),'AI_EXECUTION_SCOPE_INVALID','请使用承接声明编号；不再支持按发送实例设置规则。');
    requireAI(input.offerId!=='manual','AI_EXECUTION_SCOPE_INVALID','默认手动声明始终保留，不能修改或下架。');
    requireAI(/^[a-f0-9-]{36}$/.test(input.operationId??''),'AI_REQUEST_INVALID','规则修改需要稳定的 operationId。');
    const operationPath=join(home,'operations',input.operationId+'.json'),digest=sha256(canonical(input)),previous=await readJSON(operationPath,null);
    if(current.lastOperation?.id===input.operationId){requireAI(current.lastOperation.digest===digest,'AI_IDEMPOTENCY_CONFLICT','规则操作编号对应不同内容。');return current;}
    if(previous){requireAI(previous.digest===digest,'AI_IDEMPOTENCY_CONFLICT','规则操作编号对应不同内容。');return previous.result;}
    requireAI(current.instanceMatches&&input.ifRevision===current.revision,'AI_RULE_CONFLICT','规则已变化或来自其他实例，请重新核对。',{status:409});
    requireAI(['manual','plan','auto','workflow'].includes(input.handling)&&['auto','confirm'].includes(input.delivery)&&typeof input.published==='boolean','AI_EXECUTION_SCOPE_INVALID','处理或发布设置无效。');
    for(const [key,max] of [['name',80],['description',4000],['inputs',2000],['outputs',2000],['instructions',16000]])requireAI(typeof input[key]==='string'&&input[key].length<=max&&(key!=='name'||input[key].trim()),'AI_EXECUTION_SCOPE_INVALID','声明名称、说明或处理要求无效。');
    const agent=['plan','auto'].includes(input.handling),s=agent?input.scope:null;
    const fields=inputFields(input.inputFields??[]),workflow=input.handling==='workflow'?workflowBinding(input.workflow):null;
    const target=agent?input.target??{provider:'profile'}:null;
    if(target)requireAI(['profile','api','codex-cli','codex-desktop'].includes(target.provider),'AI_EXECUTION_SCOPE_INVALID','请选择 API、CLI 或 Desktop。');
    if(target?.provider==='codex-desktop')requireAI(target.project&&typeof target.project.name==='string'&&target.project.scope==='current','AI_EXECUTION_SCOPE_INVALID','Desktop 需要明确当前项目。');
    if(s){requireAI(['analysis','draft','project'].includes(s.capability)&&typeof s.shell==='boolean'&&typeof s.network==='boolean'&&typeof s.writeBack==='boolean'&&typeof s.profileId==='string','AI_EXECUTION_SCOPE_INVALID','能力范围需要明确工具、网络、写回与执行配置。');
    requireAI(s.capability==='project'||!s.writeBack&&!s.projectPath,'AI_EXECUTION_SCOPE_INVALID','只有项目开发范围允许配置项目写回。');}
    requireAI(!agent||s,'AI_EXECUTION_SCOPE_INVALID','Agent 处理需要明确执行范围。');
    if(s?.capability==='project'){
      const path=await checkedExecutionPath(s.projectPath);requireAI(![parse(path).root,homedir(),resolve(root)].includes(path)&&!contains(path,resolve(root))&&!path.split(/[\\/]/).some(p=>['.agents','.codex','.ssh'].includes(p)),'AI_EXECUTION_SCOPE_INVALID','请选择具体项目目录，不能授权整个实例、主目录或系统目录。');
    }
    if(validate)await validate();
    const existing=current.rules.find(r=>r.offerId===input.offerId);
    const rule={id:sha256(APP+':offer:'+input.offerId),offerId:input.offerId,name:input.name.trim(),description:input.description,inputs:input.inputs,outputs:input.outputs,instructions:input.instructions,published:input.published,handling:input.handling,...(agent?{target:target.provider==='codex-desktop'?{provider:target.provider,project:target.project}:target}:{}),...(workflow?{workflow}:{}),...(fields.length?{inputFields:fields}:{}),scope:s?{capability:s.capability,shell:s.shell,network:s.network,writeBack:s.writeBack,profileId:s.profileId,...(s.capability==='project'?{projectPath:s.projectPath}:{})}:null,delivery:input.delivery,revision:(existing?.revision??0)+1,...(existing?.legacy?{legacy:existing.legacy}:{})};
    const next={...current,lastOperation:{id:input.operationId,digest},schemaVersion:3,instance:await identity(),revision:current.revision+1,rules:[...current.rules.filter(r=>r.offerId!==rule.offerId),rule]};delete next.instanceMatches;
    requireAI(next.rules.length<=101,'AI_EXECUTION_SCOPE_INVALID','承接声明最多 100 项。');
    const published=next.rules.filter(r=>r.published).map(({offerId,name,description,inputs,outputs,handling,delivery,revision,inputFields})=>({offerId,name,description,inputs,outputs,handling,delivery,revision,...(inputFields?{inputFields}:{})}));
    requireAI(Buffer.byteLength(JSON.stringify(published))<=128*1024,'AI_EXECUTION_SCOPE_INVALID','公开声明目录过大，请缩短说明。');
    await safeDirectory(root,home);await atomicJSON(join(home,'rules.json'),next);await safeDirectory(root,join(home,'operations'));const result={...next,instanceMatches:true};await atomicJSON(operationPath,{digest,result});return result;
  }
  async function resolveGrant(caller,reference){
    requireAI(reference&&['plan','execute'].includes(reference.phase)&&typeof reference.id==='string'&&Number.isSafeInteger(reference.revision)&&/^[a-f0-9-]{36}$/.test(reference.taskId)&&/^[a-f0-9]{64}$/.test(reference.contentDigest),'AI_EXECUTION_GRANT_INVALID','执行授权引用无效。');
    const state=await read(caller),rule=state.rules.find(r=>r.id===reference.id);requireAI(state.instanceMatches&&rule?.published&&rule.revision===reference.revision&&['plan','auto'].includes(rule.handling),'AI_EXECUTION_GRANT_REVOKED','承接声明已撤回、变化或不属于当前实例。');return reference.phase==='plan'?{...rule,scope:{...rule.scope,capability:'analysis',shell:false,network:false,writeBack:false,projectPath:undefined}}:rule;
  }
  async function prepare(rule,taskId,base){
    await safeDirectory(root,base);const work=join(base,'workspace');await safeDirectory(root,work);
    if(rule.scope.capability==='project'){
      const project=await checkedExecutionPath(rule.scope.projectPath);
      if(rule.scope.writeBack)return project;
      const marker=join(base,'copy.json'),existing=await readJSON(marker,null);
      requireAI(!existing||existing.project===project,'AI_EXECUTION_SCOPE_INVALID','工作副本不属于当前授权。');
      if(!existing){
        async function inspect(at,depth=0){requireAI(depth<40,'AI_EXECUTION_SCOPE_INVALID','项目目录层级过深。');for(const e of await readdir(at,{withFileTypes:true})){if(['.git','node_modules','.codex','.ssh'].includes(e.name))continue;requireAI(!e.isSymbolicLink(),'AI_EXECUTION_SCOPE_INVALID','项目包含符号链接，不能生成受限副本。');if(e.isDirectory())await inspect(join(at,e.name),depth+1);else requireAI(e.isFile(),'AI_EXECUTION_SCOPE_INVALID','项目含有特殊文件。');}}
        await inspect(project);await cp(project,work,{recursive:true,force:false,errorOnExist:false,filter:path=>!path.split(/[\\/]/).some(p=>['.git','node_modules','.codex','.ssh'].includes(p))});await atomicJSON(marker,{project,taskId});
      }
    }
    return work;
  }
  return {read,configure,resolveGrant,prepare};
}
