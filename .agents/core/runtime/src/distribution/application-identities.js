import {readFile,readdir,lstat,mkdir,cp,open} from 'node:fs/promises';
import {join,dirname,relative,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {assert} from '../services/workbench-common.js';
import {atomicJSON,replaceFile,syncDirectory} from '../shared/durable-json.js';
import {LEGACY_APPLICATION_IDS,migrateDesktopApplicationIds} from '../applications/identities.js';
export {LEGACY_APPLICATION_IDS};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=async path=>{try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
async function safe(root,path){let at=resolve(root);const rel=relative(at,resolve(path));assert(rel&&!rel.startsWith('..')&&!rel.includes(':'),'APP_ID_MIGRATION_PATH','身份迁移路径越界。');for(const part of rel.split(/[\\/]/)){at=join(at,part);const st=await exists(at);assert(!st?.isSymbolicLink(),'APP_ID_MIGRATION_PATH','身份迁移不跟随符号链接。');}return exists(path);}
async function fileHash(path){const fd=await open(path,'r'),h=createHash('sha256');try{for await(const bytes of fd.createReadStream({autoClose:false}))h.update(bytes);}finally{await fd.close();}return h.digest('hex');}
async function inventory(root,path){
 const stat=await safe(root,path);if(!stat)return null;const files=[];
 async function walk(at,depth=0){assert(depth<=32,'APP_ID_MIGRATION_PATH','数据目录层级超限。');const st=await safe(root,at);assert(st.isDirectory()||st.isFile(),'APP_ID_MIGRATION_PATH','数据必须是普通文件或目录。');const name=relative(path,at).split('\\').join('/');if(st.isDirectory()){files.push([name,'directory',st.mode&0o777]);for(const entry of (await readdir(at)).sort())await walk(join(at,entry),depth+1);}else files.push([name,await fileHash(at),st.size,st.mode&0o777]);}
 await walk(path);return {digest:sha(JSON.stringify(files)),files:files.length};
}
/** Only host-owned identity fields are rewritten. Message manifests and application business data remain byte-identical. */
export async function inspectApplicationIdentityMigration(root,mapping){
 for(const [old,id] of Object.entries(mapping))assert(Object.hasOwn(LEGACY_APPLICATION_IDS,old)&&LEGACY_APPLICATION_IDS[old]===id,'APP_ID_MIGRATION_MAP','只允许已登记的一次性身份映射。');
 assert(new Set(Object.values(mapping)).size===Object.keys(mapping).length,'APP_ID_MIGRATION_COLLISION','多个旧身份映射到同一应用，保留全部数据并人工核对。',409);
 const moves=[],edits=[];
 for(const [old,id] of Object.entries(mapping))for(const [base,suffix] of [
  ['.agents/user-data/applications/data',''],['.agents/runtime-data/applications/data',''],
  ['.agents/user-data/applications/migrations',''],['.agents/runtime-data/applications/migrations',''],
  ['.agents/user-data/applications/background','.json'],['.agents/runtime-data/applications/logs','.log'],
 ]){const from=base+'/'+old+suffix,to=base+'/'+id+suffix,source=await inventory(root,join(root,from));assert(!await safe(root,join(root,to)),'APP_ID_MIGRATION_COLLISION','新 ID 目录已存在，保留两边数据并核对：'+to,409);if(source)moves.push({from,to,...source});}
 const rename=id=>Object.hasOwn(mapping,id)?mapping[id]:id;
 async function edit(path,change){if(!await safe(root,join(root,path)))return;const bytes=await readFile(join(root,path));let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{assert(false,'APP_ID_MIGRATION_DATA','宿主记录损坏，保留原件：'+path);}
  const before=JSON.stringify(value);change(value);if(JSON.stringify(value)!==before){const next=Buffer.from(JSON.stringify(value)+'\n');edits.push({path,before:sha(bytes),after:sha(next),content:next.toString('base64')});}}
 await edit('.agents/user-data/desktop.json',v=>{if(v.values?.preferences){v.values.preferences=migrateDesktopApplicationIds(v.values.preferences);v.revision++;}});
 await edit('.agents/runtime-data/applications/policy.json',v=>{for(const key of ['manual','stopped']){assert(Array.isArray(v[key]),'APP_ID_MIGRATION_DATA','应用运行策略无效。');v[key]=v[key].map(rename);}});
 await edit('.agents/user-data/communication/config.json',v=>{
  const grants={};for(const [key,grant] of Object.entries(v.grants??{})){const split=key.indexOf('|'),next=rename(key.slice(0,split))+key.slice(split);assert(!Object.hasOwn(grants,next),'APP_ID_MIGRATION_COLLISION','通信授权目标冲突。');grants[next]=grant;}v.grants=grants;
  for(const row of Object.values(v.pairings??{})){const old=row.appId;row.appId=rename(old);if(old!==row.appId&&row.status==='accepted'&&v.peers?.[row.remote?.nodeId]){const peer=v.peers[row.remote.nodeId];peer.legacyApplicationEndpoints={...peer.legacyApplicationEndpoints,[row.appId]:peer.legacyApplicationEndpoints?.[old]??old};}}
  // Peers, certificates, tokens, endpoint identities and grant values are unchanged.
  if(Number.isSafeInteger(v.revision))v.revision++;
 });
 async function records(base,change){const folder=join(root,base);if(!await safe(root,folder))return;for(const name of (await readdir(folder)).sort())if(name.endsWith('.json'))await edit(base+'/'+name,change);}
 await records('.agents/user-data/ai/tasks',v=>{v.appId=rename(v.appId);if(v.caller)v.caller.appId=rename(v.caller.appId);});
 await records('.agents/user-data/ai/materials',v=>{if(v.appId)v.appId=rename(v.appId);});
 await records('.agents/user-data/communication/operations',v=>{if(v.owner?.kind==='app')v.owner.id=rename(v.owner.id);});
 await records('.agents/user-data/communication/materials',v=>{if(typeof v.owner==='string'&&v.owner.startsWith('app:'))v.owner='app:'+rename(v.owner.slice(4));});
 return {schemaVersion:1,mapping,moves,edits};
}
async function durableCopy(root,source,target){
 if(await exists(target)){
  if((await inventory(root,source)).digest===(await inventory(root,target)).digest)return;
  // A crash during copying may leave a partial backup. Keep it for diagnosis,
  // then recopy the still-unmodified source before allowing any commit.
  await replaceFile(target,target+'.incomplete-'+randomUUID());await syncDirectory(dirname(target));
 }
 await mkdir(dirname(target),{recursive:true});await cp(source,target,{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true});
 // Windows FlushFileBuffers requires a writable handle, including for an
 // already-copied backup. Never ignore a failed flush or commit its migration.
 async function sync(path){const st=await lstat(path);if(st.isDirectory()){for(const name of await readdir(path))await sync(join(path,name));await syncDirectory(path);}else{const fd=await open(path,process.platform==='win32'?'r+':'r');try{await fd.sync();}finally{await fd.close();}}}
 await sync(target);await syncDirectory(dirname(target));assert((await inventory(root,source)).digest===(await inventory(root,target)).digest,'APP_ID_MIGRATION_BACKUP','原件副本核验失败。');
}
/** Called only after host drain. A durable journal makes moves and rewrites idempotent after interruption. */
export async function prepareApplicationIdentityMigration(root,folder,plan,{fault}={}){
 const path=join(folder,'identity.json'),journal={...plan,edits:plan.edits.map(({content,...edit},index)=>({...edit,index}))};
 if(await exists(path)){const saved=JSON.parse(await readFile(path));assert(JSON.stringify(saved)===JSON.stringify(journal),'APP_DATA_CONFLICT','已准备迁移与当前数据不同，保留副本并重新准备。',409);return saved;}
 for(const move of plan.moves){assert((await inventory(root,join(root,move.from)))?.digest===move.digest,'APP_DATA_CONFLICT','数据在备份前变化。',409);await durableCopy(root,join(root,move.from),join(folder,'identity-originals',move.from));await fault?.('identity-backup:'+move.from);}
 for(let i=0;i<plan.edits.length;i++){const edit=plan.edits[i],bytes=await readFile(join(root,edit.path));assert(sha(bytes)===edit.before,'APP_DATA_CONFLICT','宿主记录在备份前变化。',409);await durableCopy(root,join(root,edit.path),join(folder,'identity-originals',edit.path));const target=join(folder,'identity-edits',i+'.json');await mkdir(dirname(target),{recursive:true});if(await exists(target)){assert(sha(await readFile(target))===edit.after,'APP_DATA_CONFLICT','已准备宿主记录变化。',409);}else await atomicJSON(target,JSON.parse(Buffer.from(edit.content,'base64')));await fault?.('identity-prepared-edit:'+edit.path);}
 await atomicJSON(path,journal);await fault?.('identity-journal-prepared');return journal;
}
export async function applyApplicationIdentityMigration(root,folder,{fault}={}){
 const journal=JSON.parse(await readFile(join(folder,'identity.json')));
 for(const move of journal.moves){const from=join(root,move.from),to=join(root,move.to),before=await inventory(root,from),after=await inventory(root,to);
  assert((await inventory(root,join(folder,'identity-originals',move.from)))?.digest===move.digest,'APP_ID_MIGRATION_BACKUP','迁移副本缺失或变化。');
  if(before){assert(before.digest===move.digest&&!after,'APP_DATA_CONFLICT','目录在迁移期间变化或目标冲突。',409);await mkdir(dirname(to),{recursive:true});await replaceFile(from,to);await syncDirectory(dirname(to));}else assert(after?.digest===move.digest,'APP_DATA_CONFLICT','已迁移目录变化或缺失。',409);
  await fault?.('identity-move:'+move.from);
 }
 for(const edit of journal.edits){const path=join(root,edit.path),current=sha(await readFile(path)),bytes=await readFile(join(folder,'identity-edits',edit.index+'.json'));assert(sha(bytes)===edit.after,'APP_ID_MIGRATION_DATA','迁移候选记录变化。');assert(sha(await readFile(join(folder,'identity-originals',edit.path)))===edit.before,'APP_ID_MIGRATION_BACKUP','宿主记录副本变化。');assert([edit.before,edit.after].includes(current),'APP_DATA_CONFLICT','宿主记录在迁移期间变化。',409);if(current===edit.before)await atomicJSON(path,JSON.parse(bytes));assert(sha(await readFile(path))===edit.after,'APP_ID_MIGRATION_DATA','宿主记录读回不符。');await fault?.('identity-edit:'+edit.path);}
 return journal;
}
