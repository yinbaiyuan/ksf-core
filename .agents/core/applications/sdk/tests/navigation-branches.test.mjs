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

test('collapsed trees defer custom child rendering while preserving checks and filtered navigation',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-tree-render-budget-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const entry=join(root,'entry.tsx');await writeFile(entry,`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {TreeView} from '@ksf/sdk/tree-view';
 const nodes=[{id:'parent',label:'Parent',children:Array.from({length:1000},(_,i)=>({id:'child-'+i,label:'Child '+i}))}];
 let calls=[];const label=node=>{calls.push(node.id);return node.label;};
 export const closed=renderToStaticMarkup(<TreeView label="Closed" nodes={nodes} renderLabel={label}/>);export const closedCalls=[...calls];calls=[];
 export const opened=renderToStaticMarkup(<TreeView label="Opened" nodes={nodes} defaultExpandedIds={['parent']} renderLabel={label}/>);export const openedCalls=[...calls];calls=[];
 export const checked=renderToStaticMarkup(<TreeView label="Checks" nodes={nodes} checkable checkedIds={['parent']} name="selection"/>);
 export const checkedOpened=renderToStaticMarkup(<TreeView label="Opened checks" nodes={nodes} defaultExpandedIds={['parent']} checkable checkedIds={['parent']}/>);
 export const filtered=renderToStaticMarkup(<TreeView label="Filtered" nodes={nodes} filter="Child 999" renderLabel={label}/>);export const filteredCalls=[...calls];`);
 const {build}=await import(pathToFileURL(webRequire.resolve('vite')).href);await build({root,configFile:false,logLevel:'silent',resolve:{alias:[{find:'@ksf/sdk',replacement:join(sdk,'src')},...['react','react-dom'].map(name=>({find:name,replacement:dirname(webRequire.resolve(name+'/package.json'))}))]},ssr:{noExternal:true},build:{ssr:entry,outDir:join(root,'out'),rolldownOptions:{output:{entryFileNames:'render.mjs'}}}});
 const result=await import(pathToFileURL(join(root,'out/render.mjs')).href);
 assert.deepEqual(result.closedCalls,['parent']);assert.doesNotMatch(result.closed,/Child 999/);
 assert.equal(result.openedCalls.length,1001);assert.match(result.opened,/Child 999/);
 assert.match(result.checked,/type="hidden"[^>]*name="selection"[^>]*value="parent"/);
 assert.equal([...result.checkedOpened.matchAll(/aria-checked="true"/g)].length,1001);
 assert.deepEqual(result.filteredCalls,['parent','child-999']);assert.match(result.filtered,/aria-expanded="true"/);
});
