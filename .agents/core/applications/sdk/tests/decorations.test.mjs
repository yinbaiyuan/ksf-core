import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../build.mjs';
import {decodePackage} from '../server/protocol.js';
import postcss from 'postcss';
test('production decoration styles keep the mask hole after minification and retain reduced-motion behavior',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-beam-build-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'package.json'),'{"name":"beam-app","type":"module"}');await writeFile(join(root,'manifest.json'),JSON.stringify({schemaVersion:1,sdkVersion:1,id:'com.example.beam',name:'Beam',description:'Decoration integration',version:'1.0.0',minCoreVersion:'0.5.7',permissions:[],dataStores:[],cards:[],window:{entry:'frontend/index.js'}}));
 await writeFile(join(root,'frontend.tsx'),`import {mountReact} from '@ksf/sdk/react';import {View} from '@ksf/sdk/view';import {BorderBeam} from '@ksf/sdk/border-beam';function App(){return <View><BorderBeam><button>操作</button></BorderBeam></View>}export function mount(c,s){return mountReact(App,c,s)}`);
 const result=await buildApplication(root,{local:true,quiet:true}),pkg=decodePackage(await readFile(result.packagePath));const css=[...pkg.files].filter(([name])=>name.endsWith('.css')).map(([,file])=>file.data.toString()).join('\n'),sheet=postcss.parse(css);let checked=false;
 sheet.walkRules(rule=>{if(!rule.selector.includes('.ksf-border-beam-track')||rule.selector.includes(':before')||!rule.nodes.some(node=>node.type==='decl'&&node.prop==='mask-composite'))return;const declarations=rule.nodes.filter(node=>node.type==='decl');const composite=declarations.findLastIndex(node=>node.prop==='mask-composite'),shorthand=declarations.findLastIndex(node=>node.prop==='mask');assert.equal(declarations[composite].value,'exclude');assert.ok(composite>shorthand,'mask shorthand must not reset the border hole');checked=true;});
 assert.equal(checked,true);assert.match(css,/prefers-reduced-motion/);assert.match(css,/offset-path:rect\(/);assert.match(css,/ksf-app-com_example_beam--1_0_0-ksf-border-beam-move/);
 const js=pkg.files.get('frontend/index.js').data.toString();assert.doesNotMatch(js,/No input text|Invalid error correction level/,'decorators do not bundle QR encoding');
});
