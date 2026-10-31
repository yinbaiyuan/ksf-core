import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCoordinator } from '../src/services/workbench-common.js';
import { createWorkspaceFiles } from '../src/services/workspace-files.js';
import { startWebServer } from '../src/services/web.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ksf-root-tree-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, files: createWorkspaceFiles(root, createCoordinator()) };
}

test('root tree lists only the allowed entries in order and omits legacy MEMORY with real paths', async t => {
  const { root, files } = await fixture(t);
  for (const name of ['repositories', '知识', '项目', '能力', '档案', '@收件箱', '.agents', '.codex', '.github', '.obsidian', '其他目录']) await mkdir(join(root, name));
  for (const name of ['USER.md', 'README.md', 'MEMORY.md', 'BOT.md', 'AGENTS.md', '.gitignore', '.env', '其他文件.md']) await writeFile(join(root, name), name);
  const tree = await files.tree();
  const expected = ['.agents', '@收件箱', '档案', '能力', '项目', '知识', 'repositories', 'AGENTS.md', 'BOT.md', 'README.md', 'USER.md'];
  assert.deepEqual(tree.entries.map(e => e.name), expected);
  assert.deepEqual(tree.entries.map(e => e.path), expected);
  assert.equal(tree.path, ''); assert.match(tree.version, /^[a-f0-9]{64}$/);
  assert.equal(tree.entries[0].policy, 'system');
  assert.equal(tree.entries.find(e => e.name === 'README.md').policy, 'system');
  assert.equal(tree.entries.find(e => e.name === 'USER.md').policy, 'editable');
  assert.equal((await files.read('MEMORY.md')).text, 'MEMORY.md');
});

test('missing root entries are omitted and newly created unlisted files stay hidden', async t => {
  const { root, files } = await fixture(t);
  assert.deepEqual((await files.tree()).entries, []);
  await mkdir(join(root, '项目')); await writeFile(join(root, 'USER.md'), '# 用户\n');
  await files.create({ path: '未列入白名单.md', text: 'still accessible' });
  assert.deepEqual((await files.tree()).entries.map(e => e.name), ['项目', 'USER.md']);
  assert.equal((await files.read('未列入白名单.md')).text, 'still accessible');
  await mkdir(join(root, '.agents'));
  assert.deepEqual((await files.tree()).entries.map(e => e.name), ['.agents', '项目', 'USER.md']);
});

test('nested trees keep directory ordering, skip rules and protected policies', async t => {
  const { root, files } = await fixture(t);
  for (const name of ['项目/z-dir', '项目/a-dir', '项目/.git', '项目/.cache', '.agents/core', '.agents/runtime-data']) await mkdir(join(root, name), { recursive: true });
  for (const name of ['项目/z.md', '项目/a.md', '项目/.DS_Store', '项目/.env']) await writeFile(join(root, name), 'test');
  const tree = await files.tree('项目');
  assert.deepEqual(tree.entries.filter(e => e.kind === 'directory').map(e => e.name), ['a-dir', 'z-dir']);
  assert.deepEqual(tree.entries.filter(e => e.policy === 'editable').map(e => e.name), ['a-dir', 'z-dir', 'a.md', 'z.md']);
  assert.equal(tree.entries.find(e => e.name === '.env').policy, 'blocked');
  assert.equal(tree.entries.some(e => ['.git', '.cache', '.DS_Store'].includes(e.name)), false);
  const agents = await files.tree('.agents');
  assert.equal(agents.entries.find(e => e.name === 'core').policy, 'system');
  assert.equal(agents.entries.find(e => e.name === 'runtime-data').policy, 'blocked');
  await assert.rejects(files.tree('.agents/runtime-data'), e => e.code === 'WORKSPACE_PROTECTED');
});

test('HTTP root filtering preserves hidden-file searches, direct access and saves', async t => {
  let server;
  t.after(() => server?.close());

  const { root, files } = await fixture(t);
  await mkdir(join(root, '旧目录'));
  await writeFile(join(root, '旧目录/说明.md'), 'root-whitelist-needle');
  await writeFile(join(root, '隐藏笔记.md'), 'root-whitelist-needle');
  await writeFile(join(root, 'USER.md'), '# 用户\n');
  server = await startWebServer({ root, port: 0, capture: false });
  const get = async path => { const response = await fetch(new URL(path, server.url)); assert.equal(response.status, 200); return (await response.json()).data; };
  const tree = await get('/api/workspace/tree');
  // Local CLI control publishes its private descriptor under runtime-data at startup.
  assert.deepEqual(tree.entries.map(e => e.name), ['.agents', 'USER.md']);
  const search = await get('/api/workspace/search?q=root-whitelist-needle');
  assert.deepEqual(search.matches.map(m => m.path).sort(), ['旧目录/说明.md', '隐藏笔记.md'].sort());
  assert.equal((await get('/api/workspace/tree?path=' + encodeURIComponent('旧目录'))).entries[0].path, '旧目录/说明.md');
  const path = '隐藏笔记.md', file = await get('/api/workspace/file?path=' + encodeURIComponent(path));
  const session = await get('/api/workbench/session');
  const saved = await fetch(new URL('/api/workspace/save', server.url), { method: 'POST', headers: { Origin: server.url.slice(0, -1), 'Content-Type': 'application/json', 'X-KSF-Token': session.token }, body: JSON.stringify({ path, text: 'edited hidden file', version: file.version }) });
  assert.equal(saved.status, 200);
  assert.equal(await readFile(join(root, path), 'utf8'), 'edited hidden file');
  assert.deepEqual((await files.tree()).entries.map(e => e.name), ['.agents', 'USER.md']);
});
