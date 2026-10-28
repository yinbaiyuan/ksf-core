import {platform} from '../src/platform/index.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync, symlinkSync, readdirSync, chmodSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from '../src/vendor/yaml/dist/index.js';
import { types, parseReference, parseStoredReference } from '../src/objects/schema.js';
import { currentObjectId } from '../src/objects/legacy.js';
import { sha256 } from '../src/shared/hash.js';
import { migrateCooperation, assertNoCooperationMigration, migrationDirectory, rewriteCooperationText } from '../src/migrations/cooperation.js';
import { runCooperationCommand } from '../src/commands/cooperation.js';
import { contextCapabilities } from '../src/services/context.js';
import { objectQuery, objectMutation } from '../src/services/objects.js';
import { validateStoredTarget, validateReport } from '../src/routing/schema.js';
import { decorateRecord, definitionContext, resolveReport } from '../src/routing/definitions.js';
import { recordDefinition } from '../src/user-data/records.js';
import { location } from '../src/chat-state/storage.js';
import { targetRegistry } from '../src/routing/target-registry.js';
import { mutateRoute } from '../src/services/routes.js';
import { ROUTE_DIRECTORY } from '../src/routing/schema.js';
import { primaryTarget } from '../src/task-capture/targets.js';

const oldId = 'workflow.demo.delivery', newId = 'cooperation.demo.delivery';
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf-cooperation-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const type of Object.values(types)) for (const scope of ['system', 'user']) mkdirSync(join(root, type[scope]), { recursive: true });
  const put = (path, bytes) => { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes); return file; };
  const entry = (id, extra = {}, user = true) => `---\n${YAML.stringify({ id, name: id, description: 'test', version: '1.0.0', status: 'active', ...(user ? { user_revision: 1 } : {}), ...extra })}---\n# Workflow 工作流\n`;
  put('AGENTS.md', entry('cooperation.ksf.entry', {}, false));
  const addOld = () => put(`能力/工作流/${oldId}/workflow.md`, entry(oldId));
  return { root, put, entry, addOld };
}
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const fails = (fn, code) => assert.throws(fn, e => e.code === code);

test('new CLI and discovery expose Cooperation; legacy inputs are rejected with migration guidance', t => {
  const f = fixture(t);
  const command = runCooperationCommand(['list', '--json'], f.root);
  assert.equal(command.exitCode, 0); assert.equal(JSON.parse(command.stdout).command, 'cooperation');
  const c = contextCapabilities(f.root);
  assert.ok(c.data.cooperations); assert.equal(c.data.workflows, undefined);
  assert.equal(parseReference(newId).id, newId);
  fails(() => objectQuery({ root: f.root, type: 'workflow', operation: 'list' }), 'OBJECT_TYPE_RENAMED');
  fails(() => objectMutation({ root: f.root, type: 'workflow', operation: 'remove', id: oldId }), 'OBJECT_TYPE_RENAMED');
  fails(() => parseReference(oldId), 'OBJECT_RENAMED');
  fails(() => recordDefinition(undefined, oldId), 'OBJECT_RENAMED');
  fails(() => location('a'.repeat(64), oldId), 'OBJECT_RENAMED');
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), 'workflow', 'list', '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 2); assert.equal(JSON.parse(cli.stdout).errors[0].code, 'COMMAND_RENAMED');
  assert.match(runCooperationCommand(['--help'], f.root).stdout, /cooperation migrate/);
  assert.equal(runCooperationCommand(['migrate', '--apply', '--dry-run', '--json'], f.root).exitCode, 2);
  const external = 'gh workflow run release.yml; workflow.dispatch(); workflow.tasks.run(); .github/workflows/check.yml';
  assert.equal(rewriteCooperationText(external), external);
  assert.equal(rewriteCooperationText('GitHub Actions Workflow 工作流', { terminology: true }), 'GitHub Actions Workflow 工作流');
  assert.equal(rewriteCooperationText('external:\n  workflows: [third-party]\n'), 'external:\n  workflows: [third-party]\n');
  assert.equal(rewriteCooperationText('workflow.团队.交付@1.0.0'), 'cooperation.团队.交付@1.0.0');
});

test('preview publishes no directories, files, locks, counters or source changes', t => {
  const f = fixture(t), file = f.addOld(), before = readFileSync(file);
  f.put('AGENTS.md', f.entry('workflow.ksf.entry', {}, false).replace('version: 1.0.0', 'version: 0.1.25'));
  const result = migrateCooperation({ root: f.root });
  assert.equal(result.changed, false); assert.ok(result.count > 0);
  assert.deepEqual(readFileSync(file), before);
  assert.equal(existsSync(join(f.root, migrationDirectory)), false);
  assert.equal(existsSync(join(f.root, '能力/协同', oldId)), false);
  migrateCooperation({ root: f.root, apply: true });
  assert.match(readFileSync(join(f.root, 'AGENTS.md'), 'utf8'), /version: 0\.1\.26/);
});

test('migration preserves variables, run identity, native turns, assets and historical bytes; repeat is a no-op', t => {
  const f = fixture(t); chmodSync(dirname(f.addOld()), 0o700);
  const asset = Buffer.from([0, 255, 17]); f.put(`能力/工作流/${oldId}/asset.bin`, asset);
  const chatId = 'a'.repeat(64), scope = { schemaVersion: 1, kind: 'scope', chatId, objectId: oldId, revision: 5, runId: 'existing-run', turnIds: ['turn-1', 'turn-2'], values: { nested: { count: 7 }, arbitrary: 'workflow.demo.unmodified-value' } };
  const oldState = f.put(`.agents/user-data/chats/${chatId}/abilities/${sha256(oldId)}.json`, JSON.stringify(scope));
  f.put(`.agents/user-data/abilities/${sha256(oldId)}.json`, JSON.stringify({ schema_version: 1, object_id: oldId, revision: 3, values: { setting: true } }));
  const history = f.put('档案/对话/original.json', '{"ref":"workflow.demo.delivery@1.0.0","signature":"keep"}');
  const historicalBytes = readFileSync(history);
  const applied = migrateCooperation({ root: f.root, apply: true });
  assert.equal(applied.changed, true); assert.equal(existsSync(oldState), false);
  const next = read(join(f.root, `.agents/user-data/chats/${chatId}/abilities/${sha256(newId)}.json`));
  assert.deepEqual({ ...next, objectId: oldId, revision: 5 }, scope);
  assert.equal(next.revision, 6);
  assert.deepEqual(readFileSync(join(f.root, `能力/协同/${newId}/asset.bin`)), asset);
  if(platform.supportsPosixModes)assert.equal(statSync(join(f.root, `能力/协同/${newId}`)).mode & 0o777, 0o700);
  assert.deepEqual(readFileSync(history), historicalBytes);
  assert.equal(objectQuery({ root: f.root, type: 'cooperation', operation: 'read', reference: newId }).data.object.id, newId);
  const second = migrateCooperation({ root: f.root, apply: true });
  assert.equal(second.changed, false); assert.equal(second.count, 0);
  assert.ok(existsSync(join(applied.backupDirectory, '0.before')));
  assert.equal(read(join(applied.backupDirectory, 'manifest.json')).actions.length, applied.count);
});

test('interrupted application resumes without losing data or restarting completed operations', t => {
  const f = fixture(t); f.addOld(); f.put(`能力/工作流/${oldId}/asset.bin`, 'asset');
  assert.throws(() => migrateCooperation({ root: f.root, apply: true }, { afterOperation(index) { if (index === 0) throw new Error('simulated interruption'); } }), /simulated/);
  fails(() => assertNoCooperationMigration(f.root), 'MIGRATION_PENDING');
  const result = migrateCooperation({ root: f.root, apply: true });
  assert.equal(result.changed, true); assert.equal(result.resumed, true);
  assertNoCooperationMigration(f.root);
  assert.equal(readFileSync(join(f.root, `能力/协同/${newId}/asset.bin`), 'utf8'), 'asset');
});

test('recovery detects edits to any remaining input before modifying other remaining files', t => {
  const f = fixture(t); f.addOld(); f.put(`能力/工作流/${oldId}/asset.bin`, 'asset');
  assert.throws(() => migrateCooperation({ root: f.root, apply: true }, { afterOperation() { throw new Error('interrupted'); } }));
  const state = read(join(f.root, migrationDirectory, 'state.json'));
  const remaining = state.actions.find(a => existsSync(a.source) && a.source !== state.actions[0].source);
  assert.ok(remaining); writeFileSync(remaining.source, 'concurrent edit');
  fails(() => migrateCooperation({ root: f.root, apply: true }), 'MIGRATION_CONFLICT');
  assert.equal(readFileSync(remaining.source, 'utf8'), 'concurrent edit');
});

test('old/new destination conflicts and preparation races preserve both sides', t => {
  const f = fixture(t), old = f.addOld(), target = f.put(`能力/协同/${newId}/cooperation.md`, 'new user data');
  fails(() => migrateCooperation({ root: f.root, apply: true }), 'MIGRATION_CONFLICT');
  assert.match(readFileSync(old, 'utf8'), /workflow/); assert.equal(readFileSync(target, 'utf8'), 'new user data');
  rmSync(dirname(target), { recursive: true });
  fails(() => migrateCooperation({ root: f.root, apply: true }, { beforePublish() { writeFileSync(old, 'concurrent edit'); } }), 'MIGRATION_CONFLICT');
  assert.equal(readFileSync(old, 'utf8'), 'concurrent edit');
});

test('symbolic links and corrupt scoped records fail before applying any planned changes', t => {
  const f = fixture(t), old = f.addOld();
  symlinkSync(old, join(dirname(old), 'alias.md'));
  fails(() => migrateCooperation({ root: f.root, apply: true }), 'MIGRATION_PATH_INVALID');
  rmSync(join(dirname(old), 'alias.md'));
  f.put(`.agents/user-data/abilities/${sha256(oldId)}.json`, '{invalid');
  fails(() => migrateCooperation({ root: f.root, apply: true }), 'MIGRATION_DATA_INVALID');
  assert.ok(existsSync(old));
});

test('source protocol 1, directory skeleton, references and project routing migrate explicitly', t => {
  const f = fixture(t), source = join(f.root, 'repositories/methods');
  f.put('repositories/methods/ksf-source.yaml', 'kind: ksf-ability-source\nschema_version: 1\nid: methods\nname: Methods\n');
  f.put('repositories/methods/能力/工作流/示例/workflow.md', f.entry(oldId, {}, false));
  f.put('.agents/user-data/sources.json', JSON.stringify({ schema_version: 1, namespace: 'sources', revision: 1, values: { entries: [{ id: 'methods', path: 'repositories/methods' }] } }));
  f.put('项目/项目甲/project.md', `---\nrouting:\n  workflows:\n    - ref: ${oldId}@1.0.0\n      source: methods\n---\n# 项目\n`);
  migrateCooperation({ root: f.root, apply: true });
  assert.match(readFileSync(join(source, 'ksf-source.yaml'), 'utf8'), /schema_version: 2/);
  assert.ok(existsSync(join(source, '能力/协同/示例/cooperation.md')));
  assert.match(readFileSync(join(f.root, '项目/项目甲/project.md'), 'utf8'), /cooperations/);
  const result = contextCapabilities(f.root);
  assert.equal(result.data.complete, true); assert.ok(result.data.cooperations.objects.some(o => o.id === newId));
});

test('both project routing spellings are a conflict rather than silently merging presets', t => {
  const f = fixture(t); f.put('项目/项目甲/project.md', '---\nrouting:\n  workflows: []\n  cooperations: []\n---\n# Project\n');
  fails(() => migrateCooperation({ root: f.root, apply: true }), 'MIGRATION_CONFLICT');
});

test('derived baselines are rehashed and remain writable while originals are backed up', t => {
  const f = fixture(t), entry = f.entry(oldId, { upstream: { id: oldId, version: '1.0.0' } });
  f.put(`能力/工作流/${oldId}/workflow.md`, entry);
  const base = f.entry(oldId, {}, false), originFiles = [{ path: 'workflow.md', sha256: sha256(Buffer.from(base)) }], directories = [''];
  f.put(`能力/工作流/${oldId}/.upstream/snapshot/workflow.md`, base);
  f.put(`能力/工作流/${oldId}/.upstream/origin.json`, JSON.stringify({ id: oldId, version: '1.0.0', ksf_version: '0.1.5', sourcePath: '.agents/core/abilities/workflows/example', files: originFiles, directories, digest: sha256(JSON.stringify({ files: originFiles, directories })) }));
  migrateCooperation({ root: f.root, apply: true });
  const origin = read(join(f.root, `能力/协同/${newId}/.upstream/origin.json`));
  assert.equal(origin.id, newId); assert.equal(origin.files[0].path, 'cooperation.md');
  const write = objectMutation({ root: f.root, type: 'cooperation', operation: 'write', id: newId, input: { body: '# Updated\n' } });
  assert.equal(write.errors.length, 0);
});

test('historical identity validation is separate from new writes and preserves the original digest', t => {
  const f = fixture(t); f.put(`能力/协同/${newId}/cooperation.md`, f.entry(newId));
  assert.deepEqual(parseStoredReference(oldId + '@1.0.0'), { id: oldId, version: '1.0.0' });
  const a = { id: oldId, ref: oldId + '@1.0.0', version: '1.0.0', name: 'Old name', source: 'user', path: `能力/工作流/${oldId}/workflow.md`, userRevision: 1, definitionDigest: 'a'.repeat(64), fixed: false, stage: 'adopted' };
  validateStoredTarget({ ...a, kind: 'ability', lifecycle: 'existing' });
  fails(() => validateReport({ summary: 'new', status: 'working', ownership: { state: 'none' }, relatedTargets: [], abilities: [{ ref: a.ref, source: 'user', stage: 'adopted', definitionDigest: a.definitionDigest }] }), 'OBJECT_RENAMED');
  const d = decorateRecord(definitionContext(f.root), { current: { summary: 'old', status: 'completed', project: { state: 'none' }, references: [], abilities: [a] }, history: [] });
  assert.equal(d.current.abilities[0].id, oldId); assert.equal(d.current.abilities[0].definitionDigest, a.definitionDigest);
  assert.equal(d.current.abilities[0].currentIdentity.id, newId);
});

test('empty directory trees migrate, while malformed definitions are preserved', t => {
  const f = fixture(t);
  f.put(`能力/工作流/${oldId}/empty/.gitkeep`, '');
  rmSync(join(f.root, `能力/工作流/${oldId}/empty/.gitkeep`));
  migrateCooperation({ root: f.root, apply: true });
  assert.ok(existsSync(join(f.root, `能力/协同/${newId}/empty`)));
  assert.equal(existsSync(join(f.root, '能力/工作流')), false);
  assert.equal(migrateCooperation({ root: f.root }).wouldChange, false);
  const file = f.put('能力/搭档/broken/partner.md', '---\nid: partner.demo.broken\n---\n# invalid\n');
  fails(() => migrateCooperation({ root: f.root, apply: true }), 'MIGRATION_DATA_INVALID');
  assert.match(readFileSync(file, 'utf8'), /invalid/);
});

test('pending migration blocks direct object mutations and altered staged files cannot overwrite originals', t => {
  const f = fixture(t); f.addOld();
  assert.throws(() => migrateCooperation({ root: f.root, apply: true }, { beforeOperation() { throw new Error('interrupted'); } }));
  fails(() => objectMutation({ root: f.root, type: 'partner', operation: 'write', id: 'partner.demo.new', input: { metadata: { name: 'new', description: 'test', version: '1.0.0', status: 'draft' }, body: '# new\n' } }), 'MIGRATION_PENDING');
  const state = read(join(f.root, migrationDirectory, 'state.json'));
  writeFileSync(join(f.root, migrationDirectory, 'backups', state.id, '0.after'), 'tampered');
  fails(() => migrateCooperation({ root: f.root, apply: true }), 'MIGRATION_DATA_INVALID');
  assert.ok(existsSync(join(f.root, `能力/工作流/${oldId}/workflow.md`)));
});

test('migration refuses an active writer and keeps its lock and old definition intact', t => {
  const f = fixture(t), file = f.addOld();
  const lock = f.put('.agents/runtime-data/chat-state/active.lock', JSON.stringify({ pid: process.pid }));
  fails(() => migrateCooperation({ root: f.root, apply: true }), 'MIGRATION_BUSY');
  assert.ok(existsSync(file)); assert.ok(existsSync(lock));
  assert.equal(existsSync(join(f.root, migrationDirectory, 'state.json')), false);
  rmSync(lock);
  assert.equal(migrateCooperation({ root: f.root, apply: true }).changed, true);
});

test('concurrent directory additions are preserved and never silently merged into the new object', t => {
  const f = fixture(t), old = f.addOld(), concurrent = join(f.root, `能力/协同/${newId}/user.txt`);
  fails(() => migrateCooperation({ root: f.root, apply: true }, { beforePublish() { mkdirSync(dirname(concurrent), { recursive: true }); writeFileSync(concurrent, 'user edit'); } }), 'MIGRATION_CONFLICT');
  assert.ok(existsSync(old)); assert.equal(readFileSync(concurrent, 'utf8'), 'user edit');
  rmSync(dirname(concurrent), { recursive: true });
  fails(() => migrateCooperation({ root: f.root, apply: true }, { afterOperation(index) { if (index === 0) writeFileSync(concurrent, 'late user edit'); } }), 'MIGRATION_CONFLICT');
  assert.equal(readFileSync(concurrent, 'utf8'), 'late user edit');
  fails(() => assertNoCooperationMigration(f.root), 'MIGRATION_PENDING');
  rmSync(concurrent);
  assert.equal(migrateCooperation({ root: f.root, apply: true }).resumed, true);
});

test('legacy stable target identities project to the current ability without rewriting their source records', t => {
  const f = fixture(t), id = 'b'.repeat(64);
  f.put(`能力/协同/${newId}/cooperation.md`, f.entry(newId));
  const report = { summary: 'test', status: 'working', ownership: { state: 'bound', target: { kind: 'ability', ref: newId, source: 'user' } }, relatedTargets: [], abilities: [] };
  const started = mutateRoute({ root: f.root, operation: 'start', ifMatch: 'missing', env: {}, input: { identity: { host: 'test', sessionId: 'legacy' }, eventId: 'start', report } }).record;
  const file = join(f.root, ROUTE_DIRECTORY, `${started.sessionKey}.json`), record = read(file);
  for (const snapshot of [record.current, ...record.history.map(e => e.snapshot)]) Object.assign(snapshot.ownership.target, { id: oldId, ref: oldId + '@1.0.0', path: `能力/工作流/${oldId}/workflow.md`, targetId: id, targetVersion: 2, lifecycle: 'existing' });
  writeFileSync(file, JSON.stringify(record)); const before = readFileSync(file);
  const registry = targetRegistry(f.root);
  assert.deepEqual(registry.errors, []);
  assert.equal(registry.aliases.get(`ability:user:${newId}`), id);
  assert.equal(resolveReport(definitionContext(f.root), report).ownership.target.targetId, id);
  const continuation = { ...report, ownership: { state: 'bound', target: { kind: 'ability', targetId: id } } };
  assert.equal(resolveReport(definitionContext(f.root), continuation).ownership.target.id, newId);
  const historical = { ...record.current, ownership: { state: 'bound', target: { ...record.current.ownership.target, targetId: undefined } } };
  assert.equal(primaryTarget(historical).key, `ability:user:${newId}`);
  assert.equal(historical.ownership.target.id, oldId);
  assert.deepEqual(readFileSync(file), before);
});
