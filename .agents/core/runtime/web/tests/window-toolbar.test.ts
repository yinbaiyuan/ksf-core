import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolbarLayout } from '../src/window-toolbar-model.ts';
const commands=[{id:'commit',label:'提交',priority:10},{id:'pull',label:'拉取',priority:8},{id:'push',label:'推送',priority:8},{id:'branch',label:'分支',priority:4},{id:'stash',label:'贮藏',priority:2},{id:'settings',label:'设置',priority:1},{id:'refresh',label:'刷新',priority:5}];
test('toolbar keeps icon captions and overflows lower priority commands in stable order',()=>{
 const wide=toolbarLayout(commands,1000,180);assert.equal(wide.labels,true);assert.deepEqual(wide.overflow,[]);
 const compact=toolbarLayout(commands,500,180);assert.equal(compact.labels,true);assert.deepEqual(compact.visible,['commit','pull','push','branch','refresh']);assert.deepEqual(compact.overflow,['stash','settings']);
 const narrow=toolbarLayout(commands,330,120);assert.equal(narrow.labels,true);assert.deepEqual(narrow.visible,['commit','pull','push']);assert.deepEqual(narrow.overflow,['branch','stash','settings','refresh']);
});
test('all commands remain reachable even when only overflow fits or width is initially unknown',()=>{
 for(const width of [0,20,100,150]){const layout=toolbarLayout(commands,width);assert.deepEqual([...layout.visible,...layout.overflow].sort(),commands.map(command=>command.id).sort());assert.equal(new Set([...layout.visible,...layout.overflow]).size,commands.length);}
});
test('measured Chinese captions and badges fit with a captioned overflow trigger',()=>{
 const items=[{id:'create',label:'新建项目',priority:10},{id:'export',label:'导出完整配置摘要',priority:1},{id:'refresh',label:'刷新',priority:6}];
 const widths:Record<string,number>={create:104,export:200,refresh:80},overflowWidth=76;
 const compact=toolbarLayout(items,500,120,{widths,overflowWidth});
 assert.deepEqual(compact.visible,['create','refresh']);assert.deepEqual(compact.overflow,['export']);
 assert.ok(compact.visible.reduce((sum,id)=>sum+widths[id],overflowWidth)<=500-120-12);
 const narrow=toolbarLayout(items,200,80,{widths,overflowWidth});
 assert.deepEqual(narrow.visible,[]);assert.deepEqual(narrow.overflow,items.map(item=>item.id));
 assert.deepEqual(toolbarLayout(items,400,0,{widths,overflowWidth}).overflow,[]);
});
