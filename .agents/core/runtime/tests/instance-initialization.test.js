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
test('independent Core template verifies its original tree, uses main, and enters incubation', async t => {
  const ignored='.agents/runtime-data/template-only.txt',untracked='.agents/core/template-only.txt';
  const f = await template(t,{beforeCopy(f){
    for(const path of [ignored,untracked])writeAtomic(join(f.root,path),'Synthetic local file outside the recorded source');
  }});
  for(const path of [ignored,untracked])assert.equal(existsSync(join(f.instance,path)),false);
  assert.equal(needsInstanceInitialization(f.instance),true);
  assert.equal(contextEntry(f.instance).mode,'instance-setup');
  let preview; try { preview = await initializeInstance({root:f.instance,api:f.api,dryRun:true}); } catch (error) { t.diagnostic(JSON.stringify(error.data??{code:error.code,message:error.message})); throw error; }
  assert.equal(preview.wouldChange,true); assert.equal(existsSync(join(f.instance,'USER.md')),false);
  writeAtomic(join(f.instance,'USER.md'),'My existing private preferences');
  const remote = 'https://github.com/example/my-private-ksf.git';git(f.instance,['remote','add','origin',remote]);
  const result = await initializeInstance({root:f.instance,api:f.api});
  assert.equal(result.changed,true); assert.equal(git(f.instance,['branch','--show-current']),'main');
  assert.equal(result.createdBranch,true); assert.equal(result.pushTarget,'origin/main');
  assert.equal(git(f.instance,['rev-parse','core-main']),git(f.instance,['rev-parse','main']));
  assert.equal(git(f.instance,['config','branch.main.merge']),'refs/heads/main');
  assert.equal(git(f.instance,['remote','get-url','origin']),remote);
  assert.equal(readRegular(f.instance,'USER.md').toString(),'My existing private preferences');
  assert.equal(installedManifest(f.instance).core.revision,f.first.coreRevision);
  assert.equal(contextEntry(f.instance).mode,'incubation');
  assert.equal((await initializeInstance({root:f.instance,api:f.api})).changed,false);
});

test('unverified source and modified system files fail before seeding or renaming', async t => {
  const f = await template(t);
  await assert.rejects(initializeInstance({root:f.instance,api:{request:async()=>[]}}),{code:'INSTANCE_SOURCE_UNVERIFIED'});
  writeAtomic(join(f.instance,'.agents/core/private.js'),'local edit');
  await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_SOURCE_MODIFIED'});
  assert.equal(existsSync(join(f.instance,'USER.md')),false);
  assert.equal(git(f.instance,['branch','--show-current']),'core-main');
});
