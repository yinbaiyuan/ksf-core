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
test('recovery retains personal commits made on main after a process crash',async t=>{
  const f=await template(t),original=git(f.instance,['rev-parse','HEAD']);
  const moduleURL=new URL('../src/distribution/instance.js',import.meta.url).href,apiURL=new URL('./helpers/contribution-api.js',import.meta.url).href;
  const code=`import {initializeInstance} from ${JSON.stringify(moduleURL)};import {ForkAPI} from ${JSON.stringify(apiURL)};await initializeInstance({root:${JSON.stringify(f.instance)},revision:${JSON.stringify(f.first.coreRevision)},api:new ForkAPI({coreRoot:${JSON.stringify(f.root)}}),fault:path=>{if(path==='git:branch')process.exit(75);}});`;
  const crashed=spawnSync(process.execPath,['--input-type=module','--eval',code],{encoding:'utf8',timeout:60000});
  assert.equal(crashed.status,75,crashed.stderr+crashed.stdout);
  writeAtomic(join(f.instance,'personal.txt'),'Synthetic work after interruption');git(f.instance,['add','personal.txt']);git(f.instance,['commit','-m','Preserve personal work']);
  const personal=git(f.instance,['rev-parse','HEAD']);
  await assert.rejects(initializeInstance({root:f.instance,api:f.api}),{code:'INSTANCE_RECOVERY_CONFLICT'});
  assert.equal(git(f.instance,['rev-parse','main']),personal);assert.equal(git(f.instance,['rev-parse','core-main']),original);
  assert.equal(existsSync(join(f.instance,'.agents/runtime-data/instance-initialization/transaction.json')),true);
  assert.equal(readRegular(f.instance,'personal.txt').toString(),'Synthetic work after interruption');
});

test('a crash after writing the receipt still requires initialization recovery before incubation',async t=>{
  const f=await template(t),moduleURL=new URL('../src/distribution/instance.js',import.meta.url).href,apiURL=new URL('./helpers/contribution-api.js',import.meta.url).href;
  const code=`import {initializeInstance} from ${JSON.stringify(moduleURL)};import {ForkAPI} from ${JSON.stringify(apiURL)};await initializeInstance({root:${JSON.stringify(f.instance)},revision:${JSON.stringify(f.first.coreRevision)},api:new ForkAPI({coreRoot:${JSON.stringify(f.root)}}),fault:path=>{if(path==='.agents/core/release.json')process.exit(75);}});`;
  const crashed=spawnSync(process.execPath,['--input-type=module','--eval',code],{encoding:'utf8',timeout:60000});
  assert.equal(crashed.status,75,crashed.stderr+crashed.stdout);
  assert.equal(existsSync(join(f.instance,'.agents/core/release.json')),true);
  assert.equal(existsSync(join(f.instance,'.agents/runtime-data/instance-initialization/transaction.json')),true);
  assert.equal(contextEntry(f.instance).mode,'instance-setup');
  const result=await initializeInstance({root:f.instance,revision:f.first.coreRevision,api:f.api});
  assert.equal(result.initialized,true);assert.equal(result.changed,true);
  assert.equal(existsSync(join(f.instance,'.agents/runtime-data/instance-initialization/transaction.json')),false);
  assert.equal(contextEntry(f.instance).mode,'incubation');
});
