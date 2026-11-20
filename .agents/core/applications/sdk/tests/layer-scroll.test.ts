import test from 'node:test';
import assert from 'node:assert/strict';
import {trackLayerScroll} from '../src/primitives/layer-scroll.ts';

const surface=(children:unknown[]=[])=>({contains:(node:unknown)=>children.includes(node)});
const scroll=(target:unknown)=>({target} as Event);
const rect=(top:number)=>({left:40,top,width:160,height:32} as DOMRect);

test('a queued pre-open scroll and unrelated window scrolling preserve a measured layer',async()=>{
 let box=rect(100),closed=0;
 const event=scroll({window:'other'}),pending=Promise.resolve().then(()=>tracker.handle(event));
 box=rect(60); // The browser revealed the field before its pointer handler opened it.
 const tracker=trackLayerScroll({getBoundingClientRect:()=>box},surface(),()=>{},()=>closed++);
 tracker.measured(box);await pending;tracker.handle(scroll({window:'same',unrelated:true}));
 assert.equal(closed,0);
});
test('scrolling that moves the anchor still dismisses its layer',()=>{
 let box=rect(100),closed=0;
 const tracker=trackLayerScroll({getBoundingClientRect:()=>box},surface(),()=>{},()=>closed++);
 box=rect(88);tracker.handle(scroll({ancestor:true}));assert.equal(closed,1);
});
test('a sibling scroller cannot dismiss a layer after its trigger changes size',()=>{
 let box=rect(100),closed=0;const ancestor={},sibling={};
 const tracker=trackLayerScroll({getBoundingClientRect:()=>box},surface(),()=>{},()=>closed++,undefined,target=>target===ancestor);
 box={...box,left:60,width:180};tracker.handle(scroll(sibling));assert.equal(closed,0);
 tracker.handle(scroll(ancestor));assert.equal(closed,1);
});
test('content and trigger scrolls remeasure instead of dismissing their layer',()=>{
 const content={},input={},panel=surface([content]),trigger=surface([input]);let measured=0,closed=0;
 const tracker=trackLayerScroll({getBoundingClientRect:()=>rect(100)},panel,()=>measured++,()=>closed++,trigger);
 tracker.handle(scroll(content));tracker.handle(scroll(input));assert.equal(measured,2);assert.equal(closed,0);
});
