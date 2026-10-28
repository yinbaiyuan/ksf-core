import {fixtureTarget} from './helpers/distribution-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { distributionFixture } from './helpers/distribution-fixture.js';
import { enableChat, registerChatTurn, mutateChat, readChat } from '../src/services/chat.js';
import { systemUpdate, systemRollback } from '../src/distribution/system.js';
import { buildRelease } from '../src/distribution/release.js';
import { readArchive } from '../src/distribution/archive.js';

test('Core upgrade and rollback retain chat counters, runs and dynamic values byte-for-byte', async t => {
  const f = await distributionFixture(t), root = f.workspace, identity = { host: 'codex', sessionId: 'distribution-chat' };
  enableChat({ root }); registerChatTurn({ root, identity, turnId: 'one' });
  const a = mutateChat({ root, identity, operation: 'use', objectId: 'partner.test.portable', turnId: 'one' });
  const saved = mutateChat({ root, identity, operation: 'write', objectId: 'partner.test.portable', values: { arbitrary: ['private', true] }, ifMatch: a.etag });
  const path = join(root, saved.path), bytes = readFileSync(path), next = await f.next();
  await systemUpdate({ root, from: next.coreArchive }); assert.deepEqual(readFileSync(path), bytes);
  await systemRollback({ root }); assert.deepEqual(readFileSync(path), bytes);
  const restored = readChat({ root, identity, objectId: 'partner.test.portable' });
  assert.equal(restored.system.chatTurnNumber, 1); assert.equal(restored.system.runId, saved.system.runId); assert.deepEqual(restored.values, saved.values);
});
test('Core and workspace packages contain no private chat data, even malformed records', async t => {
  const f = await distributionFixture(t), path = join(f.root, '.agents/user-data/chats', 'b'.repeat(64), 'shared.json');
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'PRIVATE_CHAT_CANARY');
  const built = await buildRelease({ root: f.root, output: join(f.directory, 'chat-exclusion') });
  for (const product of ['ksf-core', 'ksf-workspace']) {
    const archive = readArchive(readFileSync(join(built.output, `${product}-0.1.0-${fixtureTarget}.tar.gz`)));
    assert.ok(![...archive.keys()].some(name => name.startsWith('.agents/user-data/chats/')));
    assert.ok([...archive.values()].every(file => !file.bytes.includes(Buffer.from('PRIVATE_CHAT_CANARY'))));
  }
});
