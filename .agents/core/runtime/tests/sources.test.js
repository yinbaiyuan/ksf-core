import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync, symlinkSync, readdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import YAML from '../src/vendor/yaml/dist/index.js';
import { types, protectedPaths } from '../src/objects/schema.js';
import { objectQuery, objectMutation } from '../src/services/objects.js';
import { abilitySource } from '../src/services/sources.js';
import { runSourceCommand } from '../src/commands/sources.js';
import { runContextCommand } from '../src/commands/context.js';
import { contextCapabilities } from '../src/services/context.js';
import { readSourceRegistry } from '../src/sources/storage.js';
import { checkSourceCompatibility } from '../src/sources/compatibility.js';

function fixture(t) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'ksf sources 测试 '))), root = join(folder, 'ksf');
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  for (const type of Object.values(types)) for (const source of ['system', 'user']) mkdirSync(join(root, type[source]), { recursive: true });
  const run = (operation, options = {}, hooks) => abilitySource({ root, operation, ...options }, hooks);
  const add = (where, id, fields = {}, body = '# Method\n', extra = {}) => {
    const type = id.split('.')[0], base = ['system', 'user'].includes(where) ? root : where;
    const directory = join(base, types[type][where === 'system' ? 'system' : 'user'], id);
    mkdirSync(directory, { recursive: true });
    const file = join(directory, types[type].entry);
    writeFileSync(file, `---\n${YAML.stringify({ id, name: id, description: 'description', status: 'active', version: '0.1.0', ...(where === 'user' ? { user_revision: 1 } : {}), ...fields })}---\n${body}`);
    for (const [name, content] of Object.entries(extra)) { mkdirSync(dirname(join(directory, name)), { recursive: true }); writeFileSync(join(directory, name), content); }
    return file;
  };
  const source = id => {
    const path = join(folder, id); mkdirSync(path);
    const initialized = spawnSync('/usr/bin/git', ['init', '--template=', '--initial-branch=main', path], { encoding: 'utf8' });
    assert.equal(initialized.status, 0, initialized.stderr);
    run('init', { target: path, id, name: id });
    return path;
  };
  const query = (type, reference, source = 'effective') => objectQuery({ root, type, operation: 'read', reference, source });
  return { root, folder, run, add, source, query };
}
const throws = (action, code) => assert.throws(action, error => error.code === code);
function commitSource(path) {
  const run = args => {
    const result = spawnSync('/usr/bin/git', ['-C', path, '-c', 'user.name=Source Fixture', '-c', 'user.email=source@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
    assert.equal(result.status, 0, result.stderr);
  };
  run(['add', '--', '能力', 'ksf-source.yaml', 'README.md', 'AGENTS.md']);
  run(['commit', '-m', 'Fictional published source baseline']);
}


test('source init/check/link/unlink use only a direct independent repository association', t => {
  const f = fixture(t), path = f.source('methods');
  assert.equal(f.run('check', { reference: path }).data.valid, true);
  assert.match(readFileSync(join(path, 'AGENTS.md'), 'utf8'), /本仓库不是 KSF 工作区/);
  const preview = f.run('link', { target: path, dryRun: true });
  assert.equal(preview.data.changed, false); assert.equal(preview.data.wouldChange, true);
  assert.equal(existsSync(join(f.root, '.agents/user-data')), false);
  assert.equal(f.run('link', { target: path }).data.changed, true);
  assert.equal(f.run('link', { target: path }).data.changed, false);
  assert.equal(f.run('read', { target: 'methods' }).data.path, path);
  assert.equal(f.run('list').data.sources.length, 1);
  assert.deepEqual(readSourceRegistry(f.root).entries, [{ id: 'methods', path }]);
  assert.equal(existsSync(join(f.root, '.agents/runtime-data/sources')), false);
  assert.equal(f.run('unlink', { target: 'methods' }).data.changed, true);
  assert.ok(existsSync(join(path, 'ksf-source.yaml')));
  assert.equal(f.run('list').data.sources.length, 0);
});

test('declaration, protocol, identity, directory and resource errors reject association', t => {
  const f = fixture(t), path = f.source('methods'), declaration = join(path, 'ksf-source.yaml');
  const original = readFileSync(declaration);
  rmSync(declaration); throws(() => f.run('link', { target: path }), 'SOURCE_NOT_DECLARED');
  writeFileSync(declaration, original.toString().replace('schema_version: 1', 'schema_version: 99'));
  throws(() => f.run('link', { target: path }), 'SOURCE_VERSION_UNSUPPORTED');
  writeFileSync(declaration, original + '\nid: duplicate\n');
  throws(() => f.run('link', { target: path }), 'YAML_DUPLICATE_KEY');
  writeFileSync(declaration, original + '\n---\nkind: unexpected\n');
  throws(() => f.run('link', { target: path }), 'SOURCE_DECLARATION_INVALID');
  writeFileSync(declaration, original);
  const file = f.add(path, 'partner.any.method');
  symlinkSync(file, join(dirname(file), 'linked.md'));
  throws(() => f.run('link', { target: path }), 'SOURCE_INVALID');
  rmSync(join(dirname(file), 'linked.md'));
  f.run('link', { target: path });
  writeFileSync(declaration, original.toString().replace('id: methods', 'id: changed'));
  assert.ok(f.run('list').errors.some(error => error.code === 'SOURCE_ID_CHANGED'));
  assert.equal(contextCapabilities(f.root).data.complete, false);
});

test('linked objects use the live working tree, external paths and optional type directories', t => {
  const f = fixture(t), path = f.source('methods'), id = 'partner.author.method';
  for (const type of ['workflow', 'competency', 'data-package']) rmSync(join(path, types[type].user), { recursive: true });
  const file = f.add(path, id, {}, '# original\n');
  f.run('link', { target: path });
  assert.equal(f.query('partner', id).data.object.path, file);
  assert.equal(f.query('partner', id).data.object.source_root, path);
  writeFileSync(file, readFileSync(file, 'utf8').replace('# original', '# changed'));
  assert.equal(f.query('partner', id).data.object.body, '# changed\n');
  const context = contextCapabilities(f.root);
  assert.equal(context.data.partners.objects[0].source, 'methods');
  assert.equal(context.data.workflows.objects.length, 0); // source AGENTS is not a workflow
  assert.equal(context.data.complete, true);
  assert.equal(readdirSync(path).some(name => /snapshot|cache/.test(name)), false);
});

test('multiple sources require explicit choice while personal and exact-version precedence is preserved', t => {
  const f = fixture(t), a = f.source('source-a'), b = f.source('source-b'), id = 'partner.author.same';
  f.add('system', id, { version: '0.3.0' });
  f.add(a, id); f.add(b, id);
  f.run('link', { target: a }); f.run('link', { target: b });
  throws(() => f.query('partner', id), 'SOURCE_AMBIGUOUS');
  assert.equal(f.query('partner', id, 'source-a').data.object.source, 'source-a');
  assert.equal(contextCapabilities(f.root, { source: 'source-b' }).data.complete, true);
  assert.equal(f.query('partner', id + '@0.3.0').data.object.source, 'system');
  const personal = f.add('user', id, { status: 'draft' });
  assert.equal(f.query('partner', id).data.object.source, 'user');
  writeFileSync(personal, readFileSync(personal, 'utf8').replace('status: draft', 'status: archived'));
  throws(() => f.query('partner', id), 'SOURCE_AMBIGUOUS');
  assert.ok(!contextCapabilities(f.root).data.complete);
});

test('source dependencies bind to their own repository or Core, never another source or personal overrides', t => {
  const f = fixture(t), a = f.source('source-a'), b = f.source('source-b');
  const dep = 'competency.author.method', owner = 'partner.author.owner';
  f.add(a, dep); f.add(a, owner, { references: [dep + '@0.1.0'] });
  f.add(b, dep); f.add('user', dep);
  f.run('link', { target: a }); f.run('link', { target: b });
  assert.equal(f.query('partner', owner).data.references[0].source, 'source-a');
  rmSync(join(a, types.competency.user, dep), { recursive: true });
  assert.equal(f.query('partner', owner).errors.length, 1);
  f.add('system', dep);
  assert.equal(f.query('partner', owner).data.references[0].source, 'system');
});

test('personal export copies complete resources and dependencies, rebases links and leaves originals intact', t => {
  const f = fixture(t), path = f.source('methods'), method = 'competency.author.method', partner = 'partner.author.owner';
  f.run('link', { target: path });
  const methodFile = f.add('user', method, {}, '# method\n', { 'scripts/tool.js': 'throw new Error("MUST_NOT_EXECUTE");' });
  const partnerFile = f.add('user', partner, { references: [method + '@0.1.0'] }, `[method](../../基本功/${method}/competency.md)\n`);
  const originals = [readFileSync(partnerFile), readFileSync(methodFile)];
  const preview = f.run('export', { target: 'methods', reference: partner, dryRun: true });
  assert.equal(preview.data.objects.length, 2); assert.equal(preview.data.changed, false);
  assert.equal(existsSync(join(path, types.partner.user, partner)), false);
  const result = f.run('export', { target: 'methods', reference: partner });
  assert.equal(result.data.changed, true);
  assert.equal(f.run('check', { target: 'methods' }).data.valid, true);
  assert.ok(!f.query('partner', partner, 'methods').data.object.metadata.user_revision);
  assert.ok(existsSync(join(path, types.competency.user, method, 'scripts/tool.js')));
  assert.deepEqual(readFileSync(partnerFile), originals[0]); assert.deepEqual(readFileSync(methodFile), originals[1]);
  assert.equal(f.run('export', { target: 'methods', reference: partner }).data.changed, false);
  writeFileSync(partnerFile, readFileSync(partnerFile, 'utf8') + '\nchanged\n');
  throws(() => f.run('export', { target: 'methods', reference: partner }), 'SOURCE_VERSION_REQUIRED');
});

test('export strips a verified personal derivation baseline and retains its identity', t => {
  const f = fixture(t), path = f.source('methods'), id = 'competency.author.method';
  f.add('system', id);
  objectMutation({ root: f.root, type: 'competency', operation: 'write', id, input: {} });
  f.run('link', { target: path });
  f.run('export', { target: 'methods', reference: id });
  const object = f.query('competency', id, 'methods').data.object;
  assert.equal(object.id, id); assert.equal(object.metadata.upstream, undefined);
  assert.equal(existsSync(join(object.directory, '.upstream')), false);
  assert.ok(existsSync(join(f.root, types.competency.user, id, '.upstream')));
});

test('export refuses other-source dependencies and external local resources before changing the destination', t => {
  const f = fixture(t), a = f.source('source-a'), b = f.source('source-b'), dep = 'competency.author.method', id = 'partner.author.owner';
  f.add(b, dep); f.run('link', { target: a }); f.run('link', { target: b });
  const file = f.add('user', id, { references: [dep + '@0.1.0'] });
  throws(() => f.run('export', { target: 'source-a', reference: id }), 'SOURCE_DEPENDENCY_INVALID');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/references:[\s\S]*?---/, 'references: []\n---') + '\n[private](../../../知识/private.md)\n');
  throws(() => f.run('export', { target: 'source-a', reference: id }), 'SOURCE_RESOURCE_EXTERNAL');
  assert.equal(existsSync(join(a, types.partner.user, id)), false);
});

test('export detects concurrent edits and preserves the target and original', t => {
  const f = fixture(t), path = f.source('methods'), id = 'competency.author.method';
  f.run('link', { target: path });
  const file = f.add('user', id);
  throws(() => f.run('export', { target: 'methods', reference: id }, { beforePublish() { writeFileSync(file, readFileSync(file, 'utf8') + 'concurrent\n'); } }), 'SOURCE_CONFLICT');
  assert.equal(existsSync(join(path, types.competency.user, id)), false);
  assert.match(readFileSync(file, 'utf8'), /concurrent/);
  assert.equal(existsSync(join(path, '.ksf-source-write.lock')), false);
});

test('source and context CLI validate operations and expose source filters', t => {
  const f = fixture(t), path = f.source('methods');
  for (const args of [[], ['--help'], ...['init', 'link', 'unlink', 'list', 'read', 'check', 'export'].map(op => [op, '--help'])]) assert.equal(runSourceCommand(args, f.root).exitCode, 0);
  for (const args of [['init', path], ['link'], ['list', 'extra'], ['read', 'system'], ['check', 'methods', '--path', path], ['export', 'methods'], ['link', path, '--json', '--json'], ['list', '--dry-run']]) assert.equal(runSourceCommand([...args, ...(args.includes('--json') ? [] : ['--json'])], f.root).exitCode, 2, args.join(' '));
  assert.equal(runSourceCommand(['link', path, '--json'], f.root).exitCode, 0);
  f.add(path, 'partner.author.method');
  const context = runContextCommand(['capabilities', '--source', 'methods', '--json'], f.root);
  assert.equal(context.exitCode, 0, context.stdout);
  assert.equal(JSON.parse(context.stdout).data.partners.objects[0].source, 'methods');
  assert.equal(runSourceCommand(['unlink', 'methods', '--json'], f.root).exitCode, 0);
});

test('fixed entries cannot be published or loaded from a linked source', t => {
  const f = fixture(t), path = f.source('methods');
  f.run('link', { target: path });
  for (const id of Object.keys(protectedPaths)) {
    throws(() => f.run('export', { target: 'methods', reference: id, dryRun: true }), 'OBJECT_PROTECTED');
  }
  f.add(path, 'partner.ksf.runtime');
  assert.equal(f.run('check', { target: 'methods' }).data.valid, false);
});

test('export update rollback preserves all previous objects if a later publication fails', t => {
  const f = fixture(t), path = f.source('methods'), method = 'competency.author.method', owner = 'partner.author.owner';
  f.run('link', { target: path });
  const dep = f.add('user', method), entry = f.add('user', owner, { references: [method + '@0.1.0'] });
  f.run('export', { target: 'methods', reference: owner });
  const targetDep = join(path, types.competency.user, method, 'competency.md');
  const targetOwner = join(path, types.partner.user, owner, 'partner.md');
  const originals = [readFileSync(targetDep), readFileSync(targetOwner)];
  commitSource(path);
  writeFileSync(dep, readFileSync(dep, 'utf8').replace('version: 0.1.0', 'version: 0.1.1'));
  writeFileSync(entry, readFileSync(entry, 'utf8').replaceAll('0.1.0', '0.1.1'));
  assert.throws(() => f.run('export', { target: 'methods', reference: owner }, { afterObjectPublish(id) { if (id === owner) throw new Error('simulated publication failure'); } }), /simulated/);
  assert.deepEqual(readFileSync(targetDep), originals[0]); assert.deepEqual(readFileSync(targetOwner), originals[1]);
  assert.equal(f.run('export', { target: 'methods', reference: owner }).data.changed, true);
  assert.equal(f.query('partner', owner, 'methods').data.object.version, '0.1.1');
});

test('source scope and resource errors do not silently fall back to system objects', t => {
  const f = fixture(t), path = f.source('methods'), id = 'partner.author.method';
  f.add('system', id); const file = f.add(path, id);
  f.run('link', { target: path });
  writeFileSync(file, readFileSync(file, 'utf8').replace('description: description', 'description: ""'));
  throws(() => f.query('partner', id), 'OBJECT_INVALID');
  assert.equal(f.query('partner', id, 'system').data.object.source, 'system');
  rmSync(path, { recursive: true });
  throws(() => f.query('partner', id), 'OBJECT_SCOPE_INCOMPLETE');
  assert.equal(f.run('unlink', { target: 'methods' }).data.changed, true);
  assert.equal(f.query('partner', id).data.object.source, 'system');
});

test('init preserves existing guidance and rejects linked capability directories', t => {
  const f = fixture(t), path = join(f.folder, 'new-source'); mkdirSync(path);
  spawnSync('/usr/bin/git', ['init', '--template=', path]);
  writeFileSync(join(path, 'AGENTS.md'), 'existing guidance');
  f.run('init', { target: path, id: 'new-source', name: 'New source' });
  assert.equal(readFileSync(join(path, 'AGENTS.md'), 'utf8'), 'existing guidance');
  const copy = join(f.folder, 'linked-source'); mkdirSync(copy); spawnSync('/usr/bin/git', ['init', '--template=', copy]);
  symlinkSync(join(path, '能力'), join(copy, '能力'));
  throws(() => f.run('init', { target: copy, id: 'linked-source', name: 'Linked' }), 'SOURCE_PATH_INVALID');
  assert.equal(existsSync(join(copy, 'ksf-source.yaml')), false);
});

test('managed sources stay outside parent Git tracking and duplicate source identities are rejected', t => {
  const f = fixture(t);
  spawnSync('/usr/bin/git', ['init', '--template=', f.root]);
  writeFileSync(join(f.root, '.gitignore'), '/repositories/\n/.agents/runtime-data/\n');
  const path = join(f.root, 'repositories/shared'); mkdirSync(path, { recursive: true });
  spawnSync('/usr/bin/git', ['init', '--template=', path]);
  f.run('init', { target: path, id: 'shared', name: 'Shared' });
  f.add(path, 'competency.author.private');
  f.run('link', { target: path });
  assert.equal(readSourceRegistry(f.root).entries[0].path, 'repositories/shared');
  spawnSync('/usr/bin/git', ['-C', f.root, 'add', '--', '.']);
  const tracked = spawnSync('/usr/bin/git', ['-C', f.root, 'ls-files'], { encoding: 'utf8' });
  assert.ok(!tracked.stdout.includes('repositories/'));
  const other = f.source('another');
  const declaration = join(other, 'ksf-source.yaml');
  writeFileSync(declaration, readFileSync(declaration, 'utf8').replace('id: another', 'id: shared'));
  throws(() => f.run('link', { target: other }), 'SOURCE_ID_CONFLICT');
});

test('publication versions can change a derived contribution without changing the personal source version', t => {
  const f = fixture(t), path = f.source('methods'), method = 'competency.author.method', owner = 'partner.author.owner';
  f.add('system', method); f.add('system', owner, { references: [method + '@0.1.0'] });
  for (const id of [method, owner]) objectMutation({ root: f.root, type: id.split('.')[0], operation: 'write', id, input: {} });
  f.run('link', { target: path }); f.run('export', { target: 'methods', reference: owner });
  commitSource(path);
  objectMutation({ root: f.root, type: 'competency', operation: 'write', id: method, input: { body: '# Updated method\n' } });
  const versions = { [method]: '0.1.1', [owner]: '0.1.1' };
  const preview = f.run('export', { target: 'methods', reference: owner, versions, dryRun: true });
  assert.equal(preview.data.objects.find(item => item.id === owner).version, '0.1.1');
  const result = runSourceCommand(['export', 'methods', owner, '--versions', JSON.stringify(versions), '--json'], f.root);
  assert.equal(result.exitCode, 0, result.stdout);
  assert.equal(f.query('partner', owner, 'methods').data.references[0].version, '0.1.1');
  assert.equal(f.query('competency', method, 'user').data.object.version, '0.1.0');
  assert.equal(f.run('check', { target: 'methods' }).data.valid, true);
});

test('publication validation rejects empty bodies, absolute local links and invalid version mappings without writes', t => {
  const f = fixture(t), path = f.source('methods'), id = 'competency.author.method';
  f.run('link', { target: path });
  const file = f.add('user', id, {}, '');
  throws(() => f.run('export', { target: 'methods', reference: id, dryRun: true }), 'SOURCE_EXPORT_INVALID');
  writeFileSync(file, readFileSync(file, 'utf8') + '[local](/private/local-document.md)\n');
  throws(() => f.run('export', { target: 'methods', reference: id, dryRun: true }), 'SOURCE_RESOURCE_EXTERNAL');
  for (const versions of ['[]', '{"competency.author.method":"latest"}', '{bad']) {
    assert.equal(runSourceCommand(['export', 'methods', id, '--versions', versions, '--json'], f.root).exitCode, 2);
  }
  assert.equal(existsSync(join(path, types.competency.user, id)), false);
});

test('export resolves protected Core references and skips archived personal dependency copies', t => {
  const f = fixture(t), path = f.source('methods'), owner = 'partner.author.owner', method = 'competency.author.method';
  const fixed = 'competency.ksf.ability-route', file = join(f.root, protectedPaths[fixed]);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `---\nid: ${fixed}\nname: route\ndescription: route\nstatus: active\nversion: 0.1.0\n---\n# Route\n`);
  f.add('system', method); f.add('user', method, { status: 'archived' });
  f.add('user', owner, { references: [fixed + '@0.1.0', method + '@0.1.0'] });
  f.run('link', { target: path });
  const result = f.run('export', { target: 'methods', reference: owner });
  assert.equal(result.data.objects.length, 1);
  assert.ok(f.query('partner', owner, 'methods').data.references.every(ref => ref.source === 'system'));
  assert.equal(f.run('check', { target: 'methods' }).data.valid, true);
});

test('unlink of an unknown source is a no-op without configuration or lock creation', t => {
  const f = fixture(t);
  assert.equal(f.run('unlink', { target: 'missing' }).data.changed, false);
  assert.equal(existsSync(join(f.root, '.agents/user-data')), false);
  assert.equal(existsSync(join(f.root, '.agents/runtime-data')), false);
});

test('a source named registry is distinct from registry-configuration failures', t => {
  const f = fixture(t), path = f.source('registry'), id = 'partner.author.method';
  f.add(path, id); f.run('link', { target: path });
  rmSync(join(path, types.competency.user), { recursive: true });
  symlinkSync(join(f.root, types.competency.user), join(path, types.competency.user));
  const result = contextCapabilities(f.root);
  assert.equal(result.data.partners.complete, true, JSON.stringify(result.errors));
  assert.equal(result.data.partners.objects[0].source, 'registry');
});

test('export protects pre-existing target edits and previews deleted resources', t => {
  const f = fixture(t), path = f.source('methods'), id = 'competency.author.method';
  f.run('link', { target: path });
  const original = f.add('user', id);
  f.run('export', { target: 'methods', reference: id });
  const directory = join(path, types.competency.user, id), target = join(directory, 'competency.md');
  writeFileSync(join(directory, 'old.txt'), 'published old resource'); commitSource(path);
  const previous = readFileSync(target);
  writeFileSync(original, readFileSync(original, 'utf8').replace('version: 0.1.0', 'version: 0.1.1') + 'personal update\n');
  writeFileSync(target, previous + 'existing target edit\n');
  throws(() => f.run('export', { target: 'methods', reference: id }), 'SOURCE_TARGET_DIRTY');
  assert.match(readFileSync(target, 'utf8'), /existing target edit/);
  writeFileSync(target, previous);
  const exclude = join(path, '.git/info/exclude'); mkdirSync(dirname(exclude), { recursive: true });
  writeFileSync(exclude, `能力/基本功/${id}/local.cache\n`);
  writeFileSync(join(directory, 'local.cache'), 'ignored local data');
  throws(() => f.run('export', { target: 'methods', reference: id }), 'SOURCE_TARGET_DIRTY');
  assert.equal(readFileSync(join(directory, 'local.cache'), 'utf8'), 'ignored local data');
  rmSync(join(directory, 'local.cache')); rmSync(exclude);
  const preview = f.run('export', { target: 'methods', reference: id, dryRun: true });
  assert.deepEqual(preview.data.objects[0].removed_files, [`能力/基本功/${id}/old.txt`]);
  f.run('export', { target: 'methods', reference: id });
  assert.equal(existsSync(join(directory, 'old.txt')), false);
});

test('re-export after a normal Git clone ignores owner permissions and untracked empty directories', t => {
  const f = fixture(t), path = f.source('methods'), id = 'competency.author.method';
  f.run('link', { target: path });
  const file = f.add('user', id); chmodSync(file, 0o600);
  mkdirSync(join(dirname(file), 'empty'));
  f.run('export', { target: 'methods', reference: id }); commitSource(path);
  const clone = join(f.folder, 'cloned-methods');
  const copied = spawnSync('/usr/bin/git', ['clone', '--', path, clone], { encoding: 'utf8' });
  assert.equal(copied.status, 0, copied.stderr);
  f.run('unlink', { target: 'methods' }); f.run('link', { target: clone });
  assert.equal(existsSync(join(clone, types.competency.user, id, 'empty')), false);
  assert.equal(f.run('export', { target: 'methods', reference: id }).data.changed, false);
});

test('a damaged source registry is reported as configuration failure rather than an unknown source', t => {
  const f = fixture(t), path = f.source('methods'), id = 'partner.author.method';
  f.add(path, id); f.run('link', { target: path });
  writeFileSync(join(f.root, '.agents/user-data/sources.json'), '{malformed');
  throws(() => f.query('partner', id, 'methods'), 'USER_DATA_INVALID');
  assert.equal(contextCapabilities(f.root).data.complete, false);
  assert.equal(f.run('check', { reference: path }).data.valid, true);
});

test('Core compatibility rejects releases without source support while unconfigured instances remain compatible', t => {
  const f = fixture(t), candidate = join(f.folder, 'pre-source-core'); mkdirSync(candidate);
  assert.doesNotThrow(() => checkSourceCompatibility(f.root, candidate));
  const path = f.source('methods'); f.run('link', { target: path });
  throws(() => checkSourceCompatibility(f.root, candidate), 'SOURCE_CORE_INCOMPATIBLE');
});
