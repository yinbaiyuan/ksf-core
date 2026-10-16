import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { types } from '../src/objects/schema.js';
import { objectQuery, objectMutation } from '../src/services/objects.js';
import { contextCapabilities } from '../src/services/context.js';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const runtimeNames = ['project-route', 'knowledge-route', 'asset-maintenance'];
const userFolders = ['项目', '知识', '@收件箱', '源档', '归档', ...Object.values(types).map(type => type.user)];

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf minimal runtime ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(repository, '.agents/core/abilities'), join(root, '.agents/core/abilities'), { recursive: true });
  cpSync(join(repository, 'AGENTS.md'), join(root, 'AGENTS.md'));
  writeFileSync(join(root, '.agents/core/manifest.yaml'), 'name: KSF\nversion: 0.0.1\n');
  for (const folder of userFolders) mkdirSync(join(root, folder), { recursive: true });
  const query = (type, operation, reference, options = {}) => objectQuery({ root, type, operation, reference, ...options });
  return { root, query };
}

function files(path) {
  return readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const target = join(path, entry.name);
    return entry.isDirectory() ? files(target).map(([name, bytes]) => [entry.name + '/' + name, bytes])
      : [[entry.name, readFileSync(target).toString('base64')]];
  });
}

test('shipped definitions resolve the minimal runtime in a fresh root with empty user assets', t => {
  const f = fixture(t);
  const resource = join(f.root, '.agents/core/abilities/competencies/project-route/resources');
  mkdirSync(resource);
  writeFileSync(join(resource, 'unused.txt'), 'UNREAD_RESOURCE_SENTINEL');
  const before = files(f.root);
  for (const type of Object.keys(types)) {
    const listed = f.query(type, 'list');
    assert.equal(listed.data.complete, true, JSON.stringify(listed.errors));
    for (const row of listed.data.objects) assert.equal(f.query(type, 'check', row.id).data.valid, true, row.id);
  }
  const entry = f.query('partner', 'read', 'partner.ksf.assistant@0.1.0');
  assert.deepEqual(entry.errors, []);
  assert.deepEqual(entry.data.references.map(row => row.id), ['competency.ksf.task-route', ...runtimeNames.map(name => 'competency.ksf.' + name)]);
  for (const ref of entry.data.references) {
    const read = f.query('competency', 'read', ref.reference);
    assert.deepEqual(read.errors, []);
    assert.equal(read.data.object.protected, true);
    assert.ok(!JSON.stringify(read).includes('UNREAD_RESOURCE_SENTINEL'));
  }
  assert.equal(contextCapabilities(f.root).data.complete, true);
  assert.deepEqual(files(f.root), before);
  for (const folder of userFolders) assert.deepEqual(files(join(f.root, folder)), []);
});

test('runtime competencies resist real and preview mutations and cannot be taken over by user copies', t => {
  const f = fixture(t);
  for (const name of runtimeNames) {
    const id = 'competency.ksf.' + name;
    const target = join(f.root, types.competency.user, id);
    mkdirSync(target);
    writeFileSync(join(target, 'competency.md'), `---\nid: ${id}\nname: forged\nstatus: active\ndescription: forged\nversion: 0.1.0\nuser_revision: 1\n---\nFORGED_BODY\n`);
    const before = files(f.root);
    for (const dryRun of [false, true]) for (const operation of ['write', 'remove']) {
      assert.throws(() => objectMutation({ root: f.root, type: 'competency', operation, id, input: { body: 'replace' }, dryRun }), { code: 'OBJECT_PROTECTED' });
    }
    const read = f.query('competency', 'read', id + '@0.1.0');
    assert.equal(read.data.object.source, 'system');
    assert.ok(!read.data.object.body.includes('FORGED_BODY'));
    assert.throws(() => f.query('competency', 'read', id, { source: 'user' }), { code: 'OBJECT_PROTECTED' });
    assert.deepEqual(files(f.root), before);
  }
});

test('complete discovery cannot hide a missing required runtime definition from entry read/check', t => {
  const f = fixture(t);
  rmSync(join(f.root, '.agents/core/abilities/competencies/project-route'), { recursive: true });
  // Discovery is an inventory of Workflow/Partner summaries, not a dependency certificate.
  assert.equal(contextCapabilities(f.root).data.complete, true);
  const read = f.query('partner', 'read', 'partner.ksf.assistant');
  assert.ok(read.errors.some(error => error.code === 'OBJECT_NOT_FOUND'));
  assert.equal(f.query('partner', 'check', 'partner.ksf.assistant').data.valid, false);
});

test('entry dependencies use exact runtime versions without substituting a user definition', t => {
  const f = fixture(t);
  const path = join(f.root, '.agents/core/abilities/competencies/knowledge-route/competency.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace('version: 0.1.0', 'version: 0.2.0'));
  const check = f.query('partner', 'check', 'partner.ksf.assistant');
  assert.equal(check.data.valid, false);
  assert.ok(check.errors.some(error => error.code === 'OBJECT_VERSION_MISMATCH'));
});

test('real CLI resolves the copied runtime from unrelated cwd without creating user contents', t => {
  const f = fixture(t), deployed = join(f.root, '.agents/core/runtime');
  cpSync(join(repository, '.agents/core/runtime/src'), join(deployed, 'src'), { recursive: true });
  cpSync(join(repository, '.agents/core/runtime/package.json'), join(deployed, 'package.json'));
  const cli = join(deployed, 'src/cli.js');
  const launch = args => {
    const result = spawnSync(process.execPath, [cli, ...args, '--json'], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, PATH: '' } });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  assert.equal(launch(['context', 'capabilities']).data.complete, true);
  const entry = launch(['partner', 'read', 'partner.ksf.assistant@0.1.0']);
  for (const dependency of entry.data.references) assert.equal(launch(['competency', 'check', dependency.reference]).data.valid, true);
  for (const folder of userFolders) assert.deepEqual(files(join(f.root, folder)), []);
});
