import test from 'node:test';
import assert from 'node:assert/strict';
import {validDate,addDays,addMonths,monthGrid} from '../src/date/date-model.ts';
test('ISO dates reject nonexistent dates and month arithmetic clamps leap years without timezone drift',()=>{
 assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2026-04-31'),false);assert.equal(validDate('0001-01-01'),true);assert.equal(validDate('0000-01-01'),false);
 assert.equal(addDays('2026-03-08',1),'2026-03-09');assert.equal(addDays('2026-11-01',-1),'2026-10-31');assert.equal(addMonths('2024-01-31',1),'2024-02-29');assert.equal(addMonths('2024-02-29',12),'2025-02-28');assert.equal(addMonths('2026-12-31',1),'2027-01-31');
});
test('calendar grids have 42 consecutive dates and respect Monday / Sunday starts',()=>{
 const monday=monthGrid('2026-11',1),sunday=monthGrid('2026-11',0);assert.equal(monday.length,42);assert.equal(monday[0],'2026-10-26');assert.equal(sunday[0],'2026-11-01');for(let i=1;i<monday.length;i++)assert.equal(monday[i],addDays(monday[i-1],1));
});
