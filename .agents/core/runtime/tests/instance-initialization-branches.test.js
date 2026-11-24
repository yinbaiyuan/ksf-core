import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {git} from './helpers/distribution-fixture.js';
import {initializeInstance,needsInstanceInitialization} from '../src/distribution/instance.js';
import {contextEntry} from '../src/services/entry-context.js';
import {installedManifest} from '../src/distribution/manifests.js';
import {writeAtomic,readRegular} from '../src/distribution/files.js';
import {template} from './helpers/instance-fixture.js';
test('a cloned core-main keeps its refs and tracking while ordinary personal pushes update only main',async t=>{
  const f=await template(t),remote=join(f.directory,'个人远程.git');mkdirSync(remote);
  git(remote,['init','--bare','--template=','--initial-branch=core-main']);
  git(f.instance,['remote','add','origin',remote]);git(f.instance,['push','--set-upstream','origin','core-main']);
  const original=git(remote,['rev-parse','refs/heads/core-main']);
  git(f.instance,['config','push.default','matching']);
  git(f.instance,['config','branch.autoSetupMerge','inherit']);
  const configBefore=readFileSync(join(f.instance,'.git/config'));
  await initializeInstance({root:f.instance,api:f.api,dryRun:true});
  assert.deepEqual(readFileSync(join(f.instance,'.git/config')),configBefore);
  assert.equal(git(f.instance,['for-each-ref','--format=%(refname)','refs/heads/main']),'');
  await initializeInstance({root:f.instance,api:f.api});
  assert.equal(git(f.instance,['config','branch.core-main.remote']),'origin');
  assert.equal(git(f.instance,['config','branch.core-main.merge']),'refs/heads/core-main');
  assert.equal(git(f.instance,['config','branch.main.remote']),'origin');
  assert.equal(git(f.instance,['config','branch.main.merge']),'refs/heads/main');
  assert.equal(git(f.instance,['config','branch.main.pushRemote']),'origin');
  assert.equal(git(f.instance,['config','push.default']),'current');
  assert.equal(git(remote,['symbolic-ref','HEAD']),'refs/heads/core-main');
  assert.equal(git(remote,['for-each-ref','--format=%(refname)','refs/heads/main']),'');
  const path='知识/个人资料.md';
  for(const text of ['仅个人实例保存的合成材料','再次更新个人资料']){
    writeAtomic(join(f.instance,path),text);git(f.instance,['add','--',path]);git(f.instance,['commit','-m','Synthetic personal change']);
    git(f.instance,['push']);
    assert.equal(git(remote,['rev-parse','refs/heads/main']),git(f.instance,['rev-parse','HEAD']));
    assert.equal(git(remote,['rev-parse','refs/heads/core-main']),original);
    assert.equal(git(f.instance,['rev-parse','refs/heads/core-main']),original);
    assert.equal(git(remote,['symbolic-ref','HEAD']),'refs/heads/core-main');
  }
  const after=readFileSync(join(f.instance,'.git/config'));
  assert.equal((await initializeInstance({root:f.instance,api:f.api})).changed,false);
  assert.deepEqual(readFileSync(join(f.instance,'.git/config')),after);
});

test('explicit origin push mappings, mirrors and an existing main stop before changing files or refs',async t=>{
  const f=await template(t),head=git(f.instance,['rev-parse','HEAD']);
  for(const [key,value] of [['remote.origin.push','refs/heads/main:refs/heads/core-main'],['remote.origin.mirror','true']]){
    git(f.instance,['config',key,value]);
    await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_PUSH_CONFIG_CONFLICT'});
    assert.equal(existsSync(join(f.instance,'USER.md')),false);
    assert.equal(git(f.instance,['branch','--show-current']),'core-main');
    assert.equal(git(f.instance,['config',key]),value);git(f.instance,['config','--unset-all',key]);
  }
  git(f.instance,['branch','--no-track','main']);
  await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_BRANCH_CONFLICT'});
  assert.equal(git(f.instance,['rev-parse','main']),head);assert.equal(git(f.instance,['branch','--show-current']),'core-main');
  git(f.instance,['switch','main']);
  assert.equal((await initializeInstance({root:f.instance,api:f.api})).createdBranch,false);
  assert.equal(git(f.instance,['rev-parse','core-main']),head);
});
