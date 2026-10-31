import{readFile,readdir}from'node:fs/promises';
import{existsSync}from'node:fs';
import{resolve,join,relative,dirname,extname}from'node:path';
import{sourcePath}from'./source-path.mjs';
import{validateManifest,readCLIDocument}from'./protocol.js';
import{loadStoreListing}from'./listing.mjs';

export const isTestSource = path => /(?:^|[\\/])(?:tests|__tests__)(?:[\\/]|$)|\.test\.[cm]?[jt]sx?$/.test(path);
async function checkProductionImports(root,manifest,entries,add){
 const pending=[...(manifest.window?[entries.window??'frontend.tsx']:[]),...(manifest.cards??[]).map(c=>entries.cards?.[c.id]??c.id+'.tsx'),...(manifest.backend?[entries.backend??'backend.mjs']:[]),...(manifest.cli?[entries.cli??manifest.cli.entry]:[])],seen=new Set();
 while(pending.length){const file=pending.pop();if(seen.has(file))continue;seen.add(file);if(isTestSource(file)){add('error','APP_TEST_IMPORT','生产入口不能依赖测试装置。',file);continue;}
 let text;try{text=await readFile(sourcePath(root,file),'utf8');}catch{continue;}
 for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)){const spec=match[1];if(!spec.startsWith('.'))continue;const target=resolve(root,dirname(file),spec),rel=relative(root,target);if(isTestSource(rel)){add('error','APP_TEST_IMPORT','生产模块不能导入包外测试装置。',file);continue;}if(rel.startsWith('..'))continue;
 if(isTestSource(rel)){add('error','APP_TEST_IMPORT','生产模块不能通过测试目录导入宿主或测试代码。',file);continue;}
 const candidates=[rel,...(!extname(rel)?['.js','.mjs','.ts','.tsx','/index.js','/index.ts'].map(s=>rel+s):[])];const found=candidates.find(c=>existsSync(join(root,c)));if(found&&/\.[cm]?[jt]sx?$/.test(found))pending.push(found);
 }
 }
}
export async function checkApplication(root){root=resolve(root);const diagnostics=[];const add=(severity,code,message,file)=>diagnostics.push({severity,code,message,file});let manifest;try{manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));validateManifest(manifest);}catch(error){add('error',error.code??'APP_MANIFEST_INVALID',error.message,'manifest.json');return {ok:false,diagnostics};}
 try{await loadStoreListing(root);}catch(error){add('error',error.code??'APP_LISTING_INVALID',error.message,'store-listing.json');}
 let options={};try{options=JSON.parse(await readFile(join(root,'ksf-build.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')add('error','APP_BUILD_CONFIG_INVALID',error.message,'ksf-build.json');}
 const entries=options.entries??{};for(const file of [...(manifest.window?[entries.window??'frontend.tsx']:[]),...(manifest.cards??[]).map(card=>entries.cards?.[card.id]??card.id+'.tsx'),...(manifest.backend?[entries.backend??'backend.mjs']:[]),...(manifest.cli?[entries.cli??manifest.cli.entry,manifest.cli.documentation]:[])])try{await readFile(sourcePath(root,file));}catch(error){add('error','APP_SOURCE_MISSING',error.message,file);}
 if(manifest.cli)try{readCLIDocument(await readFile(sourcePath(root,manifest.cli.documentation)),{main:true});}catch(error){add('error',error.code??'APP_CLI_DOCUMENT_INVALID',error.message,manifest.cli.documentation);}
 async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(['node_modules','.build','.git','tests','__tests__'].includes(entry.name)||/\.test\.[cm]?[jt]sx?$/.test(entry.name))continue;const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else if(/\.(?:[cm]?[jt]sx?|css)$/.test(entry.name)){const text=await readFile(path,'utf8'),file=relative(root,path);if(/(?:from|import|require)\s*(?:\(\s*)?['"][^'"]*(?:runtime\/(?:src|web)|\.agents\/core|\/Users\/)/.test(text))add('error','APP_PRIVATE_IMPORT','应用不能导入宿主私有源码。',file);if(/(?:api\.(?:openai|deepseek|anthropic)\.com|from\s*['"](?:openai|@anthropic-ai)|(?:spawn|execFile|exec)\s*\(\s*['"](?:codex|claude|gemini|ollama))/.test(text))add('warning','APP_AI_DIRECT','检查模型调用；应用必须经过工作台AI服务。',file);if(/(?:sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]\s*['"][^'"]{12,})/i.test(text))add('warning','APP_CREDENTIAL_REVIEW','检查是否包含真实凭据。',file);if(/(?:createPortal[\s\S]{0,500}document\.body|document\.body\.(?:append|appendChild)|position\s*:\s*fixed)/.test(text))add('warning','APP_OVERLAY_SCOPE','人工核对弹层边界：应用弹层必须放在SDK overlayHost内，不能以网页body或视口作为应用窗口。',file);if(entry.name.endsWith('.css')&&/(?:^|})\s*(?:html|body|\*)\s*[{,]/.test(text))add('warning','APP_GLOBAL_STYLE','检查可能影响其他应用的全局样式。',file);}}}await walk(root);await checkProductionImports(root,manifest,entries,add);return {ok:!diagnostics.some(d=>d.severity==='error'),manifest,diagnostics};}
