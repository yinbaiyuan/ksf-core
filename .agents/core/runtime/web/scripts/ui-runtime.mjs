import {createHash} from 'node:crypto';
export const FRONTEND_HOST_COMPATIBILITY=Object.freeze({workbenchContract:'ksf-workbench-v1',minimumCoreVersion:'0.6.0',maximumCoreVersionExclusive:'0.7.0'});
const hash=value=>createHash('sha256').update(value).digest('hex');
export function createUIBootstrap(manifest,{sourceDigest,files,hostCompatibility=FRONTEND_HOST_COMPATIBILITY}){
 if(!/^[a-f0-9]{64}$/.test(files['index.html']??''))throw Error('Missing base workbench HTML digest.');
 const resources=Object.fromEntries(Object.keys(files).filter(name=>name.startsWith('assets/')).sort().map(name=>[name,[]]));
 for(const item of Object.values(manifest)){
  if(!files[item.file])throw Error(`Missing frontend resource ${item.file}`);
  const targets=[...(item.imports??[]),...(item.dynamicImports??[])].map(key=>{if(!manifest[key])throw Error(`Missing frontend dependency ${key}`);return manifest[key].file;}).concat(item.css??[],item.assets??[]);
  for(const target of targets)if(!files[target])throw Error(`Missing frontend resource ${target}`);
  resources[item.file]=[...new Set(targets)].sort();
 }
 const orderedFiles=Object.fromEntries(Object.keys(files).sort().map(key=>[key,files[key]]));
 const frontendReleaseId=hash(JSON.stringify({sourceDigest,hostCompatibility,resources,files:orderedFiles}));
 return {protocol:'ksf-frontend-runtime-v1',frontendReleaseId,hostCompatibility,resources,baseHtmlDigest:files['index.html'],features:['document-boot']};
}
export function injectUIBootstrap(html,runtime){
 if(html.includes('id="ksf-frontend-runtime"'))throw Error('Frontend descriptor is already present.');
 const descriptor=JSON.stringify({frontendReleaseId:runtime.frontendReleaseId}).replaceAll('<','\\u003c');
 const at=html.search(/<script\b[^>]*\btype="module"/);if(at<0)throw Error('Workbench module entry is missing.');
 return html.slice(0,at)+`<script type="application/json" id="ksf-frontend-runtime">${descriptor}</script>\n`+html.slice(at);
}
