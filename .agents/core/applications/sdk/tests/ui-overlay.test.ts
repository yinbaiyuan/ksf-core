import test from 'node:test';import assert from 'node:assert/strict';
import {OverlayStack} from '../src/controllers/overlay-stack.ts';
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function event(extra:object={}){return {defaultPrevented:false,stopped:0,immediate:0,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped++;},stopImmediatePropagation(){this.immediate++;},...extra};}
test('one Escape closes only the innermost registered interaction and cannot reach its parent',async()=>{
 const stack=new OverlayStack();stack.setActiveOwner('a');let outer=0,inner=0;
 const parent=stack.register({owner:'a',kind:'dialog',onClose:()=>{outer++;parent.dispose();}});
 const child=stack.register({owner:'a',kind:'menu',parent:parent.token,onClose:()=>{inner++;child.dispose();}});
 const key=event();assert.equal(stack.handleEscape(key),true);assert.equal(stack.handleEscape(key),false);await settle();assert.equal(inner,1);assert.equal(outer,0);assert.equal(key.stopped,1);assert.equal(key.immediate,1);assert.equal(stack.top()?.token,parent.token);
 stack.handleEscape(event());await settle();assert.equal(outer,1);assert.equal(stack.top(),null);
});
test('an inactive window cannot handle Escape and global layers precede all window layers',async()=>{
 const stack=new OverlayStack();let a=0,b=0,global=0;stack.setActiveOwner('a');const one=stack.register({owner:'a',kind:'dialog',onClose:()=>{a++;}});stack.register({owner:'b',kind:'dialog',onClose:()=>{b++;}});
 stack.handleEscape(event({isComposing:true}));stack.handleEscape(event({keyCode:229}));assert.equal(a,0);
 const top=stack.register({owner:'workbench',scope:'global',kind:'alert-dialog',onClose:()=>{global++;top.dispose();}});stack.handleEscape(event());await settle();assert.equal(global,1);assert.equal(a,0);assert.equal(b,0);assert.equal(stack.top()?.token,one.token);
 stack.setActiveOwner(null);assert.equal(stack.handleEscape(event()),false);
});
test('escape-disabled or already-closing layers consume the key without invoking a different action',async()=>{
 const stack=new OverlayStack();stack.setActiveOwner('a');let parent=0,child=0;stack.register({owner:'a',kind:'dialog',onClose:()=>{parent++;}});stack.register({owner:'a',kind:'alert-dialog',policy:{escape:false},onClose:()=>{child++;}});const key=event();assert.equal(stack.handleEscape(key),true);await settle();assert.equal(parent,0);assert.equal(child,0);assert.equal(key.defaultPrevented,true);
});
test('repeated close requests merge, failure preserves a layer and a later accepted request waits for actual disposal',async()=>{
 const stack=new OverlayStack();let calls=0,resolve!:(v:boolean)=>void;const gate=new Promise<boolean>(r=>{resolve=r;});const item=stack.register({owner:'a',kind:'dialog',onClose:()=>{calls++;return calls===1?gate:undefined;}});
 const first=stack.requestClose(item.token,'action'),second=stack.requestClose(item.token,'escape');assert.equal(first,second);resolve(false);assert.equal(await first,false);assert.equal(calls,1);assert.equal(stack.layer(item.token)?.closing,false);assert.equal(await stack.requestClose(item.token,'action'),true);assert.equal(calls,2);assert.equal(stack.layer(item.token)?.closing,true);item.dispose();assert.equal(stack.layer(item.token),undefined);
});
test('scoped access cannot claim another owner, register globally or release another window',()=>{
 const stack=new OverlayStack(),a=stack.forOwner('a'),b=stack.forOwner('b'),one=a.register({kind:'dialog',onClose(){}});assert.throws(()=>b.register({owner:'a',kind:'dialog',onClose(){}} as never),{code:'UI_OVERLAY_INVALID'});assert.throws(()=>b.register({scope:'global',kind:'dialog',onClose(){}} as never),{code:'UI_OVERLAY_INVALID'});b.release(one.token);assert.ok(stack.layer(one.token));assert.equal(a.getSnapshot(),a.getSnapshot());assert.equal(b.getSnapshot().length,0);
 assert.throws(()=>b.register({kind:'popover',parent:one.token,onClose(){}}),{code:'UI_OVERLAY_INVALID'});
});
test('parent and owner disposal release descendants and close requests cannot resurrect stale layers',async()=>{
 const stack=new OverlayStack();let reason='';const parent=stack.register({owner:'a',kind:'dialog',onClose(){}});const child=stack.register({owner:'a',kind:'popover',parent:parent.token,onClose:r=>{reason=r;}});parent.dispose();await settle();assert.equal(reason,'parent-removed');assert.equal(stack.layer(child.token),undefined);assert.equal(await stack.requestClose(child.token,'action'),false);stack.register({owner:'b',kind:'dialog',onClose(){}});stack.removeOwner('b');assert.equal(stack.getSnapshot().length,0);
});
