import test from 'node:test';
import assert from 'node:assert/strict';
import {suspendWindowContent} from '../../../applications/sdk/src/overlay-boundary.ts';
test('local modal suspends only its own content, and overlapping cleanup cannot unlock a replacement',()=>{
  const a={inert:false} as HTMLElement,b={inert:false} as HTMLElement;
  const old=suspendWindowContent(a),next=suspendWindowContent(a);
  assert.equal(a.inert,true);assert.equal(b.inert,false);
  old();old();assert.equal(a.inert,true);next();assert.equal(a.inert,false);
});
test('closing a local modal preserves pre-existing inert state',()=>{
  const content={inert:true} as HTMLElement;const release=suspendWindowContent(content);release();assert.equal(content.inert,true);
});
