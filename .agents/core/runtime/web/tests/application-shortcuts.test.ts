import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultDesktop,currentGroup,appendWidget,parseDesktop,reconcileApplicationShortcuts,adjustWidgetLayout,type WidgetLayout} from '../src/desktop-model.ts';
import {validateDesktop} from '../../../applications/sdk/src/shared/preferences-validation.js';
import {runningBackgroundApplications,backgroundIconSlots,windowApplicationIds} from '../src/desktop/background-apps-model.ts';
const app=(id='example.one',installationId='install-1',hasWindow=true)=>({id,name:id,installationId,hasWindow});
let serial=0;const createId=()=>`launcher-${++serial}`;
const reconcile=(value:ReturnType<typeof defaultDesktop>,installed=[app()])=>reconcileApplicationShortcuts(value,installed,6,createId);
const launchers=(layout:WidgetLayout[])=>layout.filter(item=>item.kind==='app');
test('first backfill targets the current group; later installs target the stable home and fill empty cells',()=>{
 const initial={...defaultDesktop(),groups:[...defaultDesktop().groups,{id:'work',name:'工作',icon:'grid' as const,layout:[]}],activeGroupId:'work'};
 const first=reconcile(initial);assert.equal(launchers(first.groups[1].layout).length,1);assert.equal(launchers(first.groups[0].layout).length,0);assert.deepEqual(initial.groups[1].layout,[]);
 const next=reconcile(first,[app(),app('example.two')]);assert.equal(launchers(next.groups[0].layout)[0].appId,'example.two');assert.equal(next.groups[0].layout[1].x,4);assert.equal(next.activeGroupId,'work');validateDesktop(next);
 assert.equal(reconcile(next,[app(),app('example.two')]),next);
});
test('intentional removal survives parsing, refresh, version updates, and disable-enable; reinstall re-adds',()=>{
 const first=reconcile(defaultDesktop());const removed={...first,groups:first.groups.map(group=>({...group,layout:group.layout.filter(item=>item.kind!=='app')}))};
 const restored=parseDesktop(JSON.parse(JSON.stringify(removed)));
 assert.equal(launchers(currentGroup(reconcile(restored)).layout).length,0);
 const reinstalled=reconcile(restored,[app('example.one','install-2')]);assert.equal(launchers(currentGroup(reinstalled).layout).length,1);
});
test('uninstall removes all launchers but retains application cards and other apps',()=>{
 const first=reconcile(defaultDesktop(),[app('conversations'),app()]);const card={...defaultDesktop().groups[0].layout[0],i:'extra-card'};
 const groups=[...first.groups,{id:'work',name:'工作',icon:'grid' as const,layout:[{...launchers(first.groups[0].layout)[0],i:'other-launcher'},card]}];
 const next=reconcile({...first,groups},[app()]);assert.equal(next.groups[1].layout.length,1);assert.equal(next.groups[1].layout[0].i,'extra-card');assert.equal(next.shortcuts?.installations.conversations,undefined);
});
test('per-group launcher uniqueness coexists with independent multi-instance cards',()=>{
 const launcher:WidgetLayout={i:'app-a',kind:'app',appId:'example.one',x:0,y:0,w:1,h:1};
 assert.equal(appendWidget([launcher],{...launcher,i:'duplicate'},6).length,1);
 const duplicate={...defaultDesktop(),groups:[{...defaultDesktop().groups[0],layout:[launcher,{...launcher,i:'duplicate',x:1}]}]};
 assert.throws(()=>validateDesktop(duplicate));assert.equal(currentGroup(parseDesktop(duplicate)).layout.length,1);
 const valid={...duplicate,groups:[{...duplicate.groups[0],layout:[launcher,...defaultDesktop().groups[0].layout,{...defaultDesktop().groups[0].layout[0],i:'card-two'}]},{id:'other',name:'其他',icon:'grid' as const,layout:[{...launcher,i:'another-group'}]}]};
 validateDesktop(valid);assert.equal(parseDesktop(valid).groups[0].layout.length,3);
});
test('launcher geometry remains one cell across parsing, resize attempts, and narrow layouts',()=>{
 const value=reconcile(defaultDesktop());const launcher=launchers(currentGroup(value).layout)[0];
 const resized=adjustWidgetLayout(currentGroup(value).layout,launcher.i,4,3,true,6).find(item=>item.i===launcher.i)!;assert.equal(resized.w,1);assert.equal(resized.h,1);
 const malformed={...value,groups:value.groups.map(group=>({...group,layout:group.layout.map(item=>item.kind==='app'?{...item,w:4,h:3}:item)}))};
 assert.throws(()=>validateDesktop(malformed));assert.equal(launchers(currentGroup(parseDesktop(malformed)).layout)[0].w,1);
});
test('renamed home retains identity and removed home is recreated; headless installs get no launcher',()=>{
 const initial=reconcile(defaultDesktop());const renamed={...initial,groups:initial.groups.map(group=>({...group,name:'常用'}))};
 const next=reconcile(renamed,[app(),app('example.two'),app('example.service','install-1',false)]);assert.equal(next.groups.length,1);assert.equal(next.groups[0].name,'常用');assert.equal(launchers(next.groups[0].layout).length,2);
 const removed={...next,activeGroupId:'work',groups:[{id:'work',name:'工作',icon:'grid' as const,layout:[]}]};
 const recreated=reconcile(removed,[app(),app('example.three')]);assert.equal(recreated.groups.find(group=>group.name==='主页')?.layout.length,1);validateDesktop(recreated);
});
test('backend runtime status and window Dock membership are independent and deduplicate per application',()=>{
 const base={name:'App',enabled:true,hasWindow:true,lifecycle:'resident',runtimes:[{id:'one'},{id:'two'}]};
 const running=runningBackgroundApplications({applications:[{...base,id:'live',state:'running'},{...base,id:'idle',state:'idle'},{...base,id:'stopped',state:'stopped'},{...base,id:'disabled',state:'running',enabled:false},{...base,id:'frontend',state:'running',runtimes:[]}]});
 assert.deepEqual(running.map(app=>app.id),['live']);assert.deepEqual(windowApplicationIds([{appId:'live'},{appId:'live'},{appId:'editor'}]),['live','editor']);assert.deepEqual(windowApplicationIds([]),[]);assert.equal(runningBackgroundApplications(null).length,0);
 assert.equal(backgroundIconSlots(360),1);assert.ok(backgroundIconSlots(1440)>backgroundIconSlots(520));
});

test('canonical persisted key order does not trigger repeated reconciliation writes',()=>{
 const value=reconcile(defaultDesktop(),[app('example.z'),app('example.a')]);
 const persisted=JSON.parse(JSON.stringify(value,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value));
 assert.equal(reconcile(persisted,[app('example.z'),app('example.a')]),persisted);
});
