import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SaveController,createConfigurationSaveAdapter,createConfigurationMutationSaveAdapter,createApplicationStorageSaveAdapter,classifySaveError} from '../src/controllers.ts';
import type {SaveAttempt,SaveAdapter,VersionedValue,ConfigurationRequest} from '../src/controllers.ts';
import {createConfigurationService} from '../../../runtime/src/services/configuration.js';
import {ConfigurationPreferences} from '../../../runtime/web/src/configuration-preferences.ts';
import {createApplicationStorage} from '../../../runtime/src/services/application-storage.js';

type Value={name:string};
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(t:{after:(fn:()=>void)=>void}){const root=mkdtempSync(join(tmpdir(),'ksf-ui-save-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function memory(){
 let record:VersionedValue<Value>={value:{name:'base'},revision:'1'},offline=false,lose=false;const attempts:SaveAttempt<Value>[]=[];
 const request:ConfigurationRequest=async<R>(_url,input)=>{
  if(offline)throw Error('connection lost');
  if(input){const a=input as {ifMatch:string;values:Value};if(a.ifMatch!==record.revision)throw Object.assign(Error('conflict'),{code:'CONFIG_CONFLICT'});record={value:a.values,revision:String(Number(record.revision)+1)};if(lose){lose=false;throw Error('reply lost');}}
  return {etag:record.revision,state:'present',values:record.value,defaults:{name:'default'},effective:null} as R;
 };
 const adapter=createConfigurationSaveAdapter<Value>({request,domain:'instance',select:r=>({name:String(r.values.name??r.defaults.name)}),values:v=>v,valueReconciliation:true});
 const write=adapter.write;adapter.write=a=>{attempts.push(a);return write(a);};
 return {adapter,attempts,get record(){return record;},offline(v:boolean){offline=v;},lose(){lose=true;},external(value:Value){record={value,revision:String(Number(record.revision)+1)};}};
}

test('fixed immutable submissions serialize saves and never label a newer draft saved',async()=>{
 const b=memory(),gate=deferred<void>(),original=b.adapter.write;let first=true;
 b.adapter.write=async a=>{if(first){first=false;await gate.promise;}return original(a);};
 const store=new SaveController(b.adapter,{initial:{name:'initial'}});await store.refresh();
 const draft={name:'first'};store.update(draft);const saving=store.save();draft.name='mutated outside';store.update({name:'second'});
 gate.resolve();await saving;
 assert.equal(b.attempts[0].value.name,'first');assert.equal(store.getSnapshot().value.name,'second');assert.equal(store.getSnapshot().status,'pending');assert.equal(store.getSnapshot().dirty,true);
 await store.save();assert.equal(b.attempts[1].baseRevision,'2');assert.notEqual(b.attempts[0].operationId,b.attempts[1].operationId);assert.equal(store.getSnapshot().status,'saved');
 assert.throws(()=>{b.attempts[0].value.name='cannot mutate';},TypeError);
});
test('an explicit second save waits for the first returned version',async()=>{
 const b=memory(),gate=deferred<void>(),original=b.adapter.write;let first=true;
 b.adapter.write=async a=>{if(first){first=false;await gate.promise;}return original(a);};
 const store=new SaveController(b.adapter,{initial:{name:''}});await store.refresh();store.update({name:'one'});const saving=store.save();store.update({name:'two'});const queued=store.save();assert.equal(saving,queued);gate.resolve();await queued;
 assert.equal(b.attempts.length,2);assert.equal(b.attempts[1].baseRevision,'2');assert.equal(store.getSnapshot().dirty,false);
});
test('lost committed reply confirms the submitted value, preserving any newer draft',async()=>{
 const b=memory(),gate=deferred<void>(),original=b.adapter.write;b.lose();
 b.adapter.write=async a=>{await gate.promise;return original(a);};
 const store=new SaveController(b.adapter,{initial:{name:''}});await store.refresh();store.update({name:'committed'});const saving=store.save();store.update({name:'new draft'});gate.resolve();await saving;
 assert.equal(b.attempts.length,1);assert.equal(store.getSnapshot().confirmation,'value');assert.equal(store.getSnapshot().committed?.value.name,'committed');assert.equal(store.getSnapshot().value.name,'new draft');assert.equal(store.getSnapshot().status,'pending');
});
test('unavailable and unknown remain separate from explicit rejection; retries retain the exact CAS identity',async()=>{
 const b=memory(),store=new SaveController(b.adapter,{initial:{name:''}});await store.refresh();b.offline(true);store.update({name:'unsure'});await store.save();
 const attempt=store.getSnapshot().pending;assert.ok(attempt);assert.equal(store.getSnapshot().status,'unknown');assert.equal(store.getSnapshot().connection,'unavailable');
 await store.save();assert.equal(b.attempts.length,1);await assert.rejects(store.discard(),{code:'SAVE_UNRESOLVED'});
 b.offline(false);await store.reconcile();assert.equal(store.getSnapshot().status,'unknown');assert.equal(store.getSnapshot().pending,attempt);await store.retry();
 assert.equal(b.attempts.length,2);assert.equal(b.attempts[1],attempt);assert.equal(store.getSnapshot().status,'saved');
 const rejected:SaveAdapter<Value>={read:async()=>({value:{name:'base'},revision:'1'}),write:async()=>{throw Object.assign(Error('invalid'),{code:'CONFIG_INVALID'});},classifyError:classifySaveError};
 const invalid=new SaveController(rejected,{initial:{name:''}});await invalid.refresh();invalid.update({name:'bad'});await invalid.save();assert.equal(invalid.getSnapshot().status,'failed');assert.equal(invalid.getSnapshot().pending,null);assert.equal(invalid.getSnapshot().error?.outcomeUnknown,false);
});
test('a value read never certifies an operation with side effects without opt-in',async()=>{
 let value={name:'old'};
 const request:ConfigurationRequest=async<R>(_url,input)=>{if(input){value=(input as {values:Value}).values;throw Error('lost reply');}return {etag:'v',state:'present',values:value,defaults:{},effective:null} as R;};
 const store=new SaveController(createConfigurationSaveAdapter({request,domain:'runtime',select:r=>r.values as Value,values:(v:Value)=>v}),{initial:value});await store.refresh();store.update({name:'next'});await store.save();await store.retry();
 assert.equal(store.getSnapshot().status,'unknown');assert.ok(store.getSnapshot().pending);assert.equal(store.getSnapshot().confirmation,null);
});
test('invalid form projection is a local rejection and never becomes an unknown network result',async()=>{
 let requests=0;
 const request:ConfigurationRequest=async<R>(_url,input)=>{if(input)requests++;return {etag:'v',state:'present',values:{text:'{}'},defaults:{},effective:null} as R;};
 const store=new SaveController(createConfigurationSaveAdapter<string>({request,domain:'draft',select:()=>'{"valid":true}',values:JSON.parse,valueReconciliation:true}),{initial:''});
 await store.refresh();store.update('{bad json');await store.save();assert.equal(requests,0);assert.equal(store.getSnapshot().status,'failed');assert.equal(store.getSnapshot().pending,null);assert.equal(store.getSnapshot().value,'{bad json');
});
test('two actual configuration clients preserve external changes and require explicit merge',async t=>{
 const service=createConfigurationService(fixture(t)),attempts:unknown[]=[];
 const request:ConfigurationRequest=async<R>(_url,input)=>{if(input){attempts.push(input);const {operation,...change}=input as {operation:string};return await service.perform('instance',operation,change) as R;}return await service.read('instance') as R;};
 const make=()=>new SaveController(createConfigurationSaveAdapter<Value>({request,domain:'instance',select:r=>({name:String(r.values.name??r.defaults.name)}),values:v=>v,valueReconciliation:true}),{initial:{name:''}});
 const a=make(),b=make();await a.refresh();await b.refresh();a.update({name:'page a'});await a.save();b.update({name:'page b draft'});await b.save();
 assert.equal(b.getSnapshot().status,'conflict');assert.equal(b.getSnapshot().value.name,'page b draft');assert.equal(b.getSnapshot().remote?.value.name,'page a');assert.equal((await service.read('instance')).values.name,'page a');
 b.merge({name:'merged'});await b.save();assert.equal((await service.read('instance')).values.name,'merged');assert.equal(attempts.length,3);assert.ok(attempts.every(x=>Object.hasOwn(x as object,'ifMatch')));
});
test('a default reset removes the real override through CAS and reconciles a lost reply without writing literal defaults',async t=>{
 const service=createConfigurationService(fixture(t));type Draft={fields:Record<string,unknown>;reset:boolean};let lose=true;const writes:unknown[]=[];
 await service.perform('program','write',{ifMatch:(await service.read('program')).etag,values:{routing:{enabled:false}}});
 const request:ConfigurationRequest=async<R>(_url,input)=>{if(!input)return await service.read('program') as R;writes.push(input);const {operation,...change}=input as {operation:string};const result=await service.perform('program',operation,change);if(lose){lose=false;throw Error('lost reset reply');}return result as R;};
 const adapter=createConfigurationMutationSaveAdapter<Draft>({request,domain:'program',select:r=>({fields:{...r.defaults,...r.values},reset:false}),values:d=>d.fields,valueReconciliation:true,intent:d=>d.reset?{operation:'reset',fields:['routing']}:{operation:'write'}}),store=new SaveController(adapter,{initial:{fields:{},reset:false}});await store.refresh();
 store.update({fields:{...store.getSnapshot().value.fields,routing:{enabled:true}},reset:true});await store.save();const raw=await service.read('program');assert.equal(Object.hasOwn(raw.values,'routing'),false);assert.equal(store.getSnapshot().status,'saved');assert.equal(store.getSnapshot().confirmation,'value');assert.equal(writes.length,1);assert.equal((writes[0] as any).operation,'reset');assert.equal(Object.hasOwn(writes[0] as object,'values'),false);assert.ok(Object.hasOwn(writes[0] as object,'ifMatch'));assert.equal(store.getSnapshot().value.reset,false);
});
test('equal resolved defaults with a retained override never falsely confirm a reset, and explicit retry keeps its original intent',async()=>{
 type Draft={fields:{name:string};reset:boolean};let perform=false;const attempts:unknown[]=[];
 const request:ConfigurationRequest=async<R>(_url,input)=>{if(input){attempts.push(input);if(!perform)throw Error('request not acknowledged');return {etag:'v2',state:'missing',values:{},defaults:{name:'default'},effective:null} as R;}return {etag:'v1',state:'present',values:{name:'default'},defaults:{name:'default'},effective:null} as R;};
 const store=new SaveController(createConfigurationMutationSaveAdapter<Draft>({request,domain:'fixture',select:r=>({fields:{name:String(r.values.name??r.defaults.name)},reset:false}),values:d=>d.fields,valueReconciliation:true,intent:d=>d.reset?{operation:'reset',fields:['name']}:{operation:'write'}}),{initial:{fields:{name:''},reset:false}});await store.refresh();store.update({fields:{name:'default'},reset:true});await store.save();const original=store.getSnapshot().pending;assert.ok(original);assert.equal(store.getSnapshot().status,'unknown');assert.equal(store.getSnapshot().confirmation,null);perform=true;await store.retry();assert.equal(store.getSnapshot().status,'saved');assert.equal(attempts.length,2);assert.deepEqual(attempts[1],attempts[0]);assert.equal(original.value.reset,true);
});
test('discard restores current authority, and protects new typing or failed reads',async()=>{
 const b=memory(),store=new SaveController(b.adapter,{initial:{name:''}});await store.refresh();store.update({name:'preview'});b.external({name:'latest committed'});assert.equal(await store.discard(),true);assert.equal(store.getSnapshot().value.name,'latest committed');
 store.update({name:'keep on failure'});b.offline(true);assert.equal(await store.discard(),false);assert.equal(store.getSnapshot().value.name,'keep on failure');b.offline(false);
 const gate=deferred<VersionedValue<Value>>();b.adapter.read=()=>gate.promise;const discard=store.discard();store.update({name:'new typing'});gate.resolve({value:{name:'remote'},revision:'9'});assert.equal(await discard,false);assert.equal(store.getSnapshot().value.name,'new typing');
});
test('real application storage reconciles a durable lost reply and always submits ifMatch including missing',async t=>{
 let lose=true,writes=0;const service=createApplicationStorage(fixture(t),{fault:async phase=>{if(phase==='after-replace'&&lose){lose=false;throw Error('lost after durable replacement');}}});
 const caller={appId:'com.example.save',dataStores:[{name:'state.json',scope:'user',schemaVersion:1,migrateFrom:[]}]};
 const storage={read:(name:string,options:unknown)=>service.read(caller,name,options),write:(name:string,text:string,options:unknown)=>{writes++;assert.ok(Object.hasOwn(options as object,'ifMatch'));return service.write(caller,name,text,options);}};
 const adapter=createApplicationStorageSaveAdapter(storage,'state.json',{initial:{schemaVersion:1,name:'new'},parse:JSON.parse,serialize:JSON.stringify});const store=new SaveController(adapter,{initial:{schemaVersion:1,name:'new'}});
 await store.refresh();assert.equal(store.getSnapshot().committed?.revision,null);store.update({schemaVersion:1,name:'saved'});await store.save();assert.equal(writes,1);assert.equal(store.getSnapshot().status,'saved');assert.equal(store.getSnapshot().confirmation,'value');assert.equal(JSON.parse((await service.read(caller,'state.json')).text).name,'saved');
});
test('editing before the first read requires choosing a base rather than silently rebasing',async()=>{
 const b=memory(),store=new SaveController(b.adapter,{initial:{name:'cache'}});store.update({name:'early edit'});await store.refresh();assert.equal(store.getSnapshot().status,'conflict');assert.equal(store.getSnapshot().value.name,'early edit');await store.save();assert.equal(b.attempts.length,0);store.merge({name:'chosen edit'});await store.save();assert.equal(b.record.value.name,'chosen edit');
});
test('unsubscribing never cancels or loses an already submitted save',async()=>{
 const b=memory(),gate=deferred<void>(),original=b.adapter.write;b.adapter.write=async a=>{await gate.promise;return original(a);};const store=new SaveController(b.adapter,{initial:{name:''}});await store.refresh();let calls=0;const off=store.subscribe(()=>calls++);store.update({name:'detached'});const saving=store.save();off();const before=calls;gate.resolve();await saving;assert.equal(calls,before);assert.equal(store.getSnapshot().status,'saved');assert.equal(b.record.value.name,'detached');
});
test('unsupported mutable snapshots fail before a write and classifier faults retain unknown identity',async()=>{
 const b=memory();const cyclic:any={name:'cyclic'};cyclic.self=cyclic;
 assert.throws(()=>new SaveController(b.adapter,{initial:cyclic}),/无循环/);
 assert.throws(()=>new SaveController(b.adapter,{initial:new Map() as never}),/普通对象/);
 const store=new SaveController<Value>({read:async()=>({value:{name:'base'},revision:'v'}),write:async()=>{throw Error('lost');},classifyError:()=>{throw Error('adapter bug');}},{initial:{name:''}});
 await store.refresh();store.update({name:'pending'});await store.save();assert.equal(store.getSnapshot().status,'unknown');assert.ok(store.getSnapshot().pending);
});

test('staged defaults retain an explicit original reset and remove only their actual service override after saving',async t=>{
 const root=mkdtempSync(join(tmpdir(),'ksf-settings-reset-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const service=createConfigurationService(root);await service.perform('program','write',{ifMatch:(await service.read('program')).etag,values:{routing:{enabled:false},updates:{check_interval_seconds:3600,request_timeout_seconds:20}}});let posts=0,lose=true;
 const request:ConfigurationRequest=async<R>(_url:string,input?:unknown)=>{if(!input)return await service.read('program') as R;posts++;const {operation,...change}=input as {operation:string};const result=await service.perform('program',operation,change);if(lose){lose=false;throw Error('lost reset acknowledgement');}return result as R;};
 const store=new ConfigurationPreferences('program','routing',{enabled:true},request);await store.load();store.beginManual();store.resetDraft();assert.equal(store.getSaveSnapshot().value.reset,true);assert.equal(store.getSnapshot().value.enabled,true);assert.equal((await service.read('program')).values.routing.enabled,false);assert.equal(posts,0);
 await store.flush();const raw=await service.read('program');assert.equal(Object.hasOwn(raw.values,'routing'),false);assert.equal(raw.values.updates.request_timeout_seconds,20);assert.equal(posts,1);assert.equal(store.getSnapshot().dirty,false);assert.equal(store.getSaveSnapshot().value.reset,false);store.endManual();assert.equal(store.isManualEditing,false);
});
test('a concurrent configuration change cannot turn a retained reset draft into a literal-default write',async t=>{
 const service=createConfigurationService(fixture(t));await service.perform('program','write',{ifMatch:(await service.read('program')).etag,values:{routing:{enabled:false}}});const operations:string[]=[];
 const request:ConfigurationRequest=async<R>(_url:string,input?:unknown)=>{if(!input)return await service.read('program') as R;const {operation,...change}=input as {operation:string};operations.push(operation);return await service.perform('program',operation,change) as R;};
 const store=new ConfigurationPreferences('program','routing',{enabled:true},request);await store.load();store.beginManual();store.resetDraft();await service.perform('program','write',{ifMatch:(await service.read('program')).etag,values:{updates:{check_interval_seconds:3600,request_timeout_seconds:25}}});await store.flush();assert.equal(store.getSaveSnapshot().status,'conflict');assert.equal(store.getSaveSnapshot().value.reset,true);
 store.keepDraftOnLatest();assert.equal(store.getSaveSnapshot().value.reset,true);await store.flush();assert.deepEqual(operations,['reset','reset']);const latest=await service.read('program');assert.equal(Object.hasOwn(latest.values,'routing'),false);assert.equal(latest.values.updates.request_timeout_seconds,25);assert.equal(store.getSnapshot().dirty,false);
});

test('a failed re-read revokes earlier permission to retry an unknown submission',async()=>{
 let readsFail=false,writes=0;
 const base={value:{name:'base'},revision:'1'},adapter:SaveAdapter<Value>={read:async()=>base,write:async()=>{writes++;throw Error('reply unknown');},reconcile:async()=>{if(readsFail)throw Error('offline');return {kind:'unknown',record:base,retrySameAttempt:true};}};
 const store=new SaveController(adapter,{initial:{name:''}});await store.refresh();store.update({name:'draft'});await store.save();
 assert.equal(store.getSnapshot().canRetrySameAttempt,true);const attempt=store.getSnapshot().pending;
 readsFail=true;await store.reconcile();assert.equal(store.getSnapshot().canRetrySameAttempt,false);await store.retry();
 assert.equal(writes,1);assert.equal(store.getSnapshot().pending,attempt);assert.equal(store.getSnapshot().status,'unknown');
});

test('simultaneous original-request retries share reconciliation and a single serial writer',async()=>{
 const reads=deferred<void>(),writing=deferred<void>(),attempts:SaveAttempt<Value>[]=[];let gateReads=false,record:VersionedValue<Value>={value:{name:'base'},revision:'1'};
 const adapter:SaveAdapter<Value>={read:async()=>record,write:async attempt=>{attempts.push(attempt);if(attempts.length===1)throw Error('unknown');await writing.promise;record={value:attempt.value,revision:'2'};return record;},reconcile:async()=>{if(gateReads)await reads.promise;return {kind:'unknown',record,retrySameAttempt:true};}};
 const store=new SaveController(adapter,{initial:{name:''}});await store.refresh();store.update({name:'fixed'});await store.save();
 gateReads=true;const first=store.retry(),second=store.retry();reads.resolve();await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(attempts.length,2);assert.equal(attempts[0],attempts[1]);assert.equal(store.getSnapshot().canRetrySameAttempt,false);
 writing.resolve();await Promise.all([first,second]);assert.equal(store.getSnapshot().status,'saved');assert.equal(store.getSnapshot().canRetrySameAttempt,false);
});
