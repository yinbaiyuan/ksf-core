import test from 'node:test';
import assert from 'node:assert/strict';
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
 const b=backend(),store=b.make();await store.load();b.offline();store.update({name:'离线草稿'});await store.flush();assert.equal(store.getSnapshot().status,'failed');assert.equal(store.getSnapshot().dirty,true);assert.equal(b.posts,0);
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


test('failed automatic saves remain unconfirmed and are recomputed after reconnection',async()=>{
 const b=backend(),store=b.make();await store.load();b.offline();await store.reconcile(value=>({name:value.name+'+自动'}));
 assert.equal(store.getSnapshot().status,'failed');assert.equal(b.posts,0);
 b.online();await store.load();await store.reconcile(value=>({name:value.name+'+自动'}));
 assert.equal(store.getSnapshot().value.name,'实例值+自动');assert.equal(store.getSnapshot().status,'saved');assert.equal(b.posts,1);
});
