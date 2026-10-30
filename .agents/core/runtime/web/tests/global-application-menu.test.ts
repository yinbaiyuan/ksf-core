import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowMenus,standardApplicationMenu} from '../src/desktop/application-menu-model.ts';
test('active-window menu state keeps settings, about, actions and disposal isolated across windows',async()=>{
 const first=createWindowMenus(),second=createWindowMenus(),events:string[]=[];
 const old=first.registerSettings(()=>{events.push('old');});const current=first.registerSettings(()=>{events.push('first-settings');});old();
 second.registerSettings(()=>{events.push('second-settings');});first.registerAbout(()=>{events.push('first-about');});
 const menu=first.registerMenu([{id:'file',label:'文件',children:[{id:'file.open',label:'打开',onAction:()=>{events.push('first-open');}}]}]);
 await first.getSnapshot().settings!();await second.getSnapshot().settings!();await first.getSnapshot().about!();await first.getSnapshot().items[0].children![0].onAction!({id:'file.open'});
 assert.deepEqual(events,['first-settings','second-settings','first-about','first-open']);assert.deepEqual(second.getSnapshot().items,[]);
 current();menu.dispose();assert.equal(first.getSnapshot().settings,null);assert.deepEqual(first.getSnapshot().items,[]);assert.ok(second.getSnapshot().settings);
});
test('background refresh replaces callbacks without resetting the menubar snapshot',async()=>{
 const menus=createWindowMenus();let calls=0;
 const registration=menus.registerMenu([{id:'refresh',label:'刷新',onAction:()=>{calls+=1;}}]);const snapshot=menus.getSnapshot();
 registration.update([{id:'refresh',label:'刷新',onAction:()=>{calls+=10;}}]);assert.equal(menus.getSnapshot(),snapshot);
 await snapshot.items[0].onAction!({id:'refresh'});assert.equal(calls,10);
 registration.update([{id:'refresh',label:'刷新',disabled:true,onAction:()=>{calls+=100;}}]);assert.notEqual(menus.getSnapshot(),snapshot);
 await snapshot.items[0].onAction!({id:'refresh'});assert.equal(calls,10);
});

test('host CLI entry stays after About across custom menu updates and per-window cleanup',async()=>{
 const first=createWindowMenus(),second=createWindowMenus();let called=0;
 const release=first.registerCLIDocs(()=>{called++;});second.registerCLIDocs(()=>{called+=10;});
 const registration=first.registerMenu([{id:'custom',label:'自定义',placement:'application',onAction:()=>{}}]);
 for(const update of [[{id:'custom',label:'更新',placement:'application' as const,onAction:()=>{}}],[]]){
  registration.update(update);const entries=standardApplicationMenu('First',true,first.getSnapshot(),()=>{});
  assert.deepEqual(entries.slice(0,2).map(item=>item.id),['ksf.about','ksf.cli-docs']);await entries[1].onAction!({id:'ksf.cli-docs'});
 }
 assert.equal(called,2);assert(!standardApplicationMenu('No CLI',false,first.getSnapshot(),()=>{}).some(item=>item.id==='ksf.cli-docs'));
 assert.throws(()=>first.registerMenu([{id:'ksf.cli-docs',label:'Override'}]));
 release();assert.equal(first.getSnapshot().cliDocs,null);assert.ok(second.getSnapshot().cliDocs);
});
