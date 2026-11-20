import test from 'node:test';import assert from 'node:assert/strict';
import {CommandRegistry} from '../src/controllers/command-registry.ts';
import {createOverlayCoordinator} from '../src/overlay-coordinator.ts';
import {createSurfaceCapabilities} from '../src/apps/surface-capabilities.ts';
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function key(extra:object={}){return {key:'s',metaKey:true,ctrlKey:false,altKey:false,shiftKey:false,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},stopImmediatePropagation(){},...extra};}
test('one key chooses the innermost enabled scope and a disabled command never falls through',async()=>{
 const registry=new CommandRegistry({platform:'darwin'});let host=0,window=0,local=0;
 registry.register({id:'host-save',label:'Host',shortcut:'Primary+S',scope:{kind:'global'},execute:()=>{host++;}});
 registry.register({id:'window-save',label:'Window',shortcut:'Primary+S',scope:{kind:'window',owner:'a'},execute:()=>{window++;}});
 const def={id:'editor-save',label:'Save',shortcut:'Primary+S',scope:{kind:'local' as const,owner:'a',id:'editor'},enabled:false,execute:()=>{local++;}},handle=registry.register(def);
 const first=key();assert.equal(registry.handle(first,{activeOwner:'a',scopePath:['editor']}),true);assert.equal(registry.handle(first,{activeOwner:'a',scopePath:['editor']}),false);await settle();assert.deepEqual([host,window,local],[0,0,0]);
 handle.update({...def,enabled:true});registry.handle(key(),{activeOwner:'a',scopePath:['editor']});await settle();assert.deepEqual([host,window,local],[0,0,1]);handle.dispose();registry.handle(key(),{activeOwner:'a'});await settle();assert.deepEqual([host,window,local],[0,1,1]);
});
test('inactive windows do not execute and modal scope excludes underlying window and host commands',async()=>{
 const registry=new CommandRegistry({platform:'darwin'});let a=0,b=0,global=0,overlay=0;registry.register({id:'host',label:'Host',shortcut:'Primary+S',scope:{kind:'global'},execute:()=>{global++;}});
 for(const owner of ['a','b'])registry.register({id:'save',label:'Save',shortcut:'Primary+S',scope:{kind:'window',owner},execute:()=>{if(owner==='a')a++;else b++;}});
 registry.handle(key(),{activeOwner:'b'});await settle();assert.deepEqual([a,b,global],[0,1,0]);
 const token=Symbol('global-dialog');registry.register({id:'dialog-save',label:'Dialog',shortcut:'Primary+S',scope:{kind:'overlay',owner:'workbench',layer:token},execute:()=>{overlay++;}});registry.handle(key(),{activeOwner:'a',overlay:{token,owner:'workbench',scope:'global'}});await settle();assert.deepEqual([a,b,global,overlay],[0,1,0,1]);
});
test('composition, AltGraph, native editing and reserved shortcuts retain their native behavior',async()=>{
 const registry=new CommandRegistry({platform:'darwin'});let calls=0;registry.register({id:'save',label:'Save',shortcut:'Primary+S',scope:{kind:'window',owner:'a'},allowEditable:true,execute:()=>{calls++;}});
 for(const event of [key({isComposing:true}),key({keyCode:229}),key({getModifierState:(name:string)=>name==='AltGraph'})])assert.equal(registry.handle(event,{activeOwner:'a',editable:true}),false);
 assert.throws(()=>registry.register({id:'quit',label:'Quit',shortcut:'Primary+W',scope:{kind:'global'},execute(){}}),{code:'UI_COMMAND_INVALID'});
 registry.register({id:'copy',label:'Copy',shortcut:'Primary+C',scope:{kind:'window',owner:'a'},allowEditable:true,execute:()=>{calls++;}});assert.equal(registry.handle(key({key:'c'}),{activeOwner:'a',editable:true}),false);await settle();assert.equal(calls,0);
 registry.handle(key(),{activeOwner:'a',editable:true});await settle();assert.equal(calls,1);
});
test('input-ineligible local commands do not accidentally select a different global action',async()=>{
 const registry=new CommandRegistry({platform:'darwin'});let count=0;registry.register({id:'global',label:'Global',shortcut:'Primary+S',scope:{kind:'global'},allowEditable:true,execute:()=>{count++;}});registry.register({id:'local',label:'Local',shortcut:'Primary+S',scope:{kind:'local',owner:'a',id:'editor'},execute:()=>{count++;}});assert.equal(registry.handle(key(),{activeOwner:'a',scopePath:['editor'],editable:true}),false);await settle();assert.equal(count,0);
});
test('scoped registrations derive labels, update safely, reject duplicate keys and cannot claim global ownership',()=>{
 const registry=new CommandRegistry({platform:'win32'}),app=registry.forOwner('a');const def={id:'save',label:'Save',shortcut:'Primary+S',execute(){}};const h=app.register(def);assert.equal(app.describe('save')?.shortcut,'Control+S');assert.equal(app.describe('save')?.displayShortcut,'Ctrl+S');h.update({...def,label:'保存',enabled:false});assert.equal(app.describe('save')?.label,'保存');assert.equal(app.describe('save')?.enabled,false);assert.throws(()=>app.register({...def,id:'duplicate'}),{code:'UI_COMMAND_INVALID'});assert.throws(()=>app.register({...def,id:'global',scope:{kind:'global'}}),{code:'UI_COMMAND_INVALID'});assert.throws(()=>app.register({...def,id:'ksf.fake'}),{code:'UI_COMMAND_INVALID'});h.dispose();assert.equal(app.describe('save'),undefined);h.update(def);assert.equal(app.describe('save'),undefined);
});
test('disposal or disabling before dispatch cancels a queued callback and repeat cannot launch a second operation',async()=>{
 const registry=new CommandRegistry({platform:'darwin'});let count=0;const def={id:'save',label:'Save',shortcut:'Primary+S',scope:{kind:'window' as const,owner:'a'},execute:()=>{count++;}},h=registry.register(def);registry.handle(key(),{activeOwner:'a'});h.dispose();await settle();assert.equal(count,0);const next=registry.register(def);registry.handle(key(),{activeOwner:'a'});registry.handle(key({repeat:true}),{activeOwner:'a'});await settle();assert.equal(count,1);next.update({...def,execute:()=>{throw Error('expected command failure');}});registry.handle(key(),{activeOwner:'a'});await settle();assert.equal(registry.getSnapshot()[0].error,'expected command failure');assert.equal(registry.getSnapshot()[0].busy,false);
});


test('a nonmodal menu keeps its owning window command available and all invocation paths share one busy operation',async()=>{
 const registry=new CommandRegistry({platform:'darwin'}),token=Symbol('menu');let resolve!:()=>void,count=0;const gate=new Promise<void>(r=>{resolve=r;}),context={activeOwner:'a',overlay:{token,owner:'a',scope:'window' as const,modal:false,kind:'menu'}};const app=registry.forOwner('a',()=>context);app.register({id:'save',label:'Save',shortcut:'Primary+S',execute:async()=>{count++;await gate;}});assert.equal(registry.handle(key(),context),true);assert.equal((await app.invoke('save')).status,'busy');await settle();assert.equal(count,1);resolve();await settle();assert.equal((await app.invoke('save')).status,'executed');assert.equal(count,2);
});
test('queued commands retain the original action callback and reject a subsequently disabled action',async()=>{
 const registry=new CommandRegistry({platform:'darwin'});let original=0,replacement=0;const def={id:'save',label:'Save',shortcut:'Primary+S',scope:{kind:'window' as const,owner:'a'},execute:()=>{original++;}},h=registry.register(def);const pending=registry.invoke('a','save',{activeOwner:'a'});h.update({...def,execute:()=>{replacement++;}});assert.equal((await pending).status,'executed');assert.deepEqual([original,replacement],[1,0]);const next=registry.invoke('a','save',{activeOwner:'a'});h.update({...def,enabled:false});assert.equal((await next).status,'disabled');assert.deepEqual([original,replacement],[1,0]);
});
test('SDK lease disposal unregisters interactions and stale facades cannot register or release replacement layers',async()=>{
 const registry=new CommandRegistry({platform:'darwin'}),coordinator=createOverlayCoordinator();const sdk=createSurfaceCapabilities({overlays:coordinator.forOwner('a'),commands:registry.forOwner('a'),isAlive:()=>true});sdk.commands!.register({id:'save',label:'Save',shortcut:'Primary+S',execute(){}});sdk.overlays.register!({kind:'dialog',onClose(){}});assert.equal(registry.getSnapshot().length,1);assert.equal(coordinator.stack.getSnapshot().length,1);sdk.dispose();assert.equal(registry.getSnapshot().length,0);assert.equal(coordinator.stack.getSnapshot().length,0);assert.throws(()=>sdk.commands!.register({id:'late',label:'Late',shortcut:'Primary+S',execute(){}}),{code:'UI_SURFACE_DISPOSED'});assert.throws(()=>sdk.overlays.register!({kind:'dialog',onClose(){}}),{code:'UI_SURFACE_DISPOSED'});assert.equal((await sdk.commands!.invoke('save')).status,'unavailable');const next=coordinator.forOwner('a').register!({kind:'dialog',onClose(){}});sdk.overlays.release(next.token);assert.ok(coordinator.stack.layer(next.token));
});
test('reentrant disposal during registration cannot leak a newly published command',()=>{
 const registry=new CommandRegistry({platform:'darwin'}),coordinator=createOverlayCoordinator(),sdk=createSurfaceCapabilities({overlays:coordinator.forOwner('a'),commands:registry.forOwner('a'),isAlive:()=>true});const off=registry.subscribe(()=>sdk.dispose());sdk.commands!.register({id:'save',label:'Save',shortcut:'Primary+S',execute(){}});off();assert.equal(registry.getSnapshot().length,0);
});
test('menus preserve the modal boundary and only window modals leave host commands available',async()=>{
 const registry=new CommandRegistry({platform:'darwin'}),dialog=Symbol('dialog'),menu=Symbol('menu');let host=0,window=0,modal=0;
 registry.register({id:'host',label:'Host',shortcut:'Primary+S',scope:{kind:'global'},execute:()=>{host++;}});
 registry.register({id:'window',label:'Window',shortcut:'Primary+S',scope:{kind:'window',owner:'a'},execute:()=>{window++;}});
 const inside=registry.register({id:'modal',label:'Modal',shortcut:'Primary+S',scope:{kind:'overlay',owner:'a',layer:dialog},execute:()=>{modal++;}});
 const context={activeOwner:'a',overlay:{token:menu,owner:'a',scope:'window' as const,modal:false},modal:{token:dialog,owner:'a',scope:'window' as const}};
 registry.handle(key(),context);await settle();assert.deepEqual([host,window,modal],[0,0,1]);
 inside.dispose();assert.equal((await registry.invoke('a','window',context)).status,'unavailable');registry.handle(key(),context);await settle();assert.deepEqual([host,window,modal],[1,0,1]);
 assert.equal(registry.handle(key(),{...context,overlay:{...context.overlay,owner:'workbench',scope:'global'},modal:{...context.modal,owner:'workbench',scope:'global'}}),false);await settle();assert.deepEqual([host,window,modal],[1,0,1]);
});
