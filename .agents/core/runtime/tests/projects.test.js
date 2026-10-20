import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, rmdirSync, readFileSync, writeFileSync, readdirSync,
  realpathSync, symlinkSync, existsSync, renameSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { project, updateProjectMetadata } from '../src/services/projects.js';
import { withWriteLock } from '../src/metadata/files.js';
import { metadata } from '../src/services/metadata.js';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf projects ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '项目'));
  const run = (operation, name, options = {}, hooks) => project({ root, operation, name, ...options }, hooks);
  const create = (name = '测试 甲', data = { body: '# 分享会\n\n当前内容。\n' }) => run('write', name, { data });
  const file = (name = '测试 甲') => join(root, '项目', name, 'project.md');
  return { root, run, create, file };
}

test('metadata transforms see the latest card inside the existing project lock and retain unrelated values', t => {
  const f = fixture(t); f.create('甲', { metadata: { repositories: ['existing'] }, body: '# Original\n' });
  metadata({ root: f.root, target: f.file('甲'), operation: 'write', data: { description: 'latest' } });
  const result = updateProjectMetadata({ root: f.root, name: '甲' }, values => {
    assert.equal(existsSync(join(f.root, '.agents/runtime-data/projects/write.lock')), true);
    assert.equal(values.description, 'latest');
    return { ...values, repositories: [...values.repositories, 'new'] };
  });
  assert.equal(result.changed, true);
  const read = f.run('read', '甲').data.project;
  assert.equal(read.metadata.description, 'latest');
  assert.deepEqual(read.metadata.repositories, ['existing', 'new']);
  assert.equal(read.body, '# Original\n');
});

test('project discovery is shallow, deterministic and accepts root cards without frontmatter', t => {
  const f = fixture(t);
  assert.deepEqual(f.run('list').data, { complete: true, projects: [] });
  f.create('乙', { metadata: { name: '乙显示名', description: '原始\n摘要', status: 'archived' }, body: '# 乙\n' });
  f.create('甲');
  mkdirSync(join(f.root, '项目', '甲', '资料'));
  writeFileSync(join(f.root, '项目', '甲', '资料', 'project.md'), '# 不应被发现');
  mkdirSync(join(f.root, '项目', '仅目录'));
  writeFileSync(join(f.root, '项目', '.gitkeep'), '');
  const listed = f.run('list');
  assert.deepEqual(listed.data.projects.map(p => p.name), ['乙', '甲']);
  assert.equal(listed.data.projects[0].description, '原始\n摘要');
  assert.equal(listed.data.projects[0].status, 'archived');
  assert.equal(listed.data.projects[1].title, '分享会');
  assert.equal(listed.data.projects[1].description, null);
  assert.ok(listed.data.projects.every(row => !Object.hasOwn(row, 'body')));
  assert.deepEqual(f.run('check').data.projects.map(row => row.valid), [true, true]);
  assert.equal(f.run('read', '甲').data.project.state, 'absent');
  assert.deepEqual(f.run('read', '甲', { part: 'metadata' }).data.project.metadata, {});
  assert.ok(!Object.hasOwn(f.run('read', '甲', { part: 'body' }).data.project, 'metadata'));
});

test('list retains valid projects when one root card is malformed and distinguishes missing scope', t => {
  const f = fixture(t); f.create('正常'); f.create('损坏');
  writeFileSync(f.file('损坏'), '---\nname: [\n---\nPRIVATE_CONTENT');
  const list = f.run('list');
  assert.equal(list.data.complete, false);
  assert.deepEqual(list.data.projects.map(row => row.name), ['正常']);
  assert.equal(list.errors[0].code, 'YAML_INVALID');
  assert.ok(!JSON.stringify(list.errors).includes('PRIVATE_CONTENT'));
  const check = f.run('check');
  assert.equal(check.data.valid, false);
  assert.equal(check.data.projects.find(row => row.name === '损坏').valid, false);
  rmSync(join(f.root, '项目'), { recursive: true });
  assert.equal(f.run('list').errors[0].code, 'PROJECT_DIRECTORY_MISSING');
  assert.throws(() => f.run('read', '不存在'), { code: 'PROJECT_DIRECTORY_MISSING' });
});

test('discovery reports unsupported stored names instead of exposing unreadable project targets', t => {
  const f = fixture(t); f.create('正常');
  mkdirSync(join(f.root, '项目', '不支持\\名称'));
  writeFileSync(join(f.root, '项目', '不支持\\名称', 'project.md'), '# 存量资料');
  const listed = f.run('list');
  assert.equal(listed.data.complete, false);
  assert.deepEqual(listed.data.projects.map(row => row.name), ['正常']);
  assert.equal(listed.errors[0].code, 'PROJECT_PATH_INVALID');
});

test('project writes merge metadata, replace only supplied body and preserve comments, BOM and CRLF', t => {
  const f = fixture(t); f.create();
  const original = '\uFEFF---\r\n# keep this comment\r\nname: "原名" # inline\r\ntags: [a]\r\n---\r\n# 原正文\r\n';
  writeFileSync(f.file(), original);
  const changed = f.run('write', '测试 甲', { data: { metadata: { name: '新名', extra: null } } });
  assert.equal(changed.data.changed, true);
  const after = readFileSync(f.file(), 'utf8');
  assert.ok(after.startsWith('\uFEFF---\r\n# keep this comment\r\n'));
  assert.match(after, /# inline/);
  assert.ok(after.endsWith('# 原正文\r\n'));
  assert.deepEqual(f.run('read', '测试 甲').data.project.metadata, { name: '新名', tags: ['a'], extra: null });
  f.run('write', '测试 甲', { data: { body: '# 替换正文\n' } });
  const latest = readFileSync(f.file(), 'utf8');
  assert.equal(latest.slice(0, latest.indexOf('# 替换正文')), after.slice(0, after.indexOf('# 原正文')));
  assert.equal(f.run('write', '测试 甲', { data: { metadata: { tags: ['a'] }, body: '# 替换正文\n' } }).data.changed, false);
});

test('dry-run creation, updates and removal do not create locks, folders or change bytes', t => {
  const f = fixture(t);
  rmdirSync(join(f.root, '项目'));
  const preview = f.run('write', '新项目', { data: { body: '# 新项目\n' }, dryRun: true });
  assert.equal(preview.data.wouldCreate, true); assert.equal(preview.data.created, false);
  assert.equal(preview.data.wouldChange, true); assert.equal(preview.data.changed, false);
  assert.deepEqual(readdirSync(f.root), []);
  f.create(); const before = readFileSync(f.file());
  f.run('write', '测试 甲', { data: { body: '# 新内容' }, dryRun: true });
  const removal = f.run('remove', '测试 甲', { dryRun: true });
  assert.equal(removal.data.wouldChange, true); assert.equal(removal.data.removed, false);
  assert.deepEqual(removal.data.entries, ['project.md']);
  assert.deepEqual(readFileSync(f.file()), before);
  assert.deepEqual(readdirSync(join(f.root, '.agents/runtime-data/projects')), []);
});

test('invalid names and inputs are rejected before any persistent directory is created', t => {
  const f = fixture(t);
  for (const name of ['', ' ', '.', '..', '../外部', 'a/b', 'a\\b', '/tmp/other', 'a\0b', '.ksf-project-hidden']) {
    assert.throws(() => f.create(name), { code: 'INVALID_ARGUMENTS' }, name);
  }
  for (const data of [{}, { name: 'wrong' }, { body: null }, { metadata: [] }, { metadata: null }, { body: '---\nx: 1\n---\n' }]) {
    assert.throws(() => f.create('输入测试', data));
  }
  assert.throws(() => f.create('缺正文', { metadata: { name: 'x' } }), { code: 'INVALID_ARGUMENTS' });
  assert.deepEqual(readdirSync(f.root), ['项目']);
});

test('project file, project folder and scope symlinks cannot be read, written or removed', t => {
  const f = fixture(t); f.create('原件');
  const bytes = readFileSync(f.file('原件'));
  symlinkSync(join(f.root, '项目/原件'), join(f.root, '项目/链接'));
  assert.equal(f.run('list').data.complete, false);
  for (const operation of ['read', 'write', 'remove']) {
    assert.throws(() => f.run(operation, '链接', { data: { body: 'overwrite' } }), { code: 'PROJECT_PATH_INVALID' });
  }
  mkdirSync(join(f.root, '项目/文件链接'));
  symlinkSync(f.file('原件'), f.file('文件链接'));
  for (const operation of ['read', 'write', 'remove']) {
    assert.throws(() => f.run(operation, '文件链接', { data: { body: 'overwrite' } }), { code: 'FILE_UNSUPPORTED' });
  }
  assert.deepEqual(readFileSync(f.file('原件')), bytes);
  renameSync(join(f.root, '项目'), join(f.root, 'original-scope'));
  symlinkSync(join(f.root, 'original-scope'), join(f.root, '项目'));
  assert.equal(f.run('list').errors[0].code, 'PROJECT_PATH_INVALID');
  assert.throws(() => f.create('越界'), { code: 'PROJECT_PATH_INVALID' });
});

test('malformed YAML and unsupported UTF-8 cannot be silently overwritten', t => {
  const f = fixture(t); f.create();
  for (const bytes of [Buffer.from('---\nx: [\n---\n'), Buffer.from([0xff, 0xfe])]) {
    writeFileSync(f.file(), bytes);
    assert.throws(() => f.run('write', '测试 甲', { data: { body: 'repair' } }));
    assert.deepEqual(readFileSync(f.file()), bytes);
  }
});

test('project updates honor the metadata lock and detect concurrent root-card edits', t => {
  const f = fixture(t); f.create(); const before = readFileSync(f.file());
  withWriteLock(f.file(), () => {
    assert.throws(() => f.run('write', '测试 甲', { data: { body: '# 新内容' } }), { code: 'FILE_LOCKED' });
    assert.throws(() => f.run('remove', '测试 甲'), { code: 'FILE_LOCKED' });
    assert.deepEqual(readFileSync(f.file()), before);
  });
  assert.throws(() => f.run('write', '测试 甲', { data: { body: '# 本轮内容' } }, {
    beforeCheck: () => writeFileSync(f.file(), '# 另一编辑者\n'),
  }), { code: 'FILE_CONFLICT' });
  assert.equal(readFileSync(f.file(), 'utf8'), '# 另一编辑者\n');
  assert.deepEqual(readdirSync(join(f.root, '项目/测试 甲')), ['project.md']);
});

test('new root-card publication does not overwrite a concurrent creator and preserves existing resources', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, '项目/既有资料'));
  writeFileSync(join(f.root, '项目/既有资料', '原件.txt'), 'KEEP');
  f.create('既有资料');
  assert.equal(readFileSync(join(f.root, '项目/既有资料', '原件.txt'), 'utf8'), 'KEEP');
  assert.throws(() => f.run('write', '竞争', { data: { body: '# 我的内容' } }, {
    beforeCheck: () => writeFileSync(f.file('竞争'), '# 已存在'),
  }), { code: 'PROJECT_CONFLICT' });
  assert.equal(readFileSync(f.file('竞争'), 'utf8'), '# 已存在');
  assert.deepEqual(readdirSync(join(f.root, '项目/竞争')), ['project.md']);
});

test('failed project creation cleans only its own empty directory', t => {
  const f = fixture(t);
  assert.throws(() => f.run('write', '失败', { data: { body: '# 内容' } }, {
    beforeCheck: () => { throw new Error('simulate failure'); },
  }));
  assert.equal(existsSync(join(f.root, '项目/失败')), false);
  assert.deepEqual(readdirSync(join(f.root, '.agents/runtime-data/projects')), []);
});

test('failed publication preserves a concurrently replaced project directory', t => {
  const f = fixture(t), folder = join(f.root, '项目/替换');
  assert.throws(() => f.run('write', '替换', { data: { body: '# 新项目' } }, {
    beforeCheck: () => {
      renameSync(folder, join(f.root, 'original-directory'));
      mkdirSync(folder);
    },
  }), { code: 'PROJECT_CONFLICT' });
  assert.equal(existsSync(folder), true);
  assert.deepEqual(readdirSync(folder), []);
});

test('remove previews and deletes the full explicit project only; missing root cards are a no-op', t => {
  const f = fixture(t); f.create(); f.create('保留');
  mkdirSync(join(f.root, '项目/测试 甲/成果'));
  writeFileSync(join(f.root, '项目/测试 甲/成果', '方案.md'), '方案');
  const removal = f.run('remove', '测试 甲', { dryRun: true });
  assert.ok(removal.data.entries.includes('成果/方案.md'));
  const result = f.run('remove', '测试 甲');
  assert.equal(result.data.removed, true); assert.equal(result.data.changed, true);
  assert.equal(existsSync(join(f.root, '项目/测试 甲')), false);
  assert.equal(existsSync(f.file('保留')), true);
  assert.equal(f.run('remove', '测试 甲').data.changed, false);
  mkdirSync(join(f.root, '项目/仅资料'));
  writeFileSync(join(f.root, '项目/仅资料', 'keep.txt'), 'KEEP');
  assert.equal(f.run('remove', '仅资料').data.changed, false);
  assert.equal(readFileSync(join(f.root, '项目/仅资料', 'keep.txt'), 'utf8'), 'KEEP');
});

test('resource changes, symlinks and busy resources stop project removal', t => {
  const f = fixture(t); f.create();
  const resource = join(f.root, '项目/测试 甲', '资料.txt');
  writeFileSync(resource, 'before');
  assert.throws(() => f.run('remove', '测试 甲', {}, { beforeCheck: () => writeFileSync(resource, 'after') }), { code: 'PROJECT_CONFLICT' });
  assert.equal(readFileSync(resource, 'utf8'), 'after');
  symlinkSync(resource, join(f.root, '项目/测试 甲', '链接'));
  assert.throws(() => f.run('remove', '测试 甲'), { code: 'PROJECT_RESOURCE_UNSUPPORTED' });
  rmSync(join(f.root, '项目/测试 甲', '链接'));
  writeFileSync(join(f.root, '项目/测试 甲', '.ksf-metadata-other.lock'), 'busy');
  assert.throws(() => f.run('remove', '测试 甲'), { code: 'PROJECT_RESOURCE_BUSY' });
  assert.equal(existsSync(f.file()), true);
});

test('cleanup failure reports that removal happened and retains a recovery location', t => {
  const f = fixture(t); f.create();
  assert.throws(() => f.run('remove', '测试 甲', {}, { cleanup: () => { throw new Error('disk error'); } }), error => {
    assert.equal(error.code, 'PROJECT_CLEANUP_FAILED');
    assert.equal(error.details.data.changed, true); assert.equal(error.details.data.removed, true);
    assert.equal(existsSync(join(error.details.data.recoveryPath, 'project.md')), true);
    return true;
  });
  assert.equal(existsSync(f.file()), false);
  assert.equal(f.run('list').data.projects.length, 0);
});

test('global project locks block mutation without blocking previews or deleting another owner lock', t => {
  const f = fixture(t); f.create();
  const lock = join(f.root, '.agents/runtime-data/projects/write.lock');
  writeFileSync(lock, '{"pid":123}\n');
  assert.throws(() => f.run('write', '测试 甲', { data: { body: 'new' } }), { code: 'PROJECT_LOCKED' });
  assert.equal(f.run('write', '测试 甲', { data: { body: 'new' }, dryRun: true }).data.wouldChange, true);
  assert.equal(readFileSync(lock, 'utf8'), '{"pid":123}\n');
});

test('project writes preserve root-card permissions and work with generic metadata updates', t => {
  const f = fixture(t); f.create(); chmodSync(f.file(), 0o640);
  f.run('write', '测试 甲', { data: { metadata: { name: '显示名' } } });
  assert.equal(statSync(f.file()).mode & 0o777, 0o640);
  metadata({ root: f.root, operation: 'write', target: f.file(), data: { custom: true } });
  assert.equal(f.run('read', '测试 甲').data.project.metadata.custom, true);
});
