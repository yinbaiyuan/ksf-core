import test from 'node:test';import assert from 'node:assert/strict';
import {transferLists,transferSelection,moveTransfer,transferRange} from '../src/controls/transfer-model.ts';
const options=[{value:'a',label:'Alpha'},{value:'b',label:'Beta'},{value:'c',label:'Gamma',disabled:true},{value:'d',label:'Delta'}];
test('transfer keeps application target order, hidden IDs and prepends valid moves',()=>{
 assert.deepEqual(transferLists(options,['d','unknown','b']).target.map(x=>x.value),['d','b']);
 assert.deepEqual(moveTransfer(['d','unknown'],['b','a','c','d','missing'],options,'add'),['b','a','d','unknown']);
 assert.deepEqual(moveTransfer(['d','unknown','c','b'],['a','b','c','unknown'],options,'remove'),['d','unknown','c']);
});
test('stale and cross-side transfer selections cannot move disabled or absent data',()=>{
 assert.deepEqual(transferSelection(['a','a','c','missing'],options),['a']);
 assert.deepEqual(moveTransfer(['b'],['b','missing','c'],options,'add'),['b']);
 assert.deepEqual(moveTransfer(['b'],['a'],options,'remove'),['b']);
});
test('shift transfer selection crosses filtered rows while skipping disabled rows and preserving hidden selection',()=>{
 assert.deepEqual(transferRange(['hidden'],options,'a','d',true,true),['hidden','a','b','d']);
 assert.deepEqual(transferRange(['hidden','a','b','d'],options,'d','a',false,true),['hidden']);
 assert.deepEqual(transferRange(['hidden'],options,'removed','b',true,true),['hidden','b']);
});
