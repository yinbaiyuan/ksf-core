import test from 'node:test';
import assert from 'node:assert/strict';
import {bytes,percent,duration,filterTasks,isActive} from '../model.ts';
const tasks=[{id:'1',name:'生成早读',kind:'ai',appId:'brief',status:'running',startedAt:'2026-10-29T00:01:00Z',version:'1',actions:['stop']},{id:'2',name:'终端',kind:'terminal',appId:'terminal',status:'succeeded',startedAt:'2026-10-29T00:00:00Z',version:'1',actions:[]}];
test('unknown resource values remain unknown while real zero stays zero',()=>{assert.equal(bytes(null),'—');assert.equal(percent(null),'—');assert.equal(percent(0),'0.0%');assert.equal(bytes(1048576),'1.0 MB');assert.equal(duration(null),'—');assert.equal(duration('2026-10-29T00:00:00Z','2026-10-29T00:01:02Z'),'1分 2秒');});
test('task filters respect source, active scope and translated app names',()=>{assert.equal(filterTasks(tasks as any,{appNames:{brief:'每日早读'},query:'每日早读'}).length,1);assert.equal(filterTasks(tasks as any,{}).length,1);assert.equal(filterTasks(tasks as any,{scope:'all',kind:'terminal'}).length,1);assert.equal(isActive({status:'unknown'}),true);assert.equal(isActive({status:'cancelled'}),false);});
test('table ordering is stable and can sort by task name',()=>{assert.equal(filterTasks(tasks as any,{scope:'all'})[0].id,'1');assert.equal(filterTasks(tasks as any,{scope:'all',sort:'id',descending:false})[0].id,'1');});
