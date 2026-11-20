import {realpathSync} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {safeDirectory,atomicJSON,readJSONSnapshot} from '../shared/durable-json.js';
import {withExclusiveLock,readFileSnapshot,sameIdentity} from '../shared/files.js';
import {createCoordinator,digest,assert,problem} from '../services/workbench-common.js';
import {parseDocumentWindowSet} from '../../../applications/sdk/src/shared/document-session.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const invalid=message=>{throw problem('UI_DOCUMENT_INVALID',message,409);};
/** Immutable host view checkpoints; never rewrites application sessions or business data. */
export function createDocumentSessionStore(root,{now=()=>new Date().toISOString(),fault}={}){
 root=realpathSync(root);const instanceId=digest(root),home=join(root,'.agents/user-data/ui-runtime/documents'),coordinator=createCoordinator();
 const path=token=>{assert(uuid(token),'UI_DOCUMENT_REQUEST_INVALID','恢复令牌或原操作身份无效。');return join(home,token+'.json');};
 async function ordinary(){let current=root;for(const part of relative(root,home).split(/[\\/]/)){current=join(current,part);try{const stat=await lstat(current);assert(stat.isDirectory()&&!stat.isSymbolicLink(),'UI_DOCUMENT_PATH_INVALID','窗口恢复目录不能是符号链接。',409);}catch(error){if(error.code==='ENOENT')return false;throw error;}}return true;}
 function checked(record,token){
  assert(record?.schemaVersion===1,'UI_DOCUMENT_VERSION','窗口恢复记录版本不兼容，原件已保留。',409);
  assert(record.instanceId===instanceId&&record.operationId===token&&record.resumeToken===token,'UI_DOCUMENT_IDENTITY','窗口恢复记录不属于此实例或操作，原件已保留。',409);
  assert(typeof record.createdAt==='string'&&Number.isFinite(Date.parse(record.createdAt)),'UI_DOCUMENT_INVALID','窗口恢复时间无效。',409);
  const value=parseDocumentWindowSet(record.value);assert(record.fingerprint===digest(JSON.stringify(value)),'UI_DOCUMENT_INVALID','窗口恢复内容摘要不符，原件已保留。',409);return {...record,value};
 }
 async function read(resumeToken){const target=path(resumeToken),missing={exists:false,record:null,etag:null};if(!await ordinary())return missing;let record;try{record=await readJSONSnapshot(target,undefined,{invalid});}catch(error){if(error.code==='ENOENT')return missing;throw error;}return {exists:true,record:checked(record,resumeToken),etag:digest(JSON.stringify(record))};}
 async function write({operationId,value}={}){
  path(operationId);value=parseDocumentWindowSet(value);const fingerprint=digest(JSON.stringify(value));await safeDirectory(root,home,{invalid});
  return coordinator.run('write',()=>withExclusiveLock(join(home,'.lock'),{pid:process.pid,nonce:randomUUID()},async()=>{
   const prior=await read(operationId);
   if(prior.exists){assert(prior.record.fingerprint===fingerprint,'UI_DOCUMENT_OPERATION_CONFLICT','原检查点操作已用于不同内容，未覆盖。',409);return {resumeToken:operationId,etag:prior.etag,record:prior.record};}
   const record={schemaVersion:1,instanceId,operationId,resumeToken:operationId,createdAt:now(),fingerprint,value};await atomicJSON(path(operationId),record);await fault?.('after-publish');
   return {resumeToken:operationId,etag:digest(JSON.stringify(record)),record};
  },{reclaimStale:true,onLocked(){throw problem('UI_DOCUMENT_BUSY','另一处正在保存窗口恢复记录，请沿原操作核对。',409);}}));
 }
 async function exportRecord(resumeToken){
  const target=path(resumeToken);assert(await ordinary(),'UI_DOCUMENT_UNKNOWN','没有找到窗口恢复记录。',404);
  const valid=stat=>assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=1024*1024,'UI_DOCUMENT_INVALID','恢复导出必须是有界普通文件。',409);
  let bytes;try{bytes=readFileSnapshot(target,{validateEntry:valid,validateOpen(before,opened){valid(opened);assert(sameIdentity(before,opened,['dev','ino']),'UI_DOCUMENT_CHANGED','恢复记录读取时发生变化。',409);},validateRead(before,after,content){assert(sameIdentity(before,after)&&content.length===after.size,'UI_DOCUMENT_CHANGED','恢复记录读取时发生变化。',409);}}).bytes;}catch(error){if(error.code==='ENOENT')throw problem('UI_DOCUMENT_UNKNOWN','没有找到窗口恢复记录。',404);throw error;}
  return {name:'ksf-window-recovery-'+resumeToken+'.json',bytes};
 }
 return {read,write,export:exportRecord};
}
