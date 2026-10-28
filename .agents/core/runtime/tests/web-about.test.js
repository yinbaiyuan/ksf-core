import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readWorkbenchAbout } from '../src/services/web-about.js';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ksf-about-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'build.json');
}
test('about reads the executing Core build version instead of an installation receipt or frontend package', t => {
  const file = fixture(t);
  writeFileSync(file, JSON.stringify({ schema_version: 1, name: 'ksf-core', version: '1.2.3-dev.4' }));
  writeFileSync(join(file, '../release.json'), JSON.stringify({ version: '0.9.0' }));
  writeFileSync(join(file, '../package.json'), JSON.stringify({ version: '0.1.0' }));
  assert.deepEqual(readWorkbenchAbout(file), { ok: true, productName: 'KSF 工作台', coreVersion: '1.2.3-dev.4' });
});
test('missing metadata returns a bounded error without exposing local paths', t => {
  const file = fixture(t);
  assert.throws(() => readWorkbenchAbout(file), { code: 'WEB_ABOUT_UNAVAILABLE', message: '版本信息暂不可用。' });
});
test('corrupt, unrelated and invalid version metadata cannot produce a misleading version', t => {
  const file = fixture(t);
  for (const content of ['{', 'null', '{}', JSON.stringify({ schema_version: 1, name: 'other', version: '1.2.3' }), JSON.stringify({ schema_version: 1, name: 'ksf-core', version: '1.02.3' })]) {
    writeFileSync(file, content);
    assert.throws(() => readWorkbenchAbout(file), { code: 'WEB_ABOUT_UNAVAILABLE', message: '版本信息暂不可用。' });
  }
});
