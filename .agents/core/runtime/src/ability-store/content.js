import {posix} from 'node:path';
import {digest,fault} from '../store-catalog/protocol.js';
import {parseFrontmatter} from '../metadata/frontmatter.js';
import {types,parseDependencyReference} from '../objects/schema.js';

const external=value=>/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(value);
// A release fingerprint follows the bytes the object actually consumes. Delivery
// source IDs, root selections, compression and timestamps never enter it.
export function contentFiles(packet,object){
 const files=new Map(packet.files.map(f=>[f.path,f])),owned=object.relative+'/',selected=new Set();
 const add=path=>{const file=files.get(path);if(!file)throw fault('ABILITY_PACKAGE_RESOURCE_MISSING','能力包缺少必要资源：'+path);if(selected.has(path))return;selected.add(path);if(!/\.md$/i.test(path))return;
  const parsed=parseFrontmatter(Buffer.from(file.content,'base64'),path),references=[];
  for(const ref of parsed.values.references??[]){const d=parseDependencyReference(ref);if(d.kind==='file')references.push(d.path);}
  for(const match of parsed.body.toString('utf8').matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g))references.push(match[1].replace(/^<|>$/g,''));
  for(const href of references){if(external(href))continue;let decoded;try{decoded=decodeURIComponent(href.split(/[?#]/)[0]);}catch{throw fault('ABILITY_PACKAGE_RESOURCE_INVALID','资源链接编码无效。');}const target=posix.normalize(posix.join(posix.dirname(path),decoded));if(target==='..'||target.startsWith('../'))throw fault('ABILITY_PACKAGE_RESOURCE_INVALID','资源链接越过发布范围。');add(target);}
 };
 for(const file of packet.files)if(file.path.startsWith(owned))add(file.path);
 return [...selected].sort().map(path=>files.get(path));
}
export function contentIdentity(packet,object){
 const files=contentFiles(packet,object).map(f=>[f.path.startsWith(object.relative+'/')?'object/'+f.path.slice(object.relative.length+1):'resource/'+f.path,f.sha256,f.mode&0o111?0o755:0o644]).sort((a,b)=>a[0].localeCompare(b[0]));
 const dependencies=(object.dependencies??[]).map(d=>({id:d.id,version:d.version})).sort((a,b)=>a.id.localeCompare(b.id)||a.version.localeCompare(b.version));
 return digest(JSON.stringify({id:object.id,version:object.version,entry:types[object.id.split('.')[0]].entry,files,dependencies}));
}
export function groupsOf(packet){return packet.protocol==='ksf-ability-package-v2'?packet.groups:[packet];}
export function packetObjects(packet){return groupsOf(packet).flatMap(group=>group.objects.map(object=>({...object,sourceId:group.sourceId})));}
