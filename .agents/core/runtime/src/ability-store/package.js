import {gzipSync,gunzipSync} from 'node:zlib';
import {digest,fault} from '../store-catalog/protocol.js';
import {validId,versionPattern,types} from '../objects/schema.js';
import {validSourceId} from '../sources/schema.js';
import {contentIdentity} from './content.js';
import {parseFrontmatter} from '../metadata/frontmatter.js';
export const ABILITY_PACKAGE_PROTOCOL='ksf-ability-package-v1';
export const ABILITY_BUNDLE_PROTOCOL='ksf-ability-package-v2';
export const MAX_ABILITY_PACKAGE=20*1024*1024;
const safe=path=>typeof path==='string'&&path.length<2048&&!/[\\\x00-\x1f:]/.test(path)&&!path.startsWith('/')&&path.split('/').every(p=>p&&!['.','..','.git','.upstream'].includes(p));
export function validateAbilityPackage(value,{sourceId,id,version,group=false}={}){
 if(value?.protocol===ABILITY_BUNDLE_PROTOCOL)return validateBundle(value,{sourceId,id,version});
 if(value?.protocol!==ABILITY_PACKAGE_PROTOCOL)throw fault('ABILITY_PACKAGE_UNSUPPORTED','此能力包协议尚不受支持，请升级 Core。');
 if(value?.protocol!==ABILITY_PACKAGE_PROTOCOL||!validSourceId(value.sourceId)||(sourceId&&value.sourceId!==sourceId)||!Array.isArray(value.objects)||!value.objects.length||value.objects.length>1000||!Array.isArray(value.files)||value.files.length>5000)throw fault('ABILITY_PACKAGE_INVALID','能力包声明无效。');
 const seen=new Set(),files=new Map();let total=0;for(const f of value.files){if(!safe(f.path)||seen.has(f.path)||typeof f.content!=='string'||!Number.isSafeInteger(f.size)||f.size<0||!Number.isSafeInteger(f.mode)||(f.mode&~0o777))throw fault('ABILITY_PACKAGE_INVALID','能力包资源路径无效。');seen.add(f.path);const bytes=Buffer.from(f.content,'base64');total+=bytes.length;if(total>24*1024*1024||bytes.length!==f.size||digest(bytes)!==f.sha256)throw fault('ABILITY_PACKAGE_INTEGRITY','能力包资源摘要无效。');files.set(f.path,{...f,bytes});}
 if(!Array.isArray(value.roots)||!value.roots.length||new Set(value.roots).size!==value.roots.length||value.roots.some(id=>!value.objects.some(o=>o.id===id)))throw fault('ABILITY_PACKAGE_INVALID','能力包显式安装项无效。');
 const ids=new Set(),paths=new Set();for(const o of value.objects){if(!validId(o?.id)||ids.has(o.id)||!versionPattern.test(o.version)||!safe(o.relative)||paths.has(o.relative)||!Array.isArray(o.dependencies))throw fault('ABILITY_PACKAGE_INVALID','包内能力声明无效或重复。');ids.add(o.id);paths.add(o.relative);
  const d=o.distribution;if(d!==undefined&&(!d||typeof d.entry!=='boolean'||!Array.isArray(d.owners)||d.owners.length>1000||d.owners.some(id=>!validId(id))||d.members!==undefined&&(!Array.isArray(d.members)||d.members.length>1000||d.members.some(m=>!validId(m.id)||!versionPattern.test(m.version)||typeof m.name!=='string'))))throw fault('ABILITY_PACKAGE_INVALID','能力发布单元声明无效。');
  const definition=files.get(o.relative+'/'+types[o.id.split('.')[0]].entry);if(!definition||definition.sha256!==o.definitionDigest)throw fault('ABILITY_PACKAGE_INTEGRITY','能力定义摘要无效。');const metadata=parseFrontmatter(definition.bytes,definition.path).values;if(metadata.id!==o.id||metadata.version!==o.version)throw fault('ABILITY_PACKAGE_INVALID','包内能力身份或版本与正文不一致。');
 }
 for(const f of files.values())if(Object.values(types).some(t=>f.path.endsWith('/'+t.entry))&&!value.objects.some(o=>f.path===o.relative+'/'+types[o.id.split('.')[0]].entry))throw fault('ABILITY_PACKAGE_INVALID','包中含有未声明的能力定义。');
 if(!group&&value.roots.some(id=>value.objects.find(o=>o.id===id).distribution?.entry===false))throw fault('ABILITY_PACKAGE_INVALID','发布包不能以绑定成员作为独立入口。');
 if(id&&!value.objects.some(o=>o.id===id&&(!version||o.version===version)))throw fault('ABILITY_PACKAGE_INVALID','包内没有所需能力版本。');return value;
}
export const encodeAbilityPackage=value=>gzipSync(Buffer.from(JSON.stringify(value)+'\n'),{level:9});
export function decodeAbilityPackage(bytes){try{if(bytes.length>MAX_ABILITY_PACKAGE)throw Error();return JSON.parse(gunzipSync(bytes,{maxOutputLength:32*1024*1024}));}catch{throw fault('ABILITY_PACKAGE_INVALID','能力包损坏或内容超过限制。');}}

function validateBundle(value,{sourceId,id,version}={}){
 if(!validSourceId(value.sourceId)||sourceId&&value.sourceId!==sourceId||!Array.isArray(value.groups)||!value.groups.length||value.groups.length>100||!Array.isArray(value.roots)||!value.roots.length)throw fault('ABILITY_PACKAGE_INVALID','多来源能力包声明无效。');
 const sources=new Set(),objects=new Map();let size=0,count=0;
 for(const group of value.groups){if(sources.has(group.sourceId))throw fault('ABILITY_PACKAGE_INVALID','能力包来源分组重复。');sources.add(group.sourceId);validateAbilityPackage({...group,protocol:ABILITY_PACKAGE_PROTOCOL},{group:true});for(const file of group.files){size+=file.size;count++;}for(const object of group.objects){if(objects.has(object.id))throw fault('ABILITY_PACKAGE_INVALID','能力包含同ID的多个定义。');objects.set(object.id,{object,group});if(object.contentDigest!==contentIdentity(group,object))throw fault('ABILITY_PACKAGE_INTEGRITY','能力规范内容摘要不一致：'+object.id);}}
 if(size>24*1024*1024||count>5000||objects.size>1000||new Set(value.roots).size!==value.roots.length||value.roots.some(root=>!objects.has(root)))throw fault('ABILITY_PACKAGE_INVALID','能力包闭包或大小无效。');
 if(value.roots.some(id=>objects.get(id).object.distribution?.entry===false))throw fault('ABILITY_PACKAGE_INVALID','发布包不能以绑定成员作为独立入口。');
 for(const {object} of objects.values())for(const dep of object.dependencies){if(!validId(dep.id)||!versionPattern.test(dep.version)||dep.source!=='system'&&!sources.has(dep.source))throw fault('ABILITY_PACKAGE_INVALID','能力包依赖来源绑定无效。');if(dep.source!=='system'){const target=objects.get(dep.id);if(!target||target.group.sourceId!==dep.source||target.object.version!==dep.version)throw fault('ABILITY_PACKAGE_INVALID','能力包未完整提供非Core依赖闭包：'+dep.id);}}
 if(id&&!objects.has(id)||id&&version&&objects.get(id).object.version!==version)throw fault('ABILITY_PACKAGE_INVALID','包内没有所需能力版本。');return value;
}
