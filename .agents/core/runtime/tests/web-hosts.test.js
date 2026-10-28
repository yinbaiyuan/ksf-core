import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { configureWebHosts, readWebHosts, webHostsPath } from '../src/services/web-hosts.js';

function fixture(t, text) {
  const root = mkdtempSync(join(tmpdir(), 'ksf-hosts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'hosts');
  writeFileSync(path, text, { mode: 0o640 });
  return path;
}

test('hosts preview is read-only; applying preserves existing bytes and is idempotent', t => {
  for (const original of ['127.0.0.1 localhost\n', '# existing\n127.0.0.1 localhost', '\ufeff# Windows\r\n127.0.0.1 localhost\r\n']) {
    const path = fixture(t, original), before = readFileSync(path), mode = statSync(path).mode;
    assert.equal(configureWebHosts({ path }).state, 'missing');
    assert.deepEqual(readFileSync(path), before);
    assert.equal(configureWebHosts({ path, apply: true }).changed, true);
    const after = readFileSync(path);
    assert.deepEqual(after.subarray(0, before.length), before);
    assert.equal(statSync(path).mode, mode);
    assert.equal(readWebHosts({ path }).state, 'configured');
    assert.equal(configureWebHosts({ path, apply: true }).changed, false);
    assert.deepEqual(readFileSync(path), after);
    if (original.includes('\r\n')) assert.match(after.toString(), /127\.0\.0\.1 ksf\.ai\r\n::ffff:127\.0\.0\.1 ksf\.ai\r\n$/);
  }
});

test('hosts recognizes exact aliases and comments, preserving conflicting mappings', t => {
  const ready = fixture(t, '127.0.0.1 localhost KSF.AI. # local\n::ffff:127.0.0.1 ksf.ai\n');
  assert.equal(readWebHosts({ path: ready }).state, 'configured');
  for (const text of ['10.0.0.1 ksf.ai\n', '127.0.0.1 ksf.ai\n::1 ksf.ai\n']) {
    const path = fixture(t, text);
    assert.equal(readWebHosts({ path }).state, 'conflict');
    assert.throws(() => configureWebHosts({ path, apply: true }), { code: 'WEB_HOSTS_CONFLICT' });
    assert.equal(readFileSync(path, 'utf8'), text);
  }
  const unrelated = fixture(t, '# 127.0.0.1 ksf.ai\n127.0.0.1 ksf.ai.evil.example\n');
  assert.equal(readWebHosts({ path: unrelated }).state, 'missing');
});

test('hosts adds only the missing address family, without duplicating an existing alias', t => {
  const path = fixture(t, '127.0.0.1 localhost ksf.ai\n');
  assert.equal(configureWebHosts({ path, apply: true }).changed, true);
  assert.equal(readFileSync(path, 'utf8'), '127.0.0.1 localhost ksf.ai\n::ffff:127.0.0.1 ksf.ai\n');
});

test('hosts rejects unsupported encodings and file symlinks, and reports missing files', t => {
  const path = fixture(t, Buffer.from([255, 254, 65, 0]));
  assert.throws(() => configureWebHosts({ path, apply: true }), { code: 'WEB_HOSTS_INVALID' });
  if (process.platform !== 'win32') {
    const link = path + '-link'; symlinkSync(path, link);
    assert.throws(() => configureWebHosts({ path: link, apply: true }), { code: 'WEB_HOSTS_INVALID' });
  }
  assert.equal(readWebHosts({ path: path + '-missing' }).state, 'unavailable');
});

test('hosts resolves platform paths without requiring Windows or a DNS daemon', () => {
  assert.equal(webHostsPath({ platform: 'darwin', env: {} }), '/etc/hosts');
  assert.equal(webHostsPath({ platform: 'win32', env: {} }), 'C:\\Windows\\System32\\drivers\\etc\\hosts');
  assert.equal(webHostsPath({ platform: 'win32', env: { SystemRoot: 'D:\\Windows' } }), 'D:\\Windows\\System32\\drivers\\etc\\hosts');
});
