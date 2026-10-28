import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuPosition } from '../src/components/ui/context-menu-model.ts';
test('context menus stay reachable at viewport edges and keyboard anchors',()=>{
  for(const [width,height] of [[600,400],[960,800],[1600,1000]])for(const [x,y] of [[0,0],[width,height],[-30,-20],[width/2,height/2]]) {
    const position=menuPosition(x,y,240,280,width,height);
    assert.ok(position.left>=8&&position.top>=8);
    assert.ok(position.left+240<=width-8&&position.top+280<=height-8);
  }
  assert.deepEqual(menuPosition(100,120,240,280,1280,800),{left:100,top:120});
});
