import {platform as nativePlatform} from '../src/platform/index.js';
import {fixtureTarget} from './helpers/distribution-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installedManifest, stableJSON, writeAtomic } from '../src/distribution/common.js';
import { systemCheck, systemUpdate, systemRollback, systemRead, systemSync, systemFingerprint } from '../src/distribution/system.js';
import { distributionFixture } from './helpers/distribution-fixture.js';
const sample = 'first\none\ntwo\nthree\nfour\nfive\nlast\n';

for (const point of ['old-renamed', 'new-renamed', 'committed']) {
  test(`a real SIGKILL at ${point} is recovered by the fixed launcher without Node or Git setup`, async t => {
    const f = await distributionFixture(t), next = await f.next();
    const moduleURL = new URL('../src/distribution/system.js', import.meta.url).href;
    const script = `import {systemUpdate} from ${JSON.stringify(moduleURL)};\n` +
      `await systemUpdate({root: process.argv[1], from: process.argv[2], fault: stage => {if(stage === process.argv[3]) process.kill(process.pid, 'SIGKILL');}});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, f.workspace, next.coreArchive, point], { encoding: 'utf8', timeout: 60000 });
    assert.equal(child.error,undefined,child.error?.message);
    if(nativePlatform.name==='win32')assert.equal(child.status,1,child.stderr);else assert.equal(child.signal,'SIGKILL',child.stderr);
    const recovered = f.launch(['hello', '--json']);
    assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
    assert.equal(installedManifest(f.workspace).version, point === 'committed' ? '0.1.1' : '0.1.0');
    assert.equal(existsSync(join(f.workspace, '.agents/runtime-data/system/transaction')), false);
    assert.equal(f.launch(['hello', '--json']).status, 0);
  });
}
