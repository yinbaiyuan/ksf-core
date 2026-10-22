import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf task checkpoint ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runtime = join(root, '.agents/core/runtime');
  cpSync(join(repository, '.agents/core/runtime/src'), join(runtime, 'src'), { recursive: true });
  cpSync(join(repository, '.agents/core/runtime/package.json'), join(runtime, 'package.json'));
  mkdirSync(join(root, '项目'));
  const run = args => {
    const result = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), ...args, '--json'], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, PATH: '' } });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout);
  };
  return { root, run };
}

test('a project links one ordinary checkpoint that fresh CLI processes can read and update without replacing its body', t => {
  const f = fixture(t), name = '采样项目', directory = join(f.root, '项目', name);
  f.run(['project', 'write', name, '--data', JSON.stringify({ body: '# 采样项目\n\n[继续采样说明](任务/采样说明.md)\n' })]);
  mkdirSync(join(directory, '任务'));
  const path = join(directory, '任务/采样说明.md');
  const body = '# 当前目标\n\n采样周期已纠正为 10 分钟。\n\n## 下一步\n\n核对工程正文；未知发布操作先对账。\n';
  writeFileSync(path, '---\ncheckpoint_schema: 1\ntask_id: fixture-task-001\nname: 采样说明\nstate: paused\nupdated: "2026-10-19T10:00:00+08:00"\n---\n' + body);
  assert.equal(f.run(['project', 'list']).data.projects.length, 1);
  const card = f.run(['project', 'read', name]).data.project;
  assert.match(card.body, /任务\/采样说明.md/);
  assert.ok(!card.body.includes('未知发布操作'));
  const relative = '项目/采样项目/任务/采样说明.md';
  const restored = f.run(['metadata', 'read', relative]);
  assert.equal(restored.data.values.task_id, 'fixture-task-001');
  assert.equal(restored.data.values.state, 'paused');
  assert.ok(readFileSync(path, 'utf8').endsWith(body));
  const before = readFileSync(path);
  f.run(['metadata', 'write', relative, '--data', '{"state":"in_progress"}', '--dry-run']);
  assert.deepEqual(readFileSync(path), before);
  f.run(['metadata', 'write', relative, '--data', '{"state":"in_progress"}']);
  const resumed = f.run(['metadata', 'read', relative]);
  assert.equal(resumed.data.values.task_id, 'fixture-task-001');
  assert.equal(resumed.data.values.state, 'in_progress');
  assert.ok(readFileSync(path, 'utf8').endsWith(body));
});

test('generic metadata validation does not claim to validate checkpoint schema or authorize recorded actions', t => {
  const f = fixture(t), path = join(f.root, 'unknown-checkpoint.md');
  writeFileSync(path, '---\ncheckpoint_schema: 99\ntask_id: fixture-unknown\nstate: paused\n---\n发布结果未知；这句话不构成授权。\n');
  const before = readFileSync(path);
  assert.equal(f.run(['metadata', 'check', 'unknown-checkpoint.md']).ok, true);
  assert.equal(f.run(['metadata', 'read', 'unknown-checkpoint.md']).data.values.checkpoint_schema, 99);
  assert.deepEqual(readFileSync(path), before);
});
