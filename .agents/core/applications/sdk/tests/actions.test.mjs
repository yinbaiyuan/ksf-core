import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {menuIndex, menuMatch, placeMenu} from '../src/actions/menu-model.ts';
import {fitToolbar} from '../src/actions/toolbar-model.ts';
import {buildApplication} from '../build.mjs';
import {decodePackage} from '../server/protocol.js';
import {queryComponents} from '../server/components/query.mjs';
const sdk = fileURLToPath(new URL('../', import.meta.url)), app = fileURLToPath(new URL('../../component-library', import.meta.url));
const webRequire = createRequire(new URL('../../../runtime/web/package.json', import.meta.url));
const action = (id, extra={}) => ({id,label:id,onAction(){},...extra});

test('menu keyboard traversal skips separators and disabled commands, wraps and supports typeahead',()=>{
  const items=[action('Alpha'),{id:'s',type:'separator'},action('Disabled',{disabled:true}),action('Beta'),action('Bravo')];
  assert.equal(menuIndex(items,-1,'ArrowDown'),0);assert.equal(menuIndex(items,-1,'ArrowUp'),4);
  assert.equal(menuIndex(items,0,'ArrowDown'),3);assert.equal(menuIndex(items,0,'ArrowUp'),4);
  assert.equal(menuIndex(items,4,'ArrowDown'),0);assert.equal(menuIndex(items,3,'Home'),0);assert.equal(menuIndex(items,0,'End'),4);
  assert.equal(menuIndex([action('x',{disabled:true})],0,'ArrowDown'),-1);
  assert.equal(menuMatch(items,0,'b'),3);assert.equal(menuMatch(items,3,'b'),4);assert.equal(menuMatch(items,4,'b'),3);assert.equal(menuMatch(items,0,'disabled'),-1);
});
test('root and submenu placement flips and clamps inside offset window bounds',()=>{
  const area={left:120,top:80,width:380,height:300};
  assert.deepEqual(placeMenu(area,{left:420,top:300,width:40,height:30},200,160),{left:292,top:136});
  assert.deepEqual(placeMenu(area,{left:420,top:200,width:40,height:30},200,160,undefined,true),{left:216,top:196});
  const pointer=placeMenu(area,{left:0,top:0,width:0,height:0},220,240,{x:490,y:375});
  assert.deepEqual(pointer,{left:272,top:132});
});
test('toolbar fitting preserves source order and groups while removing lowest-priority actions',()=>{
  const items=[{id:'a',group:'file',priority:100},{id:'b',group:'file',priority:20},{id:'c',group:'edit',priority:10},{id:'d',group:'view',priority:30}];
  const widths=new Map(items.map(i=>[i.id,60]));
  assert.deepEqual(fitToolbar(items,widths,400,60),[]);
  assert.deepEqual(fitToolbar(items,widths,220,60),['b','c']);
  assert.deepEqual(fitToolbar(items,widths,70,60),['a','b','c','d']);
  assert.deepEqual(fitToolbar([{id:'a'},{id:'b'},{id:'c'}],new Map([['a',50],['b',50],['c',50]]),120,50),['b','c']);
});
test('public action controls preserve native semantics, labels and non-submit menu triggers', async t=>{
  const root=await mkdtemp(join(tmpdir(),'ksf-actions-render-'));t.after(()=>rm(root,{recursive:true,force:true}));const entry=join(root,'render.tsx');
  await writeFile(entry,`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {IconButton} from '@ksf/sdk/icon-button';import {ButtonGroup} from '@ksf/sdk/button-group';import {Button} from '@ksf/sdk/button';import {Link} from '@ksf/sdk/link';import {DropdownMenu} from '@ksf/sdk/dropdown-menu';import {ContextMenu} from '@ksf/sdk/context-menu';import {Toolbar} from '@ksf/sdk/toolbar';import {Menubar} from '@ksf/sdk/menubar';
    const Glyph=p=><svg {...p}><path d="M0 0h1"/></svg>;const items=[{id:'one',label:'命令',onAction(){}}];
    export const markup=renderToStaticMarkup(<form><IconButton icon={Glyph} label="添加" disabled/><ButtonGroup label="分组" attached><Button>一</Button><Button>二</Button></ButtonGroup><Link href="https://example.invalid" target="_blank" rel="nofollow">链接</Link><DropdownMenu label="菜单" items={items}/><ContextMenu label="内容菜单" items={items}>目标</ContextMenu><Toolbar label="内部工具栏" items={items}/><Menubar label="内部菜单栏" menus={[{id:'file',label:'文件',items}]}/></form>);
    export function emptyLabel(){return renderToStaticMarkup(<IconButton icon={Glyph} label="  "/>)}
  `);
  const {build}=await import(pathToFileURL(webRequire.resolve('vite')).href);
  await build({root,configFile:false,logLevel:'silent',resolve:{alias:[{find:'@ksf/sdk',replacement:join(sdk,'src')},...['react','react-dom'].map(name=>({find:name,replacement:dirname(webRequire.resolve(name+'/package.json'))}))]},ssr:{noExternal:true},build:{ssr:entry,outDir:join(root,'out'),rolldownOptions:{output:{entryFileNames:'render.mjs'}}}});
  const {markup,emptyLabel}=await import(pathToFileURL(join(root,'out/render.mjs')).href);
  assert.match(markup,/<button(?=[^>]*disabled="")(?=[^>]*aria-label="添加")/);assert.match(markup,/role="group" aria-label="分组"/);
  assert.match(markup,/<a[^>]*href="https:\/\/example.invalid"[^>]*rel="nofollow noopener noreferrer"/);
  const buttons=[...markup.matchAll(/<button\b([^>]*)>/g)];assert.ok(buttons.length>=6);assert.ok(buttons.every(b=>b[1].includes('type="button"')));
  assert.match(markup,/aria-haspopup="menu" aria-expanded="false"/);assert.match(markup,/role="toolbar" aria-label="内部工具栏"/);assert.match(markup,/role="menubar" aria-label="内部菜单栏"/);
  assert.throws(emptyLabel,/非空label/);assert.doesNotMatch(markup,/role="menu"|data-ksf-action-menu=/);
});
test('a menu app packages scoped theme styles and keeps legacy/new entries independently available',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ksf-actions-build-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'package.json'),'{"name":"actions-app","type":"module"}');
  await writeFile(join(root,'manifest.json'),JSON.stringify({schemaVersion:1,sdkVersion:1,id:'com.example.actions',name:'Actions',description:'Public action components',version:'1.0.0',minCoreVersion:'0.5.7',permissions:[],dataStores:[],cards:[],window:{entry:'frontend/index.js'}}));
  await writeFile(join(root,'frontend.tsx'),`import {mountReact} from '@ksf/sdk/react';import {View} from '@ksf/sdk/view';import {DropdownMenu} from '@ksf/sdk/dropdown-menu';import {Toolbar} from '@ksf/sdk/toolbar';function App(){const items=[{id:'one',label:'操作',onAction(){}}];return <View><DropdownMenu label="菜单" items={items}/><Toolbar label="工具" items={items}/></View>}export function mount(c,s){return mountReact(App,c,s)}`);
  const built=await buildApplication(root,{local:true,quiet:true}),decoded=decodePackage(await readFile(built.packagePath));assert.equal(built.manifest.uiRuntime,undefined);
  const css=[...decoded.files].filter(([n])=>n.endsWith('.css')).map(([,f])=>f.data.toString()).join('\n');assert.match(css,/ksf-app-com_example_actions--1_0_0/);assert.match(css,/ksf-action-menu/);assert.match(css,/var\(--ksf-color-surface-raised\)/);
  const pkg=JSON.parse(await readFile(join(sdk,'package.json'),'utf8'));assert.equal(pkg.exports['./components/ui/context-menu'],'./src/components/ui/context-menu.tsx');assert.equal(pkg.exports['./context-menu'],'./src/context-menu.tsx');
});
test('Agent verifies every new action public entry and returns its exact standard example',async()=>{
  for(const [id,name] of [['ACT-02','icon-button'],['ACT-03','button-group'],['ACT-04','link'],['ACT-05','dropdown-menu'],['ACT-06','context-menu'],['ACT-07','toolbar'],['ACT-08','menubar']]){
    const read=await queryComponents({operation:'read',selector:id,appDir:app});assert.equal(read.targetSupport.status,'supported',JSON.stringify(read));
    const result=await queryComponents({operation:'example',selector:name+'.basic',appDir:app});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.example.source,await readFile(join(sdk,result.example.file),'utf8'));
  }
});
