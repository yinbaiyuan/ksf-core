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

for (const rootFile of ['AGENTS.md', '.agents/ksf', '.agents/ksf.ps1']) {
  test(`SIGKILL after replacing ${rootFile} restores roots and Core together`, async t => {
    const f = await distributionFixture(t);
    const paths = ['AGENTS.md', '.agents/ksf', '.agents/ksf.ps1'];
    const changes = Object.fromEntries(paths.map(path => [path, readFileSync(join(f.root, path), 'utf8') + '\n# Fictional new release\n']));
    const next = await f.next('0.1.1', changes), before = systemFingerprint(f.workspace);
    const moduleURL = new URL('../src/distribution/system.js', import.meta.url).href;
    const script = `import {systemUpdate} from ${JSON.stringify(moduleURL)};\n` +
      `await systemUpdate({root:process.argv[1],from:process.argv[2],fault:stage=>{if(stage===process.argv[3])process.kill(process.pid,'SIGKILL');}});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, f.workspace, next.coreArchive, `root-installed:${rootFile}`], { encoding: 'utf8', timeout: 60000 });
    assert.equal(child.error,undefined,child.error?.message);
    if(nativePlatform.name==='win32')assert.equal(child.status,1,child.stderr);else assert.equal(child.signal,'SIGKILL',child.stderr);
    const recovered = f.launch(['launcher', 'recover'], {timeoutMs:60000});
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(systemFingerprint(f.workspace), before);
  });
}
