import {fixtureTarget} from './helpers/distribution-fixture.js';
import {gitBinary} from './helpers/platform.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { publishGitTemplate } from '../src/distribution/template-git.js';
import { repository } from './helpers/distribution-fixture.js';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ksf template 大文件 '));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
  const git = (root, args) => {
    const result = spawnSync(gitBinary, ['-C', root, ...args], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const remote = join(directory, 'remote.git'), source = join(directory, 'source'); mkdirSync(source);
  git(source, ['init', '--bare', '--template=', '--initial-branch=main', remote]);
  git(source, ['init', '--template=', '--initial-branch=main']);
  git(source, ['config', 'user.name', 'Fixture']); git(source, ['config', 'user.email', 'fixture@example.invalid']);
  git(source, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(source, 'obsolete-workflow.yml'), 'old template task\n');
  git(source, ['add', '--', 'obsolete-workflow.yml']); git(source, ['commit', '-m', 'Old template']);
  git(source, ['push', remote, 'HEAD:refs/heads/main']);
  const head = () => git(remote, ['rev-parse', 'refs/heads/main']);
  const tree = () => git(remote, ['rev-parse', 'refs/heads/main^{tree}']);
  const entry = (path, bytes, mode = 0o644) => [path, { path, bytes: Buffer.from(bytes), mode }];
  const entries = new Map([entry('中文/说明.md', 'template\n'), entry('.agents/ksf', '#!/bin/sh\nexit 0\n', 0o755), entry('知识/.gitkeep', '')]);
  const options = () => ({ repository: 'yinbaiyuan/ksf-workspace', branch: 'main', expectedHead: head(), expectedTree: tree(), entries,
    message: 'Release fixture', remoteURL: remote });
  return { remote, source, git, entries, head, tree, options, entry };
}

test('real shipped Node archive transfers via Git, preserving bytes, executable modes, Chinese paths and deletions', async t => {
  const f = fixture(t), config = JSON.parse(readFileSync(join(repository, '.agents/core/build.json')));
  const path = config.runtime.packages[fixtureTarget].archive_path, bytes = readFileSync(join(repository, path));
  assert.ok(bytes.length > 32 * 1024 * 1024, 'Regression must exercise the actual >32 MiB shipped archive.');
  f.entries.set(path, { path, bytes, mode: 0o644 });
  const before = f.head(), result = await publishGitTemplate(f.options());
  assert.equal(result.pushFailed, false); assert.equal(f.head(), result.commit);
  assert.equal(f.git(f.remote, ['rev-parse', 'main^']), before);
  const blob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  assert.equal(f.git(f.remote, ['rev-parse', `main:${path}`]), blob);
  assert.match(f.git(f.remote, ['ls-tree', 'main', '.agents/ksf']), /^100755 /);
  assert.equal(f.git(f.remote, ['show', 'main:中文/说明.md']), 'template');
  assert.equal(f.git(f.remote, ['ls-tree', 'main', 'obsolete-workflow.yml']), '');
  const second = await publishGitTemplate(f.options());
  assert.equal(second.changed, false); assert.equal(second.commit, result.commit);
});

test('a changed branch before fetch is preserved without publication', async t => {
  const f = fixture(t), options = f.options();
  writeFileSync(join(f.source, 'other.md'), 'other writer');
  f.git(f.source, ['add', '--', 'other.md']); f.git(f.source, ['commit', '-m', 'Other writer']);
  f.git(f.source, ['push', f.remote, 'HEAD:refs/heads/main']); const changed = f.head();
  await assert.rejects(publishGitTemplate(options), { code: 'TEMPLATE_CHANGED' });
  assert.equal(f.head(), changed);
});

test('a concurrent commit during upload rejects the non-force push and preserves its files', async t => {
  const f = fixture(t); let changed;
  const result = await publishGitTemplate({ ...f.options(), run: (program, args, options) => {
    if (args.includes('push')) {
      assert.ok(!args.some(arg => arg.startsWith('--force')));
      f.git(f.source, ['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Concurrent writer']);
      f.git(f.source, ['push', f.remote, 'HEAD:refs/heads/main']); changed = f.head();
    }
    return spawnSync(program, args, options);
  } });
  assert.equal(result.pushFailed, true); assert.equal(f.head(), changed);
  assert.equal(f.git(f.remote, ['show', 'main:obsolete-workflow.yml']), 'old template task');
});

test('a lost push response exposes the computed commit for read-only reconciliation without duplicating it', async t => {
  const f = fixture(t);
  const result = await publishGitTemplate({ ...f.options(), run: (program, args, options) => {
    const response = spawnSync(program, args, options);
    return args.includes('push') && response.status === 0 ? { ...response, status: 1 } : response;
  } });
  assert.equal(result.pushFailed, true); assert.equal(f.head(), result.commit);
  assert.equal((await publishGitTemplate(f.options())).changed, false);
});

test('Git errors do not echo credentials or subprocess output', async t => {
  const f = fixture(t), secret = 'fixture-secret-not-public';
  await assert.rejects(publishGitTemplate({ ...f.options(), token: secret,
    run: () => ({ status: 1, stderr: Buffer.from(secret), stdout: Buffer.from(secret) }) }), error => {
    assert.equal(error.code, 'TEMPLATE_GIT_FAILED'); assert.ok(!JSON.stringify(error).includes(secret));
    assert.ok(!error.message.includes(secret)); return true;
  });
});


for (const operation of ['rewind', 'delete']) test(`a concurrent ${operation} before push advertisement is preserved`, async t => {
  const f = fixture(t), ancestor = f.head();
  f.git(f.source, ['commit', '--allow-empty', '-m', 'Observed template head']);
  f.git(f.source, ['push', f.remote, 'HEAD:refs/heads/main']); const options = f.options();
  const result = await publishGitTemplate({ ...options, run: (program, args, config) => {
    if (args.includes('push')) {
      if (operation === 'rewind') f.git(f.remote, ['update-ref', 'refs/heads/main', ancestor, options.expectedHead]);
      else f.git(f.remote, ['update-ref', '-d', 'refs/heads/main', options.expectedHead]);
    }
    return spawnSync(program, args, config);
  } });
  assert.equal(result.pushFailed, true);
  if (operation === 'rewind') assert.equal(f.head(), ancestor);
  else assert.equal(f.git(f.remote, ['for-each-ref', 'refs/heads/main']), '');
});
