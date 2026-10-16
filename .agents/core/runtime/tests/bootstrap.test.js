import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const runtime = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const platform = 'darwin-arm64';
const sha256 = data => createHash('sha256').update(data).digest('hex');

class Fixture {
  constructor() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf runtime 测试 ')));
    this.children = new Set();
    this.launcher = join(this.root, '.agents/ksf');
    mkdirSync(dirname(this.launcher), { recursive: true });
    copyFileSync(join(repo, '.agents/ksf'), this.launcher);
    chmodSync(this.launcher, 0o755);
    mkdirSync(this.path('.agents/core/runtime/src'), { recursive: true });
    writeFileSync(this.path('.agents/core/runtime/src/cli.js'), '// fixture business entry\n');
    copyFileSync(join(runtime, 'bootstrap.sh'), this.path('.agents/core/runtime/bootstrap.sh'));
    this.release = this.makeRelease('99.0.0');
    this.writeManifest(this.release);
  }

  path(name) { return join(this.root, name); }

  makeRelease(version, license = 'fixture license') {
    const node = Buffer.from(`#!/bin/sh
if [ "$1" = '--version' ]; then
  [ -z "\${KSF_TEST_TRACE-}" ] || printf 'node-version\\n' >> "$KSF_TEST_TRACE"
  printf 'v${version}\\n'
else
  printf '{"version":"v${version}","nodePath":"%s"}\\n' "$0"
fi
`);
    const archiveRoot = `node-v${version}-${platform}`;
    const archivePath = `.agents/core/runtime/packages/${archiveRoot}.tar.gz`;
    const scratch = mkdtempSync(this.path('package fixture '));
    const contents = join(scratch, archiveRoot);
    mkdirSync(join(contents, 'bin'), { recursive: true });
    writeFileSync(join(contents, 'bin/node'), node, { mode: 0o755 });
    writeFileSync(join(contents, 'LICENSE'), license);
    mkdirSync(dirname(this.path(archivePath)), { recursive: true });
    try {
      const packed = spawnSync('/usr/bin/tar', ['-czf', this.path(archivePath), '-C', scratch, archiveRoot], {
        encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, timeout: 15_000,
      });
      assert.equal(packed.status, 0, packed.stderr);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    return { version, archivePath, archiveRoot,
      archiveSha256: sha256(readFileSync(this.path(archivePath))), nodeSha256: sha256(node) };
  }

  writeManifest(release) {
    writeFileSync(this.path('.agents/core/manifest.yaml'), `name: ksf-core
version: null
runtime:
  bootstrap_protocol: 1
  engine: nodejs
  version: "${release.version}"
  source_entry: .agents/core/runtime/src/cli.js
  packages:
    ${platform}:
      archive_path: ${release.archivePath}
      archive_root: ${release.archiveRoot}
      archive_sha256: ${release.archiveSha256}
      node_sha256: ${release.nodeSha256}
`);
  }

  cli(args = ['hello', '--json'], env = {}) {
    const result = spawnSync(this.launcher, args, {
      cwd: '/tmp', env: { ...process.env, PATH: '/usr/bin:/bin', ...env },
      encoding: 'utf8', timeout: 15_000,
    });
    if (result.error) throw result.error;
    return result;
  }

  install() {
    const result = this.cli();
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).nodePath;
  }

  tools(scripts) {
    const tools = this.path('tools');
    mkdirSync(tools, { recursive: true });
    for (const [name, body] of Object.entries(scripts)) {
      writeFileSync(join(tools, name), `#!/bin/sh\n${body}`, { mode: 0o755 });
    }
    return { PATH: `${tools}:/usr/bin:/bin` };
  }

  installedRecords() {
    const folder = this.path('.agents/runtime-data/runtime/node');
    return readdirSync(folder).filter(name => existsSync(join(folder, name, '.install-record')));
  }

  start(args, env = {}, detached = false) {
    const child = spawn(this.launcher, args, {
      env: { ...process.env, PATH: '/usr/bin:/bin', ...env }, detached,
    });
    const state = { child, detached };
    this.children.add(state);
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
    child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
    state.completed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (detached) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      }, 15_000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', (status, signal) => {
        clearTimeout(timer);
        this.children.delete(state);
        resolve({ status, signal, stdout, stderr });
      });
    });
    return state;
  }

  async cleanup() {
    for (const state of this.children) {
      if (state.detached) process.kill(-state.child.pid, 'SIGKILL');
      else state.child.kill('SIGKILL');
    }
    await Promise.allSettled([...this.children].map(state => state.completed));
    rmSync(this.root, { recursive: true, force: true });
  }
}

let fixture;
beforeEach(() => { fixture = new Fixture(); });
afterEach(async () => { await fixture?.cleanup(); });

test('first call prepares runtime without installed Node', () => {
  const node = fixture.install();
  assert.ok(existsSync(node));
  assert.ok(node.startsWith(`${fixture.path('.agents/runtime-data/runtime/node')}${sep}`));
  assert.ok(existsSync(join(dirname(dirname(node)), '.install-record')));
});

test('warm start does not hash, extract or spawn a version check', () => {
  const node = fixture.install();
  const record = join(dirname(dirname(node)), '.install-record');
  const before = statSync(record, { bigint: true }).mtimeNs;
  const trace = fixture.path('trace');
  const env = { ...fixture.tools({ shasum: 'exit 91\n', tar: 'exit 92\n' }), KSF_TEST_TRACE: trace };
  const result = fixture.cli(undefined, env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(statSync(record, { bigint: true }).mtimeNs, before);
  assert.equal(existsSync(trace), false);
});

test('empty PATH uses system tools without global Node', () => {
  const result = fixture.cli(undefined, { PATH: '' });
  assert.equal(result.status, 0, result.stderr);
});

test('preparation does not depend on caller locale', () => {
  const result = fixture.cli(undefined, { LC_ALL: 'ksf_missing_locale', LANG: 'ksf_missing_locale' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /locale/);
});

test('version upgrade and rollback retain both installations', () => {
  const oldNode = fixture.install();
  fixture.writeManifest(fixture.makeRelease('99.1.0'));
  const newNode = fixture.install();
  assert.notEqual(oldNode, newNode);
  assert.ok(existsSync(oldNode));
  assert.equal(JSON.parse(fixture.cli().stdout).version, 'v99.1.0');
  fixture.writeManifest(fixture.release);
  const result = fixture.cli(undefined, fixture.tools({ shasum: 'exit 91\n', tar: 'exit 92\n' }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).nodePath, oldNode);
});

test('same version with a new archive uses a new installation', () => {
  const oldNode = fixture.install();
  fixture.writeManifest(fixture.makeRelease('99.0.0', 'updated license'));
  const newNode = fixture.install();
  assert.notEqual(oldNode, newNode);
  assert.ok(existsSync(oldNode));
});

test('source-only change reuses the installed runtime', () => {
  const node = fixture.install();
  writeFileSync(fixture.path('.agents/core/runtime/src/cli.js'), '// updated business entry\n');
  const result = fixture.cli(undefined, fixture.tools({ shasum: 'exit 91\n', tar: 'exit 92\n' }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).nodePath, node);
});

test('changed file attributes verify Node without unpacking', () => {
  const node = fixture.install();
  const stat = statSync(node);
  utimesSync(node, stat.atime, new Date(stat.mtimeMs + 10_000));
  const trace = fixture.path('hash-trace');
  const env = { ...fixture.tools({ tar: 'exit 92\n',
    shasum: 'printf "%s\\n" "$3" >> "$KSF_TEST_TRACE"\nexec /usr/bin/shasum "$@"\n' }), KSF_TEST_TRACE: trace };
  const result = fixture.cli(undefined, env);
  assert.equal(result.status, 0, result.stderr);
  const lines = readFileSync(trace, 'utf8').trim().split('\n');
  assert.ok(lines.includes(node));
  assert.equal(lines.some(line => line.endsWith('.tar.gz')), false);
  const again = fixture.cli(undefined, fixture.tools({ shasum: 'exit 91\n', tar: 'exit 92\n' }));
  assert.equal(again.status, 0, again.stderr);
});

test('missing or corrupted Node is automatically repaired', () => {
  const node = fixture.install();
  unlinkSync(node);
  assert.equal(fixture.install(), node);
  writeFileSync(node, 'corrupted runtime\n');
  assert.equal(fixture.install(), node);
  assert.equal(sha256(readFileSync(node)), fixture.release.nodeSha256);
});

test('invalid installation record is rebuilt', () => {
  const node = fixture.install();
  const record = join(dirname(dirname(node)), '.install-record');
  writeFileSync(record, 'protocol=1\n');
  assert.equal(fixture.install(), node);
  assert.ok(readFileSync(record, 'utf8').includes(`archive_sha256=${fixture.release.archiveSha256}`));
});

test('bad upgrade fails without running or deleting the old Node', () => {
  const oldNode = fixture.install();
  const upgraded = fixture.makeRelease('99.1.0');
  fixture.writeManifest(upgraded);
  writeFileSync(fixture.path(upgraded.archivePath), 'broken archive');
  const result = fixture.cli();
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ARCHIVE_INVALID/);
  assert.ok(existsSync(oldNode));
  assert.equal(readdirSync(fixture.path('.agents/runtime-data/runtime/locks')).some(name => name.endsWith('.lock')), false);
});

test('wrong Node hash fails before execution', () => {
  fixture.writeManifest({ ...fixture.release, nodeSha256: '0'.repeat(64) });
  const result = fixture.cli();
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /NODE_INVALID/);
  assert.deepEqual(fixture.installedRecords(), []);
});

test('missing archive fails on the first call', () => {
  unlinkSync(fixture.path(fixture.release.archivePath));
  const result = fixture.cli();
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ARCHIVE_MISSING/);
});

test('duplicate or unsupported manifest fields fail closed', () => {
  const manifest = fixture.path('.agents/core/manifest.yaml');
  const original = readFileSync(manifest, 'utf8');
  for (const malformed of [original.replace('  bootstrap_protocol: 1', '  bootstrap_protocol: 2'),
    original.replace('  version:', '  version: "98.0.0"\n  version:')]) {
    writeFileSync(manifest, malformed);
    const result = fixture.cli();
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /MANIFEST_INVALID/);
  }
});

test('stale PID lock is recovered', () => {
  const locks = fixture.path('.agents/runtime-data/runtime/locks');
  mkdirSync(locks, { recursive: true });
  const identity = `99.0.0-${platform}-${fixture.release.archiveSha256}`;
  writeFileSync(join(locks, `${identity}.lock`), '99999999\n');
  fixture.install();
  assert.equal(readdirSync(locks).some(name => name.endsWith('.lock')), false);
});

test('concurrent calls unpack once', async () => {
  const trace = fixture.path('extract-trace');
  const env = { ...fixture.tools({ tar: 'case "$1" in -xzf) printf "extract\\n" >> "$KSF_TEST_TRACE"; sleep 0.3;; esac\nexec /usr/bin/tar "$@"\n' }),
    KSF_TEST_TRACE: trace };
  const children = Array.from({ length: 4 }, () => fixture.start(['hello', '--json'], env));
  const results = await Promise.all(children.map(state => state.completed));
  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).version, 'v99.0.0');
  }
  assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n'), ['extract', 'node-version']);
});

test('killed preparation is not reused and the next call recovers', async () => {
  const trace = fixture.path('extract-started');
  const env = { ...fixture.tools({ tar: 'case "$1" in -xzf) printf "started\\n" > "$KSF_TEST_TRACE"; sleep 20;; esac\nexec /usr/bin/tar "$@"\n' }),
    KSF_TEST_TRACE: trace };
  const state = fixture.start(['hello'], env, true);
  const deadline = Date.now() + 5_000;
  while (!existsSync(trace) && Date.now() < deadline) await delay(20);
  assert.ok(existsSync(trace));
  process.kill(-state.child.pid, 'SIGKILL');
  const result = await state.completed;
  assert.equal(result.signal, 'SIGKILL');
  assert.deepEqual(fixture.installedRecords(), []);
  fixture.install();
  assert.deepEqual(readdirSync(fixture.path('.agents/runtime-data/runtime/staging')), []);
});

test('manual verification reads the archive even with a ready installation', () => {
  fixture.install();
  writeFileSync(fixture.path(fixture.release.archivePath), 'bad archive');
  const result = fixture.cli(['runtime', 'verify']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ARCHIVE_INVALID/);
});
