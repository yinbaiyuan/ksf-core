import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateSplit,resizeSplitPair} from '../src/layout/split-model.ts';
test('split allocation keeps proportions, constraints, collapsed panels and tiny containers within available space',()=>{
  assert.deepEqual(allocateSplit(900,[20,50,30],[{},{},{}]),[180,450,270]);
  assert.deepEqual(allocateSplit(600,[1,1],[{maxSize:160},{}]),[160,440]);
  assert.deepEqual(allocateSplit(600,[1,1,1],[{},{},{}],[true,false,false]),[0,300,300]);
  assert.deepEqual(allocateSplit(100,[1,1],[{minSize:80},{minSize:120}]),[40,60]);
  assert.deepEqual(allocateSplit(600,[1,1],[{maxSize:100},{maxSize:120}]),[100,120]);
  for(let width=0;width<=1200;width+=7){const result=allocateSplit(width,[2,5,3],[{minSize:90,maxSize:240},{minSize:140},{minSize:100,maxSize:260}]);assert.ok(result.every(Number.isFinite));assert.ok(result.every(v=>v>=0));assert.ok(result.reduce((a,b)=>a+b,0)<=width+1e-8);}
});
test('resizing an adjacent pair preserves other panes, total size and minimum / maximum boundaries',()=>{
  const panes=[{minSize:100,maxSize:240},{minSize:180},{minSize:100}];
  assert.deepEqual(resizeSplitPair([160,300,140],0,300,panes),[240,220,140]);
  assert.deepEqual(resizeSplitPair([160,300,140],0,-300,panes),[100,360,140]);
  assert.deepEqual(resizeSplitPair([40,60],0,20,[{minSize:80},{minSize:120}]),[40,60]);
});
