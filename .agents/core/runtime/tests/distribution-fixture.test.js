import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {distributionFixture,git,commitWorkspace} from './helpers/distribution-fixture.js';
import {installedManifest,writeAtomic} from '../src/distribution/common.js';

test('run seed consumers own independent Core histories, receipts and workspace changes',async t=>{
  const first=await distributionFixture(t),second=await distributionFixture(t);
  assert.notEqual(first.root,second.root);assert.notEqual(first.workspace,second.workspace);
  const revision=git(second.root,['rev-parse','HEAD']),receipt=readFileSync(join(second.workspace,'.agents/core/release.json'));
  commitWorkspace(first);writeAtomic(join(first.workspace,'.agents/core/example.txt'),'only first scenario\n');commitWorkspace(first);
  await first.next('0.1.1',{'.agents/core/example.txt':'independent next release\n'});
  assert.notEqual(git(first.root,['rev-parse','HEAD']),revision);
  assert.equal(git(second.root,['rev-parse','HEAD']),revision);assert.equal(git(second.root,['status','--porcelain']),'');
  assert.deepEqual(readFileSync(join(second.workspace,'.agents/core/release.json')),receipt);
  assert.equal(installedManifest(second.workspace).version,'0.1.0');
  assert.notEqual(readFileSync(join(second.workspace,'.agents/core/example.txt'),'utf8'),'only first scenario\n');
});
