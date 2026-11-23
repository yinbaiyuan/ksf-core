import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {git} from './helpers/distribution-fixture.js';
import {initializeInstance} from '../src/distribution/instance.js';
import {contextEntry} from '../src/services/entry-context.js';
import {writeAtomic,readRegular} from '../src/distribution/files.js';
import {template,reclonedInstance} from './helpers/instance-fixture.js';
test('recloning rolls back restoration and prefers an existing local main without resetting personal commits',async t=>{
  const f=await reclonedInstance(t);
  // Exercise Windows-style conversion without mixing the helper's isolated
  // global configuration and the initialization subprocess environment.
  git(f.clone,['config','core.autocrlf','true']);const config=readFileSync(join(f.clone,'.git/config'));
  await assert.rejects(initializeInstance({root:f.clone,api:f.offline,fault:path=>{if(path==='git:branch')throw new Error('controlled restore failure');}}),/controlled restore failure/);
  assert.equal(git(f.clone,['branch','--show-current']),'core-main');assert.deepEqual(readFileSync(join(f.clone,'.git/config')),config);
  assert.equal(git(f.clone,['for-each-ref','--format=%(refname)','refs/heads/main']),'');
  assert.equal(git(f.clone,['status','--porcelain']),'');
  git(f.clone,['switch','--track','-c','main','origin/main']);writeAtomic(join(f.clone,'local-only.txt'),'Synthetic unpushed work');
  git(f.clone,['add','local-only.txt']);git(f.clone,['commit','-m','Keep local personal commit']);const local=git(f.clone,['rev-parse','HEAD']);git(f.clone,['switch','core-main']);
  await initializeInstance({root:f.clone,api:f.offline});
  assert.equal(git(f.clone,['rev-parse','HEAD']),local);assert.equal(git(f.clone,['rev-parse','origin/main']),f.personal);
  assert.equal(readRegular(f.clone,'local-only.txt').toString(),'Synthetic unpushed work');assert.equal(git(f.clone,['rev-parse','core-main']),f.initial);
});

test('recloning retains commits made after a restoration process crash',async t=>{
  const f=await reclonedInstance(t),moduleURL=new URL('../src/distribution/instance.js',import.meta.url).href;
  const code=`import {initializeInstance} from ${JSON.stringify(moduleURL)};await initializeInstance({root:${JSON.stringify(f.clone)},fault:path=>{if(path==='git:branch')process.exit(75);}});`;
  const crashed=spawnSync(process.execPath,['--input-type=module','--eval',code],{encoding:'utf8',timeout:60000});
  assert.equal(crashed.status,75,crashed.stderr+crashed.stdout);
  writeAtomic(join(f.clone,'after-crash.txt'),'Synthetic personal work after crash');git(f.clone,['add','after-crash.txt']);git(f.clone,['commit','-m','Preserve work after restoration crash']);const personal=git(f.clone,['rev-parse','HEAD']);
  await assert.rejects(initializeInstance({root:f.clone,api:f.offline}),{code:'INSTANCE_RECOVERY_CONFLICT'});
  assert.equal(git(f.clone,['rev-parse','main']),personal);assert.equal(git(f.clone,['rev-parse','core-main']),f.initial);
  assert.equal(existsSync(join(f.clone,'.agents/runtime-data/instance-initialization/transaction.json')),true);
});
