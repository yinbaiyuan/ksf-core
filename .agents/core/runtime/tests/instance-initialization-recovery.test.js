import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync,mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {git} from './helpers/distribution-fixture.js';
import {ForkAPI} from './helpers/contribution-api.js';
import {initializeInstance} from '../src/distribution/instance.js';
import {contextEntry} from '../src/services/entry-context.js';
import {writeAtomic,readRegular} from '../src/distribution/files.js';
import {template} from './helpers/instance-fixture.js';
test('recovery refreshes local Git configuration after a branch write and preserves concurrent settings',async t=>{
  const f=await template(t),transaction=join(f.instance,'.agents/runtime-data/instance-initialization/transaction.json');
  const configPath=join(f.instance,'.git/config'),originalConfig=readFileSync(configPath),large='x'.repeat(480*1024);
  appendFileSync(configPath,`\n[push]\n\tdefault = current\n[branch "main"]\n\tremote = ${large}\n\tmerge = ${large}\n\tpushRemote = ${large}\n\tpushRemote = second\n`);
  const oversizedConfig=readFileSync(configPath);
  await assert.rejects(initializeInstance({root:f.instance,api:f.api,dryRun:true}),{code:'INSTANCE_PUSH_CONFIG_CONFLICT'});
  assert.deepEqual(readFileSync(configPath),oversizedConfig);
  assert.equal(existsSync(transaction),false);
  writeFileSync(configPath,originalConfig);
  const savedPushRemote='saved\nremote\rvalue';
  git(f.instance,['config','branch.main.pushRemote',savedPushRemote]);
  git(f.instance,['config','branch.main.remote','']);
  await assert.rejects(initializeInstance({root:f.instance,api:f.api,fault:path=>{
    if(path==='BOT.md')throw new Error('controlled restoration of local values');
  }}),/controlled restoration of local values/);
  assert.equal(git(f.instance,['config','--local','--null','--get-all','branch.main.pushRemote']),savedPushRemote+'\0');
  assert.equal(git(f.instance,['config','--local','--null','--get-all','branch.main.remote']),'\0');
  assert.equal(existsSync(transaction),false);
  await assert.rejects(initializeInstance({root:f.instance,api:f.api,fault:path=>{
    if(path==='git:branch'){
      git(f.instance,['config','--local','push.default','upstream']);
      throw new Error('controlled concurrent configuration edit');
    }
  }}),{code:'INSTANCE_RECOVERY_CONFLICT'});
  assert.equal(git(f.instance,['config','--local','push.default']),'upstream');
  assert.equal(git(f.instance,['branch','--show-current']),'main');
  assert.equal(existsSync(transaction),true);
  await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_RECOVERY_CONFLICT'});
  assert.equal(git(f.instance,['config','--local','push.default']),'upstream');
  assert.equal(existsSync(transaction),true);
});
