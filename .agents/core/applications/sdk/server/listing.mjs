import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {sourcePath} from './source-path.mjs';
import {checksum,storeImageType,validateStoreListing,validateManifest,decodePackage,sameManifest,MAX_STORE_IMAGE} from './protocol.js';
import {atomicWrite,withStoreLock} from './publication.mjs';
const invalid=message=>Object.assign(Error(message),{code:'APP_LISTING_INVALID'});
/** Authoritative store assets live under store/ and are included in the same package. */
export async function loadStoreListing(root){
 let value;try{value=JSON.parse(await readFile(join(root,'store/listing.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return {listing:{},media:[]};throw invalid('store/listing.json: '+error.message);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('商店展示资料必须为对象。');
 if(value.screenshots!==undefined&&(!Array.isArray(value.screenshots)||value.screenshots.length>8))throw invalid('最多提供8张截图。');const media=[];
 async function image(input){if(typeof input==='string')input={path:input};if(!input||typeof input.path!=='string'||input.path.startsWith('/')||input.path.split('/').some(p=>!p||p==='..'||p==='.'))throw invalid('图片需要store目录内的相对path。');
  const url='store/'+input.path,path=sourcePath(root,url),stat=await lstat(path);if(!stat.isFile()||stat.size>MAX_STORE_IMAGE)throw invalid('图片必须是8 MiB以内的普通文件。');const bytes=await readFile(path);storeImageType(bytes);const ref={url,sha256:checksum(bytes),size:bytes.length,...(input.alt!==undefined?{alt:input.alt}:{})};media.push({url,bytes});return ref;
 }
 const listing={};for(const key of ['subtitle','description','releaseNotes'])if(value[key]!==undefined)listing[key]=value[key];if(value.icon!==undefined)listing.icon=await image(value.icon);if(value.screenshots!==undefined)listing.screenshots=await Promise.all(value.screenshots.map(image));validateStoreListing(listing);return {listing,media};
}
export async function publishStoreListing(){throw Object.assign(Error('商店资料属于应用包，请递增应用版本并重新build。'),{code:'APP_LISTING_REBUILD_REQUIRED'});}
