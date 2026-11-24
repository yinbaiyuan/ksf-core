import {fixtureTarget} from './helpers/distribution-fixture.js';
import assert from 'node:assert/strict';
import {test,beforeEach} from 'node:test';
import {existsSync,writeFileSync} from 'node:fs';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join,basename} from 'node:path';
import {stableJSON} from '../src/distribution/common.js';
import {systemCheck,systemUpdate,systemFingerprint} from '../src/distribution/system.js';
import {transactionFixture as distributionFixture} from './helpers/distribution-fixture.js';
const sample = 'first\none\ntwo\nthree\nfour\nfive\nlast\n';

beforeEach(t => {
  const remove = fsPromises.rm, removeSync = fs.rmSync, removals = [];
  const owned = path => typeof path === 'string' && /^ksf-(update|rollback)-/.test(basename(path));
  const asyncMock = t.mock.method(fsPromises, 'rm', (path, options) => {
    if (!owned(path)) return remove(path, options);
    const entry = { path, finished: false }; removals.push(entry);
    return (async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      await remove(path, options); entry.finished = true;
    })();
  });
  const syncMock = t.mock.method(fs, 'rmSync', (path, options) => {
    assert(!owned(path), 'owned validation staging must use the awaited asynchronous cleanup');
    return removeSync(path, options);
  });
  syncBuiltinESMExports();
  t.after(() => {
    asyncMock.mock.restore(); syncMock.mock.restore(); syncBuiltinESMExports();
    for (const entry of removals) {
      assert(entry.finished, 'update must not return while its private cleanup is in flight');
      assert(!existsSync(entry.path), 'private staging must be removed before returning');
    }
  });
});

test('update preview verifies the candidate but changes no live system or personal file', async t => {
  const f = await distributionFixture(t), next = await f.next();
  const before = systemFingerprint(f.workspace);
  const result = await systemUpdate({ root: f.workspace, source: next.source, dryRun: true });
  assert.equal(result.wouldChange, true); assert.equal(result.changed, false);
  assert.equal(systemFingerprint(f.workspace), before);
  assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/transaction')), false);
});


test('checksum failures, wrong source identity and invalid candidates cannot publish a partial system', async t => {
  const f = await distributionFixture(t), next = await f.next();
  const before = systemFingerprint(f.workspace), feed = structuredClone(next.feed);
  feed.platforms[fixtureTarget].core.sha256 = '0'.repeat(64);
  writeFileSync(next.source, stableJSON(feed));
  await assert.rejects(systemUpdate({ root: f.workspace, source: next.source }), { code: 'CHECKSUM_MISMATCH' });
  feed.core_repository = 'different/core'; writeFileSync(next.source, stableJSON(feed));
  await assert.rejects(systemCheck({ root: f.workspace, source: next.source }), { code: 'RELEASE_INVALID' });
  assert.equal(systemFingerprint(f.workspace), before);
});
