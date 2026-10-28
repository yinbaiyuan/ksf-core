import test from 'node:test';
import assert from 'node:assert/strict';
import { randomId } from '../src/random-id.ts';

test('local HTTP creates unique IDs without crypto.randomUUID', t => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  t.mock.getter(globalThis, 'crypto', () => ({ getRandomValues }));
  assert.equal(typeof crypto.randomUUID, 'undefined');
  const ids = Array.from({ length: 1000 }, () => randomId());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('UUID version and variant bits are set independently of random bytes', t => {
  t.mock.getter(globalThis, 'crypto', () => ({ getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) }));
  assert.equal(randomId(), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
