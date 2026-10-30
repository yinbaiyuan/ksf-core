// Offline preparation only. Does not commit, push, publish or contact a registry.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';
import {checksum,compareVersions,decodePackage,sameManifest} from '../../sdk/server/protocol.js';
const store=fileURLToPath(new URL('../../store/',import.meta.url)),target=resolve(process.argv[2]??'repositories/ksf-apps');
const source=JSON.parse(await readFile(join(store,'index.json'))),latest=new Map();
for(const entry of source.apps){const key=[entry.manifest.id,entry.manifest.target??'*',entry.manifest.nodeAbi??'*'].join(':');const old=latest.get(key);if(!old||compareVersions(entry.manifest.version,old.manifest.version)>0)latest.set(key,entry);}
const directory=join(target,'store');await mkdir(join(directory,'packages'),{recursive:true});let index;try{index=JSON.parse(await readFile(join(directory,'index.json')));}catch(e){if(e.code!=='ENOENT')throw e;index={protocol:'ksf-app-registry-v1',apps:[]};}
for(const entry of latest.values()){
 const bytes=await readFile(join(store,entry.package.url));if(checksum(bytes)!==entry.package.sha256||!sameManifest(decodePackage(bytes).manifest,entry.manifest))throw Error('离线包校验失败：'+entry.manifest.id);
 const previous=index.apps.find(e=>e.manifest.id===entry.manifest.id&&e.manifest.version===entry.manifest.version&&e.manifest.target===entry.manifest.target&&e.manifest.nodeAbi===entry.manifest.nodeAbi);
 if(previous&&previous.package.sha256!==entry.package.sha256)throw Error('公用源已有同版本不同摘要，不能替换：'+entry.manifest.id);
 const name=entry.package.url,url='packages/'+name;
 try{const existing=await readFile(join(directory,url));if(checksum(existing)!==entry.package.sha256)throw Error('已有公用源包不可变：'+url);}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(join(store,name),join(directory,url));}
 for(const image of [entry.listing?.icon,...(entry.listing?.screenshots??[])].filter(Boolean)){await mkdir(join(directory,'media'),{recursive:true});const bytes=await readFile(join(store,image.url));if(checksum(bytes)!==image.sha256)throw Error('图片摘要不符');await writeFile(join(directory,image.url),bytes,{flag:'w'});}
 if(!previous)index.apps.push({...entry,package:{...entry.package,url}});
}
index.apps.sort((a,b)=>a.manifest.id.localeCompare(b.manifest.id)||compareVersions(b.manifest.version,a.manifest.version));await writeFile(join(directory,'index.json'),JSON.stringify(index,null,2)+'\n');
for(const name of ['protocol.js','common.js'])await copyFile(fileURLToPath(new URL('../../sdk/server/'+name,import.meta.url)),join(target,'scripts/sdk',name));
console.log(JSON.stringify({prepared:true,releases:index.apps.length,source:'ksf-apps',published:false}));
