import test from 'node:test';import assert from 'node:assert/strict';import {relateLayer} from '../src/primitives/layer-relations.ts';
interface Surface {ownerDocument:object;isConnected:boolean;inert:boolean;hidden:boolean;parent?:Surface;contains(target:unknown):boolean;getAttribute(name:string):string|null}
function surface(doc:object,parent?:Surface):Surface{const item:Surface={ownerDocument:doc,isConnected:true,inert:false,hidden:false,parent,contains(target:unknown){for(let node=target as typeof item|undefined;node;node=node.parent)if(node===item)return true;return false;},getAttribute(name:string){return name==='aria-hidden'&&item.hidden?'true':null;}};return item;}
const html=(value:unknown)=>value as HTMLElement;
test('a portaled select remains inside its logical parent and Escape targets the child first',()=>{
 const doc={},root=surface(doc),trigger=surface(doc,root),parent=surface(doc,root),field=surface(doc,parent),child=surface(doc,root),option=surface(doc,child),a=relateLayer(html(parent),html(trigger),'one'),b=relateLayer(html(child),html(field),'one');
 assert.equal(parent.contains(option),false);assert.equal(a.contains(html(option)),true);assert.equal(a.receivesEscape(html(field)),false);assert.equal(b.receivesEscape(html(field)),true);
 child.hidden=true;assert.equal(a.receivesEscape(html(field)),true);b.dispose();a.dispose();
});
test('unrelated owners never become a family even when a custom root is nested in another surface',()=>{
 const doc={},parent=surface(doc),trigger=surface(doc,parent),child=surface(doc),option=surface(doc,child),a=relateLayer(html(parent),html(surface(doc)),'one'),b=relateLayer(html(child),html(trigger),'two');
 assert.equal(a.contains(html(option)),false);assert.equal(a.receivesEscape(html(trigger)),false);assert.equal(b.receivesEscape(html(trigger)),true);b.dispose();a.dispose();
});
test('disposing a layer removes its stale portal and promotes a surviving descendant',()=>{
 const doc={},parent=surface(doc),trigger=surface(doc,parent),child=surface(doc),option=surface(doc,child),a=relateLayer(html(parent),html(surface(doc)),'one'),b=relateLayer(html(child),html(trigger),'one');
 a.dispose();assert.equal(a.contains(html(option)),false);assert.equal(b.receivesEscape(html(option)),true);b.dispose();assert.equal(b.contains(html(option)),false);
});
