import {realpathSync} from 'node:fs';
import { readdir, lstat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, basename, resolve, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodePackage, decodePackage, checksum, validPath } from './protocol.js';

import {atomicWrite,withStoreLock} from './publication.mjs';
import {init,parse} from 'es-module-lexer';

export async function validateBuiltPackage(bytes){
 const decoded=decodePackage(bytes);if([...decoded.files.keys()].some(path=>/\.(?:node|dll|exe|dylib)$/.test(path))&&!decoded.manifest.target)throw Error('包含平台二进制的应用包必须声明 target。');await init;
 const reference=(owner,spec)=>{if(!spec||spec.startsWith('data:')||spec.startsWith('#'))return;if(!spec.startsWith('.'))throw Error(`未打包的前端依赖: ${owner} → ${spec}`);const target=posix.normalize(posix.join(posix.dirname(owner),spec.split(/[?#]/)[0]));if(!target.startsWith('frontend/')||!decoded.files.has(target))throw Error(`资源不存在或越界: ${owner} → ${spec}`);};
 for(const [path,file] of decoded.files){if(!path.startsWith('frontend/'))continue;const source=file.data.toString('utf8');if(/\.m?js$/.test(path)){for(const item of parse(source)[0])if(item.n)reference(path,item.n);}if(path.endsWith('.css'))for(const item of source.matchAll(/url\(\s*["']?([^\s)"']+)/g))reference(path, /^[a-zA-Z]+:|^[./#]/.test(item[1])?item[1]:'./'+item[1]);}
 if(decoded.manifest.dataStores.some(store=>store.migrateFrom.length)){
  const backend=decoded.files.get(decoded.manifest.backend.entry);const exports=parse(backend.data.toString('utf8'))[1];if(!exports.some(entry=>(typeof entry==='string'?entry:entry.n)==='prepareData'))throw Object.assign(Error('有迁移声明的后端必须导出 prepareData。'),{code:'APP_DATA_PREPARE_REQUIRED'});
 }
 for(const [path,file] of decoded.files){
  if(path.startsWith('cli/')&&/\.m?js$/.test(path)){for(const item of parse(file.data.toString('utf8'))[0]){if(item.d===-2||item.n?.startsWith('node:'))continue;if(!item.n||!item.n.startsWith('.'))throw Error(`CLI 存在未打包或动态依赖: ${path}`);const target=posix.normalize(posix.join(posix.dirname(path),item.n));if(!/^(cli|backend)\//.test(target)||!decoded.files.has(target))throw Error(`CLI 依赖不存在或越界: ${path} → ${item.n}`);}}
  if(path.startsWith('docs/')&&path.endsWith('.md'))for(const match of file.data.toString('utf8').matchAll(/\]\(([^)]+)\)/g)){const ref=match[1].split('#')[0];if(!ref||/^[a-z][a-z0-9+.-]*:/i.test(ref))continue;const target=posix.normalize(posix.join(posix.dirname(path),ref));if(!/^(docs|cli)\//.test(target)||!decoded.files.has(target))throw Error(`CLI 文档引用不存在或越界: ${path} → ${ref}`);}
 }
 return decoded;
}

export async function packApplication(directory, output) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')), files = {};
  async function walk(path) {
    const stat = await lstat(join(directory, path));
    if (!validPath(path) || stat.isSymbolicLink()) throw new Error(`Unsupported app path: ${path}`);
    if (stat.isDirectory()) for (const name of (await readdir(join(directory, path))).sort()) await walk(`${path}/${name}`);
    else if (stat.isFile()) { const bytes = await readFile(join(directory, path)); files[path] = { content: bytes.toString('base64'), sha256: checksum(bytes), mode: stat.mode & 0o111 ? 0o755 : 0o644 }; }
    else throw new Error(`Unsupported app entry: ${path}`);
  }
  if(manifest.window||(manifest.cards??[]).length)await walk('frontend'); if (manifest.backend) await walk('backend');
  if(manifest.cli){await walk('cli');await walk('docs');}
  const bytes = encodePackage(manifest, files);await validateBuiltPackage(bytes);await withStoreLock(dirname(output),async()=>{let existing;try{existing=await readFile(output);}catch(error){if(error.code!=='ENOENT')throw error;}if(existing&&checksum(existing)!==checksum(bytes))throw Object.assign(Error('同版本应用包已有不同内容，请递增版本。'),{code:'APP_VERSION_REUSED'});await atomicWrite(output,bytes);});
  return { manifest, package: { url: basename(output), sha256: checksum(bytes), size: bytes.length } };
}
export async function runPackCLI(directory,output){
  if(!directory||!output){console.error('Usage: node pack.mjs <built-app-directory> <output.ksfapp>');process.exitCode=2;}
  else console.log(JSON.stringify(await packApplication(resolve(directory),resolve(output)),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href)await runPackCLI(...process.argv.slice(2));
