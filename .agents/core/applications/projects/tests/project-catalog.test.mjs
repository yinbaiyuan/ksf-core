import test from 'node:test';import assert from 'node:assert/strict';
import {catalogProjects,recordProjectVisit,mergeRecentProjects,validRecentProjects,RECENT_PROJECT_LIMIT} from '../project-catalog-model.js';
const p=name=>({name,title:name,scope:'current'}),at=n=>new Date(n).toISOString();
test('项目固定组稳定排列，其余按真实访问排序，未访问项目按名称排列且不重复',()=>{
 const all=[p('C'),p('A'),p('B'),p('D')],view=catalogProjects(all,['current:B'],{'current:C':at(1000),'current:A':at(2000),'current:B':at(3000)});
 assert.deepEqual(view.pinned.map(p=>p.name),['B']);assert.deepEqual(view.others.map(p=>p.name),['A','C','D']);assert.equal(new Set([...view.pinned,...view.others].map(p=>p.name)).size,4);
});
test('延迟或重复回执不倒退最近访问，并保留旧字段；只保留有限访问记录',()=>{
 const old={schemaVersion:1,pinnedProjects:['current:X'],tab:'tasks'},one=recordProjectVisit(old,'current:A',at(2000));
 assert.equal(recordProjectVisit(one,'current:A',at(1000)),one);assert.equal(recordProjectVisit(one,'current:A',at(2000)),one);assert.deepEqual(one.pinnedProjects,old.pinnedProjects);assert.equal(one.tab,'tasks');assert.equal(old.recentProjects,undefined);
 const many=Object.fromEntries(Array.from({length:RECENT_PROJECT_LIMIT+2},(_,i)=>['current:P'+i,at(i+1)]));assert.equal(Object.keys(mergeRecentProjects(many)).length,RECENT_PROJECT_LIMIT);assert.equal(mergeRecentProjects(many)['current:P0'],undefined);
 assert.equal(mergeRecentProjects({'current:A':at(4000)},{'current:A':at(1000)})['current:A'],at(4000));
});
test('旧设置无需迁移，损坏的访问记录与非法项目键不能当作空记录',()=>{
 assert.equal(validRecentProjects(undefined),true);assert.equal(validRecentProjects({}),true);assert.equal(validRecentProjects({'current:A':at(1000)}),true);
 for(const value of [null,[],{'current:A':'坏时间'},{'current:../A':at(1000)}])assert.equal(validRecentProjects(value),false);
});
