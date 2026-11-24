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
test('initialization failure restores files and branch, and can be retried', async t => {
  const f = await template(t), before = readFileSync(join(f.instance,'.gitignore'));
  git(f.instance,['config','push.default','matching']);git(f.instance,['config','branch.main.remote','saved-remote']);
  await assert.rejects(initializeInstance({root:f.instance,api:f.api,fault:path=>{if(path==='BOT.md')throw new Error('controlled failure');}}),/controlled failure/);
  assert.equal(existsSync(join(f.instance,'USER.md')),false);assert.equal(existsSync(join(f.instance,'BOT.md')),false);
  assert.deepEqual(readFileSync(join(f.instance,'.gitignore')),before);
  assert.equal(git(f.instance,['branch','--show-current']),'core-main');
  assert.equal(git(f.instance,['config','push.default']),'matching');
  assert.equal(git(f.instance,['config','branch.main.remote']),'saved-remote');
  assert.equal(git(f.instance,['for-each-ref','--format=%(refname)','refs/heads/main']),'');
  assert.equal((await initializeInstance({root:f.instance,api:f.api})).changed,true);
});

test('official Core URL variants and hidden push destinations cannot initialize a personal main',async t=>{
  const f=await template(t),config=JSON.parse(readRegular(f.instance,'.agents/core/distribution.json')),repo=config.core_repository;
  const variants=[`ssh://git@github.com/${repo}.git`,`https://example-user@github.com/${repo.toUpperCase()}.git/`,`git@github.com:${repo.toUpperCase()}.git`];
  git(f.instance,['remote','add','origin',variants[0]]);
  for(const url of variants){
    git(f.instance,['remote','set-url','origin',url]);
    await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_CORE_SOURCE'});
    assert.equal(existsSync(join(f.instance,'USER.md')),false);assert.equal(git(f.instance,['branch','--show-current']),'core-main');
  }
  git(f.instance,['remote','set-url','origin','https://github.com/example/private-instance.git']);
  git(f.instance,['config','--add','remote.origin.pushurl','https://github.com/example/private-instance.git']);
  git(f.instance,['config','--add','remote.origin.pushurl',variants[0]]);
  const before=readFileSync(join(f.instance,'.git/config'));
  await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_PUSH_CONFIG_CONFLICT'});
  assert.deepEqual(readFileSync(join(f.instance,'.git/config')),before);assert.equal(existsSync(join(f.instance,'USER.md')),false);
  assert.equal(git(f.instance,['for-each-ref','--format=%(refname)','refs/heads/main']),'');
  git(f.instance,['config','--unset-all','remote.origin.pushurl']);
  git(f.instance,['config',`url.${variants[0]}.pushInsteadOf`,'https://github.com/example/private-instance.git']);
  const rewritten=readFileSync(join(f.instance,'.git/config'));
  await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_PUSH_CONFIG_CONFLICT'});
  assert.deepEqual(readFileSync(join(f.instance,'.git/config')),rewritten);assert.equal(existsSync(join(f.instance,'USER.md')),false);
});
