import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {transactionFixture as distributionFixture} from './helpers/distribution-fixture.js';
import {systemUpdate,systemRollback} from '../src/distribution/system.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
import {stageApplicationPackages,applicationStatePath} from '../src/applications/core-upgrade.js';
import {processIdentity} from '../src/services/service-lock.js';
import {createApplicationManager} from './helpers/application-catalog.js';
import {assertKilled} from './helpers/core-application-fixture.js';
import {fixture} from './helpers/core-update-applications-fixture.js';
test('Core owns builtin versions; source installs and standalone rollback are rejected while Core rollback preserves business files',async t=>{
 const f=await fixture(t),sentinel=join(f.workspace,'.agents/user-data/applications/data/com.ksf.projects/private.json');mkdirSync(join(sentinel,'..'),{recursive:true});writeFileSync(sentinel,'{"schemaVersion":1,"private":"keep"}');
 const preview=await systemUpdate({root:f.workspace,from:f.next.coreArchive,dryRun:true});assert.equal(preview.applications.find(a=>a.appId==='com.ksf.projects').action,'update');assert.equal(JSON.parse(readFileSync(join(f.workspace,applicationStatePath))).installed['com.ksf.projects'].active.manifest.version,'1.0.0');
 await systemUpdate({root:f.workspace,from:f.next.coreArchive});
 const manager=createApplicationManager(f.workspace,{coreVersion:'0.5.3',storeDirectory:join(f.workspace,'.agents/core/applications/builtin'),fetcher:async()=>{throw Error('offline');}});t.after(()=>manager.close());
 await assert.rejects(manager.install({appId:'com.ksf.projects',sourceId:'ksf-apps',version:'1.2.0',digest:'a'.repeat(64),trusted:true}),{code:'APP_CORE_MANAGED'});await assert.rejects(manager.changeApp('com.ksf.projects','rollback'),{code:'APP_CORE_MANAGED'});await manager.close();
 await systemRollback({root:f.workspace});const state=JSON.parse(readFileSync(join(f.workspace,applicationStatePath)));assert.equal(state.installed['com.ksf.projects'].active.manifest.version,'1.0.0');assert.equal(state.installed['com.ksf.projects'].enabled,false);assert.equal(state.installed['com.ksf.projects'].installationId,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');assert.equal(readFileSync(sentinel,'utf8'),'{"schemaVersion":1,"private":"keep"}');
});
test('migrated business data blocks both rollback paths without restoring stale data',async t=>{
 const f=await fixture(t,{migration:true}),path=join(f.workspace,'.agents/user-data/applications/data/com.ksf.projects/state.json');mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify({schemaVersion:1,items:['keep']}));await systemUpdate({root:f.workspace,from:f.next.coreArchive});const manager=createApplicationManager(f.workspace,{coreVersion:'0.5.3',storeDirectory:join(f.workspace,'.agents/core/applications/builtin')});t.after(()=>manager.close());const lease=await manager.launch('com.ksf.projects',f.two.release.digest,{kind:'service'});assert.equal(await manager.call(lease.id,'read'),'ok');await manager.release(lease.id);await manager.close();const migrated=readFileSync(path);assert.equal(JSON.parse(migrated).schemaVersion,2);await assert.rejects(systemRollback({root:f.workspace,dryRun:true}),{code:'APP_DATA_INCOMPATIBLE'});const retry=createApplicationManager(f.workspace,{coreVersion:'0.5.3',storeDirectory:join(f.workspace,'.agents/core/applications/builtin')});t.after(()=>retry.close());await assert.rejects(retry.changeApp('com.ksf.projects','rollback'));assert.deepEqual(readFileSync(path),migrated);
});

test('live service blocks actual Core and application switching',async t=>{
 const f=await fixture(t),before=readFileSync(join(f.workspace,applicationStatePath)),control=join(f.workspace,'.agents/runtime-data/web/control.json');mkdirSync(join(control,'..'),{recursive:true});writeFileSync(control,JSON.stringify(processIdentity()));await assert.rejects(systemUpdate({root:f.workspace,from:f.next.coreArchive}),{code:'SERVICE_RUNNING'});assert.deepEqual(readFileSync(join(f.workspace,applicationStatePath)),before);assert.equal(JSON.parse(readFileSync(join(f.workspace,'.agents/core/build.json'))).version,'0.1.0');
});
