import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {webSourceDigest} from '../../src/web/assets.js';
import * as current from '../../web/scripts/ui-runtime.mjs';
import * as historical from './legacy-ui-bootstrap.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function uiRuntimeFixture(t,{suffix='123',content=suffix,hostCompatibility,features,bridge=true,legacy=false}={}) {
  const {createUIBootstrap,injectUIBootstrap}=legacy?historical:current;
  const root=mkdtempSync(join(tmpdir(),'ksf-shared-ui-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const web=join(root,'runtime/web'),dist=join(web,'dist');
  function write(path,value){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value);}
  for(const name of ['src','scripts'])mkdirSync(join(web,name),{recursive:true});
  for(const name of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html'])write(join(web,name),'{}');
  for(const name of ['route-evolution.js','view-targets.js'])write(join(root,'runtime/src/routing',name),'export {};');
  const optional=[['ui.domain','ksf-ui-domain'],['ui.ai','ksf-ui-ai'],['ui.desktop','ksf-ui-desktop'],['ui.files','ksf-ui-files'],['ui.legacy','ksf-ui-compat']].filter(([feature])=>!features||features.includes(feature)).map(([,entry])=>entry);
  const names=['ksf-ui',...(bridge?['ksf-ui-bridge']:[]),...optional,'ksf-react','ksf-react-dom','ksf-react-dom-client','ksf-jsx-runtime'];
  const manifest=Object.fromEntries(names.map(name=>[name,{name,isEntry:true,file:`assets/${name}-${suffix}.js`,css:name==='ksf-ui'?[`assets/ui-${suffix}.css`]:[]}]));
  write(join(web,'src/version.ts'),content);
  const files={};
  for(const name of names){const path=`assets/${name}-${suffix}.js`,bytes=`export const fixture=${JSON.stringify(content)};`;write(join(dist,path),bytes);files[path]=hash(bytes);}
  for(const [path,bytes]of Object.entries({[`assets/ui-${suffix}.css`]:'.ksf-ui-root {color:blue;}','THIRD_PARTY_NOTICES.txt':'fixture notices','index.html':`<html><link rel="stylesheet" href="/assets/ui-${suffix}.css"><script type="module" src="/assets/ksf-ui-${suffix}.js"></script></html>`})){write(join(dist,path),bytes);files[path]=hash(bytes);}
  const sourceDigest=webSourceDigest(web),uiRuntime=createUIBootstrap(manifest,{sourceDigest,contractVersion:'1.0.0',rendererFamily:'ksf-react-v1',files,...(hostCompatibility?{hostCompatibility}:{}),...(features?{features}:{})});
  const html=injectUIBootstrap(readFileSync(join(dist,'index.html'),'utf8'),uiRuntime);write(join(dist,'index.html'),html);files['index.html']=hash(html);
  const info={protocol:'ksf-web-build-v1',sourceDigest,files,...(legacy?{uiRuntime}:{frontendRuntime:uiRuntime})};
  // Fixture accessor for existing selector tests; not serialized metadata.
  if(!legacy)Object.defineProperty(info,'uiRuntime',{get:()=>info.frontendRuntime});
  const save=()=>write(join(dist,'build.json'),JSON.stringify(info));save();
  return {web,dist,info,save,write};
}

