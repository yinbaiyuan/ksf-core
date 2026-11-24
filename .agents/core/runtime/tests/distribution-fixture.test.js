import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {distributionFixture,transactionFixture,git,commitWorkspace} from './helpers/distribution-fixture.js';
import {installedManifest,writeAtomic} from '../src/distribution/common.js';
import {inspectReleaseDirectory} from '../src/distribution/publish.js';

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

test('transaction fixtures retain validated initial archives and independent writable sources without an unused inspection copy',async t=>{
 const f=await transactionFixture(t),source=readFileSync(join(f.root,'.agents/core/example.txt'));
 assert.equal(inspectReleaseDirectory(f.root,f.first.output).index.core_revision,f.first.coreRevision);
 assert.equal(installedManifest(f.workspace).version,'0.1.0');
 assert.deepEqual(readFileSync(join(f.workspace,'.agents/core/example.txt')),source);
 assert(!existsSync(join(f.first.output,'ksf')));
 for(const key of ['template','instance'])assert.throws(()=>f.first[key],{code:'TEST_FIXTURE_INSPECTION_NOT_REQUESTED'});
 writeAtomic(join(f.workspace,'.agents/core/example.txt'),'only the writable transaction workspace changes');
 assert.deepEqual(readFileSync(join(f.root,'.agents/core/example.txt')),source);
 assert.equal(git(f.root,['status','--porcelain']),'');
 assert.equal(inspectReleaseDirectory(f.root,f.first.output).index.core_revision,f.first.coreRevision);
});
