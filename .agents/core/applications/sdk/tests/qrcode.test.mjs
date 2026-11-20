import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import jsQR from 'jsqr';
const sdk=fileURLToPath(new URL('../',import.meta.url)),webRequire=createRequire(new URL('../../../runtime/web/package.json',import.meta.url));
test('public QRCode SVG decodes with an independent reader for URLs, numeric and UTF-8 text; invalid capacity yields an error',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-qrcode-render-'));t.after(()=>rm(root,{recursive:true,force:true}));const entry=join(root,'render.tsx');
 await writeFile(entry,`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {QRCode} from '@ksf/sdk/qr-code';export function render(value,correction){return renderToStaticMarkup(<QRCode value={value} correction={correction}/>);}`);
 const {build}=await import(pathToFileURL(webRequire.resolve('vite')).href);await build({root,configFile:false,logLevel:'silent',resolve:{alias:[{find:'@ksf/sdk',replacement:join(sdk,'src')},{find:'qrcode',replacement:join(sdk,'node_modules/qrcode/lib/browser.js')},...['react','react-dom'].map(name=>({find:name,replacement:dirname(webRequire.resolve(name+'/package.json'))}))]},ssr:{noExternal:true},build:{ssr:entry,outDir:join(root,'out'),rolldownOptions:{output:{entryFileNames:'render.mjs'}}}});
 const {render}=await import(pathToFileURL(join(root,'out/render.mjs')).href);
 for(const [text,correction] of [['https://ant.design/components/','M'],['012345678901234567890','L'],['KSF组件库 · 中文验证 ✅','H'],['A'.repeat(300),'Q']]){
  const svg=render(text,correction),extent=Number(svg.match(/viewBox="0 0 (\d+) (\d+)"/)[1]),scale=6,width=extent*scale,pixels=new Uint8ClampedArray(width*width*4).fill(255),path=svg.match(/<path d="([^"]+)"/)[1];
  for(const match of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)){const x=Number(match[1]),y=Number(match[2]),length=Number(match[3]);for(let py=y*scale;py<(y+1)*scale;py++)for(let px=x*scale;px<(x+length)*scale;px++){const at=(py*width+px)*4;pixels[at]=pixels[at+1]=pixels[at+2]=0;}}
  assert.equal(jsQR(pixels,width,width)?.data,text);
 }
 assert.equal(render('','M'),'','empty values do not render a misleading code or error');assert.match(render('x'.repeat(10000),'H'),/无法生成二维码/);
});
