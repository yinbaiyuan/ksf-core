// Isolated CLI documentation acceptance: fictional packages, no personal data/model calls.
import {mkdtemp,cp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startWebServer} from '../src/services/web.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
import {createApplicationManager} from '../src/applications/manager.js';
const source=fileURLToPath(new URL('../../',import.meta.url)),root=await mkdtemp(join(tmpdir(),'ksf-cli-docs-browser-')),core=join(root,'.agents/core'),web=join(core,'runtime/web'),store=join(root,'store');
for(const name of ['src','scripts','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','dist'])await cp(join(source,'runtime/web',name),join(web,name),{recursive:true});
await cp(join(source,'applications/sdk/src'),join(core,'applications/sdk/src'),{recursive:true});
await cp(join(source,'applications/sdk/package.json'),join(core,'applications/sdk/package.json'));
await mkdir(join(core,'runtime/src/routing'),{recursive:true});
for(const name of ['route-evolution.js','view-targets.js'])await cp(join(source,'runtime/src/routing',name),join(core,'runtime/src/routing',name));
for(const name of ['distribution.json','build.json','data-compatibility.json'])await cp(join(source,name),join(core,name));
await mkdir(store);await writeFile(join(root,'USER.md'),'# 隔离验收用户\n');await writeFile(join(root,'BOT.md'),'# 隔离验收 Agent\n');
const file=value=>{const bytes=Buffer.from(value);return{content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};};
const entries=[];
async function packageApp(id,name,{cli=true,window=true,cards=false,version='1.0.0'}={}){
 const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',dataStores:[],id,name,description:'隔离 CLI 文档验收',version,permissions:[],...(window?{window:{entry:'frontend/index.js',multiInstance:true,minSize:{width:320,height:280}}}:{}),...(cards?{cards:[{id:'sample',name:'验收卡片',description:'卡片应用文档入口',entry:'frontend/index.js',defaultSize:{w:2,h:2},minSize:{w:1,h:1}}]}:{}),backend:{runtime:'node',entry:'backend/index.mjs',lifecycle:'on-demand'},...(cli?{cli:{contractVersion:1,entry:'cli/index.mjs',documentation:'docs/cli.md',commands:[{id:'inspect',description:'只读验收'}]}}:{})};
 const frontend=`export function mount(container,sdk){const button=document.createElement('button');button.textContent='更新自定义菜单';const label=document.createElement('p');label.textContent='应用窗口内容';const fresh=document.createElement('button');fresh.textContent='打开同应用新窗口';fresh.onclick=()=>sdk.openApp?.(${JSON.stringify(id)},'',true);container.append(button,fresh,label);let n=0;const menu=sdk.menu.register([{id:'sample',label:'自定义菜单',onAction(){}}]);button.onclick=()=>{n++;menu.update([{id:'sample',label:'自定义菜单 '+n,onAction(){}}]);};return{dispose(){menu.dispose();container.replaceChildren();}}}`;
 const marker=join(root,id+'-backend-loaded'),cliMarker=join(root,id+'-cli-loaded');
 const files={'frontend/index.js':file(frontend),'backend/index.mjs':file(`import{writeFile}from'node:fs/promises';await writeFile(${JSON.stringify(marker)},'loaded');export function activate(){return{call(){return{ok:true}}}}`)};
 if(cli)Object.assign(files,{'cli/index.mjs':file(`import{writeFile}from'node:fs/promises';await writeFile(${JSON.stringify(cliMarker)},'loaded');export function createCLI(){return{execute(){return{ok:true}}}}`),'docs/cli.md':file('# CLI 验收说明\n\n当前包版本 '+version+'。\n\n[子文档](guide.txt) · [参数 schema](../cli/schemas/input.json) · [损坏引用](missing.md)\n\n[外部链接](https://example.invalid/no-network)\n\n![禁止远程图片](https://example.invalid/image.png)\n\n<script>globalThis.cliDocsExecuted=true</script>\n\n```sh\nksf app exec '+id+' inspect --from - --json\n```\n'),'docs/guide.txt':file('纯文本子文档，仅读取当前包。'),'cli/schemas/input.json':file('{"type":"object","properties":{"query":{"type":"string"}}}')});
 const bytes=encodePackage(manifest,files),entry={manifest,package:{url:id+'-'+version+'.ksfapp',size:bytes.length,sha256:checksum(bytes)}};await writeFile(join(store,entry.package.url),bytes);entries.push(entry);return entry;
}
const installed=[await packageApp('com.example.cli','CLI 窗口验收'),await packageApp('com.example.plain','普通窗口验收',{cli:false}),await packageApp('com.example.disabled','停用后台验收',{window:false}),await packageApp('com.example.card','仅卡片验收',{window:false,cards:true})];
await packageApp('com.example.uninstalled','未安装 CLI 验收',{window:false});
await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:entries}));
const manager=createApplicationManager(root,{storeDirectory:store,defaultSource:null});
for(const entry of installed)await manager.install({trusted:true,sourceId:'builtin',appId:entry.manifest.id,version:entry.manifest.version,digest:entry.package.sha256});
await manager.changeApp('com.example.disabled','disable');await manager.close();
const blocked={async execute(){throw Error('Fixture forbids model execution.');}};
const server=await startWebServer({root,port:0,capture:false,webDirectory:web,applications:{storeDirectory:store,defaultSource:null},ai:{executors:Object.fromEntries(['codex','openai-responses-v1','deepseek-responses-v1','openai-transcription-v1'].map(key=>[key,blocked]))}});
console.log(JSON.stringify({url:server.url,root,mode:'isolated-cli-document-acceptance',entries}));
// Optional stdin instruction creates a new release; it never touches the daily instance.
process.stdin.setEncoding('utf8');process.stdin.on('data',async text=>{if(text.trim()==='upgrade-disabled'){const entry=await packageApp('com.example.disabled','停用后台验收',{window:false,version:'1.0.1'});await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:entries}));const m=createApplicationManager(root,{storeDirectory:store,defaultSource:null});try{await m.install({trusted:true,sourceId:'builtin',appId:entry.manifest.id,version:entry.manifest.version,digest:entry.package.sha256});console.log('disabled-upgraded');}finally{await m.close();}}});
async function close(){await server.close();await rm(root,{recursive:true,force:true});process.exit(0);}process.on('SIGTERM',close);process.on('SIGINT',close);
