// Prepare a local review bundle only. Never installs, commits, pushes or publishes.
import {readFile,writeFile,mkdir,copyFile,chmod,symlink,rm,lstat} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {walkFiles,fileMode} from '../src/distribution/files.js';
import {developmentPath} from '../src/distribution/paths.js';
import {buildManifest} from '../src/services/build-manifest.js';
import {decodePackage,compareVersions} from '../src/applications/protocol.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function prepareCooperationCandidate(root,output){
 root=resolve(root);output=resolve(output);
 if(!relative(root,output)||relative(output,root).split(/[\\/]/).every(p=>p!=='..'))throw Error('Candidate must be separate from the instance root.');
 const excluded=path=>developmentPath(path)||path.endsWith('/.DS_Store');
 const paths=walkFiles(root,'.agents/core',{exclude:excluded}).sort(),before=new Map();
 await mkdir(output,{recursive:false});
 for(const path of paths){const bytes=await readFile(join(root,path));before.set(path,hash(bytes));const destination=join(output,path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes);await chmod(destination,fileMode(join(root,path)));}
 const web=join(output,'.agents/core/runtime/web'),modules=join(web,'node_modules');
 // Build-only toolchain link is removed before inventory or distribution.
 await symlink(join(root,'.agents/core/runtime/web/node_modules'),modules,'junction');
 try{const built=spawnSync(process.execPath,[join(web,'scripts/build.mjs')],{encoding:'utf8',maxBuffer:4*1024*1024});if(built.status!==0)throw Error(built.stderr||built.stdout);}
 finally{await rm(modules,{recursive:true,force:true});}
 const manifest=await buildManifest(output,{sourceRoot:root});
 const receipt=JSON.parse(await readFile(join(root,'.agents/core/release.json')));
 await writeFile(join(output,'.agents/core/release.json'),JSON.stringify({...receipt,schema_version:4,version:manifest.manifest.version,development:true})+'\n');
 const registry=JSON.parse(await readFile(join(output,'.agents/core/applications/store/index.json'))),latest=new Map();
 for(const entry of registry.apps){const previous=latest.get(entry.manifest.id);if(!previous||compareVersions(entry.manifest.version,previous.manifest.version)>0)latest.set(entry.manifest.id,entry);}
 await mkdir(join(output,'application-store'),{recursive:true});
 for(const entry of latest.values()){
  const bytes=await readFile(join(output,'.agents/core/applications/store',entry.package.url));
  if(hash(bytes)!==entry.package.sha256||decodePackage(bytes).manifest.id!==entry.manifest.id)throw Error('Invalid offline package: '+entry.manifest.id);
  await copyFile(join(output,'.agents/core/applications/store',entry.package.url),join(output,'application-store',entry.package.url));
  for(const media of [entry.listing?.icon,...(entry.listing?.screenshots??[])].filter(Boolean)){const destination=join(output,'application-store',media.url);await mkdir(dirname(destination),{recursive:true});await copyFile(join(output,'.agents/core/applications/store',media.url),destination);if(hash(await readFile(destination))!==media.sha256)throw Error('Invalid listing media.');}
 }
 await writeFile(join(output,'application-store/index.json'),JSON.stringify({...registry,apps:[...latest.values()]},null,2)+'\n');
 // Detect shared-workspace edits instead of publishing a mixed snapshot.
 if(paths.join('\n')!==walkFiles(root,'.agents/core',{exclude:excluded}).sort().join('\n'))throw Error('Core source inventory changed during preparation.');
 for(const [path,digest] of before)if(hash(await readFile(join(root,path)))!==digest)throw Error('Core source changed during preparation: '+path);
 const files={};
 for(const prefix of ['.agents/core','application-store'])for(const path of walkFiles(output,prefix)){const bytes=await readFile(join(output,path)),stat=await lstat(join(output,path));if(!stat.isFile())throw Error('Candidate must contain regular files.');files[path]={sha256:hash(bytes),size:bytes.length,mode:fileMode(join(output,path))};}
 await writeFile(join(output,'inventory.json'),JSON.stringify({schemaVersion:1,files},null,2)+'\n');
 return {prepared:true,development:true,published:false,version:manifest.manifest.version,output,files:Object.keys(files).length,applications:latest.size};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(!process.argv[2])throw Error('Usage: cooperation-candidate.mjs <new-output-directory> [instance-root]');console.log(JSON.stringify(await prepareCooperationCandidate(process.argv[3]??process.cwd(),process.argv[2])));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
