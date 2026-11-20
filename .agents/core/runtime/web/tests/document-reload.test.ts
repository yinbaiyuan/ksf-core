import test from 'node:test';import assert from 'node:assert/strict';
import {DocumentReloadCoordinator,type ReloadParticipant} from '../src/ui-runtime/reload-model.ts';
import {createReloadParticipant,reloadParticipants} from '../src/ui-runtime/reload-participants.ts';
const ready=()=>({status:'ready' as const,validate:()=>true});
function fixture(){let frozen=0,unfrozen=0,navigations=0,writes=0,cancelled=0,topology='windows:a,b',value={windows:['a','b']},participants:ReloadParticipant[]=['a','b'].map(id=>({id,name:id,prepare:ready}));const coordinator=new DocumentReloadCoordinator({participants:()=>participants,snapshot:()=>({topology,value}),freeze:()=>{frozen++;return()=>{unfrozen++;};},checkpoint:async()=>{writes++;return {resumeToken:'checkpoint-one'};},navigate:()=>{navigations++;},cancelNavigation:()=>{cancelled++;}});return {coordinator,get counts(){return {frozen,unfrozen,navigations,writes,cancelled};},get participants(){return participants;},set participants(next:ReloadParticipant[]){participants=next;},set topology(next:string){topology=next;},set value(next:{windows:string[]}){value=next;}};}
test('one refusing window cancels the document reload without closing any other window',async()=>{
 const f=fixture();let prepared=0;f.participants[0].prepare=()=>{prepared++;return ready();};f.participants[1].prepare=()=>({status:'cancelled'});assert.equal(await f.coordinator.request(),false);assert.equal(prepared,1);assert.deepEqual(f.counts,{frozen:1,unfrozen:1,navigations:0,writes:0,cancelled:0});assert.equal(f.coordinator.getSnapshot().phase,'idle');
});
test('stale first-window preparation or topology change prevents checkpoint and navigation',async()=>{
 for(const kind of ['content','topology','participants']){const f=fixture();let valid=true;f.participants[0].prepare=()=>({status:'ready',validate:()=>valid});f.participants[1].prepare=()=>{if(kind==='content')valid=false;else if(kind==='topology')f.topology='changed';else f.participants=[f.participants[0]];return ready();};assert.equal(await f.coordinator.request(),false);assert.equal(f.counts.writes,0);assert.equal(f.counts.navigations,0);assert.equal(f.counts.unfrozen,1);}
});
test('all current preparations lead to exactly one checkpoint/navigation and input stays frozen until explicit navigation cancellation',async()=>{
 const f=fixture(),first=f.coordinator.request('upgrade'),second=f.coordinator.request();assert.equal(first,second);assert.equal(await first,true);assert.deepEqual(f.counts,{frozen:1,unfrozen:0,navigations:1,writes:1,cancelled:0});assert.equal(f.coordinator.getSnapshot().phase,'reloading');assert.equal(await f.coordinator.request(),true);assert.equal(f.counts.navigations,1);assert.equal(f.coordinator.continueCurrentPage(),true);assert.equal(f.counts.cancelled,1);assert.equal(f.counts.unfrozen,1);assert.equal(f.coordinator.getSnapshot().phase,'idle');
});
test('a generation change while durable acknowledgement is pending is rechecked at the actual navigation boundary',async()=>{
 let valid=true,unlocked=0,navigations=0;const coordinator=new DocumentReloadCoordinator({participants:()=>[{id:'a',name:'A',prepare:()=>({status:'ready',validate:()=>valid})}],snapshot:()=>({topology:'same',value:{draft:'first'}}),freeze:()=>()=>{unlocked++;},checkpoint:async()=>{valid=false;return {resumeToken:'durable-but-stale'};},navigate:()=>{navigations++;},cancelNavigation(){}});assert.equal(await coordinator.request(),false);assert.equal(navigations,0);assert.equal(unlocked,1);assert.match(coordinator.getSnapshot().error!,/新内容/);
});
test('checkpoint failure or unknown acknowledgement keeps the whole document mounted without automatic retry',async()=>{
 let writes=0,navigations=0,unlock=0;const coordinator=new DocumentReloadCoordinator({participants:()=>[{id:'a',name:'A',prepare:ready}],snapshot:()=>({topology:'same',value:{}}),freeze:()=>()=>{unlock++;},checkpoint:async()=>{writes++;throw Error('receipt unknown');},navigate:()=>{navigations++;},cancelNavigation(){}});assert.equal(await coordinator.request(),false);assert.deepEqual([writes,navigations,unlock],[1,0,1]);assert.match(coordinator.getSnapshot().error!,/receipt unknown/);
});
test('unknown legacy preparation and duplicate participant identities cannot imply reload permission',async()=>{
 const f=fixture();f.participants[0].prepare=()=>({status:'ready'} as never);assert.equal(await f.coordinator.request(),false);assert.match(f.coordinator.getSnapshot().error!,/保全协议/);f.participants=[{id:'a',name:'A',prepare:ready},{id:'a',name:'A2',prepare:ready}];assert.equal(await f.coordinator.request(),false);assert.equal(f.counts.navigations,0);
});
test('SDK preparation requires current explicit guards and ordinary legacy close guards never grant reload',async()=>{
 let generation=1,alive=true,legacy=0;const guards=[async()=>{const readyGeneration=generation;return {status:'ready' as const,validate:()=>generation===readyGeneration};}],participant=createReloadParticipant({id:'sdk',name:'SDK',isAlive:()=>alive,guards:()=>guards,legacyCount:()=>legacy}),request={requestId:'reload-one',reason:'reload' as const};
 const first=await participant.prepare(request);assert.equal(first.status,'ready');if(first.status==='ready'){assert.equal(first.validate(),true);generation++;assert.equal(first.validate(),false);}
 legacy=1;assert.equal((await participant.prepare(request)).status,'failed');legacy=0;alive=false;assert.equal((await participant.prepare(request)).status,'failed');alive=true;guards.splice(0);assert.equal((await participant.prepare(request)).status,'failed');
});
test('replacing a surface registry entry is safe against stale cleanup from the previous SDK lifetime',()=>{
 const a={id:'one',name:'A',prepare:ready},b={id:'one',name:'B',prepare:ready};const old=reloadParticipants.register(a),next=reloadParticipants.register(b);old();assert.equal(reloadParticipants.list().find(p=>p.id==='one'),b);next();assert.equal(reloadParticipants.list().some(p=>p.id==='one'),false);
});
test('explicit preparation cancellation releases input without waiting forever or navigating after a late guard reply',async()=>{
 const f=fixture();let resolve!:(value:ReturnType<typeof ready>)=>void,signal:AbortSignal|undefined;const gate=new Promise<ReturnType<typeof ready>>(r=>{resolve=r;});f.participants[0].prepare=request=>{signal=request.signal;return gate;};const pending=f.coordinator.request();await Promise.resolve();assert.equal(f.coordinator.cancelPreparation(),true);assert.equal(await pending,false);assert.equal(signal?.aborted,true);assert.equal(f.counts.unfrozen,1);resolve(ready());await Promise.resolve();assert.equal(f.counts.writes,0);assert.equal(f.counts.navigations,0);assert.equal(f.coordinator.getSnapshot().phase,'idle');
});
