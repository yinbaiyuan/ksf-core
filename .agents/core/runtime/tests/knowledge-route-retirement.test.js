import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { distributionFixture } from './helpers/distribution-fixture.js';
import { ForkAPI } from './helpers/contribution-api.js';
import { systemUpdate, systemRollback } from '../src/distribution/system.js';
import { objectQuery } from '../src/services/objects.js';
import { protectedPaths } from '../src/objects/schema.js';
import { writeAtomic } from '../src/distribution/common.js';

test('a synthetic previous fixed-entry graph upgrades without the retired route and rolls back with its own schema', async t => {
  const f = await distributionFixture(t);
  const api = new ForkAPI({ coreRoot: f.root });
  const id = 'competency.ksf.knowledge-route', path = '.agents/core/abilities/competencies/knowledge-route/competency.md';
  const runtime = '.agents/core/abilities/partners/ksf-runtime/partner.md', schema = '.agents/core/runtime/src/objects/schema.js';
  const currentRuntime = readFileSync(join(f.root, runtime), 'utf8'), currentSchema = readFileSync(join(f.root, schema), 'utf8');
  assert.equal(Object.hasOwn(protectedPaths, id), false);
  assert.equal(existsSync(join(f.workspace, path)), false);
  // This fixture reproduces the old fixed-entry contract, not an entire historical release.
  const old = await f.next('0.1.1', {
    [path]: `---\nid: ${id}\nname: retired fixture\ndescription: Synthetic previous fixed route.\nversion: 0.1.10\nstatus: active\nreferences: []\n---\n# Previous route fixture\n`,
    [runtime]: currentRuntime.replace('references:\n', `references:\n  - ${id}@0.1.10\n`),
    [schema]: currentSchema.replace('export const protectedPaths = {', `export const protectedPaths = {\n  '${id}': '${path}',`),
  });
  await systemUpdate({ root: f.workspace, from: old.coreArchive, api });
  assert.equal(existsSync(join(f.workspace, path)), true);
  const record = `.agents/user-data/abilities/${createHash('sha256').update(id).digest('hex')}.json`;
  const original = JSON.stringify({ schema_version: 1, object_id: id, revision: 1, values: { fixture_note: 'retain old data' } }) + '\n';
  writeAtomic(join(f.workspace, record), original);
  const next = await f.next('0.1.2', { [path]: null, [runtime]: currentRuntime, [schema]: currentSchema });
  await systemUpdate({ root: f.workspace, from: next.coreArchive, api });
  assert.equal(existsSync(join(f.workspace, path)), false);
  const entry = objectQuery({ root: f.workspace, type: 'partner', operation: 'read', reference: 'partner.ksf.runtime' });
  assert.deepEqual(entry.errors, []);
  assert.ok(entry.data.references.every(ref => ref.id !== id));
  assert.throws(() => objectQuery({ root: f.workspace, type: 'competency', operation: 'read', reference: id + '@0.1.10' }), { code: 'OBJECT_NOT_FOUND' });
  assert.equal(readFileSync(join(f.workspace, record), 'utf8'), original);
  assert.equal(f.launch(['context', 'capabilities', '--json']).status, 0);
  await systemRollback({ root: f.workspace });
  assert.equal(existsSync(join(f.workspace, path)), true);
  assert.equal(readFileSync(join(f.workspace, record), 'utf8'), original);
  assert.equal(f.launch(['context', 'capabilities', '--json']).status, 0);
});
