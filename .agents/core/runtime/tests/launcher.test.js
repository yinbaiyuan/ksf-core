import {platform,launcherInvocation} from '../src/platform/index.js';
import {fileMode} from '../src/distribution/files.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
function fixture(t) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'ksf launcher 中文 space ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
  put('AGENTS.md', 'old agents\n');
  mkdirSync(join(root, '.agents'), { recursive: true });
  for (const file of ['ksf', 'ksf.ps1']) copyFileSync(join(repository, '.agents', file), join(root, '.agents', file));
  const transaction = '.agents/runtime-data/system/transaction';
  const journal = () => {
    for (const [key, value] of Object.entries({ protocol: '1', owner: '2147483647', 'owner.start': 'dead owner', name: 'fixture-1' })) put(`${transaction}/${key}`, `${value}\n`);
  };
  const run = (...args) => {const command=launcherInvocation(root,args);return spawnSync(command.executable,command.args,{cwd:tmpdir(),encoding:'utf8',env:{...process.env,PATH:''}});};
  return { root, put, journal, run, transaction };
}
test('launcher recovery needs no Core, runtime, Git or network; arguments and root survive Core handoff', t => {
  const f = fixture(t);
  assert.equal(f.run('launcher', 'recover').status, 0);
  assert.equal(f.run('hello').status, 1);
  assert.match(f.run('hello').stderr, /BOOTSTRAP_MISSING/);
  if(platform.name==='win32')f.put('.agents/core/runtime/bootstrap.ps1', `function ksf_bootstrap_main { foreach($value in @($env:KSF_ROOT,$env:KSF_LAUNCHER_PROTOCOL)+$args){Write-Output ('<'+$value+'>')};$global:LASTEXITCODE=37 }`);
  else f.put('.agents/core/runtime/bootstrap.sh', 'ksf_bootstrap_main() { printf "<%s>\\n" "$KSF_ROOT" "$KSF_LAUNCHER_PROTOCOL" "$@"; exit 37; }\n');
  const args = ['hello', '中文 space', '', 'quote"', '$HOME;*', '--json'];
  const result = f.run(...args);
  assert.equal(result.status, 37, result.stderr);
  assert.equal(result.stdout.replaceAll('\r\n','\n'), [f.root, '1', ...args].map(value => `<${value}>\n`).join(''));
  assert.equal(readFileSync(join(f.root, '.agents/runtime-data/.gitignore'), 'utf8'), '*\n');
});
test('unknown launcher commands are rejected before runtime preparation', t => {
  const f = fixture(t), result = f.run('launcher', 'unknown');
  assert.equal(result.status, 2); assert.match(result.stderr, /Usage:/);
});
for (const protocol of ['2', '']) test(`unknown or missing journal protocol (${protocol}) preserves the transaction`, t => {
  const f = fixture(t); f.journal(); f.put(`${f.transaction}/protocol`, protocol);
  const result = f.run('launcher', 'recover');
  assert.equal(result.status, 1); assert.match(result.stderr, /RECOVERY_PROTOCOL/);
  assert.equal(existsSync(join(f.root, f.transaction)), true);
});
test('interrupted Core rename is recovered before bootstrap exists; repeated recovery is harmless', t => {
  const f = fixture(t); f.journal(); f.put(`${f.transaction}/old-core/sentinel`, 'old core');
  assert.equal(f.run('launcher', 'recover').status, 0);
  assert.equal(readFileSync(join(f.root, '.agents/core/sentinel'), 'utf8'), 'old core');
  assert.equal(existsSync(join(f.root, '.agents/runtime-data/system/failed/fixture-1')), true);
  assert.equal(f.run('launcher', 'recover').status, 0);
});
test('preparation-only recovery keeps concurrent root edits without replacement intent', t => {
  const f = fixture(t); f.journal();
  f.put(`${f.transaction}/old-root/AGENTS.md`, 'old agents\n');
  f.put('AGENTS.md', 'concurrent user edit\n');
  assert.equal(f.run('launcher', 'recover').status, 0);
  assert.equal(readFileSync(join(f.root, 'AGENTS.md'), 'utf8'), 'concurrent user edit\n');
});
test('recovery restores replaced roots, including its own executable, from preserved snapshots', t => {
  const f = fixture(t); f.journal();
  const launcher = readFileSync(join(f.root, '.agents/ksf'));
  const updated = Buffer.concat([launcher, Buffer.from('\n# new launcher\n')]);
  f.put(`${f.transaction}/old-core/sentinel`, 'old'); f.put('.agents/core/sentinel', 'new');
  for (const [path, old, next] of [['AGENTS.md', 'old agents\n', 'new agents\n'], ['.agents/ksf', launcher, updated]]) {
    f.put(`${f.transaction}/old-root/${path}`, old); f.put(`${f.transaction}/new-root/${path}`, next);
    f.put(`${f.transaction}/root-intent/${path}`, '1\n'); f.put(path, next);
  }
  chmodSync(join(f.root, `${f.transaction}/old-root/.agents/ksf`), 0o755);
  const result = f.run('launcher', 'recover');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(join(f.root, '.agents/ksf')), launcher);
  assert.equal(fileMode(join(f.root, '.agents/ksf')), 0o755);
  assert.equal(readFileSync(join(f.root, '.agents/core/sentinel'), 'utf8'), 'old');
});
test('a concurrent root edit stops recovery before changing either Core or roots', t => {
  const f = fixture(t); f.journal();
  f.put(`${f.transaction}/old-core/sentinel`, 'old'); f.put('.agents/core/sentinel', 'new');
  f.put(`${f.transaction}/old-root/AGENTS.md`, 'old agents\n'); f.put(`${f.transaction}/new-root/AGENTS.md`, 'new agents\n');
  f.put(`${f.transaction}/root-intent/AGENTS.md`, '1\n'); f.put('AGENTS.md', 'concurrent edit\n');
  const result = f.run('launcher', 'recover');
  assert.equal(result.status, 1); assert.match(result.stderr, /RECOVERY_CONFLICT/);
  assert.equal(readFileSync(join(f.root, '.agents/core/sentinel'), 'utf8'), 'new');
  assert.equal(readFileSync(join(f.root, 'AGENTS.md'), 'utf8'), 'concurrent edit\n');
  assert.equal(existsSync(join(f.root, f.transaction)), true);
});
test('committed transactions are archived without undoing the new Core', t => {
  const f = fixture(t); f.journal(); f.put(`${f.transaction}/committed`, 'fixture-1');
  f.put(`${f.transaction}/old-core/sentinel`, 'old'); f.put('.agents/core/sentinel', 'new');
  assert.equal(f.run('launcher', 'recover').status, 0);
  assert.equal(readFileSync(join(f.root, '.agents/core/sentinel'), 'utf8'), 'new');
  assert.equal(existsSync(join(f.root, '.agents/runtime-data/system/backups/fixture-1')), true);
});
test('journal symlinks and traversal names are rejected without touching their targets', t => {
  const f = fixture(t); f.journal(); f.put('outside', 'unchanged');
  rmSync(join(f.root, `${f.transaction}/protocol`)); symlinkSync(join(f.root, 'outside'), join(f.root, `${f.transaction}/protocol`));
  assert.match(f.run('launcher', 'recover').stderr, /UNSAFE_PATH/);
  assert.equal(readFileSync(join(f.root, 'outside'), 'utf8'), 'unchanged');
  rmSync(join(f.root, `${f.transaction}/protocol`)); f.put(`${f.transaction}/protocol`, '1'); f.put(`${f.transaction}/name`, '..');
  assert.match(f.run('launcher', 'recover').stderr, /JOURNAL_INVALID/);
});
test('a live recovery lock prevents a second recovery', {skip:platform.name!=='darwin'?'POSIX shlock; Windows FileStream lock covered by bootstrap-windows.ps1':false}, t => {
  const f = fixture(t); f.journal();
  const lock = join(f.root, '.agents/runtime-data/system/recovery.lock');
  assert.equal(spawnSync('/usr/bin/shlock', ['-f', lock, '-p', String(process.pid)]).status, 0);
  const result = f.run('launcher', 'recover');
  assert.equal(result.status, 1); assert.match(result.stderr, /RECOVERY_BUSY/);
  assert.equal(existsSync(join(f.root, f.transaction)), true);
});
test('archive collisions are detected before restoring live files', t => {
  const f = fixture(t); f.journal();
  f.put('.agents/runtime-data/system/failed/fixture-1/sentinel', 'keep existing archive');
  f.put(`${f.transaction}/old-core/sentinel`, 'old core'); f.put('.agents/core/sentinel', 'live core');
  const result = f.run('launcher', 'recover');
  assert.equal(result.status, 1); assert.match(result.stderr, /RECOVERY_CONFLICT/);
  assert.equal(readFileSync(join(f.root, '.agents/core/sentinel'), 'utf8'), 'live core');
});
