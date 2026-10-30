import {mkdir,readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {hash,check,safeLocal} from './store.mjs';
export function createMaterials(context,store){
  const home=join(context.dataDirectory,'materials');
  async function put(bytes,{name='material',mediaType='application/octet-stream'}={}){
    check(Buffer.isBuffer(bytes)&&bytes.length<=128*1024*1024,'单个材料最多 128 MiB。');check(typeof name==='string'&&name.length>0&&name.length<=256&&!/[\\/\x00-\x1f]/.test(name),'材料名称无效。');
    const digest=hash(bytes);safeLocal(home);await mkdir(home,{recursive:true,mode:0o700});const path=safeLocal(join(home,digest));
    try{await writeFile(path,bytes,{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;check(hash(await readFile(path))===digest,'材料摘要冲突。','COOP_MATERIAL_CORRUPT');}
    store.db.prepare('INSERT OR IGNORE INTO artifacts VALUES (?,?,?,?)').run(digest,name,bytes.length,mediaType);return {digest,name,size:bytes.length,mediaType};
  }
  async function read(digest){check(/^[a-f0-9]{64}$/.test(digest),'材料摘要无效。');const path=safeLocal(join(home,digest)),stat=await lstat(path);check(stat.isFile()&&stat.size<=128*1024*1024,'材料文件无效。');const bytes=await readFile(path);check(hash(bytes)===digest,'材料文件摘要不符。','COOP_MATERIAL_CORRUPT');return {path,bytes};}
  async function importPath(path,metadata){
    // Arbitrary user paths are a local window action, enforced by the backend.
    safeLocal(path);const stat=await lstat(path);check(stat.isFile()&&stat.size<=128*1024*1024,'材料必须是普通文件，最多 128 MiB。');return put(await readFile(await realpath(path)),metadata);
  }
  async function stagedMaterial(materialId){
    // Host material references belong to this installation. Host resolves the path.
    const value=await context.services.call('messages','material',[materialId]);return importPath(value.path,{name:value.name,mediaType:value.mediaType});
  }
  return {put,read,importPath,stagedMaterial,home};
}
