import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {sourcePath} from './source-path.mjs';
import {checksum,storeImageType,validateStoreListing,validateManifest,decodePackage,sameManifest,MAX_STORE_IMAGE} from './protocol.js';
import {atomicWrite,withStoreLock} from './publication.mjs';
const invalid=message=>Object.assign(Error(message),{code:'APP_LISTING_INVALID'});
/** Source listing is editorial metadata; never part of the executable package. */
export async function loadStoreListing(root){
 let value;try{value=JSON.parse(await readFile(join(root,'store-listing.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return {listing:undefined,media:[]};throw invalid('store-listing.json: '+error.message);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('商店展示资料必须为对象。');
 if(value.screenshots!==undefined&&(!Array.isArray(value.screenshots)||value.screenshots.length>8))throw invalid('最多提供8张截图。');
 const media=[];
 async function image(input){
  if(typeof input==='string')input={path:input};
  if(!input||typeof input.path!=='string')throw invalid('图片需要本地path。');
  const path=sourcePath(root,input.path),stat=await lstat(path);if(!stat.isFile()||stat.size>MAX_STORE_IMAGE)throw invalid('图片必须是8 MiB以内的普通文件。');
  const bytes=await readFile(path),type=storeImageType(bytes),sha256=checksum(bytes),url=`media/${sha256}.${{'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[type]}`;
  const ref={url,sha256,size:bytes.length,...(input.alt!==undefined?{alt:input.alt}:{})};media.push({url,bytes});return ref;
 }
 const listing={};for(const key of ['subtitle','description','releaseNotes'])if(value[key]!==undefined)listing[key]=value[key];
 if(value.icon!==undefined)listing.icon=await image(value.icon);
 if(value.screenshots!==undefined)listing.screenshots=await Promise.all(value.screenshots.map(image));
 validateStoreListing(listing);return {listing,media};
}
/** Publish editorial changes against existing immutable local packages, including v1. */
export async function publishStoreListing(root,store){
 const manifest=validateManifest(JSON.parse(await readFile(join(root,'manifest.json'),'utf8'))),{listing,media}=await loadStoreListing(root);
 if(!listing)throw invalid('请先提供store-listing.json。');
 return withStoreLock(store,async()=>{
  const index=JSON.parse(await readFile(join(store,'index.json'),'utf8')),entries=index.apps.filter(e=>e.manifest.id===manifest.id&&e.manifest.version===manifest.version);
  if(!entries.length)throw Object.assign(Error('该版本尚未构建，请先发布安装包。'),{code:'APP_RELEASE_MISSING'});
  for(const entry of entries){if(!/^[a-zA-Z0-9_.-]+\.ksfapp$/.test(entry.package.url))throw invalid('仅支持本地构建源中的安装包。');const bytes=await readFile(join(store,entry.package.url));if(bytes.length!==entry.package.size||checksum(bytes)!==entry.package.sha256||!sameManifest(decodePackage(bytes).manifest,entry.manifest))throw invalid('现有安装包与索引不一致。');}
  for(const image of media)await atomicWrite(join(store,image.url),image.bytes);
  for(const entry of entries)entry.listing=listing;
  await atomicWrite(join(store,'index.json'),JSON.stringify(index,null,2)+'\n');return entries;
 });
}
