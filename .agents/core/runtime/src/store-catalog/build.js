import {mkdirSync,writeFileSync,renameSync,readFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {PROTOCOL,PAGE_SIZE,digest,terms,searchText} from './protocol.js';
/** Deterministic publisher shared by applications and abilities. Inputs are per-object releases. */
export function buildCatalog({directory,kind,source,objects}){
 mkdirSync(join(directory,'catalog'),{recursive:true});
 const atomic=(path,bytes)=>{const temporary=path+'.'+randomUUID()+'.tmp';writeFileSync(temporary,bytes);renameSync(temporary,path);};
 const put=value=>{const bytes=Buffer.from(JSON.stringify(value)+'\n'),sha256=digest(bytes),url='catalog/'+sha256+'.json';const path=join(directory,url);if(existsSync(path)){if(!readFileSync(path).equals(bytes))throw Error('Immutable catalog shard changed');}else atomic(path,bytes);return {url,size:bytes.length,sha256};};
 const tree=(entries,key=x=>x.id,prefix='')=>{
  if(entries.length<=PAGE_SIZE)return put({prefix,entries});
  while(entries.every(row=>key(row)[prefix.length]===key(entries[0])[prefix.length])&&prefix.length<key(entries[0]).length)prefix+=key(entries[0])[prefix.length];
  const groups=new Map();for(const row of entries){const c=key(row)[prefix.length]??'';if(!groups.has(c))groups.set(c,[]);groups.get(c).push(row);}
  return put({prefix,children:[...groups].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([c,rows])=>({prefix:prefix+c,min:key(rows[0]),max:key(rows.at(-1)),count:rows.length,types:Object.fromEntries([...new Set(rows.map(x=>x.type).filter(Boolean))].map(t=>[t,rows.filter(x=>x.type===t).length])),ref:tree(rows,key,prefix+c)}))});
 };
 const sorted=[...objects].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),ids=new Set();
 const summaries=sorted.map(object=>{
  if(ids.has(object.id)||!object.versions?.length)throw Error('Duplicate/empty object '+object.id);ids.add(object.id);
  let versions;for(let at=Math.floor((object.versions.length-1)/PAGE_SIZE)*PAGE_SIZE;at>=0;at-=PAGE_SIZE)versions=put({id:object.id,versions:object.versions.slice(at,at+PAGE_SIZE),next:versions??null});
  const active=object.versions.filter(v=>!v.withdrawn);const current=active[0]??object.versions[0];const summary={...(current.distribution?{distribution:current.distribution}:{}),...(active.length?{}:{withdrawn:true}),id:object.id,name:current.manifest?.name??current.name??object.name,description:current.manifest?.description??current.description??object.description??'',type:object.type,latestVersion:current.version??current.manifest?.version};
  return {...summary,detail:put({...summary,versions,totalVersions:object.versions.length})};
 });
 const postings=new Map();for(const row of summaries)for(const term of terms(searchText(row))){if(!postings.has(term))postings.set(term,[]);postings.get(term).push({id:row.id});}
 const dictionary=[...postings].map(([term,rows])=>({id:digest(term),term,postings:tree(rows)})).sort((a,b)=>a.id<b.id?-1:1);
 const value={protocol:PROTOCOL,kind,source,count:summaries.length,directory:tree(summaries),search:tree(dictionary)};
 const index={...value,revision:digest(JSON.stringify(value))};const bytes=Buffer.from(JSON.stringify(index)+'\n');if(bytes.length>8192)throw Error('Catalog root exceeds 8 KiB');atomic(join(directory,'index.json'),bytes);return index;
}
