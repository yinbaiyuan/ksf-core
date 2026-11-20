import test from 'node:test';
import assert from 'node:assert/strict';
import {cascadePath, cascadeSearch} from '../src/controls/cascade-model.ts';

const options = [
  {value:'east',label:'East',children:[{value:'city',label:'City',children:[{value:'lake',label:'Lake'}]}]},
  {value:'closed',label:'Closed',disabled:true,children:[{value:'child',label:'Child'}]},
];

test('a cascader path cannot bypass a disabled ancestor or use a stale branch', () => {
  assert.equal(cascadePath(options,['closed','child']).disabled,true);
  assert.equal(cascadePath(options,['east','missing']).complete,false);
  assert.deepEqual(cascadePath(options,['east','city','lake']).nodes.map(node=>node.label),['East','City','Lake']);
});

test('path search retains parent names and disabled boundaries without duplicating parent entries', () => {
  assert.deepEqual(cascadeSearch(options),[
    {path:['east','city','lake'],names:['East','City','Lake'],disabled:false},
    {path:['closed','child'],names:['Closed','Child'],disabled:true},
  ]);
  assert.equal(cascadeSearch(options,true).length,5);
});

test('dynamic branch replacement invalidates old leaves while preserving the parent path', () => {
  const loaded=[{value:'east',label:'East',children:[{value:'new',label:'New city'}]}];
  assert.equal(cascadePath(loaded,['east']).complete,true);
  assert.equal(cascadePath(loaded,['east','city']).complete,false);
  assert.deepEqual(cascadeSearch(loaded).map(entry=>entry.path),[['east','new']]);
});
