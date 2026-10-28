import{platform}from'../src/platform/index.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync, readlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { project } from '../src/services/projects.js';
import { repository } from '../src/services/repositories.js';
import { parseProjectArgs, runProjectCommand } from '../src/commands/projects.js';
import { parseRepositoryArgs } from '../src/commands/repositories.js';

function fixture(t, metadata = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf 档案 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (operation, name = '甲', options = {}, hooks) => project({ root, operation, name: operation === 'list' || (operation === 'check' && options.scope === 'all') ? undefined : name, ...options }, hooks);
  run('write', '甲', { data: { metadata: { status: 'draft', ...metadata }, body: '# 甲\n\n完成情况保留在正文。\n' } });
  const original = join(root, '项目/甲'), archived = join(root, '档案/项目/甲');
  return { root, run, original, archived, pending: () => JSON.parse(readFileSync(join(root, '.agents/runtime-data/projects/pending.json'))).operationId };
}
const snapshot = root => readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => {
  const path = join(e.parentPath, e.name); return [path, readFileSync(path).toString('base64')];
}).sort();

test('archive preview writes nothing and round-trip preserves bodies, binaries, JSON and internal links', t => {
  const f = fixture(t); mkdirSync(join(f.original, '资料'));
  const binary = Buffer.from([0, 128, 255, 3]);
  writeFileSync(join(f.original, '资料/原件.bin'), binary);
  writeFileSync(join(f.original, '资料/历史.json'), '{"path":"项目/甲/旧路径"}\n');
  symlinkSync('原件.bin', join(f.original, '资料/链接'));
  const before = snapshot(f.root);
  const preview = f.run('archive', '甲', { reason: '阶段结束', dryRun: true });
  assert.equal(preview.data.wouldChange, true); assert.equal(preview.data.changed, false);
  assert.deepEqual(snapshot(f.root), before); assert.equal(existsSync(join(f.root, '档案')), false);
  const archived = f.run('archive', '甲', { reason: '阶段结束' });
  assert.equal(archived.data.changed, true); assert.ok(archived.data.referenceReview.movedMarkdown.includes('project.md'));
  assert.equal(f.run('list', undefined).data.projects.length, 0);
  const all = f.run('list', undefined, { scope: 'all' }).data.projects;
  assert.equal(all.length, 1); assert.equal(all[0].scope, 'archived');
  const card = f.run('read', '甲', { scope: 'archived' }).data.project;
  assert.equal(card.metadata.status, 'archived'); assert.equal(card.metadata.archive_history[0].previous_status, 'draft');
  assert.equal(card.body, '# 甲\n\n完成情况保留在正文。\n');
  assert.deepEqual(readFileSync(join(f.archived, '资料/原件.bin')), binary);
  assert.equal(readlinkSync(join(f.archived, '资料/链接')), '原件.bin');
  assert.equal(readFileSync(join(f.archived, '资料/历史.json'), 'utf8'), '{"path":"项目/甲/旧路径"}\n');
  assert.equal(f.run('archive', '甲', { reason: '重复' }).data.changed, false);
  assert.equal(f.run('check', undefined, { scope: 'all' }).data.valid, true);
  f.run('write', '甲', { scope: 'archived', data: { metadata: { description: '补充说明' } } });
  f.run('restore', '甲', { status: 'draft' });
  const restored = f.run('read').data.project;
  assert.equal(restored.scope, 'current'); assert.equal(restored.metadata.status, 'draft');
  assert.equal(restored.metadata.archive_history.length, 2);
  assert.equal(f.run('restore').data.changed, false);
  f.run('archive', '甲', { reason: '再次收起' }); f.run('restore');
  assert.equal(f.run('read').data.project.metadata.archive_history.length, 4);
});

test('ability presets stay unchanged while engineering associations rebase in both scopes', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, '知识')); writeFileSync(join(f.root, '知识/依据.md'), '# 依据\n');
  const created = repository({ root: f.root, operation: 'create', target: '工程' });
  assert.equal(created.data.created, true);
  repository({ root: f.root, operation: 'link', target: 'repositories/工程', projectName: '甲' });
  f.run('write', '甲', { data: { metadata: { routing: { partners: [] } } } });
  f.run('archive', '甲', { reason: '结案' });
  const card = f.run('read', '甲', { scope: 'archived' }).data.project;
  assert.deepEqual(card.metadata.routing, { partners: [] });
  assert.deepEqual(card.metadata.repositories, ['../../../repositories/工程']);
  assert.equal(f.run('check', '甲', { scope: 'archived' }).data.valid, true);
  assert.equal(repository({ root: f.root, operation: 'check', projectName: '甲', scope: 'archived' }).data.valid, true);
  repository({ root: f.root, operation: 'unlink', target: 'repositories/工程', projectName: '甲', scope: 'archived' });
  repository({ root: f.root, operation: 'link', target: 'repositories/工程', projectName: '甲', scope: 'archived' });
  f.run('restore');
  assert.deepEqual(f.run('read').data.project.metadata.routing, { partners: [] });
  assert.equal(repository({ root: f.root, operation: 'check', projectName: '甲' }).data.valid, true);
  assert.equal(existsSync(join(f.root, 'repositories/工程/.git')), true);
});

test('archived names cannot be silently recreated and a colliding destination never merges', t => {
  const f = fixture(t); f.run('archive', '甲', { reason: '结束' });
  assert.throws(() => f.run('write', '甲', { data: { body: '# duplicate' } }), { code: 'PROJECT_ARCHIVED_EXISTS' });
  mkdirSync(f.original); writeFileSync(join(f.original, 'project.md'), '# 另一份\n');
  assert.equal(f.run('list', undefined, { scope: 'all' }).data.projects.length, 2);
  assert.throws(() => f.run('restore'), { code: 'PROJECT_DESTINATION_EXISTS' });
  assert.throws(() => f.run('archive', '甲', { reason: '结束' }), { code: 'PROJECT_DESTINATION_EXISTS' });
  assert.equal(readFileSync(join(f.original, 'project.md'), 'utf8'), '# 另一份\n');
});

test('explicit archived removal previews its own directory and preserves independent engineering', t => {
  const f = fixture(t);
  repository({ root: f.root, operation: 'create', target: '保留工程' });
  repository({ root: f.root, operation: 'link', target: 'repositories/保留工程', projectName: '甲' });
  f.run('archive', '甲', { reason: '结束' });
  const preview = f.run('remove', '甲', { scope: 'archived', dryRun: true });
  assert.equal(preview.data.path, '档案/项目/甲'); assert.equal(preview.data.scope, 'archived'); assert.equal(existsSync(f.archived), true);
  assert.equal(f.run('remove', '甲', { scope: 'archived' }).data.removed, true);
  assert.equal(existsSync(f.archived), false); assert.equal(existsSync(join(f.root, 'repositories/保留工程/.git')), true);
});

for (const stage of ['prepared', 'moved', 'card-written', 'completed']) test(`interruption at ${stage} has an explicit, repeatable recovery`, t => {
  const f = fixture(t), original = readFileSync(join(f.original, 'project.md'));
  assert.throws(() => f.run('archive', '甲', { reason: '结束' }, { fault(point) { if (point === stage) throw new Error('fixture interruption'); } }));
  const id = f.pending();
  assert.throws(() => f.run('write', '新项目', { data: { body: '# new' } }), { code: 'PROJECT_TRANSITION_PENDING' });
  assert.equal(f.run('recover', id, { dryRun: true }).data.wouldChange, true);
  f.run('recover', id);
  assert.equal(f.run('recover', id).data.changed, false);
  if (stage === 'completed') assert.equal(existsSync(f.archived), true);
  else { assert.equal(existsSync(f.original), true); assert.deepEqual(readFileSync(join(f.original, 'project.md')), original); }
});

test('recovery refuses later user edits and pre-publication changes leave the source in place', t => {
  const f = fixture(t);
  assert.throws(() => f.run('archive', '甲', { reason: '结束' }, { beforeCheck() { writeFileSync(join(f.original, '新资料.md'), 'new'); } }), { code: 'PROJECT_CONFLICT' });
  assert.equal(existsSync(f.archived), false);
  assert.throws(() => f.run('archive', '甲', { reason: '结束' }, { fault(point) { if (point === 'moved') throw new Error('stop'); } }));
  const id = f.pending(); writeFileSync(join(f.archived, '新资料.md'), '用户修改');
  assert.throws(() => f.run('recover', id), { code: 'PROJECT_CONFLICT' });
  assert.equal(readFileSync(join(f.archived, '新资料.md'), 'utf8'), '用户修改');
});

test('a root-card edit between loading and inventory is preserved before any directory move', t => {
  const f = fixture(t);
  assert.throws(() => f.run('archive', '甲', { reason: '结束' }, { afterLoad(current) {
    writeFileSync(current.target, '# 用户并发更新\n');
  } }), { code: 'PROJECT_CONFLICT' });
  assert.equal(readFileSync(join(f.original, 'project.md'), 'utf8'), '# 用户并发更新\n');
  assert.equal(existsSync(f.archived), false);
  assert.equal(existsSync(join(f.root, '.agents/runtime-data/projects/pending.json')), false);
});

test('unsupported links, embedded engineering and unsafe managed parents are rejected before moving', t => {
  const f = fixture(t); symlinkSync('../../outside', join(f.original, 'external'));
  assert.throws(() => f.run('archive', '甲', { reason: '结束', dryRun: true }), { code: 'PROJECT_LINK_RELOCATION_UNSUPPORTED' });
  rmSync(join(f.original, 'external')); mkdirSync(join(f.original, '.git'));
  assert.throws(() => f.run('archive', '甲', { reason: '结束' }), { code: 'PROJECT_EMBEDDED_REPOSITORY' });
  rmSync(join(f.original, '.git'), { recursive: true });
  mkdirSync(join(f.root, 'elsewhere')); symlinkSync('elsewhere', join(f.root, '档案'));
  assert.throws(() => f.run('archive', '甲', { reason: '结束' }), { code: 'PROJECT_PATH_INVALID' });
  assert.equal(f.run('list', undefined, { scope: 'archived' }).data.complete, false);
  assert.equal(existsSync(f.original), true);
});

test('a failed filesystem rename retains the original and a recoverable operation record', t => {
  const f = fixture(t);
  assert.throws(() => f.run('archive', '甲', { reason: '结束' }, { rename() { throw Object.assign(new Error('cross-device fixture'), { code: 'EXDEV' }); } }));
  assert.equal(existsSync(f.original), true); assert.equal(existsSync(f.archived), false);
  f.run('recover', f.pending()); assert.equal(existsSync(f.original), true);
});

test('an active material-intake lock prevents moving the project record', t => {
  const f = fixture(t); mkdirSync(join(f.original, '资料/导入记录'), { recursive: true });
  const lock = join(f.original, '资料/导入记录/.intake.lock');
  writeFileSync(lock, JSON.stringify({ pid: process.pid }));
  assert.throws(() => f.run('archive', '甲', { reason: '结束', dryRun: true }), { code: 'PROJECT_RESOURCE_BUSY' });
  assert.equal(existsSync(lock), true); assert.equal(existsSync(f.archived), false);
});

for (const stage of ['moved', 'card-staged', 'card-written']) test(`real SIGKILL at ${stage} recovers a dead writer without touching unrelated projects`, t => {
  const f = fixture(t), url = new URL('../src/services/projects.js', import.meta.url).href;
  const code = `import { project } from ${JSON.stringify(url)}; project({root:${JSON.stringify(f.root)},operation:'archive',name:'甲',reason:'fixture'}, {fault(stage){if(stage===${JSON.stringify(stage)}) process.kill(process.pid,'SIGKILL');}});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000 });
  if(platform.name==='win32')assert.equal(child.status,1,child.stderr);else assert.equal(child.signal, 'SIGKILL', child.stderr);
  const operationId = f.pending();
  const recovered = runProjectCommand(['recover', operationId], f.root);
  assert.equal(recovered.exitCode, 0, recovered.stdout);
  assert.ok(recovered.stdout.startsWith(`Updated: ${operationId}\n`));
  assert.equal(existsSync(f.original), true); assert.equal(f.run('read').data.project.metadata.status, 'draft');
  f.run('write', '乙', { data: { body: '# 乙\n' } });
});

test('archive CLI scopes and transition options remain strict and return the existing JSON envelope', t => {
  const f = fixture(t);
  assert.equal(parseProjectArgs(['list', '--scope', 'all']).scope, 'all');
  assert.equal(parseRepositoryArgs(['check', '--project', '甲', '--scope', 'archived']).scope, 'archived');
  for (const args of [['archive', '甲'], ['archive', '甲', '--reason', 'x', '--scope', 'current'], ['read', '甲', '--scope', 'all'], ['check', '甲', '--scope', 'all'], ['restore', '甲', '--status', '']]) assert.throws(() => parseProjectArgs(args));
  assert.throws(() => parseRepositoryArgs(['list', '--scope', 'archived']));
  const result = runProjectCommand(['archive', '甲', '--reason', '结束', '--dry-run', '--json'], f.root);
  assert.equal(result.exitCode, 0); assert.equal(JSON.parse(result.stdout).data.wouldChange, true);
});


for (const scope of ['current', 'archived']) test(`removed knowledge blocks ${scope} transition before moving any files`, t => {
  const f = fixture(t);
  if (scope === 'archived') f.run('archive', '甲', { reason: '结束' });
  const folder = join(f.root, scope === 'current' ? '项目/甲' : '档案/项目/甲');
  const card = join(folder, 'project.md');
  const original = readFileSync(card, 'utf8');
  writeFileSync(card, original.replace('---\n', '---\nrouting:\n  knowledge:\n    - ../../知识/不读取.md\n'));
  const before = readFileSync(card);
  assert.throws(() => f.run(scope === 'current' ? 'archive' : 'restore', '甲', { reason: '完成' }), error =>
    error.code === 'PROJECT_ROUTING_INVALID' && error.details.issues[0].code === 'PROJECT_ROUTING_KNOWLEDGE_REMOVED');
  assert.deepEqual(readFileSync(card), before);
  assert.equal(existsSync(join(f.root, scope === 'current' ? '档案/项目/甲' : '项目/甲')), false);
});
