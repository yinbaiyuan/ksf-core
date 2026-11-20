import test from 'node:test';
import assert from 'node:assert/strict';
import {positionFloating} from '../src/primitives/position-model.ts';
test('floating placements flip at their own window edge and remain inside that window',()=>{
 const bounds={left:300,top:200,width:500,height:400},panel={width:160,height:90};
 const bottom=positionFloating({left:450,top:570,width:40,height:24},panel,bounds,'bottom-start');assert.equal(bottom.side,'top');
 const left=positionFloating({left:305,top:300,width:40,height:24},panel,bounds,'left');assert.equal(left.side,'right');
 for(const placement of ['top','bottom','left','right','top-start','top-end','bottom-start','bottom-end','left-start','left-end','right-start','right-end'])for(const x of [300,450,780])for(const y of [200,350,570]){const result=positionFloating({left:x,top:y,width:30,height:24},panel,bounds,placement);assert.ok(result.left>=308&&result.left+panel.width<=792);assert.ok(result.top>=208&&result.top+panel.height<=592);}
});
