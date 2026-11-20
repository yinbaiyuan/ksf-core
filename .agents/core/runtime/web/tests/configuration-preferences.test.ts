import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationDifferences} from '../src/desktop/settings-comparison.ts';
import {createSettingsReloadParticipant} from '../src/desktop/settings-reload.ts';
import {DocumentReloadCoordinator} from '../src/ui-runtime/reload-model.ts';
import {ConfigurationPreferences,type ConfigurationRequest,type ConfigurationSnapshot} from '../src/configuration-preferences.ts';
function backend(){
 let value={name:'实例值'},version=1,posts=0,failAfterCommit=false,unreachable=false;
 const request:ConfigurationRequest=async<R>(_url:string,input?:unknown)=>{
  if(unreachable)throw Error('offline');
  if(input){const change=input as {ifMatch:string;values:{preferences:{name:string}}};posts++;if(change.ifMatch!==String(version))throw Object.assign(Error('conflict'),{code:'CONFIG_CONFLICT'});value=change.values.preferences;version++;if(failAfterCommit){failAfterCommit=false;throw Error('lost reply');}}
  return {etag:String(version),state:'present',values:{preferences:value},defaults:{preferences:{name:'默认'}},effective:{preferences:value}} as R;
 };
 const storage=new Map<string,string>();
 return {request,storage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);}},make:(legacy:{name:string}|null=null)=>new ConfigurationPreferences('desktop','preferences',{name:'默认'},request,undefined,legacy),change(next:string){value={name:next};version++;},get posts(){return posts;},loseReply(){failAfterCommit=true;},offline(){unreachable=true;},online(){unreachable=false;}};
}
test('two pages share instance state and stale edits preserve both remote and local drafts',async()=>{
 const b=backend(),first=b.make(),second=b.make();await first.load();await second.load();
 first.update({name:'页面一'});await first.flush();second.update({name:'页面二草稿'});await second.flush();
 assert.equal(second.getSnapshot().status,'conflict');assert.equal(second.getSnapshot().value.name,'页面二草稿');
 await first.load();assert.equal(first.getSnapshot().value.name,'页面一');assert.equal(b.posts,2);
 await second.reload();assert.equal(second.getSnapshot().value.name,'页面一');assert.equal(second.getSnapshot().dirty,false);
});
test('lost successful write is reconciled by reading, never sent twice',async()=>{
 const b=backend(),store=b.make();await store.load();b.loseReply();store.update({name:'已提交'});await store.flush();
 assert.equal(store.getSnapshot().status,'saved');assert.equal(store.getSnapshot().dirty,false);assert.equal(b.posts,1);
});
test('queued changes serialize behind an in-flight write with its returned version',async()=>{
 const b=backend();let release:()=>void=()=>{};let waiting=false;
 const request:ConfigurationRequest=async<R>(url:string,input?:unknown)=>{if(input&&!waiting){waiting=true;await new Promise<void>(resolve=>{release=resolve;});}return b.request<R>(url,input);};
 const store=new ConfigurationPreferences('desktop','preferences',{name:'默认'},request);await store.load();store.update({name:'第一稿'});const pending=store.flush();store.update({name:'第二稿'});release();await pending;await store.flush();
 assert.equal(store.getSnapshot().value.name,'第二稿');assert.equal(store.getSnapshot().dirty,false);assert.equal(b.posts,2);
});
test('polling cannot replace held layout drafts or silently rebase their version',async()=>{
 const b=backend(),store=b.make();await store.load();store.hold(true);b.change('外部修改');await store.load();assert.equal(store.getSnapshot().value.name,'实例值');
 store.update({name:'布局草稿'});await store.flush();assert.equal(b.posts,0);assert.equal(store.getSnapshot().status,'conflict');
});
test('legacy migration is explicit, version-checked and repeatable without duplicate data',async()=>{
 const b=backend(),store=b.make({name:'旧浏览器'});await store.load();assert.equal(b.posts,0);assert.equal(store.getSnapshot().value.name,'实例值');
 await store.importLegacy();assert.equal(b.posts,1);assert.equal(store.getSnapshot().legacy,null);await store.importLegacy();assert.equal(b.posts,1);
});
test('unavailable backend leaves a visible unsaved draft without automatic retry',async()=>{
 const b=backend(),store=b.make();await store.load();b.offline();store.update({name:'离线草稿'});await store.flush();assert.equal(store.getSnapshot().status,'unknown');assert.equal(store.getSnapshot().dirty,true);assert.equal(b.posts,0);
});

test('automatic reconciliation rereads after a concurrent write and recomputes without replacing it',async()=>{
 const b=backend(),store=b.make();await store.load();b.change('并发值');
 await store.reconcile(value=>({name:value.name+'+自动'}));assert.equal(store.getSnapshot().value.name,'并发值');assert.equal(store.getSnapshot().dirty,false);
 await store.reconcile(value=>({name:value.name+'+自动'}));assert.equal(store.getSnapshot().value.name,'并发值+自动');assert.equal(store.getSnapshot().status,'saved');
});
test('automatic reconciliation defers held layouts and never discards a newer manual draft',async()=>{
 const b=backend();let release:()=>void=()=>{};let wait=false;
 const request:ConfigurationRequest=async<R>(url:string,input?:unknown)=>{if(input){wait=true;await new Promise<void>(resolve=>{release=resolve;});}return b.request<R>(url,input);};
 const store=new ConfigurationPreferences('desktop','preferences',{name:'默认'},request);await store.load();store.hold(true);await store.reconcile(()=>({name:'自动'}));assert.equal(b.posts,0);store.hold(false);
 b.change('远程');const pending=store.reconcile(()=>({name:'自动'}));assert.equal(wait,true);store.update({name:'手工草稿'});release();await pending;
 assert.equal(store.getSnapshot().value.name,'手工草稿');assert.equal(store.getSnapshot().dirty,true);assert.equal(store.getSnapshot().status,'conflict');
});


test('unknown automatic saves retain their submission and are recomputed after reconnection',async()=>{
 const b=backend(),store=b.make();await store.load();b.offline();await store.reconcile(value=>({name:value.name+'+自动'}));
 assert.equal(store.getSnapshot().status,'unknown');assert.equal(b.posts,0);
 b.online();await store.load();await store.reconcile(value=>({name:value.name+'+自动'}));
 assert.equal(store.getSnapshot().value.name,'实例值+自动');assert.equal(store.getSnapshot().status,'saved');assert.equal(b.posts,1);
});
test('manual preview never autosaves, including newer input received during its explicit save',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const b=backend();let release:()=>void=()=>{};
 const request:ConfigurationRequest=async<R>(url:string,input?:unknown)=>{if(input)await new Promise<void>(resolve=>{release=resolve;});return b.request<R>(url,input);};
 const store=new ConfigurationPreferences('appearance','preferences',{name:'默认'},request);await store.load();store.beginManual();store.edit({name:'预览一'});t.mock.timers.tick(1000);assert.equal(b.posts,0);
 const pending=store.flush();store.edit({name:'预览二'});release();await pending;t.mock.timers.tick(1000);
 assert.equal(b.posts,1);assert.equal(store.getSnapshot().value.name,'预览二');assert.equal(store.getSnapshot().dirty,true);assert.equal(store.getSaveSnapshot().committed?.value.value.name,'预览一');assert.equal(store.getSaveSnapshot().status,'pending');
 store.endManual();assert.equal(store.isManualEditing,true);await store.discardDraft();store.endManual();assert.equal(store.isManualEditing,false);
});
test('a manual unknown request cannot be discarded or released before its original outcome is reconciled',async()=>{
 const b=backend(),store=b.make();await store.load();store.beginManual();store.edit({name:'原未知草稿'});b.offline();await store.flush();const pending=store.getSaveSnapshot().pending;
 assert.ok(pending);assert.equal(store.getSnapshot().status,'unknown');store.endManual();assert.equal(store.isManualEditing,true);assert.equal(await store.discardDraft(),false);assert.equal(store.getSaveSnapshot().pending?.operationId,pending.operationId);assert.equal(store.getSnapshot().value.name,'原未知草稿');assert.equal(b.posts,0);
 b.online();await store.retry();assert.equal(store.getSnapshot().status,'saved');assert.equal(b.posts,1);store.endManual();assert.equal(store.isManualEditing,false);
});
test('discarding a manual preview restores the latest committed service value without writing the preview',async()=>{
 const b=backend(),store=b.make();await store.load();store.beginManual();store.edit({name:'临时预览'});b.change('最新外部值');await store.load();assert.equal(store.getSnapshot().value.name,'临时预览');
 assert.equal(await store.discardDraft(),true);assert.equal(store.getSnapshot().value.name,'最新外部值');assert.equal(store.getSnapshot().dirty,false);assert.equal(b.posts,0);store.endManual();assert.equal(store.isManualEditing,false);
});

test('settings comparisons expose changed leaves without burying them under unchanged profiles',()=>{
 const shared={profiles:{window:{blur:18,opacity:.9}},themeMode:'dark'},draft={...shared,desktop:{iconSize:82,gap:48},motion:true},latest={...shared,desktop:{iconSize:84,gap:48}};
 const before=structuredClone({draft,latest});
 assert.deepEqual(configurationDifferences(draft,latest),[{field:'desktop.iconSize',draft:82,latest:84},{field:'motion',draft:true,latest:'未设置'}]);
 assert.deepEqual({draft,latest},before);assert.deepEqual(configurationDifferences(latest,latest),[]);
 assert.deepEqual(configurationDifferences({list:[1,2]},{list:[2,1]}),[{field:'list',draft:[1,2],latest:[2,1]}]);
});

test('document reload stops before checkpoint for dirty, busy or unresolved settings',async()=>{
 const state={open:true,location:'appearance',epoch:1,dirty:false,busy:false,unresolved:false};let checkpoints=0,navigations=0;
 const participant=createSettingsReloadParticipant('settings',()=>({...state})),coordinator=new DocumentReloadCoordinator({participants:()=>[participant],snapshot:()=>({topology:'same',value:{}}),freeze:()=>()=>{},checkpoint:async()=>{checkpoints++;return {resumeToken:'test'};},navigate:()=>{navigations++;},cancelNavigation:()=>{}});
 for(const key of ['dirty','busy','unresolved'] as const){state[key]=true;assert.equal(await coordinator.request(),false);assert.match(coordinator.getSnapshot().error??'',/未保存|未决提交/);assert.equal(checkpoints,0);assert.equal(navigations,0);state[key]=false;coordinator.dismissFailure();}
 assert.equal(await coordinator.request(),true);assert.equal(checkpoints,1);assert.equal(navigations,1);coordinator.dispose();
});

test('settings preparation is rechecked at the actual document navigation boundary',async()=>{
 const state={open:true,location:'appearance',epoch:1,dirty:false,busy:false,unresolved:false};let navigations=0;
 const participant=createSettingsReloadParticipant('settings',()=>({...state})),coordinator=new DocumentReloadCoordinator({participants:()=>[participant],snapshot:()=>({topology:'same',value:{}}),freeze:()=>()=>{},checkpoint:async()=>{state.epoch++;return {resumeToken:'test'};},navigate:()=>{navigations++;},cancelNavigation:()=>{}});
 assert.equal(await coordinator.request(),false);assert.equal(navigations,0);assert.match(coordinator.getSnapshot().error??'',/又有新内容/);coordinator.dispose();
});
