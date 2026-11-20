import {realpathSync} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {safeDirectory,atomicJSON,readJSONSnapshot} from '../shared/durable-json.js';
import {readFileSnapshot,sameIdentity} from '../shared/files.js';
import {assert,digest,problem} from '../services/workbench-common.js';

export const FRONTEND_QUALIFICATION_CHECKS=Object.freeze([
  'integrity','application-boundary','sdk-compatibility','state-preservation',
  'snapshot-rollback','recovery','csp-isolation','workbench-interaction',
]);
const LEGACY_QUALIFICATION_CHECKS=Object.freeze([
  'integrity','shared-runtime','legacy-boundary','state-preservation',
  'snapshot-rollback','recovery','csp-isolation','theme-motion',
]);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value);
const invalid=message=>{throw problem('UI_QUALIFICATION_INVALID',message,409);};
function keys(value,allowed){assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key)),'UI_QUALIFICATION_INVALID','验收记录含未知结构，原件已保留。',409);}
function parse(input){
  keys(input,['schemaVersion','profile','releaseId','buildDigest','sourceDigest','platforms','reviewedAt','reviewedBy','checks','evidence','limitations']);
  assert(input.schemaVersion===1&&['ksf-frontend-runtime-v1','ksf-ui-runtime-v1'].includes(input.profile)&&hash(input.releaseId)&&hash(input.buildDigest)&&hash(input.sourceDigest),'UI_QUALIFICATION_INVALID','验收记录版本或快照身份无效。',409);
  assert(Array.isArray(input.platforms)&&input.platforms.length>0&&input.platforms.length<=3&&new Set(input.platforms).size===input.platforms.length&&input.platforms.every(value=>['darwin','win32','linux'].includes(value)),'UI_QUALIFICATION_INVALID','验收环境范围无效。',409);
  assert(text(input.reviewedBy)&&text(input.reviewedAt)&&Number.isFinite(Date.parse(input.reviewedAt)),'UI_QUALIFICATION_INVALID','验收记录缺少明确复核者或时间。',409);
  assert(Array.isArray(input.evidence)&&input.evidence.length>0&&input.evidence.length<=64,'UI_QUALIFICATION_INVALID','验收记录缺少有界证据。',409);
  const ids=new Set(),evidence=input.evidence.map(entry=>{
    keys(entry,['id','path','sha256']);
    assert(text(entry.id)&&!ids.has(entry.id)&&hash(entry.sha256)&&typeof entry.path==='string'&&entry.path.length<=1024&&/^\.agents\/runtime-data\//.test(entry.path)&&entry.path.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!part.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(part)),'UI_QUALIFICATION_INVALID','验收证据身份或路径无效。',409);ids.add(entry.id);
    return {id:entry.id,path:entry.path,sha256:entry.sha256};
  });
  const required=input.profile==='ksf-ui-runtime-v1'?LEGACY_QUALIFICATION_CHECKS:FRONTEND_QUALIFICATION_CHECKS;
  assert(Array.isArray(input.checks)&&input.checks.length===required.length,'UI_QUALIFICATION_REQUIRED','完整运行基础验收尚有缺项。',409);
  const seen=new Set(),checks=input.checks.map(entry=>{
    keys(entry,['id','result','evidence']);
    assert(required.includes(entry.id)&&!seen.has(entry.id)&&entry.result==='passed'&&Array.isArray(entry.evidence)&&entry.evidence.length>0&&entry.evidence.length<=64&&new Set(entry.evidence).size===entry.evidence.length&&entry.evidence.every(id=>ids.has(id)),'UI_QUALIFICATION_REQUIRED','验收检查未通过或没有对应证据。',409);seen.add(entry.id);
    return {id:entry.id,result:'passed',evidence:[...entry.evidence]};
  });
  assert(Array.isArray(input.limitations)&&input.limitations.length<=32&&input.limitations.every(text),'UI_QUALIFICATION_INVALID','验收限制说明无效。',409);
  const order=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
  return {schemaVersion:1,profile:input.profile,releaseId:input.releaseId,buildDigest:input.buildDigest,sourceDigest:input.sourceDigest,platforms:[...input.platforms].sort(),reviewedAt:input.reviewedAt,reviewedBy:input.reviewedBy,checks:checks.sort(order),evidence:evidence.sort(order),limitations:[...input.limitations]};
}

/** Host release tooling records an explicit engineering review; document boot cannot create qualifications. */
export function createFrontendQualifications(root,{platform=process.platform}={}){
  root=realpathSync(root);const home=join(root,'.agents/user-data/ui-runtime/qualifications');
  async function ordinary(relative){
    let path=root;for(const part of relative.split('/')){path=join(path,part);const stat=await lstat(path);assert(!stat.isSymbolicLink(),'UI_QUALIFICATION_PATH_INVALID','验收记录及证据路径不能是符号链接。',409);}
    return path;
  }
  function readBytes(path){
    const valid=stat=>assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=8*1024*1024,'UI_QUALIFICATION_INVALID','验收证据必须是有界普通文件。',409);
    return readFileSnapshot(path,{validateEntry:valid,validateOpen(before,opened){valid(opened);assert(sameIdentity(before,opened,['dev','ino']),'UI_QUALIFICATION_CHANGED','验收证据读取时发生变化。',409);},validateRead(before,after,bytes){assert(sameIdentity(before,after)&&bytes.length===after.size,'UI_QUALIFICATION_CHANGED','验收证据读取时发生变化。',409);}}).bytes;
  }
  async function read(id,releaseId,facts={}){
    assert(hash(id),'UI_QUALIFICATION_REQUIRED','需要独立验收记录身份，单次启动成功不能提升为LKG。',409);
    let path;try{path=await ordinary('.agents/user-data/ui-runtime/qualifications/'+id+'.json');}catch(error){if(error.code==='ENOENT')throw problem('UI_QUALIFICATION_REQUIRED','没有找到独立验收记录，原快照资格未变。',409);throw error;}
    const input=await readJSONSnapshot(path,undefined,{invalid}),value=parse(input);
    assert(digest(JSON.stringify(value))===id&&value.releaseId===releaseId,'UI_QUALIFICATION_IDENTITY','验收记录不属于此快照，原件已保留。',409);
    assert(value.platforms.includes(platform),'UI_QUALIFICATION_PLATFORM','此验收记录尚未核对此宿主平台。',409);
    assert((!facts.buildDigest||facts.buildDigest===value.buildDigest)&&(!facts.sourceDigest||facts.sourceDigest===value.sourceDigest),'UI_QUALIFICATION_IDENTITY','验收记录与完整快照字节或源码不符。',409);
    return {id,...value};
  }
  async function record(input){
    const value=parse(input);
    for(const evidence of value.evidence){const path=await ordinary(evidence.path);assert(digest(readBytes(path))===evidence.sha256,'UI_QUALIFICATION_EVIDENCE_CHANGED','验收证据摘要不符，未登记资格。',409);}
    const id=digest(JSON.stringify(value));await safeDirectory(root,home,{invalid});
    let exists=false;try{await lstat(join(home,id+'.json'));exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!exists)await atomicJSON(join(home,id+'.json'),value);
    return read(id,value.releaseId,{buildDigest:value.buildDigest,sourceDigest:value.sourceDigest});
  }
  return {read,record};
}
