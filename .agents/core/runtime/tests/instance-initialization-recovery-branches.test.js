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
test('legacy rename recovery requires the original Git reference and preserves later personal commits',async t=>{
  for(const personalCommit of [false,true]){
    const f=await template(t),remote=join(f.directory,'旧事务远程.git');mkdirSync(remote);git(remote,['init','--bare','--template=','--initial-branch=core-main']);
    git(f.instance,['remote','add','origin',remote]);git(f.instance,['push','--set-upstream','origin','core-main']);
    const initial=git(f.instance,['rev-parse','HEAD']);git(f.instance,['branch','-m','main']);
    const seed=Buffer.from('Synthetic legacy initialization seed');writeAtomic(join(f.instance,'USER.md'),seed);
    const state={schema_version:1,branchBefore:'core-main',branchAfter:'main',files:[{path:'USER.md',before:null,before_mode:0o644,after_sha256:createHash('sha256').update(seed).digest('hex')}]};
    const path='.agents/runtime-data/instance-initialization/transaction.json';writeAtomic(join(f.instance,path),JSON.stringify(state));
    if(personalCommit){
      git(f.instance,['add','--force','USER.md']);git(f.instance,['commit','-m','Preserve a personal commit after an old process crash']);const personal=git(f.instance,['rev-parse','HEAD']);
      await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_RECOVERY_CONFLICT'});
      assert.equal(git(f.instance,['branch','--show-current']),'main');assert.equal(git(f.instance,['rev-parse','HEAD']),personal);
      assert.deepEqual(readRegular(f.instance,'USER.md'),seed);assert.equal(existsSync(join(f.instance,path)),true);
    }else{
      assert.equal((await initializeInstance({root:f.instance,api:f.api})).changed,true);
      assert.equal(git(f.instance,['rev-parse','core-main']),initial);assert.equal(git(f.instance,['rev-parse','main']),initial);
      assert.equal(existsSync(join(f.instance,path)),false);
    }
    assert.equal(git(remote,['rev-parse','core-main']),initial);
  }
});
