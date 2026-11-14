import {createHash} from 'node:crypto';
export const PROTOCOL='ksf-store-catalog-v2';
export const PAGE_SIZE=40;
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
export function terms(value){const chars=[...normalize(value)],out=new Set(chars);for(let i=1;i<chars.length;i++)out.add(chars[i-1]+chars[i]);return [...out];}
export function queryTerms(value){const chars=[...normalize(value)];return chars.length<2?chars:[...new Set(chars.slice(1).map((c,i)=>chars[i]+c))];}
export const searchText=row=>normalize([row.id,row.name,row.description,row.type].join(' '));
export const fault=(code,message)=>Object.assign(new Error(message),{code,status:409});
export function reference(ref){if(!ref||typeof ref.url!=='string'||!Number.isSafeInteger(ref.size)||ref.size<1||ref.size>32*1024*1024||!/^[a-f0-9]{64}$/.test(ref.sha256))throw fault('STORE_REFERENCE_INVALID','目录资源引用无效。');return ref;}
export function rootCatalog(value,kind){if(value?.protocol!==PROTOCOL||value.kind!==kind||typeof value.revision!=='string'||!value.source?.id||typeof value.source.name!=='string'||!Number.isSafeInteger(value.count))throw fault('STORE_CATALOG_INVALID','商店目录格式无效。');reference(value.directory);reference(value.search);return value;}
export function cursor(value,basis){if(!value)return '';let parsed;try{parsed=JSON.parse(Buffer.from(value,'base64url'));}catch{throw fault('STORE_CURSOR_INVALID','目录游标无效，请刷新。');}if(parsed.basis!==basis)throw fault('STORE_CURSOR_EXPIRED','目录已更新，请刷新后继续浏览。');return parsed.after;}
export const nextCursor=(basis,after)=>Buffer.from(JSON.stringify({basis,after})).toString('base64url');
