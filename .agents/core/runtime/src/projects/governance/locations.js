import {readdirSync,lstatSync} from 'node:fs';
import {join,dirname,posix} from 'node:path';
import {createHash} from 'node:crypto';
import {readSnapshot} from '../../metadata/files.js';
import {parseFrontmatter} from '../../metadata/frontmatter.js';
import {MetadataError} from '../../metadata/errors.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const inside=(path,base)=>path===base||path.startsWith(base+'/');
const replace=(path,from,to)=>inside(path,from)?to+path.slice(from.length):path;
const exists=p=>{try{const s=lstatSync(p);return s.isFile()||s.isDirectory();}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))return false;throw e;}};
const fail=(code,message,details)=>{throw new MetadataError(code,message,details);};
function normalized(path){
  if(typeof path!=='string'||!path||path.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(path)||path.split('/').some(p=>['..','.git','node_modules'].includes(p)))fail('PROJECT_REFERENCE_PATH','原件位置须为KSF内规范路径。');
  return posix.normalize(path);
}
function safe(root,path){let p=root;for(const part of normalized(path).split('/')){p=join(p,part);try{if(lstatSync(p).isSymbolicLink())fail('PROJECT_REFERENCE_PATH','引用不能穿过符号链接。');}catch(e){if(e.code==='ENOENT')break;throw e;}}return join(root,path);}
export function projectLocations(root){
  const result=[];
  for(const scope of ['项目','档案/项目']){
    let entries;try{entries=readdirSync(join(root,scope),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
    for(const entry of entries){if(!entry.isDirectory())continue;const path=scope+'/'+entry.name+'/project.md';
      try{const metadata=parseFrontmatter(readSnapshot(safe(root,path)).bytes,path).values;result.push({path,folder:dirname(path),scope:scope==='项目'?'current':'archived',metadata});}catch(e){if(e.code==='ENOENT')continue;/* malformed unrelated roots are diagnosed by governance read/check */}
    }
  }
  return result;
}
// Resolve old task folders and project moves together; never rewrite source prose.
function locationEdges(roots){
 const edges=[];for(const owner of roots){
  const history=Array.isArray(owner.metadata.archive_history)?owner.metadata.archive_history:[];
  for(const e of history)if(typeof e.from==='string'&&typeof e.to==='string'){edges.push({from:e.from,to:e.to},{from:e.from,to:owner.folder});}
  for(const e of owner.metadata.task_numbering_history??[])for(const move of e.moves??[]){
   if(typeof move.from!=='string'||typeof move.to!=='string')continue;edges.push(move);
   for(const e of history)if(inside(move.to,e.from))edges.push({from:move.from,to:replace(move.to,e.from,owner.folder)});
  }
 }return edges;
}
function locations(path,edges,reverse=false){
 const seen=new Set([path]),queue=[path];while(queue.length){const current=queue.shift();for(const e of edges){const from=reverse?e.to:e.from,to=reverse?e.from:e.to;if(!inside(current,from))continue;const next=replace(current,from,to);if(!seen.has(next)){if(seen.size>=256)fail('PROJECT_REFERENCE_LIMIT','位置历史过长或循环扩展，请核对迁移记录。');seen.add(next);queue.push(next);}}}return [...seen];
}
export function locateProjectResource(root,input){
  const {id,digest,source}=input,path=source?input.path:normalized(input.path),roots=projectLocations(root),candidates=new Set(),edges=locationEdges(roots);
  if(typeof path!=='string'||!path||path.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(path))fail('PROJECT_REFERENCE_PATH','引用位置无效。');
  const sources=source?locations(normalized(source),edges,true):[];
  const originals=source?sources.map(s=>posix.normalize(posix.join(dirname(s),path))):[path];
  for(const original of originals){if(original.startsWith('../'))continue;for(const located of locations(original,edges))if(exists(safe(root,located)))candidates.add(located);}
  const matches=[...candidates].filter(path=>!id||roots.some(p=>p.metadata.id===id&&inside(path,p.folder)));
  if(matches.length>1)fail('PROJECT_REFERENCE_AMBIGUOUS','旧入口存在多个候选，不能猜选。',{candidates:matches});
  if(!matches.length)fail('PROJECT_REFERENCE_MISSING','原件入口缺失，请检查迁移记录。',{target:path});
  const actual=matches[0],owner=roots.find(p=>inside(actual,p.folder));
  if(input.metadataOnly&&!digest)return {path:actual,originalPath:path,relocated:actual!==path,scope:owner?.scope??null,projectId:owner?.metadata.id??null,historical:false,digest:null};
  if(!lstatSync(safe(root,actual)).isFile())fail('PROJECT_REFERENCE_TYPE','此入口是目录，请查看其中的具体原件。');
  if(input.maxBytes&&lstatSync(safe(root,actual)).size>input.maxBytes)fail('PROJECT_REFERENCE_SIZE','原件过大，请从实际位置打开。');
  const bytes=readSnapshot(safe(root,actual)).bytes;
  let versionBytes=bytes,historical=false;
  if(digest&&hash(bytes)!==digest){const old=historicalProjectBytes(root,actual,digest,bytes,roots);if(!old)fail('PROJECT_REFERENCE_STALE','证据摘要不匹配，须复核原版本。',{target:actual});versionBytes=old;historical=true;}
  return {path:actual,originalPath:path,relocated:actual!==path,scope:owner?.scope??null,projectId:owner?.metadata.id??null,historical,digest:hash(versionBytes),bytes:versionBytes};
}
export function historicalProjectBytes(root,path,expected,current,roots=projectLocations(root)){
  const records=[],seen=new Set();
  for(const p of roots)for(const e of [...(Array.isArray(p.metadata.archive_history)?p.metadata.archive_history:[]),...(Array.isArray(p.metadata.task_numbering_history)?p.metadata.task_numbering_history:[])]){const id=e?.operation_id;if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id)||seen.has(id))continue;seen.add(id);
    try{const r=JSON.parse(readSnapshot(join(root,'.agents/runtime-data/projects/governance/operations',id+'.json')).bytes);if(['governance-transition','governance-numbering'].includes(r.kind)&&r.phase==='completed'&&Array.isArray(r.files))records.push(r);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  records.sort((a,b)=>b.at.localeCompare(a.at));let cursor=path,bytes=current;
  for(const r of records){const f=r.files.find(f=>f.path===cursor&&f.afterHash===hash(bytes));if(!f)continue;const before=Buffer.from(f.before,'base64');if(hash(before)!==f.beforeHash)fail('PROJECT_REFERENCE_HISTORY','原版本快照摘要损坏。');bytes=before;cursor=f.originalPath??f.path;if(hash(bytes)===expected)return bytes;}
  return null;
}
