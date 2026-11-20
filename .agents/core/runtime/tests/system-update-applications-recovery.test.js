import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {distributionFixture} from './helpers/distribution-fixture.js';
import {systemUpdate,systemRollback} from '../src/distribution/system.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
import {stageApplicationPackages,applicationStatePath} from '../src/applications/core-upgrade.js';
import {processIdentity} from '../src/services/service-lock.js';
import {createApplicationManager} from './helpers/application-catalog.js';
import {assertKilled} from './helpers/core-application-fixture.js';
import {fixture} from './helpers/core-update-applications-fixture.js';
for(const point of ['applications-intent','applications-installed','committed'])test('fixed launcher recovers Core and app pointers after process kill at '+point,async t=>{
 const f=await fixture(t),marker=join(f.root,'fault-reached'),moduleURL=new URL('../src/distribution/system.js',import.meta.url).href;
 const script=`import {writeFileSync} from 'node:fs';import {systemUpdate} from ${JSON.stringify(moduleURL)};await systemUpdate({root:process.argv[1],from:process.argv[2],fault:stage=>{if(stage===${JSON.stringify(point)}){writeFileSync(process.argv[3],stage);process.kill(process.pid,'SIGKILL');}}});`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script,f.workspace,f.next.coreArchive,marker],{encoding:'utf8',timeout:120000});assertKilled(child);assert.equal(readFileSync(marker,'utf8'),point);
 const recovered=f.launch(['launcher','recover']);assert.equal(recovered.status,0,recovered.stderr);assert.equal(JSON.parse(readFileSync(join(f.workspace,'.agents/core/build.json'))).version,point==='committed'?'0.5.3':'0.1.0');assert.equal(JSON.parse(readFileSync(join(f.workspace,applicationStatePath))).installed['com.ksf.projects'].active.manifest.version,point==='committed'?'1.1.0':'1.0.0');assert.equal(existsSync(join(f.workspace,'.agents/runtime-data/system/transaction')),false);assert.equal(f.launch(['launcher','recover']).status,0);
});

test('native recovery preserves concurrent application index edits and the Core journal',async t=>{
 const f=await fixture(t),marker=join(f.root,'fault-reached'),moduleURL=new URL('../src/distribution/system.js',import.meta.url).href;const script=`import {writeFileSync} from 'node:fs';import {systemUpdate} from ${JSON.stringify(moduleURL)};await systemUpdate({root:process.argv[1],from:process.argv[2],fault:stage=>{if(stage==='applications-installed'){writeFileSync(process.argv[3],stage);process.kill(process.pid,'SIGKILL');}}});`;const child=spawnSync(process.execPath,['--input-type=module','-e',script,f.workspace,f.next.coreArchive,marker],{encoding:'utf8',timeout:120000});assertKilled(child);assert.equal(readFileSync(marker,'utf8'),'applications-installed');const path=join(f.workspace,applicationStatePath),state=JSON.parse(readFileSync(path));state.revision++;state.installed['com.ksf.projects'].enabled=true;const external=Buffer.from(JSON.stringify(state));writeFileSync(path,external);const r=f.launch(['launcher','recover']);assert.notEqual(r.status,0);assert.deepEqual(readFileSync(path),external);assert.equal(existsSync(join(f.workspace,'.agents/runtime-data/system/transaction')),true);assert.equal(JSON.parse(readFileSync(join(f.workspace,'.agents/core/build.json'))).version,'0.5.3');
});
