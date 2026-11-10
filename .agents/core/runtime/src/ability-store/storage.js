import {withDefaultAbilitySource} from './default-source.js';
import {existsSync,readFileSync,lstatSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256} from '../shared/hash.js';
import {withExclusiveLock,withTemporaryFile} from '../shared/files.js';
import {replaceFileSync} from '../platform/index.js';
import {safeDirectory} from '../objects/storage.js';
import {validSourceId} from '../sources/schema.js';
import {validId,versionPattern,fail} from '../objects/schema.js';
export const storePath='.agents/user-data/ability-store';
export const emptyState=()=>({schemaVersion:1,revision:0,sources:withDefaultAbilitySource([]),installed:{},adopted:[],operations:[],copies:[]});
export function readStore(root){
  const path=join(root,storePath,'state.json');if(!existsSync(path))return {state:emptyState(),version:'missing'};
  safeDirectory(root,storePath);if(lstatSync(path).isSymbolicLink())fail('ABILITY_STORE_STATE_INVALID','能力商店注册表不能是符号链接。');
  const bytes=readFileSync(path);let state;try{state=JSON.parse(bytes);}catch{fail('ABILITY_STORE_STATE_INVALID','能力商店注册表损坏，原件已保留。');}
  if(state.schemaVersion!==1||!Number.isSafeInteger(state.revision)||!Array.isArray(state.sources)||!Array.isArray(state.adopted)||!Array.isArray(state.operations)||!Array.isArray(state.copies)||!state.installed||typeof state.installed!=='object')fail('ABILITY_STORE_STATE_INVALID','能力商店注册表格式不受支持。');
  const ids=new Set();for(const s of state.sources){if(!validSourceId(s.id)||ids.has(s.id)||!['local','git','http'].includes(s.kind)||(s.kind==='http'?(typeof s.location!=='string'):typeof s.path!=='string'||!s.path)||typeof s.enabled!=='boolean')fail('ABILITY_STORE_STATE_INVALID','能力源注册信息无效。');ids.add(s.id);}
  for(const id of state.adopted)if(!validSourceId(id))fail('ABILITY_STORE_STATE_INVALID','迁移来源无效。');
  for(const [id,p] of Object.entries(state.installed)){
    if(!validSourceId(id)||!/^[-a-f0-9]{36}$/.test(p.generation)||!Array.isArray(p.roots)||!Array.isArray(p.objects))fail('ABILITY_STORE_STATE_INVALID','安装版本记录无效。');
    for(const o of p.objects)if(!validId(o.id)||!versionPattern.test(o.version)||typeof o.relative!=='string'||o.relative.startsWith('/')||o.relative.split('/').some(v=>!v||['.','..','.git','.upstream'].includes(v))||!Array.isArray(o.dependencies))fail('ABILITY_STORE_STATE_INVALID','安装能力记录无效。');
    if(p.roots.some(id=>!p.objects.some(o=>o.id===id)))fail('ABILITY_STORE_STATE_INVALID','显式安装项不存在。');
  }
  state.sources=withDefaultAbilitySource(state.sources);return {state,version:sha256(bytes)};
}
export const packageRoot=(root,id,generation)=>join(root,storePath,'packages',id,generation);
export function installedScopes(root,record=readStore(root)){
 return Object.entries(record.state.installed).filter(([,p])=>p.objects.length).map(([id,p])=>({id,root:packageRoot(root,id,p.generation),installed:true,objects:p.objects}));
}
export function saveStore(root,state,version){
 if(readStore(root).version!==version)fail('ABILITY_STORE_CONFLICT','商店状态已变化，请刷新后重试。');
 const folder=safeDirectory(root,storePath,{create:true});const bytes=JSON.stringify({...state,revision:state.revision+1},null,2)+'\n';
 withTemporaryFile(join(folder,'.state-'+randomUUID()+'.tmp'),bytes,{},tmp=>replaceFileSync(tmp,join(folder,'state.json')));return sha256(bytes);
}
export function withStoreLock(root,action){
 const dir=safeDirectory(root,'.agents/runtime-data/ability-store',{create:true}),lock=join(dir,'write.lock');
 // A crashed writer has never published partially prepared generations. Only
 // reclaim an unchanged lock whose recorded process no longer exists.
 if(existsSync(lock)){const stat=lstatSync(lock);try{const {pid}=JSON.parse(readFileSync(lock));if(Number.isSafeInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'&&lstatSync(lock).ino===stat.ino)unlinkSync(lock);}}}catch{/* Leave an unknown owner untouched. */}}
 return withExclusiveLock(lock,{pid:process.pid},action,{onLocked(){fail('ABILITY_STORE_LOCKED','另一个能力商店操作正在执行，请稍后重试。');}});
}
