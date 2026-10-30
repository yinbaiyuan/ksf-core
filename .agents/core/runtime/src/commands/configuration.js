import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseOptions,optionSpecs,hasJsonFlag} from '../shared/options.js';
import {createConfigurationService} from '../services/configuration.js';
import {configurationDomain} from '../configuration/catalog.js';
import {ensureService} from '../services/service-manager.js';
import {controlRequest} from '../communication/client.js';

const operations=['list','read','check','write','reset','apply','export'];
const invalid=message=>{throw Object.assign(new Error(message),{code:'INVALID_ARGUMENTS',exitCode:2});};
export function configurationHelp(){return 'KSF 统一配置中心\n\nksf config list [--json]\nksf config read <domain> [--json]\nksf config check <domain> [--data <JSON> | --from <file|->] [--json]\nksf config write <domain> (--data <JSON> | --from <file|->) --if-match <etag|missing> [--dry-run] [--json]\nksf config reset <domain> [--fields <name...>] --if-match <etag|missing> [--dry-run] [--json]\nksf config apply <domain> --if-match <etag|missing> [--dry-run] [--json]\nksf config export [--include-device] [--include-collaboration] [--json]\n\n顶层字段更新；嵌套值整体替换。USER/BOT 使用 {"text":"原文"}。\n静态读取和预览不启动后台、不创建默认文件。运行设置的实际修改自动连接后台，不打开前端。\n';}
export async function runConfigurationCommand(args,root,{stdin}={}){
 const operation=args[0],response={ok:false,command:'config',operation:operation??null,data:null,errors:[]};
 try{
  if(!args.length||args.length===1&&['--help','-h'].includes(operation))return {stdout:configurationHelp(),exitCode:0};
  if(!operations.includes(operation))invalid('未知 config 操作。');
  const allowed={list:[],read:[],check:['data','from','if-match'],write:['data','from','if-match','dry-run'],reset:['fields','if-match','dry-run'],apply:['if-match','dry-run'],export:['include-device','include-collaboration']}[operation];
  const parsed={};const seen=parseOptions(args.slice(1),{result:parsed,invalid,options:optionSpecs([...allowed,'json','help'],{fields:{kind:'many',unique:true},'include-device':{kind:'flag',key:'includeDevice'},'include-collaboration':{kind:'flag',key:'includeCollaboration'}}),target(value){if(parsed.domain!==undefined)invalid('只接受一个配置领域。');parsed.domain=value;}});
  if(parsed.help){if(seen.size!==1||parsed.domain)invalid('请单独使用 --help。');return {stdout:configurationHelp(),exitCode:0};}
  if(['list','export'].includes(operation)?parsed.domain!==undefined:!parsed.domain)invalid('请提供正确的配置领域。');
  if(operation==='write'&&seen.has('data')===seen.has('from'))invalid('write 需要且仅接受 --data 或 --from。');
  if(seen.has('data')&&seen.has('from'))invalid('只接受一个输入来源。');
  if(['write','reset','apply'].includes(operation)&&parsed.ifMatch!=='missing'&&!/^[a-f0-9]{64}$/.test(parsed.ifMatch??''))invalid('请提供 read 返回的 --if-match 版本。');
  let values;
  if(seen.has('data')||seen.has('from')){
   const source=parsed.from===undefined?parsed.data:parsed.from==='-'?(stdin??readFileSync(0,'utf8')):readFileSync(resolve(root,parsed.from),'utf8');
   if(Buffer.byteLength(source)>1024*1024)invalid('输入超过 1 MiB。');
   try{values=JSON.parse(source);}catch{invalid('输入不是有效 JSON。');}
  }
  const input={...(values!==undefined?{values}:{}),...(parsed.ifMatch!==undefined?{ifMatch:parsed.ifMatch}:{}),...(parsed.fields?{fields:parsed.fields}:{}),dryRun:parsed.dryRun===true};
  const local=createConfigurationService(root);
  if(operation==='list')response.data=await local.list();
  else if(operation==='export')response.data=await local.export(parsed);
  else if(['write','reset','apply'].includes(operation)&&configurationDomain(parsed.domain).runtime&&!input.dryRun&&parsed.domain!=='service'){
   await ensureService(root,{reason:'config'});
   response.data=await controlRequest(root,'/api/local/config',{operation,input:{domain:parsed.domain,...input}});
  }else response.data=await local.perform(parsed.domain,operation,input);
  response.ok=true;
  return {stdout:hasJsonFlag(args)?JSON.stringify(response)+'\n':JSON.stringify(response.data,null,2)+'\n',exitCode:0};
 }catch(error){response.errors.push({code:error.code??'CONFIG_FAILED',message:error.code?error.message:'配置操作失败；请保留原件并核对当前值。',...(error.data?{data:error.data}:{})});return {stdout:JSON.stringify(response)+'\n',exitCode:error.exitCode??(error.code==='INVALID_ARGUMENTS'?2:1)};}
}
