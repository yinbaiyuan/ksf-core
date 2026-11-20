import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const sdk=fileURLToPath(new URL('../',import.meta.url)),webRequire=createRequire(new URL('../../../runtime/web/package.json',import.meta.url));
test('every published React showcase example renders through public entries; checkbox children render as accessible label text',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-showcase-render-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const contracts=JSON.parse(await readFile(join(sdk,'components/contracts.json'),'utf8')),imports=[],demos=[];
 for(const contract of contracts)for(const example of contract.examples){if(!example.file.endsWith('.tsx'))continue;const text=await readFile(join(sdk,example.file),'utf8'),name=text.match(/export function ([A-Z]\w*)\(/)?.[1];if(!name&&!/export default function/.test(text))continue;const alias='Example'+demos.length;imports.push(`import ${name ? '{'+name+' as '+alias+'}' : alias} from '@ksf/sdk/component-examples/${example.file.split('/').at(-1).replace('.tsx','')}';`);demos.push(`[${JSON.stringify(example.id)},${alias}]`);}
 const entry=join(root,'entry.tsx');await writeFile(entry,`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {Checkbox} from '@ksf/sdk/checkbox';${imports.join('\n')}export function run(){return [${demos.join(',')}].map(([id,Demo])=>{try{const markup=renderToStaticMarkup(<Demo/>);return {id,length:markup.length};}catch(error){return {id,error:String(error)};}})}export const checkbox=renderToStaticMarkup(<Checkbox>模拟失败</Checkbox>);`);
 const {build}=await import(pathToFileURL(webRequire.resolve('vite')).href);await build({root,configFile:false,logLevel:'silent',resolve:{alias:[{find:'@ksf/sdk',replacement:join(sdk,'src')},{find:'qrcode',replacement:join(sdk,'node_modules/qrcode/lib/browser.js')},...['react','react-dom'].map(name=>({find:name,replacement:dirname(webRequire.resolve(name+'/package.json'))}))]},ssr:{noExternal:true},build:{ssr:entry,outDir:join(root,'out'),rolldownOptions:{output:{entryFileNames:'render.mjs'}}}});
 const {run,checkbox}=await import(pathToFileURL(join(root,'out/render.mjs')).href),results=run();assert.equal(results.length,contracts.flatMap(c=>c.examples).filter(e=>e.file.endsWith('.tsx')).length);assert.deepEqual(results.filter(r=>r.error),[]);assert.ok(results.every(r=>r.length>0));assert.match(checkbox,/<input[^>]*type="checkbox"/);assert.match(checkbox,/<span>模拟失败<\/span>/);
});
