import test from 'node:test';
import assert from 'node:assert/strict';
import {expandTreeChecks,toggleTreeCheck,treeMixed,filterTree,visibleTree} from '../src/content/tree-model.ts';
const nodes=[{id:'root',label:'空间',children:[{id:'a',label:'设计'},{id:'branch',label:'开发',children:[{id:'b',label:'代码'},{id:'c',label:'测试'}]},{id:'locked',label:'归档',disabled:true,children:[{id:'d',label:'旧稿'}]}]}];
test('cascading tree checks normalize parents, retain disabled selections and allow unchecking one descendant',()=>{
 assert.deepEqual(expandTreeChecks(nodes,['root']),['root','a','branch','b','c']);
 assert.deepEqual(toggleTreeCheck(nodes,['root'],'b'),['a','c']);
 assert.equal(treeMixed(nodes[0],new Set(['a','c'])),true);
 assert.deepEqual(toggleTreeCheck(nodes,['d'],'root'),['root','a','branch','b','c','d']);
 assert.deepEqual(toggleTreeCheck(nodes,['locked','d'],'locked'),['locked','d']);
 assert.deepEqual(expandTreeChecks(nodes,['b','c']),['branch','b','c']);
});
test('filtered presentation never becomes the checked model; full selections survive a filtered action',()=>{
 const filtered=filterTree(nodes,'设计');assert.deepEqual(visibleTree(filtered,new Set(['root'])).map(v=>v.node.id),['root','a']);
 const checked=toggleTreeCheck(nodes,['b'],'a');assert.deepEqual(checked,['a','b']);
 assert.deepEqual(toggleTreeCheck(nodes,checked,'a'),['b']);
 assert.deepEqual(filterTree(nodes,'不存在'),[]);
});
test('checkbox-disabled branches remain boundaries and retain their independent selections',()=>{
 const nodes=[{id:'root',label:'Root',children:[{id:'a',label:'A'},{id:'locked',label:'Locked',disableCheckbox:true,children:[{id:'b',label:'B'}]}]}];
 assert.deepEqual(expandTreeChecks(nodes,['root']),['root','a']);
 assert.deepEqual(toggleTreeCheck(nodes,['b'],'root'),['root','a','b']);
 assert.deepEqual(toggleTreeCheck(nodes,['b'],'locked'),['b']);
 assert.equal(treeMixed(nodes[0],new Set(['b'])),false);
});
