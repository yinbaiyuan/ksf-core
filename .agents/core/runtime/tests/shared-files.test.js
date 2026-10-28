import {platform} from '../src/platform/index.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, renameSync, mkdirSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withExclusiveLock, withTemporaryFile } from '../src/shared/files.js';
import { readSnapshot, publishFile } from '../src/metadata/files.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ksf shared files '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return name => join(root, name);
}

test('exclusive locks preserve an existing owner and release after action failure', t => {
  const path = fixture(t)('write.lock');
  const failure = new Error('business failure');
  assert.throws(() => withExclusiveLock(path, { pid: 7 }, () => {
    assert.deepEqual(JSON.parse(readFileSync(path)), { pid: 7 });
    assert.throws(() => withExclusiveLock(path, {}, () => assert.fail('must not enter')), { code: 'EEXIST' });
    assert.deepEqual(JSON.parse(readFileSync(path)), { pid: 7 });
    throw failure;
  }), error => error === failure);
  assert.equal(existsSync(path), false);
});

test('lock cleanup preserves a replacement and invokes its domain notification', t => {
  const path = fixture(t)('write.lock');
  let notified = false;
  const value = withExclusiveLock(path, {}, () => {
    renameSync(path, path + '.old');
    writeFileSync(path, 'new owner');
    return 42;
  }, { onReplaced() { notified = true; } });
  assert.equal(value, 42);
  assert.equal(notified, true);
  assert.equal(readFileSync(path, 'utf8'), 'new owner');
});

test('durable temporary files clean up on rejected publication and retain requested permissions', t => {
  const path = fixture(t)('staged');
  assert.throws(() => withTemporaryFile(path, 'new bytes', { permissions: 0o640 }, staged => {
    assert.equal(readFileSync(staged, 'utf8'), 'new bytes');
    if(platform.supportsPosixModes)assert.equal(statSync(staged).mode & 0o777,0o640);
    throw new Error('publication rejected');
  }), /publication rejected/);
  assert.equal(existsSync(path), false);
});

test('metadata adapter still detects a publication conflict and retains mode on successful replacement', t => {
  const path = fixture(t)('note.md');
  writeFileSync(path, 'original'); chmodSync(path, 0o640);
  assert.throws(() => publishFile(readSnapshot(path), Buffer.from('requested'), {
    beforeCheck() { writeFileSync(path, 'concurrent edit'); },
  }), { code: 'FILE_CONFLICT' });
  assert.equal(readFileSync(path, 'utf8'), 'concurrent edit');
  publishFile(readSnapshot(path), Buffer.from('published'));
  assert.equal(readFileSync(path, 'utf8'), 'published');
  if(platform.supportsPosixModes)assert.equal(statSync(path).mode & 0o777,0o640);
});

test('exclusive lock permits publication and removal of its parent directory',t=>{
  const base=fixture(t)('folder');mkdirSync(base);const lock=join(base,'owner.lock');
  withExclusiveLock(lock,{pid:process.pid},()=>{renameSync(base,base+'.published');rmSync(base+'.published',{recursive:true});});
  assert.equal(existsSync(base),false);
});

test('POSIX permission bits survive metadata replacement',{skip:!platform.supportsPosixModes?'NTFS has no POSIX chmod bits; declared Git/archive modes are tested separately':false},t=>{const path=fixture(t)('mode.md');writeFileSync(path,'old');chmodSync(path,0o640);publishFile(readSnapshot(path),Buffer.from('new'));assert.equal(statSync(path).mode&0o777,0o640);});
