import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import postcss from 'postcss';
import {buildApplication} from '../build.mjs';
import {decodePackage} from '../server/protocol.js';

test('optional Kokonut effects reference keyframes shipped by the consumer, without host animation names',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-effect-isolation-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'package.json'),'{"name":"effect-isolation","type":"module"}');
 await writeFile(join(root,'manifest.json'),JSON.stringify({schemaVersion:1,sdkVersion:1,id:'com.example.effect-isolation',name:'Effect isolation',description:'Independent consumer',version:'1.0.0',minCoreVersion:'0.5.7',permissions:[],dataStores:[],cards:[],window:{entry:'frontend/index.js'}}));
 await writeFile(join(root,'frontend.tsx'),`import {mountReact} from '@ksf/sdk/react';import {View} from '@ksf/sdk/view';import {OrbitLoader} from '@ksf/sdk/orbit-loader';import {AnimatedText} from '@ksf/sdk/animated-text';import {AITextLoading} from '@ksf/sdk/ai-text-loading';import {AgentActivity} from '@ksf/sdk/agent-activity';import {ToolCalls} from '@ksf/sdk/tool-calls';import {TransferProgressView} from '@ksf/sdk/component-examples/transfer-progress-view';function App(){return <View><OrbitLoader/><AnimatedText effect="typewriter" text="Testing"/><AITextLoading label="Thinking" messages={['One','Two']}/><AgentActivity label="Activity" steps={[{id:'one',label:'Running',status:'running'}]}/><ToolCalls label="Tools" calls={[{id:'one',name:'read',status:'receiving'}]}/><TransferProgressView/></View>}export function mount(c,s){return mountReact(App,c,s)}`);
 const built=await buildApplication(root,{local:true,quiet:true}),decoded=decodePackage(await readFile(built.packagePath));
 const css=[...decoded.files].filter(([name])=>name.endsWith('.css')).map(([,file])=>file.data.toString()).join('\n'),tree=postcss.parse(css),keyframes=new Set(),variables=new Map(),animations=[];
 tree.walkAtRules('keyframes',rule=>keyframes.add(rule.params));
 tree.walkDecls(decl=>{if(decl.prop.startsWith('--animate-'))variables.set(decl.prop,decl.value);if(decl.prop==='animation')animations.push(decl.value);});
 let checked=0;
 for(const value of animations){const resolved=value.replace(/var\((--animate-[\w-]+)\)/g,(_,key)=>variables.get(key)??'');const name=resolved.match(/^([a-zA-Z_][\w-]*)/)?.[1];if(!name||['none','inherit','initial','unset','var'].includes(name))continue;checked++;assert.ok(keyframes.has(name),`Animation ${name} has no keyframes in the standalone package`);}
 assert.ok(checked>0,'The consumer must include real effect animations');
 for(const name of ['kokonut-ai-wave','kokonutui-typewriter-caret','kokonutui-ct-in','kokonutui-ct-draw','ksf-tool-spin']){assert.ok([...keyframes].some(key=>key!==name&&key.endsWith(name)),`Fixed effect ${name} must ship a namespaced stylesheet definition`);}
});

test('fixed-reference container thresholds keep their 16px geometry inside a 15px KSF host',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-effect-container-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'package.json'),'{"name":"effect-container","type":"module"}');
 await writeFile(join(root,'manifest.json'),JSON.stringify({schemaVersion:1,sdkVersion:1,id:'com.example.effect-container',name:'Effect container',description:'Fixed source container geometry',version:'1.0.0',minCoreVersion:'0.5.7',permissions:[],dataStores:[],cards:[],window:{entry:'frontend/index.js'}}));
 await writeFile(join(root,'frontend.tsx'),`import {mountReact} from '@ksf/sdk/react';import {View} from '@ksf/sdk/view';import {NowPlayingView} from '@ksf/sdk/component-examples/now-playing-view';function App(){return <View style={{fontSize:15}}><NowPlayingView autoPlay={false}/></View>}export function mount(c,s){return mountReact(App,c,s)}`);
 const built=await buildApplication(root,{local:true,quiet:true}),decoded=decodePackage(await readFile(built.packagePath));
 const css=[...decoded.files].filter(([name])=>name.endsWith('.css')).map(([,file])=>file.data.toString()).join('\n'),tree=postcss.parse(css);let found=false;
 tree.walkAtRules('container',rule=>{if(!rule.params.startsWith('now-playing '))return;found=true;assert.match(rule.params,/352px/,'The original 22rem threshold is 352px; it must not shrink to 330px in the host');assert.doesNotMatch(rule.params,/\drem\b/);});
 assert.ok(found,'The independent consumer includes the actual record sizing query');
});
