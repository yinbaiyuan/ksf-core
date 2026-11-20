import {mkdtemp,mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildApplication} from '../../../applications/sdk/build.mjs';
import {decodePackage} from '../../src/applications/protocol.js';
export async function buildOpenUIApps(t,{directory}={}){
 const home=directory??await mkdtemp(join(tmpdir(),'ksf-open-ui-'));
 if(!directory)t?.after(()=>rm(home,{recursive:true,force:true}));
 const fixtures=fileURLToPath(new URL('../fixtures/open-ui/',import.meta.url)),web=fileURLToPath(new URL('../../web/',import.meta.url)),results=[];
 for(const [name,library] of [['radix','@radix-ui/react-dialog'],['grid','react-grid-layout']]){
  const root=join(home,name);await mkdir(root,{recursive:true});
  for(const source of [name+'.tsx','common.tsx','style.css'])await cp(join(fixtures,source),join(root,source===name+'.tsx'?'frontend.tsx':source));
  if(name==='grid'){const path=join(root,'style.css');await writeFile(path,(await readFile(path,'utf8')).replaceAll('#f2f7ff','#fff4ee').replaceAll('#13366a','#663519').replaceAll('#184a99','#984719').replaceAll('#d3e5ff','#f5d4be'));}
  const pkg=JSON.parse(await readFile(join(web,'node_modules',library,'package.json'),'utf8'));
  const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.5.7',id:'com.example.open-'+name,name:name==='radix'?'Radix UI 独立应用':'Grid 独立应用',description:'开放SDK隔离验证应用',version:'1.0.0',permissions:[],dataStores:[],window:{entry:'frontend/index.js',defaultSize:{width:480,height:480},minSize:{width:320,height:300},multiInstance:true}};
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));await writeFile(join(root,'package.json'),JSON.stringify({name:manifest.id,type:'module',dependencies:{[library]:pkg.version}}));
  await writeFile(join(root,'THIRD_PARTY_NOTICES.txt'),await readFile(join(web,'node_modules',library,'LICENSE'),'utf8'));
  const built=await buildApplication(root,{local:true,quiet:true});results.push({name,root,built,decoded:decodePackage(await readFile(built.packagePath))});
 }
 return results;
}
