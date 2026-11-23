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
test('a single-branch clone cannot mistake an unfetched personal main for a new instance',async t=>{
  const f=await reclonedInstance(t),limited=join(f.directory,'仅默认分支的克隆');
  git(f.directory,['clone','--single-branch','--branch','core-main',f.remote,limited]);
  assert.equal(git(limited,['for-each-ref','--format=%(refname)','refs/remotes/origin/main']),'');
  const config=readFileSync(join(limited,'.git/config'));
  await assert.rejects(initializeInstance({root:limited,api:f.offline}),{code:'INSTANCE_BRANCH_CONFLICT'});
  assert.equal(git(limited,['branch','--show-current']),'core-main');assert.equal(existsSync(join(limited,'USER.md')),false);
  assert.equal(git(limited,['for-each-ref','--format=%(refname)','refs/heads/main']),'');assert.deepEqual(readFileSync(join(limited,'.git/config')),config);
});
