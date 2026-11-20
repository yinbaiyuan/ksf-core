import test from 'node:test';
import assert from 'node:assert/strict';
import {WindowGeometryInteractions} from '../src/window-geometry.ts';
const escape=(extra={})=>({key:'Escape',isComposing:false,keyCode:27,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},stopped:false,...extra});
test('geometry Escape restores once, consumes repeated Escape until pointer release, and never commits cancelled bounds',()=>{
 const interactions=new WindowGeometryInteractions();let restored=0;const handle=interactions.begin('window-a',()=>restored++),first=escape();
 assert.equal(interactions.escape(first as unknown as KeyboardEvent,'window-a'),true);assert.equal(first.stopped,true);assert.equal(restored,1);assert.equal(handle.cancelled,true);
 assert.equal(interactions.escape(escape() as unknown as KeyboardEvent,'window-a'),true);assert.equal(restored,1);assert.equal(handle.finish(),true);
 assert.equal(interactions.escape(escape() as unknown as KeyboardEvent,'window-a'),false);
});
test('IME, handled keys and another active owner cannot cancel the gesture; a later gesture is independent',()=>{
 const interactions=new WindowGeometryInteractions();let restored=0;const a=interactions.begin('a',()=>restored++);
 for(const extra of [{isComposing:true},{keyCode:229},{defaultPrevented:true}])assert.equal(interactions.escape(escape(extra) as unknown as KeyboardEvent,'a'),false);
 assert.equal(interactions.escape(escape() as unknown as KeyboardEvent,'b'),false);assert.equal(a.finish(),false);assert.equal(restored,0);
 const b=interactions.begin('b',()=>restored++);interactions.escape(escape() as unknown as KeyboardEvent,'b');assert.equal(b.finish(),true);assert.equal(restored,1);
});
test('replacing an unfinished pointer interaction restores it without allowing its late completion to release the new interaction',()=>{
 const interactions=new WindowGeometryInteractions(),events:string[]=[];const a=interactions.begin('a',()=>events.push('a'));
 const b=interactions.begin('b',()=>events.push('b'));assert.equal(a.cancelled,true);assert.equal(a.finish(),true);
 interactions.escape(escape() as unknown as KeyboardEvent,'b');assert.deepEqual(events,['a','b']);assert.equal(b.finish(),true);
});
