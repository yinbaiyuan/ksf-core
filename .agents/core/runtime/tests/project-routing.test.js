import {gitBinary} from './helpers/platform.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import YAML from '../src/vendor/yaml/dist/index.js';
import { types } from '../src/objects/schema.js';
import { project, updateProjectMetadata } from '../src/services/projects.js';
import { contextCapabilities } from '../src/services/context.js';
import { abilitySource } from '../src/services/sources.js';
import { checkRouting } from '../src/projects/routing.js';
import { runProjectCommand } from '../src/commands/projects.js';

function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'ksf project routing '))), root = join(directory, 'ksf');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(root, '项目'), { recursive: true });
  for (const def of Object.values(types)) for (const scope of ['system', 'user']) mkdirSync(join(root, def[scope]), { recursive: true });
  const add = (scope, id, extra = {}) => {
    const base = ['system', 'user'].includes(scope) ? root : scope, type = id.split('.')[0];
    const path = join(base, types[type][scope === 'system' ? 'system' : 'user'], id, types[type].entry);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\n${YAML.stringify({ id, name: id, description: 'Fictional method', status: 'draft', version: '0.1.0',
      ...(scope === 'user' ? { user_revision: 1 } : {}), ...extra })}---\n# PRIVATE_OBJECT_BODY\n`);
    return path;
  };
  const run = (operation, name = '甲', options = {}) => project({ root, operation, name, ...options });
  const create = routing => run('write', '甲', { data: { metadata: { name: '甲', ...(routing === undefined ? {} : { routing }) }, body: '# 原项目\n' } });
  const legacy = routing => { create(); writeFileSync(join(root, '项目/甲/project.md'), `---\n${YAML.stringify({ name: '甲', routing })}---\n# 原项目\n`); };
  const source = id => {
    const path = join(directory, id);
    const git = spawnSync(gitBinary, ['init', '--template=', '--initial-branch=main', path], { encoding: 'utf8' });
    assert.equal(git.status, 0, git.stderr);
    abilitySource({ root, operation: 'init', target: path, id, name: id });
    return path;
  };
  const link = path => abilitySource({ root, operation: 'link', target: path });
  const knowledge = (name = '领域/README.md', body = '# PRIVATE_KNOWLEDGE_BODY\n') => {
    const path = join(root, '知识', name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); return path;
  };
  return { root, directory, add, run, create, legacy, source, link, knowledge, card: join(root, '项目/甲/project.md') };
}

test('old cards and empty preferences keep their behavior without knowledge or user records', t => {
  const f = fixture(t); f.create();
  assert.equal(Object.hasOwn(f.run('check').data, 'routing'), false);
  assert.equal(f.run('check').data.valid, true);
  f.run('write', '甲', { data: { metadata: { routing: {} } } });
  assert.deepEqual(f.run('check').data.routing, { valid: true, entries: [] });
  assert.equal(existsSync(join(f.root, '知识')), false);
  assert.equal(existsSync(join(f.root, '.agents/user-data')), false);
});

test('write validates new routing syntax before creating a project or locks', t => {
  const f = fixture(t);
  const invalid = [null, [], { unknown: [] }, { partners: 'partner.test.p@0.1.0' },
    { partners: ['partner.test.p@0.1.0'] }, { partners: [{ ref: 'partner.test.p' }] },
    { partners: [{ ref: 'competency.test.p@0.1.0' }] }, { partners: [{ ref: 'partner.test.p@0.1.0', source: 'all' }] },
    { partners: [{ ref: 'partner.test.p@0.1.0', source: null }] }, { partners: [{ ref: 'partner.test.p@0.1.0', extra: 1 }] },
    { cooperations: [{ ref: 'cooperation.ksf.entry@0.1.0' }] }, { competencies: [{ ref: 'competency.ksf.ability-route@0.1.0' }] },
    ...['/tmp/secret.md', 'C:/secret.md', '../../outside.md', '../../知识/../outside.md', '../../知识/a.txt', '../../知识/a\\b.md', '../../知识/a\n.md']
      .map(path => ({ knowledge: [path] }))];
  for (const routing of invalid) assert.throws(() => f.create(routing), { code: 'PROJECT_ROUTING_INVALID', exitCode: 2 });
  assert.equal(existsSync(f.card), false);
  assert.equal(existsSync(join(f.root, '.agents/runtime-data')), false);
});

test('all four preference types resolve without any knowledge tree or settings loading', t => {
  const f = fixture(t), routing = {};
  for (const [field, type] of [['cooperations', 'cooperation'], ['partners', 'partner'], ['competencies', 'competency'], ['data_packages', 'data-package']]) {
    const id = `${type}.test.example`; f.add('user', id); routing[field] = [{ ref: `${id}@0.1.0`, source: 'user' }];
  }
  f.create(routing);
  const before = readFileSync(f.card), checked = f.run('check');
  assert.deepEqual(checked.errors, []); assert.equal(checked.data.valid, true);
  assert.equal(checked.data.routing.entries.length, 4);
  assert.ok(checked.data.routing.entries.every(entry => entry.valid));
  assert.ok(!JSON.stringify(checked).includes('PRIVATE_'));
  assert.deepEqual(readFileSync(f.card), before);
  assert.equal(existsSync(join(f.root, '.agents/user-data')), false);
  assert.equal(existsSync(join(f.root, '知识/knowledge.md')), false);
});

test('availability failures retain usable entries and raw project facts in single and bulk check', t => {
  const f = fixture(t); f.add('system', 'partner.test.valid');
  f.legacy({ partners: [{ ref: 'partner.test.missing@0.1.0' }, { ref: 'partner.test.valid@0.1.0' }], knowledge: ['../../知识/missing.md'] });
  const before = readFileSync(f.card), checked = f.run('check');
  assert.equal(checked.data.valid, false);
  assert.deepEqual(checked.data.routing.entries.map(entry => entry.valid), [false, true]);
  assert.ok(checked.errors.some(error => error.code === 'OBJECT_NOT_FOUND'));
  assert.ok(checked.errors.some(error => error.code === 'PROJECT_ROUTING_KNOWLEDGE_REMOVED'));
  assert.equal(f.run('read').data.project.body, '# 原项目\n');
  assert.equal(project({ root: f.root, operation: 'list' }).data.complete, true);
  const all = project({ root: f.root, operation: 'check' });
  assert.equal(all.data.valid, false); assert.equal(all.data.projects[0].routing.entries[1].valid, true);
  assert.deepEqual(readFileSync(f.card), before);
});

test('malformed stored routing is inspectable and unrelated edits preserve it', t => {
  const f = fixture(t); f.create();
  writeFileSync(f.card, '---\nrouting:\n  unknown: true\n  partners:\n    - ref: partner.test.a\n    - ref: partner.test.valid@0.1.0\n---\n# 私有事实\n');
  f.add('system', 'partner.test.valid');
  const before = readFileSync(f.card), checked = f.run('check');
  assert.equal(checked.data.valid, false);
  assert.deepEqual(checked.data.routing.entries.map(entry => entry.valid), [false, true]);
  assert.equal(checked.errors[0].code, 'PROJECT_ROUTING_INVALID');
  assert.deepEqual(readFileSync(f.card), before);
  f.run('write', '甲', { data: { body: '# 保留原配置\n' } });
  updateProjectMetadata({ root: f.root, name: '甲' }, values => ({ ...values, repositories: [] }));
  assert.deepEqual(f.run('read').data.project.metadata.routing, { unknown: true, partners: [{ ref: 'partner.test.a' }, { ref: 'partner.test.valid@0.1.0' }] });
  assert.equal(f.run('read').data.project.body, '# 保留原配置\n');
});

test('malformed stored entries report fields without echoing arbitrary private objects', t => {
  const f = fixture(t); f.create();
  const routing = { partners: [{ ref: { secret: 'PRIVATE_SENTINEL' }, source: { token: 'PRIVATE_SENTINEL' } }], knowledge: [{ token: 'PRIVATE_SENTINEL' }] };
  writeFileSync(f.card, `---\n${YAML.stringify({ routing })}---\n# Facts\n`);
  const checked = f.run('check');
  assert.equal(checked.data.valid, false);
  assert.ok(!JSON.stringify(checked).includes('PRIVATE_SENTINEL'));
  assert.deepEqual(f.run('read').data.project.metadata.routing, routing);
});

test('exact version mismatch and explicit archived source cannot silently select a different object', t => {
  const f = fixture(t); f.add('system', 'partner.test.p', { version: '0.2.0' });
  f.add('user', 'partner.test.archived', { status: 'archived' });
  f.create({ partners: [{ ref: 'partner.test.p@0.1.0' }, { ref: 'partner.test.archived@0.1.0', source: 'user' }] });
  const checked = f.run('check');
  assert.ok(checked.errors.some(error => error.code === 'OBJECT_VERSION_MISMATCH'));
  assert.ok(checked.errors.some(error => error.code === 'PROJECT_ROUTING_ARCHIVED'));
  assert.ok(checked.data.routing.entries.every(entry => !entry.valid));
});

test('project preferences leave the global cooperation and partner candidate sets intact', t => {
  const f = fixture(t); f.add('system', 'partner.test.preferred'); f.add('system', 'partner.test.other'); f.add('system', 'cooperation.test.global');
  const before = contextCapabilities(f.root);
  f.create({ partners: [{ ref: 'partner.test.preferred@0.1.0' }] }); f.run('check');
  assert.deepEqual(contextCapabilities(f.root), before);
  assert.equal(before.data.cooperations.objects.length, 1); assert.equal(before.data.partners.objects.length, 2);
});

test('source selection resolves one preset without filtering other sources or changing source dependency bindings', t => {
  const f = fixture(t), a = f.source('alpha'), b = f.source('beta');
  f.add(a, 'competency.team.method'); f.add(b, 'competency.team.method');
  f.add(a, 'partner.team.p', { references: ['competency.team.method@0.1.0'] });
  f.link(a); f.link(b); f.add('user', 'competency.team.method');
  f.create({ partners: [{ ref: 'partner.team.p@0.1.0', source: 'alpha' }], competencies: [{ ref: 'competency.team.method@0.1.0', source: 'beta' }] });
  const checked = f.run('check'); assert.deepEqual(checked.errors, []);
  const [partner, supplemental] = checked.data.routing.entries;
  assert.equal(partner.object.source, 'alpha'); assert.equal(partner.references[0].source, 'alpha');
  assert.equal(supplemental.object.source, 'beta');
  rmSync(join(a, '能力/基本功/competency.team.method'), { recursive: true });
  const broken = f.run('check');
  assert.equal(broken.data.routing.entries[0].valid, false);
  assert.equal(broken.data.routing.entries[1].valid, true);
});

test('ambiguous and unknown ability sources remain explicit per-entry failures', t => {
  const f = fixture(t), a = f.source('alpha'), b = f.source('beta');
  f.add(a, 'partner.team.p'); f.add(b, 'partner.team.p'); f.link(a); f.link(b);
  f.create({ partners: [{ ref: 'partner.team.p@0.1.0' }, { ref: 'partner.team.p@0.1.0', source: 'missing' }, { ref: 'partner.team.p@0.1.0', source: 'alpha' }] });
  const checked = f.run('check');
  assert.deepEqual(checked.data.routing.entries.map(entry => entry.valid), [false, false, true]);
  assert.ok(checked.errors.some(error => error.code === 'SOURCE_AMBIGUOUS'));
  assert.ok(checked.errors.some(error => error.code === 'INVALID_ARGUMENTS'));
  assert.equal(f.run('read').errors.length, 0);
});

for (const placement of ['file', 'parent', 'scope']) test(`removed knowledge ${placement} links are not resolved`, t => {
  const f = fixture(t), outside = join(f.directory, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'entry.md'), '# PRIVATE\n');
  mkdirSync(join(f.root, '知识'), { recursive: true });
  if (placement === 'scope') { rmSync(join(f.root, '知识'), { recursive: true }); symlinkSync(outside, join(f.root, '知识')); }
  else if (placement === 'parent') symlinkSync(outside, join(f.root, '知识/sub'));
  else symlinkSync(join(outside, 'entry.md'), join(f.root, '知识/entry.md'));
  f.legacy({ knowledge: [placement === 'parent' ? '../../知识/sub/entry.md' : '../../知识/entry.md'] });
  const checked = f.run('check'); assert.equal(checked.data.valid, false);
  assert.ok(checked.errors.some(e => e.code === 'PROJECT_ROUTING_KNOWLEDGE_REMOVED'));
  assert.ok(!JSON.stringify(checked).includes('PRIVATE'));
  assert.equal(readFileSync(join(outside, 'entry.md'), 'utf8'), '# PRIVATE\n');
});

test('retired knowledge is not decoded while vanished ability sources remain failures', t => {
  const f = fixture(t), source = f.source('alpha'); f.add(source, 'partner.team.p'); f.link(source);
  f.knowledge('broken.md', Buffer.from([0xff]));
  f.legacy({ partners: [{ ref: 'partner.team.p@0.1.0', source: 'alpha' }], knowledge: ['../../知识/broken.md'] });
  rmSync(source, { recursive: true });
  const checked = f.run('check'); assert.equal(checked.data.valid, false);
  assert.ok(checked.errors.some(error => error.code === 'PROJECT_ROUTING_KNOWLEDGE_REMOVED'));
  assert.ok(checked.data.routing.entries[0].errors.length);
});

test('CLI exposes partial routing checks in JSON and text with compatible exit codes', t => {
  const f = fixture(t); f.add('system', 'partner.test.valid');
  f.create({ partners: [{ ref: 'partner.test.missing@0.1.0' }, { ref: 'partner.test.valid@0.1.0' }] });
  const checked = runProjectCommand(['check', '甲', '--json'], f.root);
  assert.equal(checked.exitCode, 1); assert.equal(JSON.parse(checked.stdout).data.routing.entries[1].valid, true);
  assert.match(runProjectCommand(['check', '甲'], f.root).stdout, /routing\.partners\[1\]: available; system/);
  const invalid = runProjectCommand(['write', '乙', '--data', '{"metadata":{"routing":{"partners":["wrong"]}},"body":"# 内容"}', '--json'], f.root);
  assert.equal(invalid.exitCode, 2); assert.equal(JSON.parse(invalid.stdout).errors[0].code, 'PROJECT_ROUTING_INVALID');
});


test('removed knowledge values are never dereferenced by availability checking', t => {
  const f = fixture(t); f.create();
  const routing = {};
  Object.defineProperty(routing, 'knowledge', { enumerable: true, get() { throw new Error('RETIRED_VALUE_WAS_READ'); } });
  const checked = checkRouting({ root: f.root, name: '甲', values: { routing } });
  assert.equal(checked.routing.valid, false);
  assert.deepEqual(checked.routing.entries, []);
  assert.equal(checked.errors[0].code, 'PROJECT_ROUTING_KNOWLEDGE_REMOVED');
  assert.equal(existsSync(join(f.root, '知识')), false);
});

test('legacy fields remain readable and survive unrelated writes but must be removed for routing changes', t => {
  const f = fixture(t); const routing = { knowledge: ['../../知识/missing.md'] }; f.legacy(routing);
  assert.deepEqual(f.run('read').data.project.metadata.routing, routing);
  assert.equal(project({ root: f.root, operation: 'list' }).data.complete, true);
  f.run('write', '甲', { data: { body: '# 新正文\n', metadata: { description: '仅修改项目事实' } } });
  updateProjectMetadata({ root: f.root, name: '甲' }, values => ({ ...values, repositories: [] }));
  assert.deepEqual(f.run('read').data.project.metadata.routing, routing);
  const before = readFileSync(f.card);
  assert.throws(() => f.run('write', '甲', { data: { metadata: { routing: { ...routing, partners: [] } } } }), error =>
    error.code === 'PROJECT_ROUTING_INVALID' && error.details.issues[0].code === 'PROJECT_ROUTING_KNOWLEDGE_REMOVED');
  assert.deepEqual(readFileSync(f.card), before);
  f.run('write', '甲', { data: { metadata: { routing: {} } } });
  assert.equal(f.run('check').data.valid, true);
  assert.equal(existsSync(join(f.root, '知识')), false);
});
