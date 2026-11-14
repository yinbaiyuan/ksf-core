import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PROTOCOL,digest,rootCatalog,reference,normalize,queryTerms,searchText,cursor,nextCursor,fault} from './protocol.js';
/** Content-addressed verified cache. A failed refresh never overwrites a verified root. */
export function createCatalogClient({url,kind,sourceId,cacheDirectory,baselineDirectory,fetcher=fetch,offlineOnly=false}){
 const memory=new Map();let current,live=false,rootError;
 const http=async(address,limit)=>{
  const u=new URL(address);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw fault('STORE_URL_INVALID','目录只支持无凭据的HTTP(S)地址。');
  const r=await fetcher(u.href,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw fault('STORE_UNAVAILABLE','目录返回HTTP '+r.status);
  // Fetch decodes HTTP compression, but Content-Length still measures the
  // encoded transfer. An already-compressed package can grow under gzip.
  const encoding=r.headers.get('content-encoding')?.trim().toLowerCase();
  if((!encoding||encoding==='identity')&&Number(r.headers.get('content-length')??0)>limit)throw fault('STORE_SIZE_INVALID','目录资源超过大小限制。');
  const parts=[];let size=0;for await(const b of r.body){size+=b.length;if(size>limit)throw fault('STORE_SIZE_INVALID','目录资源超过大小限制。');parts.push(Buffer.from(b));}return Buffer.concat(parts);
 };
 const save=async(name,bytes)=>{if(!cacheDirectory)return;await mkdir(cacheDirectory,{recursive:true});const tmp=join(cacheDirectory,name+'.'+randomUUID()+'.tmp');await writeFile(tmp,bytes);await rename(tmp,join(cacheDirectory,name));};
 async function open({refresh=false}={}){
  if(current&&!refresh)return current;
  let bytes,origin='live';rootError=undefined;
  if(!offlineOnly)try{bytes=await http(url,8192);}catch(e){rootError={code:e.code,message:e.message};}
  if(!bytes&&cacheDirectory)try{bytes=await readFile(join(cacheDirectory,'root.json'));origin='cache';}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!bytes&&baselineDirectory){bytes=await readFile(join(baselineDirectory,'index.json'));origin='baseline';}
  if(!bytes)throw fault('STORE_UNAVAILABLE','源暂时无法连接，且没有已验证的本机目录。');
  if(bytes.length>8192)throw fault('STORE_CATALOG_INVALID','入口目录超过8 KiB。');
  const value=rootCatalog(JSON.parse(bytes),kind);if(sourceId&&value.source.id!==sourceId)throw fault('STORE_IDENTITY_CHANGED','能力源身份已变化。');
  if(origin==='live')await save('root.json',bytes);live=origin==='live';current={...value,freshness:{kind:origin,latestConfirmed:live,checkedAt:live?new Date().toISOString():null,error:rootError??null}};return current;
 }
 async function binary(ref){reference(ref);let bytes;
  if(!offlineOnly&&current?.freshness.latestConfirmed!==false)try{bytes=await http(new URL(ref.url,url).href,ref.size);}catch(e){if(!['STORE_UNAVAILABLE','TypeError','TimeoutError','AbortError'].includes(e.code??e.name))throw e;}
  if(!bytes&&cacheDirectory)try{bytes=await readFile(join(cacheDirectory,ref.sha256));}catch(e){if(e.code!=='ENOENT')throw e;}
  // Published resource URLs are opaque and retain their original names; newly
  // exported user files use .ksfabi.
  if(!bytes&&baselineDirectory)try{if(/^(?:catalog|packages)\/[a-f0-9./-]+\.(?:json|ksfabi|ksfability)$/.test(ref.url))bytes=await readFile(join(baselineDirectory,ref.url));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!bytes){const before=current?.revision;if(before&&current.freshness.latestConfirmed){await open({refresh:true});if(current.revision!==before)throw fault('STORE_CURSOR_EXPIRED','目录已更新，请刷新后继续浏览。');}throw fault('STORE_RESOURCE_MISSING','目录分片不可用，请刷新或恢复连接。');}
  if(bytes.length!==ref.size||digest(bytes)!==ref.sha256)throw fault('STORE_INTEGRITY','目录资源大小或SHA-256校验失败。');
  await save(ref.sha256,bytes);return bytes;
 }
 async function read(ref){reference(ref);if(memory.has(ref.sha256)){const saved=memory.get(ref.sha256);if(saved.size!==ref.size)throw fault('STORE_INTEGRITY','缓存资源大小与引用不符。');memory.delete(ref.sha256);memory.set(ref.sha256,saved);return saved.value;}const bytes=await binary(ref),value=JSON.parse(bytes);memory.set(ref.sha256,{value,size:bytes.length});while([...memory.values()].reduce((sum,v)=>sum+v.size,0)>32*1024*1024)memory.delete(memory.keys().next().value);return value;}
 async function lookup(ref,id){const node=await read(ref);if(node.entries)return node.entries.find(e=>e.id===id);const child=node.children?.find(c=>id.startsWith(c.prefix));return child?lookup(child.ref,id):undefined;}
 async function* rows(ref,{after='',type=''}={}){const node=await read(ref);if(node.entries){for(const row of node.entries)if(row.id>after&&(!type||row.type===type))yield row;return;}for(const child of node.children??[]){if(child.max<=after||type&&!child.types?.[type])continue;yield* rows(child.ref,{after,type});}}
 async function list({query='',type='',limit=40,cursor:token}={}){
  const root=await open();limit=Math.max(1,Math.min(40,Number(limit)||40));query=normalize(query);const basis=digest(JSON.stringify([root.revision,query,type])),after=cursor(token,basis),items=[];let more=false,last=after;
  let candidates;
  if(query){const refs=[];for(const term of queryTerms(query)){const found=await lookup(root.search,digest(term));if(!found||found.term!==term)return {revision:root.revision,items:[],nextCursor:null,freshness:root.freshness};refs.push(found.postings);}
   // Merge sorted lazy postings; intersection never downloads object declarations.
   const streams=refs.map(ref=>rows(ref,{after})[Symbol.asyncIterator]()),heads=await Promise.all(streams.map(s=>s.next()));
   candidates=(async function*(){while(heads.every(h=>!h.done)){const max=heads.map(h=>h.value.id).sort().at(-1);for(let i=0;i<heads.length;i++)while(!heads[i].done&&heads[i].value.id<max)heads[i]=await streams[i].next();if(heads.some(h=>h.done))return;if(heads.every(h=>h.value.id===max)){const row=await lookup(root.directory,max);if(row&&(!type||row.type===type)&&searchText(row).includes(query))yield row;for(let i=0;i<heads.length;i++)heads[i]=await streams[i].next();}}})();
  }else candidates=rows(root.directory,{after,type});
  for await(const row of candidates){if(row.withdrawn)continue;if(items.length===limit){more=true;break;}items.push(row);last=row.id;}
  return {revision:root.revision,items,nextCursor:more?nextCursor(basis,last):null,freshness:root.freshness};
 }
 async function detail(id){const root=await open(),row=await lookup(root.directory,id);return row?{...await read(row.detail),revision:root.revision,freshness:root.freshness}:null;}
 async function versions(id,{cursor:token}={}){const d=await detail(id);if(!d)return null;const basis=digest(JSON.stringify([d.revision,id,'versions'])),raw=cursor(token,basis),at=raw?Number(raw):0;if(!Number.isSafeInteger(at)||at<0||at>=Math.ceil(d.totalVersions/40))throw fault('STORE_CURSOR_INVALID','版本游标无效。');let ref=d.versions,page;for(let i=0;i<=at;i++){page=await read(ref);if(page.id!==id||!Array.isArray(page.versions)||page.versions.length>40)throw fault('STORE_CATALOG_INVALID','版本记录无效。');if(i<at){if(!page.next)throw fault('STORE_CURSOR_INVALID','版本页不存在。');ref=page.next;}}return {revision:d.revision,items:page.versions,nextCursor:page.next?nextCursor(basis,String(at+1)):null,freshness:d.freshness};}

 return {open,read,binary,list,detail,versions,lookup,rows};
}
