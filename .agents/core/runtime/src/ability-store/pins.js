import {existsSync,readdirSync,readFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {parseReference} from '../objects/schema.js';
import {resolveObject} from '../objects/references.js';
import {fault} from '../store-catalog/protocol.js';

export function assertCurrentBindings(root,before,after){
 const home=join(root,'.agents/user-data/chats');if(!existsSync(home))return;const blocked=[];
 for(const entry of readdirSync(home,{withFileTypes:true})){if(!entry.isDirectory())continue;const path=join(home,entry.name,'shared.json');if(!existsSync(path))continue;if(lstatSync(path).isSymbolicLink())throw fault('ABILITY_STORE_WORK_CONTEXT_INVALID','当前工作记录不能是符号链接。');let record;try{record=JSON.parse(readFileSync(path,'utf8'));}catch{throw fault('ABILITY_STORE_WORK_CONTEXT_INVALID','当前工作记录无法读取，原件已保留。');}const work=record.values?.['ksf.currentWork'];if(!work)continue;
  for(const binding of [work.executor,...(work.methods??[])].filter(Boolean)){let ref;try{ref=parseReference(binding.ref);resolveObject(before,ref,binding.source);}catch{continue;}try{resolveObject(after,ref,binding.source);}catch{blocked.push({chatId:entry.name,ref:binding.ref,source:binding.source});}}
 }
 if(blocked.length)throw Object.assign(fault('ABILITY_STORE_WORK_IN_USE','当前工作仍绑定旧精确版本，请完成工作或显式解除旧绑定后重试。'),{details:{bindings:blocked}});
}

export function currentPinVersions(root){
 const home=join(root,'.agents/user-data/chats'),pins=[];if(!existsSync(home))return pins;for(const entry of readdirSync(home,{withFileTypes:true})){if(!entry.isDirectory())continue;const path=join(home,entry.name,'shared.json');if(!existsSync(path))continue;let record;try{record=JSON.parse(readFileSync(path,'utf8'));}catch{throw fault('ABILITY_STORE_WORK_CONTEXT_INVALID','工作记录损坏，暂不清理历史载荷。');}const work=record.values?.['ksf.currentWork'];for(const binding of [work?.executor,...(work?.methods??[])].filter(Boolean)){const ref=parseReference(binding.ref);pins.push({...ref,source:binding.source});}}return pins;
}
