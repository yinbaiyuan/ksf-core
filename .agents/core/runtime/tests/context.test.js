import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, realpathSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from '../src/vendor/yaml/dist/index.js';
import { types, protectedPaths } from '../src/objects/schema.js';
import { objectQuery } from '../src/services/objects.js';
import { contextCapabilities } from '../src/services/context.js';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf context 测试 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const def of Object.values(types)) for (const source of ['system', 'user']) mkdirSync(join(root, def[source]), { recursive: true });
  const add = (type, source, id, fields = {}, path) => {
    const file = join(root, path ?? join(types[type][source], id, types[type].entry));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `---\n${YAML.stringify({ id, name: id, description: '对象摘要', status: 'active', version: '0.1.0',
      ...(source === 'user' ? { user_revision: 1 } : {}), ...fields })}---\nPRIVATE_BODY_SENTINEL\n`);
    return file;
  };
  return { root, add };
}

function snapshot(path) {
  const stat = lstatSync(path);
  return stat.isDirectory()
    ? readdirSync(path).sort().map(name => [name, snapshot(join(path, name))])
    : { bytes: readFileSync(path).toString('base64'), mtime: stat.mtimeMs, mode: stat.mode };
}

test('empty scopes return complete, explicitly empty groups', t => {
  const f = fixture(t);
  assert.deepEqual(contextCapabilities(f.root), {
    data: { complete: true, workflows: { complete: true, objects: [] }, partners: { complete: true, objects: [] } }, errors: [],
  });
});

test('context projects full descriptions, preserves order and fixed entries, and never writes', t => {
  const f = fixture(t), description = '  适用场景：中文、冒号 : 和符号 #。\n第二行\n\n最后一行。\n';
  f.add('partner', 'user', 'partner.test.z', { name: '中文搭档', description });
  f.add('partner', 'system', 'partner.test.a');
  f.add('workflow', 'system', 'workflow.test.flow');
  f.add('competency', 'system', 'competency.test.method', { description: 'COMPETENCY_SENTINEL' });
  for (const [id, path] of Object.entries(protectedPaths)) f.add(id.split('.')[0], 'system', id, {}, path);
  const before = snapshot(f.root);
  const result = contextCapabilities(f.root);
  assert.equal(result.data.complete, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  const objects = [...result.data.workflows.objects, ...result.data.partners.objects];
  const z = objects.find(o => o.id === 'partner.test.z');
  assert.equal(z.description, description);
  assert.equal(z.name, '中文搭档');
  assert.equal(z.path, '能力/搭档/partner.test.z/partner.md');
  for (const object of objects) {
    assert.deepEqual(Object.keys(object), ['id', 'name', 'description', 'path', 'protected']);
    assert.equal(object.protected, Object.hasOwn(protectedPaths, object.id));
  }
  assert.ok(objects.some(o => o.id === 'workflow.ksf.entry'));
  assert.ok(objects.some(o => o.id === 'partner.ksf.assistant'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_BODY_SENTINEL'));
  assert.ok(!JSON.stringify(result).includes('COMPETENCY_SENTINEL'));
  for (const [type, group] of [['workflow', 'workflows'], ['partner', 'partners']]) {
    assert.deepEqual(result.data[group].objects.map(o => o.id), objectQuery({ root: f.root, type, operation: 'list' }).data.objects.map(o => o.id));
  }
  assert.deepEqual(contextCapabilities(f.root), result);
  assert.deepEqual(snapshot(f.root), before);
});

test('effective user overrides and archived fallback come from the object service', t => {
  const f = fixture(t), id = 'partner.test.same';
  f.add('partner', 'system', id, { description: '系统定义' });
  const path = f.add('partner', 'user', id, { description: '用户定义', status: 'draft' });
  let result = contextCapabilities(f.root);
  assert.equal(result.data.partners.objects.length, 1);
  assert.equal(result.data.partners.objects[0].description, '用户定义');
  writeFileSync(path, readFileSync(path, 'utf8').replace('status: draft', 'status: archived'));
  result = contextCapabilities(f.root);
  assert.equal(result.data.partners.objects.length, 1);
  assert.equal(result.data.partners.objects[0].description, '系统定义');
  f.add('partner', 'user', 'partner.test.only', { status: 'archived' });
  assert.equal(contextCapabilities(f.root).data.partners.objects.length, 1);
});

test('bad override does not expose its system copy; unrelated valid objects remain', t => {
  const f = fixture(t), id = 'partner.test.same';
  f.add('partner', 'system', id);
  f.add('partner', 'user', id, { description: '' });
  f.add('partner', 'system', 'partner.test.valid');
  const result = contextCapabilities(f.root);
  assert.equal(result.data.complete, false);
  assert.equal(result.data.workflows.complete, true);
  assert.equal(result.data.partners.complete, false);
  assert.deepEqual(result.data.partners.objects.map(o => o.id), ['partner.test.valid']);
  assert.ok(result.errors.some(e => e.type === 'partner' && e.field === 'description'));
});

test('one missing scope keeps the other object group complete and reports its type', t => {
  const f = fixture(t);
  f.add('partner', 'system', 'partner.test.valid');
  rmSync(join(f.root, types.workflow.user), { recursive: true });
  const result = contextCapabilities(f.root);
  assert.equal(result.data.complete, false);
  assert.equal(result.data.workflows.complete, false);
  assert.equal(result.data.partners.complete, true);
  assert.equal(result.data.partners.objects.length, 1);
  assert.ok(result.errors.every(e => e.type === 'workflow'));
});

test('same-source duplicates are reported while a broken unrelated type is not discovered', t => {
  const f = fixture(t), id = 'workflow.test.same';
  f.add('workflow', 'system', id);
  f.add('workflow', 'system', id, {}, '.agents/core/abilities/workflows/duplicate/workflow.md');
  f.add('competency', 'system', 'competency.test.broken', { description: '' });
  const result = contextCapabilities(f.root);
  assert.equal(result.data.workflows.complete, false);
  assert.equal(result.data.workflows.objects.length, 0);
  assert.ok(result.errors.some(e => e.code === 'OBJECT_ID_CONFLICT'));
  assert.ok(result.errors.every(e => e.type === 'workflow'));
});

test('a second discovery sees changed descriptions without an index', t => {
  const f = fixture(t), id = 'partner.test.edit';
  const path = f.add('partner', 'system', id, { description: '原摘要' });
  assert.equal(contextCapabilities(f.root).data.partners.objects[0].description, '原摘要');
  writeFileSync(path, readFileSync(path, 'utf8').replace('原摘要', '新摘要'));
  assert.equal(contextCapabilities(f.root).data.partners.objects[0].description, '新摘要');
});

test('unavailable root produces two incomplete groups without throwing', t => {
  const f = fixture(t);
  const result = contextCapabilities(join(f.root, 'missing'));
  assert.equal(result.data.complete, false);
  assert.equal(result.data.workflows.complete, false);
  assert.equal(result.data.partners.complete, false);
  assert.equal(result.errors.length, 2);
});
