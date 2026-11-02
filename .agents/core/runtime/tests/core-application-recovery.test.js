import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {reconcileCoreApplications,applicationStatePath,stageApplicationPackages,verifyInstalledRelease} from '../src/applications/core-upgrade.js';
import {release,fixture,seed,baseline,assertKilled} from './helpers/core-application-fixture.js';
test('installed package verification keeps canonical member paths and rejects backslash entries',t=>{
  const f=fixture(t),item=release('1.0.0');stageApplicationPackages(f.root,{packages:[item]});
  assert.doesNotThrow(()=>verifyInstalledRelease(f.root,item.release));
  const record=join(f.root,'.agents/user-data/applications/packages',item.release.manifest.id,item.release.digest,'release.json');
  const info=JSON.parse(readFileSync(record));info.files['backend\\index.mjs']=info.files['backend/index.mjs'];writeFileSync(record,JSON.stringify(info));
  assert.throws(()=>verifyInstalledRelease(f.root,item.release),{code:'APP_PACKAGE_INTEGRITY'});
});
for(const point of ['core-reconcile.json','state.json','core-baseline.json'])test('bridge real SIGKILL recovery at '+point,async t=>{
 const f=fixture(t),marker=join(f.root,'fault-reached'),old=release('1.0.0'),next=release('1.1.0',{api:'1.1.0'});seed(f,old);baseline(f,next);
 const moduleURL=new URL('../src/applications/core-upgrade.js',import.meta.url).href;
 const script=`import {basename} from 'node:path';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const rename=fs.renameSync;fs.renameSync=(...args)=>{const result=rename(...args);if(basename(String(args[1]))===process.argv[3]){fs.writeFileSync(process.argv[4],process.argv[3]);process.kill(process.pid,'SIGKILL');}return result;};syncBuiltinESMExports();const {reconcileCoreApplications}=await import(${JSON.stringify(moduleURL)});await reconcileCoreApplications(process.argv[1],process.argv[2]);`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script,f.root,f.target,point,marker],{encoding:'utf8',timeout:30000});assertKilled(r);assert.equal(readFileSync(marker,'utf8'),point);await reconcileCoreApplications(f.root,f.target);const after=readFileSync(join(f.root,applicationStatePath));assert.equal(JSON.parse(after).installed['com.ksf.projects'].active.manifest.version,'1.1.0');assert.equal(JSON.parse(after).installed['com.ksf.projects'].installationId,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');await reconcileCoreApplications(f.root,f.target);assert.deepEqual(readFileSync(join(f.root,applicationStatePath)),after);
});

test('interrupted bridge refuses concurrent index changes without overwriting user choices',async t=>{
 const f=fixture(t),marker=join(f.root,'fault-reached'),old=release('1.0.0'),next=release('1.1.0',{api:'1.1.0'});seed(f,old);baseline(f,next);const moduleURL=new URL('../src/applications/core-upgrade.js',import.meta.url).href;
 const script=`import {basename} from 'node:path';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const rename=fs.renameSync;fs.renameSync=(...args)=>{const result=rename(...args);if(basename(String(args[1]))===process.argv[3]){fs.writeFileSync(process.argv[4],process.argv[3]);process.kill(process.pid,'SIGKILL');}return result;};syncBuiltinESMExports();const {reconcileCoreApplications}=await import(${JSON.stringify(moduleURL)});await reconcileCoreApplications(process.argv[1],process.argv[2]);`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script,f.root,f.target,'core-reconcile.json',marker],{encoding:'utf8',timeout:30000});assertKilled(r);assert.equal(readFileSync(marker,'utf8'),'core-reconcile.json');const path=join(f.root,applicationStatePath),state=JSON.parse(readFileSync(path));state.revision++;state.installed['com.ksf.projects'].enabled=true;const external=Buffer.from(JSON.stringify(state));writeFileSync(path,external);await assert.rejects(reconcileCoreApplications(f.root,f.target),{code:'APP_STATE_CHANGED'});assert.deepEqual(readFileSync(path),external);assert.equal(JSON.parse(readFileSync(join(f.root,'.agents/runtime-data/applications/core-reconcile.json'))).schemaVersion,1);
});
