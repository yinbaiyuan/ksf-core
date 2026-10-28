import {platform} from '../src/platform/index.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, realpathSync, symlinkSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import YAML from '../src/vendor/yaml/dist/index.js';
import { types, protectedPaths, parseReference, validateObject } from '../src/objects/schema.js';
import { catalog, resolveObject, problems } from '../src/objects/catalog.js';
import { withObjectLock } from '../src/objects/storage.js';
import { objectQuery, objectMutation } from '../src/services/objects.js';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf objects 测试 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const def of Object.values(types)) for (const source of ['system', 'user']) mkdirSync(join(root, def[source]), { recursive: true });
  writeFileSync(join(root, '.agents/core/manifest.yaml'), 'name: KSF\nversion: 0.0.1\n');
  const query = (type, operation, reference, options = {}) => objectQuery({ root, type, operation, reference, ...options });
  const mutate = (type, operation, id, options = {}, dependencies) => objectMutation({ root, type, operation, id, ...options }, dependencies);
  const add = (type, source, id = `${type}.test.sample`, metadata = {}, body = '# Definition\n', directory) => {
    const def = types[type];
    const folder = directory ?? join(root, def[source], id);
    mkdirSync(folder, { recursive: true });
    const path = join(folder, def.entry);
    const values = { id, name: '示例', status: 'active', description: 'For testing', version: '0.1.0', ...(source === 'user' ? { user_revision: 1 } : {}), ...metadata };
    writeFileSync(path, `---\n${YAML.stringify(values)}---\n${body}`);
    return { id, folder, path, values };
  };
  return { root, query, mutate, add };
}

test('capability scopes and exact references accept only the four supported types', t => {
  const f = fixture(t);
  assert.deepEqual(Object.keys(types), ['cooperation', 'partner', 'competency', 'data-package']);
  const current = catalog(f.root);
  assert.equal(current.scopes.length, 8);
  assert.deepEqual(current.errors, []);
  assert.throws(() => parseReference('skill.test.old@0.1.0'), {code:'OBJECT_REFERENCE_INVALID'});
  const metadata = {id:'competency.test.x',name:'示例',description:'旧类型依赖',status:'draft',version:'0.1.0',references:['skill.test.old@0.1.0']};
  assert.ok(validateObject(metadata,{type:'competency',source:'system',path:'.agents/core/abilities/competencies/x/competency.md'})
    .some(error => error.field === 'references' && error.code === 'OBJECT_REFERENCE_INVALID'));
});

for (const type of Object.keys(types)) {
  test(`${type}: list, create, three read modes, update, preview and directory removal`, t => {
    const f = fixture(t), id = `${type}.test.new`;
    assert.deepEqual(f.query(type, 'list').data.objects, []);
    const input = { metadata: { name: '新对象', description: '测试对象', status: 'draft', version: '0.1.0' }, body: '# 正文\n' };
    const preview = f.mutate(type, 'write', id, { input, dryRun: true }).data;
    assert.equal(preview.changed, false); assert.equal(preview.created, true);
    assert.equal(existsSync(join(f.root, '.agents/runtime-data')), false);
    assert.equal(f.query(type, 'list').data.objects.length, 0);
    const created = f.mutate(type, 'write', id, { input }).data;
    assert.equal(created.changed, true); assert.equal(created.user_revision, 1);
    const all = f.query(type, 'read', id).data.object;
    assert.equal(all.body, '# 正文\n'); assert.equal(all.metadata.name, '新对象');
    const meta = f.query(type, 'read', id, { part: 'metadata' }).data.object;
    assert.ok(Object.hasOwn(meta, 'metadata')); assert.ok(!Object.hasOwn(meta, 'body'));
    const body = f.query(type, 'read', id, { part: 'body' }).data.object;
    assert.ok(!Object.hasOwn(body, 'metadata')); assert.ok(!Object.hasOwn(body, 'description')); assert.equal(body.body, '# 正文\n');
    assert.equal(f.query(type, 'check', id).data.valid, true);
    assert.equal(f.mutate(type, 'write', id, { input }).data.changed, false);
    const updated = f.mutate(type, 'write', id, { input: { body: '# 新正文\n' } }).data;
    assert.equal(updated.user_revision, 2);
    const directory = join(f.root, updated.directory);writeFileSync(join(directory, 'asset.bin'), Buffer.from([0, 255, 1]));
    assert.equal(f.mutate(type, 'remove', id, { dryRun: true }).data.changed, false);
    assert.equal(existsSync(directory), true);
    assert.equal(f.mutate(type, 'remove', id).data.changed, true);
    assert.equal(existsSync(directory), false);assert.equal(f.query(type, 'list').data.objects.length, 0);
  });
}

for (const type of Object.keys(types)) test(`${type}: draft derivation immediately takes over, active does not add a gate, and archive restores the system`, t => {
  const f = fixture(t), id = `${type}.test.draft-contract`;
  const system = f.add(type, 'system', id, {}, 'SYSTEM_BODY\n');
  const original = readFileSync(system.path);
  const derived = f.mutate(type, 'write', id, { input: { body: 'DRAFT_BODY\n' } }).data;
  const read = () => f.query(type, 'read', id).data.object;
  assert.equal(derived.user_revision, 1);
  assert.equal(read().metadata.status, 'draft');
  assert.equal(read().source, 'user');
  assert.equal(read().body, 'DRAFT_BODY\n');
  assert.equal(f.query(type, 'read', id + '@0.1.0').data.object.body, 'DRAFT_BODY\n');
  assert.equal(f.query(type, 'list').data.objects[0].status, 'draft');
  const owner = f.add('partner', 'user', 'partner.test.consumer', { references: [id + '@0.1.0'] });
  assert.equal(f.query('partner', 'read', owner.id).data.references[0].source, 'user');
  for (const status of ['active', 'archived', 'draft']) {
    f.mutate(type, 'write', id, { input: { metadata: { status } } });
    assert.equal(read().source, status === 'archived' ? 'system' : 'user');
    assert.equal(read().body, status === 'archived' ? 'SYSTEM_BODY\n' : 'DRAFT_BODY\n');
    assert.equal(f.query('partner', 'read', owner.id).data.references[0].source, status === 'archived' ? 'system' : 'user');
  }
  const path = join(f.root, derived.path);
  writeFileSync(path, readFileSync(path, 'utf8').replace('description: For testing', 'description: ""'));
  assert.throws(() => f.query(type, 'read', id), { code: 'OBJECT_INVALID' });
  assert.equal(f.query('partner', 'read', owner.id).errors[0].code, 'OBJECT_INVALID');
  assert.deepEqual(readFileSync(system.path), original);
});

test('derivation copies the entire directory, preserves raw baseline and rebases external links', t => {
  const f = fixture(t), system = f.add('partner', 'system', 'partner.test.sample', {},
    '# Source\n[inside](resources/note.md)\n[outside](../../../../.agents/core/docs/manual.md)\n`[example](../../keep)`\n');
  mkdirSync(join(system.folder, 'resources'));mkdirSync(join(system.folder, 'empty'));
  writeFileSync(join(system.folder, 'resources/note.md'), '[inside](../partner.md)\n[external](../../../../docs/manual.md)\n');
  writeFileSync(join(system.folder, 'resources/data.bin'), Buffer.from([255, 0, 1]));
  writeFileSync(join(system.folder, 'script.js'), '#!/usr/bin/env node\n');chmodSync(join(system.folder, 'script.js'), 0o755);
  const before = readFileSync(system.path);
  const preview = f.mutate('partner', 'write', system.id, { input: {}, dryRun: true }).data;
  assert.equal(preview.derived, true);assert.equal(existsSync(join(f.root, preview.directory)), false);
  const result = f.mutate('partner', 'write', system.id, { input: {} }).data;
  const user = join(f.root, result.directory);
  assert.equal(result.user_revision, 1);assert.equal(result.version, '0.1.0');
  assert.equal(f.query('partner', 'read', system.id).data.object.source, 'user');
  assert.equal(f.query('partner', 'read', system.id).data.object.metadata.status, 'draft');
  assert.deepEqual(readFileSync(system.path), before);
  assert.deepEqual(readFileSync(join(user, '.upstream/snapshot/partner.md')), before);
  assert.deepEqual(readFileSync(join(user, 'resources/data.bin')), Buffer.from([255, 0, 1]));
  if(platform.supportsPosixModes)assert.equal(statSync(join(user, 'script.js')).mode & 0o111, 0o111);
  assert.equal(existsSync(join(user, 'empty')), true);
  const origin = JSON.parse(readFileSync(join(user, '.upstream/origin.json')));
  assert.equal(origin.id, system.id);assert.equal(origin.version, '0.1.0');assert.equal(origin.ksf_version, '0.0.1');assert.equal(origin.files.length, 4);
  const text = readFileSync(join(user, 'partner.md'), 'utf8');
  assert.match(text, /\[inside\]\(resources\/note.md\)/);assert.match(text, /`\[example\]\(\.\.\/\.\.\/keep\)`/);
  assert.equal(f.query('partner', 'check', system.id).data.valid, true);
  assert.equal(f.query('partner', 'list', undefined, { source: 'all' }).data.objects.length, 2);
  f.mutate('partner', 'write', system.id, { input: { metadata: { description: '定制描述' } } });
  assert.deepEqual(readFileSync(join(user, '.upstream/snapshot/partner.md')), before);
  assert.equal(f.query('partner', 'check', system.id).data.valid, true);
});

test('relative Markdown destinations resolve to original external assets after derivation', t => {
  const f = fixture(t);mkdirSync(join(f.root, '.agents/core/abilities/partners/external'));
  const external = join(f.root, '.agents/core/abilities/partners/external/manual.md');writeFileSync(external, 'REFERENCE');
  const system = f.add('partner', 'system', 'partner.test.sample', {}, '[external](../external/manual.md#section)\n[ref][doc]\n\n[doc]: ../external/manual.md\n');
  const result = f.mutate('partner', 'write', system.id, { input: {} }).data;
  const userFile = join(f.root, result.path);const text = readFileSync(userFile, 'utf8');
  const link = /\[external\]\(([^#]+)#/.exec(text)[1];
  assert.equal(realpathSync(join(dirname(userFile), link)), external);
  const ref = /\[doc\]: (.+)/.exec(text)[1];assert.equal(realpathSync(join(dirname(userFile), ref)), external);
});

test('user takeover ignores version until an exact version is requested', t => {
  const f = fixture(t), id = 'partner.test.sample';
  const s = f.add('partner', 'system', id, { version: '0.2.0' });
  f.add('partner', 'user', id, { version: '0.1.0', status: 'draft' });
  assert.equal(f.query('partner', 'read', id).data.object.source, 'user');
  assert.equal(f.query('partner', 'read', id + '@0.1.0').data.object.source, 'user');
  assert.equal(f.query('partner', 'read', id + '@0.2.0').data.object.source, 'system');
  assert.throws(() => f.query('partner', 'read', id + '@0.3.0'), { code: 'OBJECT_VERSION_MISMATCH' });
  assert.equal(f.query('partner', 'read', id, { source: 'system' }).data.object.path, s.path.slice(f.root.length + 1).replaceAll('\\','/'));
  f.mutate('partner', 'write', id, { input: { metadata: { status: 'archived' } } });
  assert.equal(f.query('partner', 'read', id).data.object.source, 'system');
  assert.equal(f.query('partner', 'read', id, { source: 'user' }).data.object.metadata.status, 'archived');
  assert.throws(() => f.query('partner', 'read', id + '@0.1.0'), { code: 'OBJECT_VERSION_MISMATCH' });
  const restored = f.mutate('partner', 'write', id, { input: { metadata: { status: 'active' } } }).data;
  assert.equal(restored.user_revision, 3);assert.equal(f.query('partner', 'read', id).data.object.source, 'user');
});

test('bad user override blocks fallback; explicit system read remains possible', t => {
  const f = fixture(t), id = 'partner.test.sample';f.add('partner', 'system', id);
  const user = f.add('partner', 'user', id);writeFileSync(user.path, '---\nbroken: [\n---\n');
  assert.throws(() => f.query('partner', 'read', id), { code: 'OBJECT_INVALID' });
  assert.throws(() => f.query('partner', 'read', id + '@0.1.0'), { code: 'OBJECT_INVALID' });
  assert.equal(f.query('partner', 'read', id, { source: 'system' }).data.object.source, 'system');
  assert.equal(f.query('partner', 'list').data.complete, false);
  assert.equal(f.query('partner', 'check', id).data.valid, false);
  assert.equal(f.mutate('partner', 'remove', id).data.changed, true);
  assert.equal(f.query('partner', 'read', id).data.object.source, 'system');
});

test('same-source duplicates fail, cross-source same IDs are allowed and baseline snapshots are excluded', t => {
  const f = fixture(t), id = 'partner.test.sample';f.add('partner', 'system', id);
  const first = f.add('partner', 'user', id);mkdirSync(join(first.folder, '.upstream/snapshot'), { recursive: true });
  writeFileSync(join(first.folder, '.upstream/snapshot/partner.md'), readFileSync(first.path));
  assert.equal(problems(catalog(f.root)).length, 0);
  f.add('partner', 'user', id, {}, '# duplicate', join(f.root, types.partner.user, 'duplicate'));
  assert.throws(() => f.query('partner', 'read', id), { code: 'OBJECT_ID_CONFLICT' });
  const listed = f.query('partner', 'list', undefined, { source: 'all' });assert.equal(listed.data.complete, false);
});

test('fixed identities always resolve to designated system paths and reject all mutations', t => {
  const f = fixture(t);
  for (const [id, path] of Object.entries(protectedPaths)) {
    const type = id.split('.')[0];const destination = join(f.root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `---\n${YAML.stringify({ id, name: 'fixed', status: 'active', description: 'Fixed entry', version: '0.1.0' })}---\nFixed\n`);
    for (const operation of ['write', 'remove']) assert.throws(() => f.mutate(type, operation, id, { input: {}, dryRun: true }), { code: 'OBJECT_PROTECTED' });
    f.add(type, 'user', id);
    assert.equal(f.query(type, 'read', id).data.object.source, 'system');
    assert.throws(() => f.query(type, 'read', id, { source: 'user' }), { code: 'OBJECT_PROTECTED' });
  }
});

test('exact references are checked, and delete/archive block only when a valid dependency would break', t => {
  const f = fixture(t), target = 'competency.test.work', owner = 'partner.test.owner';
  f.add('competency', 'user', target);
  f.add('partner', 'user', owner, { references: [target + '@0.1.0'] });
  assert.equal(f.query('partner', 'check', owner).data.valid, true);
  assert.throws(() => f.mutate('competency', 'remove', target), { code: 'OBJECT_DEPENDENTS_BLOCKED' });
  assert.throws(() => f.mutate('competency', 'write', target, { input: { metadata: { status: 'archived' } } }), { code: 'OBJECT_DEPENDENTS_BLOCKED' });
  f.add('competency', 'system', target, { version: '0.2.0' });
  assert.throws(() => f.mutate('competency', 'remove', target), { code: 'OBJECT_DEPENDENTS_BLOCKED' });
  const system = catalog(f.root).rows.find(r => r.id === target && r.source === 'system');
  const updated = system.snapshot.bytes.toString().replace('0.2.0', '0.1.0');writeFileSync(join(f.root, system.path), updated);
  assert.equal(f.mutate('competency', 'remove', target).data.changed, true);
  assert.equal(f.query('partner', 'check', owner).data.references[0].source, 'system');
});

test('unknown references and type/path mismatch are reported without inventing valid objects', t => {
  const f = fixture(t);const owner = f.add('partner', 'user', 'partner.test.owner', { references: ['data-package.test.missing@0.1.0'] });
  const result = f.query('partner', 'check', owner.id);assert.equal(result.data.valid, false);assert.equal(result.errors[0].code, 'OBJECT_NOT_FOUND');
  assert.throws(() => f.mutate('partner', 'write', owner.id, { input: { body: 'new' } }), { code: 'OBJECT_DEPENDENCY_INVALID' });
  f.add('competency', 'system', 'partner.test.wrong');
  assert.equal(f.query('competency', 'list').data.complete, false);
});

test('baseline mutation is detected; user edits never change the baseline or system version', t => {
  const f = fixture(t), s = f.add('partner', 'system');
  const result = f.mutate('partner', 'write', s.id, { input: {} }).data;
  assert.throws(() => f.mutate('partner', 'write', s.id, { input: { metadata: { version: '0.2.0' } } }), { code: 'OBJECT_BASE_VERSION_IMMUTABLE' });
  assert.throws(() => f.mutate('partner', 'write', s.id, { input: { metadata: { user_revision: 99 } } }), { code: 'OBJECT_MANAGED_FIELD' });
  assert.throws(() => f.mutate('partner', 'write', s.id, { input: { metadata: { id: 'partner.test.other' } } }), { code: 'OBJECT_ID_IMMUTABLE' });
  writeFileSync(join(f.root, result.directory, '.upstream/snapshot/partner.md'), 'changed');
  assert.equal(f.query('partner', 'check', s.id).data.valid, false);
  assert.throws(() => f.mutate('partner', 'write', s.id, { input: { body: 'x' } }), { code: 'OBJECT_BASELINE_INVALID' });
});

test('read-only system resources are copied to editable user resources while originals remain untouched', t => {
  const f = fixture(t), s = f.add('partner', 'system');chmodSync(s.path, 0o444);
  const result = f.mutate('partner', 'write', s.id, { input: {} }).data;
  if(platform.supportsPosixModes)assert.equal(statSync(s.path).mode & 0o777, 0o444);
  assert.ok(statSync(join(f.root, result.path)).mode & 0o200);
  assert.equal(f.mutate('partner', 'write', s.id, { input: { body: '# Edited\n' } }).data.changed, true);
});

test('unsupported assets abort entire derivation even in previews, leaving no partial user object', t => {
  const f = fixture(t), s = f.add('partner', 'system');symlinkSync(s.path, join(s.folder, 'linked.md'));
  for (const dryRun of [true, false]) assert.throws(() => f.mutate('partner', 'write', s.id, { input: {}, dryRun }), { code: 'OBJECT_RESOURCE_UNSUPPORTED' });
  assert.deepEqual(readdirSync(join(f.root, types.partner.user)), []);
});

test('concurrent edits to entries, resources or catalog prevent publication and clean staging', t => {
  for (const target of ['entry', 'resource', 'catalog']) {
    const f = fixture(t), s = f.add('partner', 'system');writeFileSync(join(s.folder, 'resource.bin'), 'before');
    assert.throws(() => f.mutate('partner', 'write', s.id, { input: {} }, { beforePublish: () => {
      if (target === 'entry') writeFileSync(s.path, readFileSync(s.path, 'utf8') + '\nexternal');
      else if (target === 'resource') writeFileSync(join(s.folder, 'resource.bin'), 'after');
      else f.add('data-package', 'user', 'data-package.test.new');
    } }), { code: 'OBJECT_CONFLICT' });
    assert.deepEqual(readdirSync(join(f.root, types.partner.user)), []);
  }
});

test('global lock blocks another object mutation but dry-run does not acquire or remove it', t => {
  const f = fixture(t), s = f.add('partner', 'system');
  withObjectLock(f.root, () => {
    assert.throws(() => f.mutate('partner', 'write', s.id, { input: {} }), { code: 'OBJECT_LOCKED' });
    assert.equal(f.mutate('partner', 'write', s.id, { input: {}, dryRun: true }).data.changed, false);
    assert.equal(existsSync(join(f.root, '.agents/runtime-data/objects/write.lock')), true);
  });
  assert.equal(existsSync(join(f.root, '.agents/runtime-data/objects/write.lock')), false);
});

test('physical removal leaves diagnostic recovery data if quarantine cleanup fails', t => {
  const f = fixture(t), u = f.add('partner', 'user');
  assert.throws(() => f.mutate('partner', 'remove', u.id, {}, { cleanup: () => { throw new Error('simulated'); } }), error => {
    assert.equal(error.code, 'OBJECT_CLEANUP_FAILED');assert.equal(error.details.data.changed, true);
    assert.equal(existsSync(error.details.data.recoveryPath), true);return true;
  });
  assert.equal(existsSync(u.folder), false);assert.equal(f.query('partner', 'list').data.objects.length, 0);
});

test('missing or linked scopes produce incomplete discovery instead of empty success', t => {
  const f = fixture(t);rmSync(join(f.root, types.partner.user), { recursive: true });
  assert.equal(f.query('partner', 'list').data.complete, false);
  symlinkSync(join(f.root, types.partner.system), join(f.root, types.partner.user));
  assert.equal(f.query('partner', 'list').data.complete, false);
});

test('wrong entry filenames are rejected as invalid rather than exposed as usable summaries', t => {
  const f = fixture(t);
  const object = f.add('partner', 'system');
  const bytes = readFileSync(object.path);rmSync(object.path);
  writeFileSync(join(object.folder, 'cooperation.md'), bytes);
  const listed = f.query('partner', 'list', undefined, { source: 'all' });
  assert.equal(listed.data.complete, false);assert.deepEqual(listed.data.objects, []);
  assert.ok(listed.errors.some(e => e.code === 'OBJECT_ENTRY_INVALID'));
  assert.throws(() => f.query('partner', 'read', object.id), { code: 'OBJECT_INVALID' });
});

test('reusable object service validates input before locks or directory changes', t => {
  const f = fixture(t);
  for (const input of [null, [], { body: false }, { metadata: [] }, { extra: 'x' }, { metadata: { count: Infinity } }, { metadata: { value: undefined } }]) {
    assert.throws(() => f.mutate('partner', 'write', 'partner.test.new', { input }), { code: 'INPUT_INVALID' });
  }
  assert.equal(existsSync(join(f.root, '.agents/runtime-data')), false);
  assert.deepEqual(f.query('partner', 'list').data.objects, []);
});

test('Markdown link rebasing handles nested labels, parentheses, spaces and code examples', t => {
  const f = fixture(t);
  const externalDirectory = join(f.root, '.agents/core/abilities/partners/external');mkdirSync(externalDirectory);
  const external = join(externalDirectory, 'manual(v1).md');writeFileSync(external, '# Ref');
  const body = '[**[nested]**](../external/manual(v1).md#section "title")\n' +
    '![image](<../external/manual(v1).md> "caption")\n' +
    '[ref]: ../external/manual(v1).md "title"\n' +
    '`[literal](../external/manual(v1).md)`\n' +
    '    [code](../external/manual(v1).md)\n' +
    '```md\n[fenced](../external/manual(v1).md)\n```\n';
  const s = f.add('partner', 'system', 'partner.test.links', {}, body);
  const result = f.mutate('partner', 'write', s.id, { input: {} }).data;
  const text = f.query('partner', 'read', s.id).data.object.body;
  const lines = text.split('\n');
  const first = /\]\((.+)#section/.exec(lines[0])[1];
  assert.equal(realpathSync(join(dirname(join(f.root, result.path)), decodeURIComponent(first))), external);
  assert.ok(!lines[1].includes('(<../external/'));assert.ok(!lines[2].includes(': ../external/'));
  assert.ok(lines[3].includes('`[literal](../external/manual(v1).md)`'));
  assert.equal(lines[4], '    [code](../external/manual(v1).md)');
  assert.ok(text.includes('[fenced](../external/manual(v1).md)'));
});

test('damaged ID fields cannot hide a user override and silently expose the system copy', t => {
  for (const brokenId of ['wrong', 'partner.test.different', null]) {
    const f = fixture(t), id = 'partner.test.sample';f.add('partner', 'system', id);
    f.add('partner', 'user', id, { id: brokenId });
    assert.throws(() => f.query('partner', 'read', id), { code: 'OBJECT_INVALID' });
    assert.equal(f.query('partner', 'read', id, { source: 'system' }).data.object.source, 'system');
    assert.equal(f.query('partner', 'check', id).data.valid, false);
    assert.equal(f.mutate('partner', 'remove', id).data.changed, true);
  }
});

test('derived origin marker prevents a missing baseline from being mistaken for an original', t => {
  const f = fixture(t), s = f.add('partner', 'system');
  const result = f.mutate('partner', 'write', s.id, { input: {} }).data;
  assert.deepEqual(f.query('partner', 'read', s.id).data.object.metadata.upstream, { id: s.id, version: '0.1.0' });
  assert.throws(() => f.mutate('partner', 'write', s.id, { input: { metadata: { upstream: null } } }), { code: 'OBJECT_MANAGED_FIELD' });
  rmSync(join(f.root, result.directory, '.upstream'), { recursive: true });
  assert.equal(f.query('partner', 'check', s.id).data.valid, false);
  assert.throws(() => f.mutate('partner', 'write', s.id, { input: { body: '# Changed' } }), { code: 'OBJECT_BASELINE_INVALID' });
  assert.equal(f.mutate('partner', 'remove', s.id).data.changed, true);
});

test('remove reports absent user objects without touching unsupported system-only resources', t => {
  const f = fixture(t), s = f.add('partner', 'system');
  symlinkSync(s.path, join(s.folder, 'symbolic-resource.md'));
  for (const dryRun of [false, true]) assert.throws(() => f.mutate('partner', 'remove', s.id, { dryRun }), { code: 'OBJECT_NOT_FOUND' });
  assert.equal(existsSync(s.path), true);
});
