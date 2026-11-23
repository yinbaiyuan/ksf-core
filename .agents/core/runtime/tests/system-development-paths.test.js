import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, symlinkSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from '../src/platform/index.js';
import { writeAtomic } from '../src/distribution/common.js';
import { systemFingerprint, systemRead, systemUpdate, systemRollback } from '../src/distribution/system.js';
import { distributionFixture } from './helpers/distribution-fixture.js';

test('system maintenance ignores development dependencies and preserves them through upgrade and rollback', async t => {
  const f = await distributionFixture(t), before = systemFingerprint(f.workspace);
  const outside = join(f.directory, 'linked-development-package');
  writeAtomic(join(outside, 'tool.js'), 'fictional development tool\n');
  const caches = [
    '.agents/core/applications/sdk/node_modules',
    '.agents/core/applications/example/.build',
    '.agents/core/runtime/web/node_modules',
    '.agents/core/runtime/web/.vite',
    '.agents/core/runtime/native-build/node_modules',
    '.agents/core/runtime/vendor-build/node_modules',
  ];
  for (const path of caches) {
    const directory = join(f.workspace, path);
    mkdirSync(directory, { recursive: true });
    writeAtomic(join(directory, 'cache.txt'), 'keep development cache\n');
    symlinkSync(outside, join(directory, 'linked-package'), platform.name === 'win32' ? 'junction' : 'dir');
    if (platform.name !== 'win32') {
      mkdirSync(join(directory, '.bin'));
      symlinkSync(join(outside, 'tool.js'), join(directory, '.bin', 'tool'));
    }
  }
  assert.equal(systemFingerprint(f.workspace), before);
  assert.deepEqual((await systemRead({ root: f.workspace })).changes, []);
  const next = await f.next();
  const preview = await systemUpdate({ root: f.workspace, from: next.coreArchive, dryRun: true });
  assert.equal(preview.wouldChange, true);
  await systemUpdate({ root: f.workspace, from: next.coreArchive });
  for (const path of caches) {
    assert.equal(readFileSync(join(f.workspace, path, 'cache.txt'), 'utf8'), 'keep development cache\n');
    assert.equal(readFileSync(join(f.workspace, path, 'linked-package', 'tool.js'), 'utf8'), 'fictional development tool\n');
  }
  await systemRollback({ root: f.workspace });
  assert.equal(systemFingerprint(f.workspace), before);
  for (const path of caches) assert.equal(readFileSync(join(f.workspace, path, 'cache.txt'), 'utf8'), 'keep development cache\n');
  symlinkSync(outside, join(f.workspace, '.agents/core/unmanaged-source-link'), platform.name === 'win32' ? 'junction' : 'dir');
  assert.throws(() => systemFingerprint(f.workspace), { code: 'UNSAFE_PATH' });
  await assert.rejects(systemRead({ root: f.workspace }), { code: 'UNSAFE_PATH' });
});


test('development installs retain independent transaction copies and the original rollback snapshot',async t=>{
 const f=await distributionFixture(t),paths=['applications/sdk/node_modules','applications/projects/node_modules','runtime/web/node_modules'];
 for(const path of paths){writeAtomic(join(f.workspace,'.agents/core',path,'marker'),'original development state');if(platform.name!=='win32')symlinkSync('marker',join(f.workspace,'.agents/core',path,'relative-marker'));}
 const before=systemFingerprint(f.workspace),next=await f.next();
 await assert.rejects(systemUpdate({root:f.workspace,from:next.coreArchive,fault:(phase,transaction)=>{
  if(phase!=='prepared')return;
  for(const path of paths){
   if(platform.name!=='win32')assert.equal(readlinkSync(join(transaction,'new-core',path,'relative-marker')),'marker');
   const copy=join(transaction,'new-core',path,'marker');assert.equal(readFileSync(copy,'utf8'),'original development state');writeAtomic(copy,'private failed candidate');assert.equal(readFileSync(join(f.workspace,'.agents/core',path,'marker'),'utf8'),'original development state');
  }
  throw new Error('controlled development-copy failure');
 }}),/controlled development-copy failure/);
 assert.equal(systemFingerprint(f.workspace),before);
 for(const path of paths)assert.equal(readFileSync(join(f.workspace,'.agents/core',path,'marker'),'utf8'),'original development state');
 await systemUpdate({root:f.workspace,from:next.coreArchive});
 for(const path of paths){if(platform.name!=='win32')assert.equal(readlinkSync(join(f.workspace,'.agents/core',path,'relative-marker')),'marker');assert.equal(readFileSync(join(f.workspace,'.agents/core',path,'marker'),'utf8'),'original development state');writeAtomic(join(f.workspace,'.agents/core',path,'marker'),'later development state');}
 await systemRollback({root:f.workspace});
 for(const path of paths)assert.equal(readFileSync(join(f.workspace,'.agents/core',path,'marker'),'utf8'),'original development state');
});
