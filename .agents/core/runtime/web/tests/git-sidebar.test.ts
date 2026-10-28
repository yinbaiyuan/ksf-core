import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sidebarMax, sidebarWidth } from '../src/apps/git-sidebar-model.ts';
test('sidebar limits preserve working area and remain usable in narrow containers',()=>{
  assert.equal(sidebarMax(1280,680,160,420),420);
  assert.equal(sidebarMax(960,680,160,420),280);
  assert.equal(sidebarMax(780,480,160,360),300);
  assert.equal(sidebarMax(400,480,160,360),160);
});
test('saved widths tolerate corrupt storage and clamp without destroying a wider preference',()=>{
  for(const value of [null,{},'300',NaN,Infinity,-Infinity])assert.equal(sidebarWidth(value,220,160,420),220);
  assert.equal(sidebarWidth(-100,220,160,420),160);
  assert.equal(sidebarWidth(300,220,160,280),280);
  assert.equal(sidebarWidth(300,220,160,420),300);
  assert.equal(sidebarWidth(100000,220,160,420),420);
});
