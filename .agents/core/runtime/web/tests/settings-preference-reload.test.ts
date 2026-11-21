import test from 'node:test';
import assert from 'node:assert/strict';
import {ConfigurationPreferences} from '../src/configuration-preferences.ts';
import {preparePreferenceReload} from '../src/desktop/settings-preference-reload.ts';
function fixture(){let stored={theme:'light'},revision=1,writes=0;const request=async(_url:string,input?:any)=>{if(input?.operation==='write'){writes++;stored=input.values.settings;revision++;}return {etag:String(revision),state:'present',defaults:{settings:{theme:'light'}},values:{settings:stored},effective:null};};const store=new ConfigurationPreferences('appearance','settings',{theme:'light'},request as any);return {store,writes:()=>writes,stored:()=>stored};}
test('safe reload refuses a manual appearance draft before any write is attempted',async()=>{
 const f=fixture();await f.store.load();f.store.beginManual();f.store.edit({theme:'dark'});
 const result=await preparePreferenceReload([f.store],undefined,()=>false);
 assert.equal(result.status,'failed');assert.equal(f.writes(),0);assert.deepEqual(f.stored(),{theme:'light'});assert.equal(f.store.getSnapshot().dirty,true);assert.deepEqual(f.store.getSnapshot().value,{theme:'dark'});
});
test('automatic preferences flush once and invalidate the prepared reload if a new draft appears',async()=>{
 const f=fixture();await f.store.load();f.store.update({theme:'dark'});
 const result=await preparePreferenceReload([f.store],undefined,()=>false);
 assert.equal(result.status,'ready');assert.equal(f.writes(),1);assert.deepEqual(f.stored(),{theme:'dark'});
 if(result.status!=='ready')throw Error('Expected a prepared reload');assert.equal(await result.validate?.(),true);
 f.store.beginManual();f.store.edit({theme:'light'});assert.equal(await result.validate?.(),false);await f.store.discardDraft();f.store.endManual();
});
test('cancelled and busy reload preparation never submits a pending automatic preference',async()=>{
 for(const mode of ['abort','busy']){const f=fixture();await f.store.load();f.store.beginManual();f.store.edit({theme:'dark'});const controller=new AbortController();if(mode==='abort')controller.abort();const result=await preparePreferenceReload([f.store],controller.signal,()=>mode==='busy');assert.equal(result.status,'failed');assert.equal(f.writes(),0);await f.store.discardDraft();f.store.endManual();}
});
