export interface FileLike {name:string;size:number;type:string;lastModified?:number}
export interface FileRules {accept?:string;maxSize?:number;maxFiles?:number}
export interface FileRejection<T=FileLike>{file:T;reason:'type'|'size'|'count';message:string}
export function acceptsFile(file:FileLike,accept=''){
 const rules=accept.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean),name=file.name.toLowerCase(),mime=file.type.toLowerCase();
 return !rules.length||rules.some(rule=>rule==='*/*'||(rule.startsWith('.')?name.endsWith(rule):rule.endsWith('/*')?mime.startsWith(rule.slice(0,-1)):mime===rule));
}
export function validateFiles<T extends FileLike>(files:readonly T[],rules:FileRules={},current=0){const accepted:T[]=[],rejected:FileRejection<T>[]=[];for(const file of files){const reason=!acceptsFile(file,rules.accept)?'type':rules.maxSize!==undefined&&file.size>rules.maxSize?'size':rules.maxFiles!==undefined&&current+accepted.length>=Math.max(0,rules.maxFiles)?'count':null;if(reason)rejected.push({file,reason,message:reason==='type'?'文件类型不符合要求':reason==='size'?'文件超过大小限制':'文件数量超过限制'});else accepted.push(file);}return {accepted,rejected};}
export function formatFileSize(size:number){if(!Number.isFinite(size)||size<0)return '';if(size<1024)return size+' B';if(size<1024*1024)return (size/1024).toFixed(1)+' KB';return (size/1024/1024).toFixed(1)+' MB';}
