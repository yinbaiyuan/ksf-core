import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplicationMenuRegistry} from '../src/application-menu.ts';
test('menu registration updates atomically and stale cleanup cannot erase a replacement',()=>{
 const registry=createApplicationMenuRegistry(),action=()=>{};let changes=0;const unsubscribe=registry.subscribe(()=>changes++);
 const first=registry.register([{id:'first',label:'First',onAction:action}]);
 assert.throws(()=>first.update([{id:'ksf.quit',label:'Invalid',onAction:action}]));assert.equal(registry.getSnapshot()[0].id,'first');
 const second=registry.register([{id:'second',label:'Second',onAction:action}]);first.dispose();first.update([]);assert.equal(registry.getSnapshot()[0].id,'second');
 second.update([{id:'changed',label:'Changed',checked:true,disabled:true,onAction:action}]);assert.equal(registry.getSnapshot()[0].checked,true);second.dispose();assert.deepEqual(registry.getSnapshot(),[]);assert.equal(changes,4);unsubscribe();
});
test('menu validation preserves callbacks but isolates mutable input and rejects duplicate nested identities',async()=>{
 const registry=createApplicationMenuRegistry(),received:unknown[]=[];
 const input=[{id:'view',label:'View',children:[{id:'view.wrap',label:'Wrap',checked:false,onAction:(event:unknown)=>{received.push(event);}}]}];
 registry.register(input);input[0].children[0].label='Changed outside';assert.equal(registry.getSnapshot()[0].children![0].label,'Wrap');
 await registry.getSnapshot()[0].children![0].onAction!({id:'view.wrap',checked:true});assert.deepEqual(received,[{id:'view.wrap',checked:true}]);
 assert.throws(()=>registry.register([{id:'view',label:'View',children:[{id:'view',label:'Duplicate',onAction(){}}]}]));assert.equal(registry.getSnapshot()[0].children![0].label,'Wrap');
});
test('window menu registries remain independent and disposal is idempotent',()=>{
 const a=createApplicationMenuRegistry(),b=createApplicationMenuRegistry(),entry={id:'settings',label:'Settings',onAction(){}};
 const registration=a.register([entry]);assert.deepEqual(b.getSnapshot(),[]);registration.dispose();registration.dispose();assert.deepEqual(a.getSnapshot(),[]);
});

test('equivalent menu refreshes keep the open snapshot and invoke only the latest live callback',async()=>{
 const registry=createApplicationMenuRegistry(),events:string[]=[];
 const registration=registry.register([{id:'refresh',label:'Refresh',onAction:()=>{events.push('old');}}]);
 const snapshot=registry.getSnapshot();registration.update([{id:'refresh',label:'Refresh',onAction:()=>{events.push('new');}}]);
 assert.equal(registry.getSnapshot(),snapshot);await snapshot[0].onAction!({id:'refresh'});assert.deepEqual(events,['new']);
 registration.dispose();await snapshot[0].onAction!({id:'refresh'});assert.deepEqual(events,['new']);
});

test('menu placement distinguishes the application menu from parallel menubar menus',()=>{
 const registry=createApplicationMenuRegistry();
 registry.register([{id:'advanced',label:'Advanced',placement:'application',onAction(){}},{id:'file',label:'File',children:[{id:'open',label:'Open',onAction(){}}]}]);
 assert.equal(registry.getSnapshot()[0].placement,'application');assert.equal(registry.getSnapshot()[1].children![0].id,'open');
 assert.throws(()=>registry.register([{id:'file',label:'File',children:[{id:'open',label:'Open',placement:'application',onAction(){}}]}]));
});

test('pending commands stay guarded across menu snapshots and disabled ancestors block stale child actions',async()=>{
 const registry=createApplicationMenuRegistry();let count=0,finish:()=>void=()=>{};
 const registration=registry.register([{id:'tools',label:'Tools',children:[{id:'run',label:'Run',onAction:async()=>{count++;await new Promise<void>(resolve=>{finish=resolve;});}}]}]);
 const old=registry.getSnapshot()[0].children![0];const running=old.onAction!({id:'run'});await old.onAction!({id:'run'});assert.equal(count,1);assert.equal(registry.getSnapshot()[0].children![0].disabled,true);finish();await running;
 registration.update([{id:'tools',label:'Tools',disabled:true,children:[{id:'run',label:'Run',onAction:()=>{count++;}}]}]);await old.onAction!({id:'run'});assert.equal(count,1);
});
