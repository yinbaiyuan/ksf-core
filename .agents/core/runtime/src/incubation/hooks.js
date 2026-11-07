import {resolve,dirname} from 'node:path';
import {realpathSync} from 'node:fs';
import {platform} from '../platform/index.js';
import {readConfigFile} from '../configuration/storage.js';

// Local configuration can prove installation, never the host's trust decision
// or delivery to the model. Those are checked in the native conversation.
function configuredCommand(command,root,kind) {
  if(command===platform.hookCommand(resolve(root),kind))return true;
  // macOS exposes /var through /private/var. Accept only the same generated
  // launcher command and the same real directory, never a substring match.
  if(platform.name!=='darwin'||typeof command!=='string')return false;
  const match=/^'([\s\S]*)' (task|context) hook$/.exec(command);
  if(!match||match[2]!==kind)return false;
  const launcher=match[1].replaceAll("'\\''", "'");
  if(!launcher.endsWith('/.agents/ksf'))return false;
  const candidate=dirname(dirname(launcher));
  if(command!==platform.hookCommand(candidate,kind))return false;
  try{return realpathSync(candidate)===realpathSync(root);}catch{return false;}
}
export function incubationHooks(root,values={}) {
  const task=platform.hookCommand(resolve(root)),context=platform.hookCommand(resolve(root),'context');
  const expected=[
    ...['UserPromptSubmit','SessionStart'].map(event=>({event,command:context,purpose:'工作上下文',kind:'context'})),
    ...['UserPromptSubmit','PreCompact','Stop','Interrupt'].map(event=>({event,command:task,purpose:'任务接续',kind:'task'})),
  ];
  let configuration;
  try {
    const raw=readConfigFile(root,'.codex/hooks.json'),hooks=raw.document?.hooks;
    if(hooks!==undefined&&(!hooks||typeof hooks!=='object'||Array.isArray(hooks)))throw new Error('Hook 配置格式无法识别，请保留原件。');
    const required=expected.map(item=>{
      const groups=hooks?.[item.event];
      if(groups!==undefined&&!Array.isArray(groups))throw new Error('Hook 事件配置格式无法识别，请保留原件。');
      return {...item,configured:(groups??[]).some(group=>Array.isArray(group?.hooks)&&group.hooks.some(handler=>handler?.type==='command'&&configuredCommand(handler.command,root,item.kind)))};
    });
    const configuredCount=required.filter(item=>item.configured).length;
    configuration={state:configuredCount===required.length?'installed':configuredCount?'partial':'not_installed',path:'.codex/hooks.json',required,configuredCount};
  } catch(error) {
    configuration={state:'unavailable',path:'.codex/hooks.json',error:{code:error.code??'INCUBATION_HOOKS_UNAVAILABLE',message:error.message}};
  }
  const applicable=['pending','completed'].includes(values.status),deferred=values.draft?.deferHooks===true;
  return {
    applicable,state:!applicable?'not_required':deferred?'deferred':configuration.state==='installed'?'review_pending':configuration.state,
    configuration,
    review:{state:'unknown',cli:'/hooks',desktop:['输入框中的 Review hooks','Settings → Hooks'],documentation:'https://learn.chatgpt.com/docs/hooks'},
    verification:{state:'unverified',expectedContext:'KSF_WORK_CONTEXT_V1',steps:[
      '在宿主中确认本实例所需 Hook 已启用，当前精确定义已获信任；配置文件存在不能代替该检查。',
      '审查后发送一条真实新消息，核对宿主自动提供的 KSF_WORK_CONTEXT_V1；手工执行 context hook 不作为自动投递证据。',
    ]},
    nextAction:deferred?'已按用户选择暂缓；可从快速上手继续审查，或用 incubate hooks --resume 恢复提醒。':'请提醒用户审查并信任所需 Hook，然后用真实新输入核对自动投递；用户明确暂缓时用 incubate hooks --defer 保存。',
  };
}
