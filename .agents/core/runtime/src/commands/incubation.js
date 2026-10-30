import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseOptions,optionSpecs,hasJsonFlag} from '../shared/options.js';
import {createIncubationService} from '../services/incubation.js';
import {validVersion,incubationError} from '../incubation/schema.js';

export function incubationHelp(){return 'KSF 首次孵化\n\nksf incubate read [--json]\nksf incubate write (--from <file|-> | --data <JSON>) --if-match <etag> [--dry-run] [--json]\nksf incubate finish --if-match <etag> [--dry-run] [--json]\nksf incubate skip --if-match <etag> [--dry-run] [--json]\n\n草稿字段：userLabel、instanceName、deviceName、autostart。可选 openWorkbench、deferService；显式原文使用 userText + userEtag。\nread 和 dry-run 不写状态、不启动后台、不打开浏览器。失败后 read 对账，再使用最新 etag 继续原操作。\n';}
export async function runIncubationCommand(args,root,{stdin,service}={}){
  const response={ok:false,command:'incubate',operation:args[0]??null,data:null,errors:[]};
  const invalid=message=>{throw Object.assign(incubationError('INVALID_ARGUMENTS',message),{exitCode:2});};
  try{
    if(!args.length||args.length===1&&['--help','-h'].includes(args[0]))return {stdout:incubationHelp(),exitCode:0};
    const operation=args[0];if(!['read','write','finish','skip'].includes(operation))invalid('未知孵化操作。');
    const allowed=operation==='read'?['json','help']:['if-match','dry-run','json','help',...(operation==='write'?['from','data']:[])];
    const parsed={};const seen=parseOptions(args.slice(1),{result:parsed,options:optionSpecs(allowed,{from:{kind:'value',allowDash:true}}),invalid,target(){invalid('孵化操作不接受位置参数。');}});
    if(parsed.help){if(seen.size!==1)invalid('请单独使用 --help。');return {stdout:incubationHelp(),exitCode:0};}
    if(operation!=='read'&&!validVersion(parsed.ifMatch))invalid('请提供 read 返回的 --if-match。');
    let values;
    if(operation==='write'){
      if(seen.has('data')===seen.has('from'))invalid('write 需要且只接受 --data 或 --from。');
      const raw=parsed.from===undefined?parsed.data:parsed.from==='-'?(stdin??readFileSync(0,'utf8')):readFileSync(resolve(root,parsed.from),'utf8');
      if(Buffer.byteLength(raw)>512*1024)invalid('草稿输入超过 512 KiB。');
      try{values=JSON.parse(raw);}catch{invalid('草稿不是有效 JSON。');}
    }
    const owner=service??createIncubationService(root);response.data=await owner[operation]({ifMatch:parsed.ifMatch,values,dryRun:parsed.dryRun===true});response.ok=true;
    return {stdout:hasJsonFlag(args)?JSON.stringify(response)+'\n':JSON.stringify(response.data,null,2)+'\n',exitCode:0};
  }catch(error){response.errors=[{code:error.code??'INCUBATION_FAILED',message:error.message,...(error.data?{data:error.data}:{})}];return {stdout:JSON.stringify(response)+'\n',exitCode:error.exitCode??1};}
}
