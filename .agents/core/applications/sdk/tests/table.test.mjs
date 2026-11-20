import test from 'node:test';
import assert from 'node:assert/strict';
import {processTableRows} from '../src/content/table-model.ts';
test('table processing filters before sorting, preserves ties and never changes the application rows',()=>{
 const rows=[{id:'a',count:3,status:'open'},{id:'b',count:2,status:'done'},{id:'c',count:3,status:'open'},{id:'d',count:1,status:'open'}];
 const columns=[{id:'count',sort:(a,b)=>a.count-b.count},{id:'status',filter:{options:[],match:(row,value)=>row.status===value}}];
 assert.deepEqual(processTableRows(rows,columns,{column:'count',direction:'ascending'},{status:'open'}).map(row=>row.id),['d','a','c']);
 assert.deepEqual(processTableRows(rows,columns,{column:'count',direction:'descending'},{}).map(row=>row.id),['a','c','b','d']);
 assert.deepEqual(processTableRows(rows,columns,null,{status:'absent'}),[]);
 assert.deepEqual(rows.map(row=>row.id),['a','b','c','d']);
});
