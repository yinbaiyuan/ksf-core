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
test('recloning restores the existing personal main offline instead of reinitializing the template snapshot',async t=>{
  const f=await reclonedInstance(t),config=readFileSync(join(f.clone,'.git/config'));
  const preview=await initializeInstance({root:f.clone,api:f.offline,dryRun:true});
  assert.equal(preview.resumed,true);assert.deepEqual(preview.files,[]);
  assert.equal(git(f.clone,['branch','--show-current']),'core-main');assert.deepEqual(readFileSync(join(f.clone,'.git/config')),config);
  const result=await initializeInstance({root:f.clone,api:f.offline});
  assert.equal(result.resumed,true);assert.equal(git(f.clone,['rev-parse','main']),f.personal);
  assert.equal(git(f.clone,['rev-parse','core-main']),f.initial);assert.equal(git(f.remote,['symbolic-ref','HEAD']),'refs/heads/core-main');
  for(const path of ['USER.md','知识/个人资料.md','.agents/core/release.json','.agents/user-data/incubation.json','.agents/core/example.txt'])assert.deepEqual(readRegular(f.clone,path),readRegular(f.instance,path));
  assert.equal(contextEntry(f.clone).mode,contextEntry(f.instance).mode);
  writeAtomic(join(f.clone,'知识/个人资料.md'),'More synthetic private knowledge');git(f.clone,['add','知识/个人资料.md']);git(f.clone,['commit','-m','Continue personal work']);git(f.clone,['push']);
  assert.equal(git(f.remote,['rev-parse','main']),git(f.clone,['rev-parse','HEAD']));assert.equal(git(f.remote,['rev-parse','core-main']),f.initial);
});

test('recloning preserves dirty and ignored files instead of overwriting them during main restoration',async t=>{
  const f=await reclonedInstance(t),entry=readRegular(f.clone,'AGENTS.md'),config=readFileSync(join(f.clone,'.git/config'));
  writeAtomic(join(f.clone,'AGENTS.md'),'Uncommitted synthetic edit');
  await assert.rejects(initializeInstance({root:f.clone,api:f.offline}),{code:'INSTANCE_BRANCH_CONFLICT'});
  assert.equal(readRegular(f.clone,'AGENTS.md').toString(),'Uncommitted synthetic edit');writeAtomic(join(f.clone,'AGENTS.md'),entry);
  writeAtomic(join(f.clone,'USER.md'),'Ignored synthetic identity must survive');
  await assert.rejects(initializeInstance({root:f.clone,api:f.offline}),{code:'INSTANCE_BRANCH_CONFLICT'});
  assert.equal(readRegular(f.clone,'USER.md').toString(),'Ignored synthetic identity must survive');
  assert.equal(git(f.clone,['branch','--show-current']),'core-main');assert.deepEqual(readFileSync(join(f.clone,'.git/config')),config);
  assert.equal(git(f.clone,['for-each-ref','--format=%(refname)','refs/heads/main']),'');
  rmSync(join(f.clone,'USER.md'));
  // A main without a valid initialized receipt must not be replaced by a fresh main.
  git(f.clone,['update-ref','refs/remotes/origin/main',f.initial]);
  await assert.rejects(initializeInstance({root:f.clone,api:f.offline}),{code:'INSTANCE_BRANCH_CONFLICT'});
  assert.equal(git(f.clone,['branch','--show-current']),'core-main');assert.equal(existsSync(join(f.clone,'USER.md')),false);
});
