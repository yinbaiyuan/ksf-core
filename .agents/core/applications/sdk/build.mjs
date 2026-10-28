import {sourcePath} from './server/source-path.mjs';
import {scopeApplicationCSS} from './server/styles.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import {existsSync} from 'node:fs';
import { readFile, writeFile, mkdir, rm, readdir, cp, lstat } from 'node:fs/promises';
import {packApplication} from './server/pack.mjs';
import {atomicWrite,withStoreLock} from './server/publication.mjs';
import {validateManifest} from './server/protocol.js';
import {loadStoreListing} from './server/listing.mjs';
const sdkRoot=dirname(fileURLToPath(import.meta.url));
function toolchain(root){
  for(const directory of [root,sdkRoot,resolve(sdkRoot,'../../runtime/web')]){
    const require=createRequire(join(directory,'package.json'));
    try{return {directory,require,vite:require.resolve('vite'),react:require.resolve('@vitejs/plugin-react'),rolldown:require.resolve('rolldown')};}catch{}
  }
  throw new Error('请安装应用或 SDK 声明的构建依赖，再执行 build。');
}
export async function buildApplication(root,options={}){return withStoreLock(resolve(root),()=>buildApplicationUnlocked(root,options),{lockName:'.ksf-build.lock'});}
async function buildApplicationUnlocked(root,{storeDirectory,entries:sourceEntries={},quiet=false}={}){
  root=resolve(root);const tools=toolchain(root),{build}=await import(pathToFileURL(tools.vite).href),react=(await import(pathToFileURL(tools.react).href)).default,{rolldown}=await import(pathToFileURL(tools.rolldown).href);const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),out=join(root,'.build');
  await rm(out,{recursive:true,force:true});await mkdir(join(out,'frontend'),{recursive:true});
  const sdkPackage=JSON.parse(await readFile(join(sdkRoot,'package.json'),'utf8')),appPackage=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  validateManifest(manifest);
  const storeListing=await loadStoreListing(root);
  const names=new Set([...Object.keys(sdkPackage.peerDependencies??{}),...Object.keys(appPackage.dependencies??{})]);
  const alias=[{find:'@ksf/sdk',replacement:join(sdkRoot,'src')}];
  for(const name of names){if(name==='@ksf/sdk')continue;const location=[root,sdkRoot,resolve(sdkRoot,'../../runtime/web')].flatMap(directory=>createRequire(join(directory,'package.json')).resolve.paths(name)??[]).map(path=>join(path,name)).find(path=>existsSync(join(path,'package.json')));if(location)alias.push({find:name,replacement:location});}
  const entries={};if(manifest.window){entries.index=sourcePath(root,sourceEntries.window??'frontend.tsx');manifest.window.entry='frontend/index.js';}for(const card of manifest.cards??[]){entries['cards/'+card.id]=sourcePath(root,sourceEntries.cards?.[card.id]??card.id+'.tsx');card.entry='frontend/cards/'+card.id+'.js';}
  await build({configFile:false,root:root,define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[react()],resolve:{alias},logLevel:quiet?'silent':'warn',build:{outDir:join(out,'frontend'),emptyOutDir:true,minify:true,target:'es2022',cssCodeSplit:false,lib:{entry:entries,formats:['es']},rolldownOptions:{output:{entryFileNames:'[name].js',chunkFileNames:'chunks/[name]-[hash].js',assetFileNames:'assets/[name]-[hash][extname]'}}}});
  async function collect(relative){const files=[];for(const item of await readdir(join(out,relative),{withFileTypes:true})){const path=relative+'/'+item.name;if(item.isDirectory())files.push(...await collect(path));else if(item.name.endsWith('.css'))files.push(path);}return files;}const styles=await collect('frontend');for(const path of styles)await writeFile(join(out,path),scopeApplicationCSS(await readFile(join(out,path),'utf8'),manifest));
  if(manifest.window)manifest.window.styles=styles;for(const card of manifest.cards??[])card.styles=styles;
  if(manifest.backend){const backendSource=sourcePath(root,sourceEntries.backend??'backend.mjs');await mkdir(join(out,'backend'),{recursive:true});const bundle=await rolldown({input:backendSource,platform:'node',external:/^node:/});await bundle.write({format:'esm',file:join(out,manifest.backend.entry),codeSplitting:false,banner:"import { createRequire as __ksfRequire } from 'node:module'; const require = __ksfRequire(import.meta.url);"});await bundle.close();}
  if(manifest.cli){
    const cliSource=sourcePath(root,sourceEntries.cli??manifest.cli.entry);await mkdir(join(out,dirname(manifest.cli.entry)),{recursive:true});
    const bundle=await rolldown({input:cliSource,platform:'node',external:/^node:/});await bundle.write({format:'esm',file:join(out,manifest.cli.entry),codeSplitting:false,banner:"import {createRequire as __ksfRequire} from 'node:module';const require=__ksfRequire(import.meta.url);"});await bundle.close();
    async function resources(path){const source=join(root,path),stat=await lstat(source);if(stat.isSymbolicLink())throw Error('CLI 资源不能是符号链接。');if(stat.isDirectory()){await mkdir(join(out,path),{recursive:true});for(const name of await readdir(source))await resources(path+'/'+name);}else{sourcePath(root,path);await mkdir(dirname(join(out,path)),{recursive:true});await cp(source,join(out,path));}}
    await resources('docs');try{await resources('cli/schemas');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  // Reuse the verified, complete notices from this SDK toolchain.
  await cp(join(sdkRoot,'THIRD_PARTY_NOTICES.txt'),join(out,'frontend/THIRD_PARTY_NOTICES.txt'));
  await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const store=storeDirectory??resolve(root,'../store'),entry=await packApplication(out,join(store,`${manifest.id}-${manifest.version}.ksfapp`));
  await withStoreLock(store,async()=>{let index;try{index=JSON.parse(await readFile(join(store,'index.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;index={protocol:'ksf-app-registry-v1',name:'KSF 应用',apps:[]};}
  const previous=index.apps.find(item=>item.manifest.id===manifest.id&&item.manifest.version===manifest.version);if(previous&&previous.package.sha256!==entry.package.sha256)throw Error('索引已存在同版本不同内容。');
  if(storeListing.listing!==undefined){entry.listing=storeListing.listing;for(const image of storeListing.media)await atomicWrite(join(store,image.url),image.bytes);}else if(previous?.listing)entry.listing=previous.listing;
  index.apps=[...index.apps.filter(item=>!(item.manifest.id===manifest.id&&item.manifest.version===manifest.version)),entry];await atomicWrite(join(store,'index.json'),JSON.stringify(index,null,2)+'\n');});if(!quiet)console.log(`Built ${manifest.id}@${manifest.version}: ${entry.package.size} bytes (${entry.package.sha256})`);return entry;
}
