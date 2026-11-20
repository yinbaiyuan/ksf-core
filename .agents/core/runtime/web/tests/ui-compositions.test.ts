import test from 'node:test';
import assert from 'node:assert/strict';
import {stableIds,splitRange,constrainSplit,previewText} from '../src/internal-ui/composition-model.ts';
import {projectFileResource,resourceSnapshot} from '../../../applications/sdk/src/resource-model.ts';
import {createFileResourceAdapter} from '../../../applications/sdk/src/controllers/resource-adapter.ts';
import {toolbarLayout} from '../../../applications/sdk/src/window-toolbar-model.ts';
import type {FileInfo} from '../../../applications/sdk/src/files.ts';
const info:FileInfo={ref:{scope:'workspace',path:'资料/组件说明.md'},path:'资料/组件说明.md',kind:'file',size:20,modifiedAt:'2026-11-16T00:00:00Z',version:'v1',policy:'readonly',writable:false,protection:{code:'READ_ONLY',message:'不可写入'}};
test('stable selection identities survive reordering and reject duplicate/empty identities',()=>{
 const a={id:'a'},b={id:'b'};assert.deepEqual(stableIds([b,a],x=>x.id),['b','a']);assert.throws(()=>stableIds([a,a],x=>x.id),/唯一/);assert.throws(()=>stableIds([{id:' '}],x=>x.id),/非空/);
});
test('split constraints preserve both minimum pane sizes and report an impossible layout',()=>{
 const range=splitRange(400,120,160,10,90);assert.deepEqual(range,{min:30,max:60,fits:true});assert.equal(constrainSplit(2,range),30);assert.equal(constrainSplit(99,range),60);
 assert.equal(splitRange(200,120,120).fits,false);assert.equal(splitRange(0,120,120).fits,false);assert.throws(()=>splitRange(200,-1,0));assert.throws(()=>constrainSplit(NaN,range));
});
test('Unicode truncation preserves surrogate pairs and distinguishes exact from partial previews',()=>{
 assert.deepEqual(previewText('甲😀乙',2),{text:'甲😀',truncated:true,total:3});assert.deepEqual(previewText('甲😀乙',3),{text:'甲😀乙',truncated:false,total:3});assert.throws(()=>previewText('x',0));
});
test('measured toolbar sizes retain text and original order while selecting by priority',()=>{
 const items=[{id:'first',label:'很长的第一个操作',priority:0},{id:'second',label:'第二个',priority:2},{id:'third',label:'第三个',priority:1}];
 const layout=toolbarLayout(items,260,0,{widths:{first:160,second:70,third:70},overflowWidth:70});assert.equal(layout.labels,true);assert.deepEqual(layout.visible,['second','third']);assert.deepEqual(layout.overflow,['first']);
 assert.deepEqual(toolbarLayout(items,500,0,{widths:{first:160,second:70,third:70},overflowWidth:70}).visible,['first','second','third']);
});
test('write protection stays distinct from read availability and reference snapshots preserve versions',()=>{
 const resource=projectFileResource(info);assert.equal(resource.availability,'available');assert.equal(resource.readOnly,true);assert.equal(resource.version,'v1');assert.deepEqual(resource.ref,info.ref);
 const snapshot=resourceSnapshot([resource]);assert.ok(Object.isFrozen(snapshot)&&Object.isFrozen(snapshot[0])&&Object.isFrozen(snapshot[0].ref));assert.notEqual(snapshot[0].ref,info.ref);
});
test('resource adapter uses the public list/read contracts and refuses stale versions without writing',async()=>{
 const calls:unknown[]=[];const adapter=createFileResourceAdapter({list:async ref=>{calls.push(ref);return {...info,entries:[info]};},readText:async ref=>{calls.push(ref);return {...info,version:'v2',text:'内容'};}});
 const listed=await adapter.list({scope:'workspace',path:'资料'},'组件');assert.equal(listed.resources.length,1);assert.equal(listed.resources[0].version,'v1');await assert.rejects(adapter.read(listed.resources[0]),{code:'UI_RESOURCE_VERSION_CHANGED'});assert.deepEqual(calls,[{scope:'workspace',path:'资料'},info.ref]);
});
