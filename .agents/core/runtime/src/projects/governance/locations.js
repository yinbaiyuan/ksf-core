import {readdirSync,lstatSync} from 'node:fs';
import {join,dirname,posix} from 'node:path';
import {createHash} from 'node:crypto';
import {readSnapshot} from '../../metadata/files.js';
import {parseFrontmatter} from '../../metadata/frontmatter.js';
import {MetadataError} from '../../metadata/errors.js';
import {memoRead} from './read-context.js';

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
  return memoRead(root,'locations',()=>readProjectLocations(root));
}
function readProjectLocations(root){
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
export function projectMergeRecords(root,roots=projectLocations(root),extra=[]){
 return memoRead(extra.length?extra:roots,'merges:'+root,()=>readMergeRecords(root,roots,extra));
}
function journal(root,id){return memoRead(root,'journal:'+id,()=>JSON.parse(readSnapshot(join(root,'.agents/runtime-data/projects/governance/operations',id+'.json')).bytes));}
function readMergeRecords(root,roots,extra){
 const records=[...extra],seen=new Set(extra.map(r=>r.operationId));
 for(const owner of roots)for(const entry of owner.metadata.project_merge_history??[]){
  const id=entry.operation_id;if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id)||seen.has(id))continue;seen.add(id);
  try{const r=journal(root,id);
   if(r.kind==='governance-merge-child'&&r.phase==='completed'&&r.operationId===id&&r.targetProject?.id===owner.metadata.id&&r.sourceProject?.id===entry.source_id&&Array.isArray(r.moves)&&Array.isArray(r.files))records.push(r);
  }catch(e){if(e.code!=='ENOENT'&&e.code!=='FILE_NOT_FOUND')throw e;}
 }return records;
}
function locationEdges(roots,merges=[]){
 const edges=[];for(const owner of roots){
  const history=Array.isArray(owner.metadata.archive_history)?owner.metadata.archive_history:[];
  for(const e of history)if(typeof e.from==='string'&&typeof e.to==='string'){edges.push({from:e.from,to:e.to},{from:e.from,to:owner.folder});}
  for(const e of owner.metadata.task_numbering_history??[])for(const move of e.moves??[]){
   if(typeof move.from!=='string'||typeof move.to!=='string')continue;edges.push(move);
   for(const e of history)if(inside(move.to,e.from))edges.push({from:move.from,to:replace(move.to,e.from,owner.folder)});
  }
 }
 for(const r of merges){edges.push(...r.moves,{from:r.from,to:r.to,exact:true});}
 return edges;
}
function locations(path,edges,reverse=false){
 const seen=new Set([path]),queue=[path];while(queue.length){const current=queue.shift();for(const e of edges){const from=reverse?e.to:e.from,to=reverse?e.from:e.to;if(e.exact?current!==from:!inside(current,from))continue;const next=replace(current,from,to);if(!seen.has(next)){if(seen.size>=256)fail('PROJECT_REFERENCE_LIMIT','位置历史过长或循环扩展，请核对迁移记录。');seen.add(next);queue.push(next);}}}return [...seen];
}
// A moved, unchanged prose body still uses its original relative-link base.
// Considering its new base as well could silently select an unrelated M2.
function authoredSource(root,source,merges,edges){
 const current=readSnapshot(safe(root,source)).bytes;
 for(const r of [...merges].sort((a,b)=>b.at.localeCompare(a.at))){
  const file=r.files.find(f=>f.originalPath&&locations(f.path,edges).includes(source));
  if(file){const after=Buffer.from(file.after,'base64');if(hash(current)===file.afterHash||parseFrontmatter(current,source).body.equals(parseFrontmatter(after,file.path).body))return file.originalPath;}
  const material=r.materials?.find(e=>locations(e.to,edges).includes(source)&&e.sha256===hash(current));if(material)return material.from;
 }return source;
}
export function locateProjectResource(root,input,{mergeRecords=[]}={}){
  const {id,digest,source}=input,path=source?input.path:normalized(input.path),roots=projectLocations(root),candidates=new Set(),merges=projectMergeRecords(root,roots,mergeRecords),edges=locationEdges(roots,merges);
  if(typeof path!=='string'||!path||path.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(path))fail('PROJECT_REFERENCE_PATH','引用位置无效。');
  let base=source?normalized(source):null;
  if(base&&exists(safe(root,base))&&lstatSync(safe(root,base)).isFile())base=authoredSource(root,base,merges,edges);
  const sources=source?locations(base,edges,true):[];
  const originals=source?sources.map(s=>posix.normalize(posix.join(dirname(s),path))):[path];
  for(const original of originals){if(original.startsWith('../'))continue;for(const located of locations(original,edges))if(exists(safe(root,located)))candidates.add(located);}
  const matches=[...candidates].filter(path=>!id||roots.some(p=>(p.metadata.id===id||merges.some(r=>r.sourceProject.id===id&&r.targetProject.id===p.metadata.id))&&inside(path,p.folder)));
  if(matches.length>1)fail('PROJECT_REFERENCE_AMBIGUOUS','旧入口存在多个候选，不能猜选。',{candidates:matches});
  if(!matches.length)fail('PROJECT_REFERENCE_MISSING','原件入口缺失，请检查迁移记录。',{target:path});
  const actual=matches[0],owner=roots.find(p=>inside(actual,p.folder));
  if(input.metadataOnly&&!digest)return {path:actual,originalPath:path,relocated:actual!==path,scope:owner?.scope??null,projectId:owner?.metadata.id??null,historical:false,digest:null};
  if(!lstatSync(safe(root,actual)).isFile())fail('PROJECT_REFERENCE_TYPE','此入口是目录，请查看其中的具体原件。');
  if(input.maxBytes&&lstatSync(safe(root,actual)).size>input.maxBytes)fail('PROJECT_REFERENCE_SIZE','原件过大，请从实际位置打开。');
  if(input.digestOnly){
    const value=readSnapshot(safe(root,actual),{digestOnly:true});
    if(!digest||value.digest===digest)return {path:actual,originalPath:path,relocated:actual!==path,scope:owner?.scope??null,projectId:owner?.metadata.id??null,historical:false,digest:value.digest};
    if(value.stat.size>2*1024*1024)fail('PROJECT_REFERENCE_STALE','证据摘要不匹配，须复核原版本。',{target:actual});
  }
  const bytes=readSnapshot(safe(root,actual)).bytes;
  let versionBytes=bytes,historical=false;
  if(digest&&hash(bytes)!==digest){const old=historicalProjectBytes(root,actual,digest,bytes,roots,{mergeRecords});if(!old)fail('PROJECT_REFERENCE_STALE','证据摘要不匹配，须复核原版本。',{target:actual});versionBytes=old;historical=true;}
  return {path:actual,originalPath:path,relocated:actual!==path,scope:owner?.scope??null,projectId:owner?.metadata.id??null,historical,digest:hash(versionBytes),...(input.digestOnly?{}:{bytes:versionBytes})};
}
export function historicalProjectBytes(root,path,expected,current,roots=projectLocations(root),{mergeRecords=[]}={}){
  const records=memoRead(mergeRecords.length?mergeRecords:roots,'history:'+root,()=>{
  const records=[],seen=new Set();
  for(const p of roots)for(const e of [...(Array.isArray(p.metadata.archive_history)?p.metadata.archive_history:[]),...(Array.isArray(p.metadata.task_numbering_history)?p.metadata.task_numbering_history:[])]){const id=e?.operation_id;if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id)||seen.has(id))continue;seen.add(id);
    try{const r=journal(root,id);if(['governance-transition','governance-numbering'].includes(r.kind)&&r.phase==='completed'&&Array.isArray(r.files))records.push(r);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  records.push(...projectMergeRecords(root,roots,mergeRecords));
  return records.sort((a,b)=>b.at.localeCompare(a.at));
  });
  for(const r of records){
   if(r.kind!=='governance-merge-child')continue;
   if(path===r.targetProject.path){const entry=r.entries.find(e=>e.path==='project.md');if(entry?.sha256===expected){const bytes=readSnapshot(safe(root,r.snapshotPath+'/project.md')).bytes;if(hash(bytes)===expected)return bytes;}}
  }
  let cursor=path,bytes=current;
  for(const r of records){const f=r.files.find(f=>f.path===cursor&&f.afterHash===hash(bytes));if(!f)continue;const before=Buffer.from(f.before,'base64');if(hash(before)!==f.beforeHash)fail('PROJECT_REFERENCE_HISTORY','原版本快照摘要损坏。');bytes=before;cursor=f.originalPath??f.path;if(hash(bytes)===expected)return bytes;}
  return null;
}
