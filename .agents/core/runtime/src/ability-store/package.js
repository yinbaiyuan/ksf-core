import {gzipSync,gunzipSync} from 'node:zlib';
import {digest,fault} from '../store-catalog/protocol.js';
import {validId,versionPattern,types} from '../objects/schema.js';
export const ABILITY_PACKAGE_PROTOCOL='ksf-ability-package-v1';
const safe=path=>typeof path==='string'&&path.length<2048&&!/[\\\x00-\x1f:]/.test(path)&&!path.startsWith('/')&&path.split('/').every(p=>p&&!['.','..','.git','.upstream'].includes(p));
export function validateAbilityPackage(value,{sourceId,id,version}={}){
 const o=value?.object;if(value?.protocol!==ABILITY_PACKAGE_PROTOCOL||value.sourceId!==sourceId||!validId(o?.id)||o.id!==id||!versionPattern.test(o.version)||o.version!==version||!safe(o.relative)||!Array.isArray(o.dependencies)||!Array.isArray(value.files)||value.files.length>5000)throw fault('ABILITY_PACKAGE_INVALID','能力包声明无效。');
 const seen=new Set();let total=0;for(const f of value.files){if(!safe(f.path)||seen.has(f.path)||typeof f.content!=='string'||!Number.isSafeInteger(f.size)||f.size<0||!Number.isSafeInteger(f.mode)||(f.mode&~0o777))throw fault('ABILITY_PACKAGE_INVALID','能力包资源路径无效。');seen.add(f.path);const bytes=Buffer.from(f.content,'base64');total+=bytes.length;if(total>24*1024*1024||bytes.length!==f.size||digest(bytes)!==f.sha256)throw fault('ABILITY_PACKAGE_INTEGRITY','能力包资源摘要无效。');}
 const definition=value.files.find(f=>f.path===o.relative+'/'+types[o.id.split('.')[0]].entry);if(!definition||definition.sha256!==o.definitionDigest)throw fault('ABILITY_PACKAGE_INTEGRITY','能力定义摘要无效。');return value;
}

export const encodeAbilityPackage=value=>gzipSync(Buffer.from(JSON.stringify(value)+'\n'),{level:9});
export function decodeAbilityPackage(bytes){try{return JSON.parse(gunzipSync(bytes,{maxOutputLength:32*1024*1024}));}catch{throw fault('ABILITY_PACKAGE_INVALID','能力包损坏或展开内容超过限制。');}}
