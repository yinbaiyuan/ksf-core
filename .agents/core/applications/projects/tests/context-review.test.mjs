import test from 'node:test';
import assert from 'node:assert/strict';
import {contextFileNodes,contextFileReview} from '../context-scopes.js';

const scopes=[{root:'p',objectPath:'p/project.md'},{root:'p/m',objectPath:'p/m/milestone.md'},{root:'p/m/t',objectPath:'p/m/t/task.md'}];
const file=(path,reason=null,unread=null)=>({path,kind:'file',name:path.split('/').at(-1),reason,unread});

test('pending files aggregate within each owner and its folders, excluding managed sources',()=>{
  const entries=[file('p/说明.md','new','p1'),file('p/m/说明.md','updated','m1'),{path:'p/m/t/资料',kind:'directory'},file('p/m/t/资料/说明.md','updated','t1'),file('p/m/t/资料/新增.md','new','t2'),file('p/m/t/资料/已读.md'),file('p/m/t/task.md','updated','managed')];
  const before=structuredClone(entries),excluded=new Set(['p/m/t/task.md']);
  const {counts,notices}=contextFileReview(entries,scopes,excluded);
  assert.equal(counts.get('p'),1);assert.equal(counts.get('p/m'),1);assert.equal(counts.get('p/m/t'),2);assert.equal(counts.get('p/m/t/资料'),2);
  assert.equal(notices.get('p/m/t/资料/说明.md'),'modified');assert.equal(notices.get('p/m/t/资料/新增.md'),'new');assert.equal(notices.has('p/m/t/task.md'),false);
  assert.deepEqual(entries,before);
});

test('acknowledging an exact token clears counts, while filenames and stale reasons do not classify files',()=>{
  const entries=[file('p/已修改-M.md','updated',null),file('p/很旧的文件.md','new','token'),file('p/普通.md','updated','next')];
  assert.equal(contextFileReview(entries,scopes).counts.get('p'),2);
  entries[1].unread=null;
  const next=contextFileReview(entries,scopes);
  assert.equal(next.counts.get('p'),1);assert.equal(next.notices.has('p/已修改-M.md'),false);assert.equal(next.notices.get('p/普通.md'),'modified');
  entries[2].unread=null;assert.equal(contextFileReview(entries,scopes).counts.size,0);
});

test('deleted descendants of a removed folder remain reachable and counted without synthetic directories',()=>{
  const entries=[file('p/m/t/已删除目录/原件.md','deleted','d1')],before=structuredClone(entries);
  const nodes=contextFileNodes(entries,new Set(),scopes)('p/m/t');
  assert.deepEqual(nodes,[{id:entries[0].path,label:'已删除目录/原件.md',children:undefined}]);
  const {counts,notices}=contextFileReview(entries,scopes);
  assert.equal(counts.get('p/m/t'),1);assert.equal(counts.has('p'),false);assert.equal(notices.get(entries[0].path),'deleted');assert.deepEqual(entries,before);
});

test('surviving folders keep deleted children at the closest real ancestor',()=>{
  const entries=[{path:'p/m/t/资料',kind:'directory'},file('p/m/t/资料/已删/原件.md','deleted','d1'),file('p/m/t/资料/保留.md')];
  const nodes=contextFileNodes(entries,new Set(),scopes)('p/m/t');
  assert.equal(nodes[0].children[0].label,'已删/原件.md');assert.equal(nodes[0].children[1].label,'保留.md');
  assert.equal(contextFileReview(entries,scopes).counts.get('p/m/t/资料'),1);
});
