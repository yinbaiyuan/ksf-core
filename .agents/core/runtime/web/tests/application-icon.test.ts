import test from 'node:test';import assert from 'node:assert/strict';
import {applicationIconModel,createIconCatalog} from '../src/apps/application-icon-model.ts';
import type {StoreApplication,StoreCatalog} from '../src/apps/application-model.ts';
const app={appId:'example.app',display:{manifest:{id:'example.app',version:'1.0.0',icon:'terminal'},source:{id:'original'},listing:{icon:{url:'media/icon.png',size:20,sha256:'a'.repeat(64)}}}} as StoreApplication;
test('Dock and Store resolve the same built-in identities, including Projects and unsupported glyphs',()=>{
  for(const [id,key] of [['conversations','flywheel'],['markdown','documents'],['git','git'],['com.ksf.projects','projects'],['com.ksf.knowledge','knowledge'],['com.ksf.abilities','abilities'],['app-store','store']])assert.equal(applicationIconModel(id,{icon:id}).key,key);
  assert.equal(applicationIconModel('com.ksf.terminal',{icon:'terminal'}).key,'terminal');assert.equal(applicationIconModel('external',{icon:'unknown'}).key,'package');
  assert.equal(applicationIconModel('com.ksf.activity-monitor',{icon:'activity'}).key,'monitor');
});
test('custom icons use the same declared-source proxy as Store and retain the same fallback',()=>{
  const icon=applicationIconModel(app.appId,undefined,app),url=new URL(icon.imageURL!,'http://example.invalid');assert.equal(icon.key,'terminal');assert.equal(url.pathname,'/api/apps/media');assert.equal(url.searchParams.get('sourceId'),'original');assert.equal(url.searchParams.get('digest'),'a'.repeat(64));assert.equal(applicationIconModel(app.appId,{icon:'terminal'}).key,icon.key);
  const branded=applicationIconModel('com.yinbaiyuan.daily-meeting',undefined,{...app,appId:'com.yinbaiyuan.daily-meeting'});assert.equal(branded.key,'meeting');assert.equal(new URL(branded.imageURL!,'http://example.invalid').searchParams.get('digest'),'a'.repeat(64));
});
test('icon metadata deduplicates loads, notifies changes and retries failures without blocking application definitions',async()=>{
  let reads=0,time=0,fail=false;const catalog={applications:[app]} as StoreCatalog;
  const cache=createIconCatalog(async()=>{reads++;if(fail)throw Error('offline');return catalog;},()=>time);let changes=0;const off=cache.subscribe(()=>changes++);
  await Promise.all([cache.refresh(),cache.refresh()]);assert.equal(reads,1);assert.equal(changes,1);assert.equal(cache.get(app.appId),app);
  await cache.refresh();assert.equal(reads,1);cache.replace(catalog);assert.equal(changes,1);
  time=60001;fail=true;await cache.refresh();assert.equal(reads,2);assert.equal(cache.get(app.appId),app);
  time=120002;fail=false;await cache.refresh();assert.equal(reads,3);assert.equal(changes,1);off();
});
