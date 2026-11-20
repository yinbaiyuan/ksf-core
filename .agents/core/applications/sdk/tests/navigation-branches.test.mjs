import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const sdk=fileURLToPath(new URL('../',import.meta.url)),webRequire=createRequire(new URL('../../../runtime/web/package.json',import.meta.url));

test('optional parent navigation exposes separate native actions and preserves default branch semantics',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-navigation-branches-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const entry=join(root,'entry.tsx');await writeFile(entry,`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {NavigationList} from '@ksf/sdk/navigation-list';
 const items=[{id:'parent',label:'Parent',children:[{id:'child',label:'Child'}]}];
 export const legacy=renderToStaticMarkup(<NavigationList label="Default" items={items} selectedId="parent"/>);
 export const selected=renderToStaticMarkup(<NavigationList label="Split" selectBranches items={items} selectedId="parent"/>);
 export const disabled=renderToStaticMarkup(<NavigationList label="Disabled" selectBranches items={[{...items[0],disabled:true}]}/>);`);
 const {build}=await import(pathToFileURL(webRequire.resolve('vite')).href);await build({root,configFile:false,logLevel:'silent',resolve:{alias:[{find:'@ksf/sdk',replacement:join(sdk,'src')},...['react','react-dom'].map(name=>({find:name,replacement:dirname(webRequire.resolve(name+'/package.json'))}))]},ssr:{noExternal:true},build:{ssr:entry,outDir:join(root,'out'),rolldownOptions:{output:{entryFileNames:'render.mjs'}}}});
 const {legacy,selected,disabled}=await import(pathToFileURL(join(root,'out/render.mjs')).href);
 assert.doesNotMatch(legacy,/ksf-nav-row/);assert.match(legacy,/<button[^>]*aria-expanded="false"/);
 assert.match(selected,/<button[^>]*class="ksf-nav-select"[^>]*aria-current="page"/);
 assert.match(selected,/<button[^>]*class="ksf-nav-toggle"[^>]*aria-labelledby="[^"]+"[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+"/);
 assert.doesNotMatch(selected,/<button\b[^>]*>(?:(?!<\/button>).)*<button\b/s);
 assert.equal([...disabled.matchAll(/class="ksf-nav-(?:select|toggle)"[^>]*disabled=""/g)].length,2);
});
